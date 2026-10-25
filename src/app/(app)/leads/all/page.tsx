"use client";
/* "מאגר לידים": every lead in the system as one thin row each (active, closed, not now, disqualified,
   converted, archived), with filters and sorting. The Excel download takes exactly the filtered rows.
   The leads board stays for the leads being worked on. */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { sb } from "@/lib/supabase/browser";
import { Top, St } from "@/components/Shell";
import Icon from "@/components/Icon";
import { useApp } from "@/components/AppCtx";
import { download } from "@/components/ExcelIO";
import { STAGES, SOURCES, INDUSTRIES, fmtDate, today, type Row } from "@/lib/crm";
import { REGIONS } from "@/lib/regions";

const GROUPS = ["הכל", "בטיפול", "סגירת פנייה", "לא עכשיו", "נפסל", "הפכו ללקוח", "ארכיון"] as const;
type Group = (typeof GROUPS)[number];
const ACTIVE: readonly string[] = STAGES.filter((s) => s !== "לקוח");
function groupOf(l: Row): Group {
  if (l.stage === "לקוח" || l.client_id) return "הפכו ללקוח";
  if (l.archived_at) return "ארכיון";
  if (ACTIVE.includes(l.stage)) return "בטיפול";
  return (GROUPS as readonly string[]).includes(l.stage) ? (l.stage as Group) : "בטיפול";
}
const DATES = [["", "כל הזמן"], ["7", "7 הימים האחרונים"], ["30", "30 הימים האחרונים"], ["90", "90 הימים האחרונים"], ["month", "החודש"], ["range", "טווח תאריכים"]] as const;
type Sort = "date" | "name" | "industry" | "stage" | "next";
type F = { g: Group; q: string; date: string; from: string; to: string; industry: string; source: string; campaign: string; region: string; sort: Sort; asc: boolean };
const EMPTY: F = { g: "הכל", q: "", date: "", from: "", to: "", industry: "", source: "", campaign: "", region: "", sort: "date", asc: false };
const KEY = "crm.leadsPool.filters";

const ymd = (d: Date) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const dmy = (s?: string) => { if (!s) return ""; const d = new Date(s); return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + String(d.getFullYear()).slice(2); };
/* the next step's date and hour, as the sort key and as the label in the list */
const nextKey = (l: Row) => (l.next_at ? l.next_at + " " + (l.next_time ? String(l.next_time).slice(0, 5) : "00:00") : "");
function NextChip({ l }: { l: Row }) {
  if (!l.next_at) return <span className="faint">-</span>;
  const t = today();
  const cls = l.next_at < t ? "bad" : l.next_at === t ? "gold" : "";
  return <span className={"nx " + cls} title={l.next_step || ""}>{l.next_at === t ? "היום" : fmtDate(l.next_at)}{l.next_time ? " · " + String(l.next_time).slice(0, 5) : ""}</span>;
}
const fileDate = () => { const d = new Date(); return d.getDate() + "." + (d.getMonth() + 1) + "." + d.getFullYear(); };

export default function LeadsPool() {
  const { toast } = useApp();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [f, setF] = useState<F>(EMPTY);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<F>) => setF((x) => ({ ...x, ...p }));

  useEffect(() => {
    try { const s = localStorage.getItem(KEY); if (s) setF({ ...EMPTY, ...JSON.parse(s) }); } catch { /* storage blocked */ }
    (async () => {
      const all: Row[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb().from("crm_leads").select("*").order("created_at", { ascending: false }).range(from, from + 999);
        if (error) { toast(error.message, true); break; }
        all.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      setRows(all);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(f)); } catch { /* storage blocked */ } }, [f]);

  const opts = useMemo(() => {
    const uniq = (k: string, base: readonly string[] = []) => [...new Set([...base, ...(rows || []).map((r) => (r[k] || "").trim()).filter(Boolean)])].sort((a, b) => a.localeCompare(b, "he"));
    return { industry: uniq("industry", INDUSTRIES), source: uniq("source", SOURCES), campaign: uniq("campaign") };
  }, [rows]);

  // every filter except the status group, so the chips can show how many each group holds
  const base = useMemo(() => {
    const t = f.q.trim();
    let since = "", until = "";
    const now = new Date();
    if (f.date === "7" || f.date === "30" || f.date === "90") { const d = new Date(now); d.setDate(d.getDate() - Number(f.date) + 1); since = ymd(d); }
    if (f.date === "month") since = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
    if (f.date === "range") { since = f.from; until = f.to; }
    return (rows || []).filter((l) => {
      const day = l.created_at ? ymd(new Date(l.created_at)) : "";
      return (!t || [l.name, l.biz, l.phone, l.email, l.industry, l.source, l.campaign, l.city, l.reason].join(" ").includes(t))
        && (!since || day >= since) && (!until || day <= until)
        && (!f.industry || (l.industry || "") === f.industry)
        && (!f.source || (l.source || "") === f.source)
        && (!f.campaign || (l.campaign || "") === f.campaign)
        && (!f.region || (f.region === "-" ? !l.region : l.region === f.region));
    });
  }, [rows, f]);
  const counts = useMemo(() => {
    const c = Object.fromEntries(GROUPS.map((g) => [g, 0])) as Record<Group, number>;
    base.forEach((l) => { c[groupOf(l)]++; c["הכל"]++; });
    return c;
  }, [base]);
  const list = useMemo(() => {
    const xs = base.filter((l) => f.g === "הכל" || groupOf(l) === f.g);
    const val = (l: Row) => (f.sort === "date" ? l.created_at || "" : f.sort === "name" ? l.name || l.biz || "" : f.sort === "industry" ? l.industry || "" : f.sort === "next" ? nextKey(l) : l.stage || "");
    xs.sort((a, b) => {
      // by next step: leads without one always go last
      if (f.sort === "next" && !nextKey(a) !== !nextKey(b)) return nextKey(a) ? -1 : 1;
      const r = String(val(a)).localeCompare(String(val(b)), "he"); return f.asc ? r : -r;
    });
    return xs;
  }, [base, f.g, f.sort, f.asc]);

  const filtered = f.g !== "הכל" || f.q.trim() || f.date || f.industry || f.source || f.campaign || f.region;
  async function exportXl() {
    if (!list.length) return toast("אין לידים להורדה בסינון הזה", true);
    setBusy(true);
    try {
      const parts = [f.g !== "הכל" ? f.g : "", f.industry, f.source, f.campaign, f.region && f.region !== "-" ? f.region : "", f.date ? DATES.find((d) => d[0] === f.date)?.[1] || "" : ""].filter(Boolean);
      await download("leads", list, undefined, ["לידים", ...(parts.length ? parts : ["כל הלידים"]), fileDate()].join(" - ").replace(/[\\/:*?"<>|]/g, ""));
    } catch (e) { toast("הקובץ לא נוצר: " + (e as Error).message, true); }
    setBusy(false);
  }
  const head = (k: Sort, label: string) => (
    <button type="button" className={f.sort === k ? "on" : ""} onClick={() => set(f.sort === k ? { asc: !f.asc } : { sort: k, asc: k !== "date" })}>
      {label}{f.sort === k ? (f.asc ? " ↑" : " ↓") : ""}
    </button>
  );
  const stCls = (l: Row) => (groupOf(l) === "הפכו ללקוח" ? "ok" : l.stage === "נפסל" ? "bad" : l.stage === "סגירת פנייה" ? "ok" : undefined);

  return (
    <>
      <Top title="מאגר לידים" crumb={{ href: "/leads", label: "לידים" }}
        sub={rows ? rows.length + " לידים במערכת" + (filtered ? " · מוצגים " + list.length : "") : ""}
        right={<button className="btn primary" disabled={busy || !rows} onClick={exportXl}><Icon n="download" s={16} />{busy ? "מכין קובץ…" : "הורדה לאקסל · " + list.length + " לידים"}</button>} />
      <div className="content">
        <div className="pool-chips">
          {GROUPS.map((g) => (
            <button key={g} type="button" className={"pillck" + (f.g === g ? " on" : "")} onClick={() => set({ g })}>{g}<small>{counts[g]}</small></button>
          ))}
        </div>
        <div className="pool-f">
          <input className="inp" placeholder="חיפוש: שם, עסק, טלפון, מייל" value={f.q} onChange={(e) => set({ q: e.target.value })} />
          <select className="inp" aria-label="תאריך" value={f.date} onChange={(e) => set({ date: e.target.value })}>{DATES.map(([v, l]) => <option key={v} value={v}>{v ? l : "תאריך: כל הזמן"}</option>)}</select>
          <select className="inp" aria-label="תחום" value={f.industry} onChange={(e) => set({ industry: e.target.value })}><option value="">כל התחומים</option>{opts.industry.map((x) => <option key={x}>{x}</option>)}</select>
          <select className="inp" aria-label="מקור" value={f.source} onChange={(e) => set({ source: e.target.value })}><option value="">כל המקורות</option>{opts.source.map((x) => <option key={x}>{x}</option>)}</select>
          <select className="inp" aria-label="קמפיין" value={f.campaign} onChange={(e) => set({ campaign: e.target.value })}><option value="">כל הקמפיינים</option>{opts.campaign.map((x) => <option key={x}>{x}</option>)}</select>
          <select className="inp" aria-label="אזור" value={f.region} onChange={(e) => set({ region: e.target.value })}><option value="">כל האזורים</option>{REGIONS.map((r) => <option key={r}>{r}</option>)}<option value="-">בלי אזור</option></select>
          {f.date === "range" ? (
            <div className="range">
              <label className="field"><span>מתאריך</span><input className="inp" type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} /></label>
              <label className="field"><span>עד תאריך</span><input className="inp" type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} /></label>
            </div>
          ) : null}
        </div>
        {filtered ? <div className="bar"><button className="btn sm ghost" onClick={() => setF(EMPTY)}><Icon n="reset" s={14} />ניקוי הסינון</button></div> : null}
        <div className="pool">
          <div className="pr h">{head("date", "תאריך")}{head("name", "שם ועסק")}<span>טלפון</span>{head("next", "צעד הבא")}{head("industry", "תחום")}<span>מקור / קמפיין</span>{head("stage", "סטטוס")}</div>
          {!rows ? <div className="pr"><span className="tiny">טוען…</span></div>
            : !list.length ? <div className="pr"><span className="tiny">אין לידים בסינון הזה</span></div>
            : list.map((l) => (
              <Link key={l.id} href={"/leads/" + l.id} className="pr">
                <span className="d">{dmy(l.created_at)}</span>
                <span className="nm"><b>{l.name || l.biz || "ללא שם"}</b>{l.biz && l.name ? <span className="meta"> · {l.biz}</span> : null}</span>
                <span className="ph">{l.phone || ""}</span>
                <span className="nxc"><NextChip l={l} /></span>
                <span className="ind">{l.industry || ""}</span>
                <span className="src meta">{[l.source, l.campaign].filter(Boolean).join(" · ")}</span>
                <St cls={stCls(l)}>{groupOf(l) === "הפכו ללקוח" ? "לקוח" : l.archived_at ? "ארכיון" : l.stage}</St>
              </Link>
            ))}
        </div>
      </div>
    </>
  );
}
