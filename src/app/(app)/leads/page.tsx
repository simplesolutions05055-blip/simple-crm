"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { sb } from "@/lib/supabase/browser";
import { Top, Modal, St } from "@/components/Shell";
import Icon from "@/components/Icon";
import { useApp } from "@/components/AppCtx";
import ExcelIO from "@/components/ExcelIO";
import { STAGES, OFF_STAGES, SOURCES, INDUSTRIES, BUDGETS, ago, fmtDate, today, money, FIT, type Row } from "@/lib/crm";

export default function Leads() {
  const { org, toast } = useApp();
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");
  const [showOff, setShowOff] = useState(false);
  const [adding, setAdding] = useState(false);
  const [over, setOver] = useState<string | null>(null);
  const [arch, setArch] = useState(false);

  const load = async () => {
    const { data } = await sb().from("crm_leads").select("*").is("archived_at", null).order("created_at", { ascending: false });
    setRows(data || []);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const t = q.trim();
    return (rows || []).filter((l) => !t || [l.name, l.biz, l.phone, l.industry, l.source].join(" ").includes(t));
  }, [rows, q]);
  const cols = showOff ? [...STAGES, ...OFF_STAGES] : [...STAGES];

  async function move(id: string, stage: string) {
    const l = rows?.find((r) => r.id === id);
    if (!l || l.stage === stage) return;
    if (stage === "נפסל") return router.push("/leads/" + id + "?disq=1");
    setRows((rs) => rs!.map((r) => (r.id === id ? { ...r, stage } : r)));
    const { error } = await sb().from("crm_leads").update({ stage }).eq("id", id);
    if (error) { toast(error.message, true); load(); return; }
    await sb().from("crm_activities").insert({ org_id: org, lead_id: id, type: "מערכת", text: "שלב: " + l.stage + " ← " + stage, by: "מערכת" });
  }

  if (arch) return <Archive onBack={() => { setArch(false); load(); }} />;

  return (
    <>
      <Top title="לידים" sub={rows ? filtered.length + " לידים פעילים" : ""}
        right={<div className="bar">
          <ExcelIO kind="leads" onDone={load} />
          <button className="btn" onClick={() => setArch(true)}><Icon n="inbox" s={16} />ארכיון</button>
          <button className="btn primary" onClick={() => setAdding(true)}><Icon n="plus" s={16} />ליד חדש</button>
        </div>} />
      <div className="content">
        <div className="bar">
          <input className="inp" style={{ maxWidth: 300 }} placeholder="סינון לפי שם, עסק, תחום, מקור" value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="pillck"><input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} />להציג גם &quot;לא עכשיו&quot; ו&quot;נפסל&quot;</label>
        </div>
        <div className="kanban" style={{ gridTemplateColumns: `repeat(${cols.length},minmax(220px,1fr))` }}>
          {cols.map((s) => {
            const list = filtered.filter((l) => l.stage === s);
            return (
              <div key={s} className={"kcol" + (over === s ? " over" : "")}
                onDragOver={(e) => { e.preventDefault(); setOver(s); }} onDragLeave={() => setOver(null)}
                onDrop={(e) => { e.preventDefault(); setOver(null); move(e.dataTransfer.getData("id"), s); }}>
                <h3>{s}<span className="n">{list.length}</span></h3>
                {list.map((l) => {
                  const late = l.next_at && l.next_at < today();
                  const untouched = l.stage === "חדש" && !l.last_contact_at;
                  return (
                    <Link key={l.id} href={"/leads/" + l.id} draggable onDragStart={(e) => e.dataTransfer.setData("id", l.id)}
                      className={"kcard" + (late || untouched ? " alert" : "")} style={{ textDecoration: "none" }}>
                      <div className="kf"><b>{l.name}</b><span className="dots" title="התאמה">{FIT.map(([k]) => <i key={k} className={l.fit?.[k] ? "on" : ""} />)}</span></div>
                      {l.biz ? <span className="sub">{l.biz}{l.industry ? " · " + l.industry : ""}</span> : null}
                      <div className="kf">
                        <span className="meta">{l.source}</span>
                        {l.value ? <span className="meta">{money(l.value)}</span> : null}
                      </div>
                      {l.next_step ? <span className={"meta" + (late ? " bad" : "")}><Icon n="flag" s={13} />{l.next_step}{l.next_at ? " · " + fmtDate(l.next_at) : ""}</span>
                        : untouched ? <span className="meta bad"><Icon n="alert" s={13} />לא נוצר קשר · {ago(l.created_at)}</span> : null}
                      {l.reason && l.stage === "נפסל" ? <St cls="bad">{l.reason}</St> : null}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>
        <p className="tiny">גוררים כרטיס בין העמודות כדי לשנות שלב. הנקודות בכרטיס הן ההתאמה לפי 5 הקריטריונים.</p>
      </div>
      {adding ? <NewLead onClose={() => setAdding(false)} onDone={(id) => router.push("/leads/" + id)} /> : null}
    </>
  );
}

function Archive({ onBack }: { onBack: () => void }) {
  const { org, toast } = useApp();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");
  const load = async () => {
    const { data } = await sb().from("crm_leads").select("*").not("archived_at", "is", null).order("archived_at", { ascending: false });
    setRows(data || []);
  };
  useEffect(() => { load(); }, []);
  const list = (rows || []).filter((l) => !q.trim() || [l.name, l.biz, l.phone, l.industry, l.source, l.reason].join(" ").includes(q.trim()));

  async function restore(l: Row) {
    const { error } = await sb().from("crm_leads").update({ archived_at: null }).eq("id", l.id);
    if (error) return toast(error.message.includes("crm_leads_phone_uq") ? "יש כבר ליד פעיל עם אותו טלפון. פותחים אותו במקום." : error.message, true);
    await sb().from("crm_activities").insert({ org_id: org, lead_id: l.id, type: "מערכת", text: "הוחזר מהארכיון", by: "מערכת" });
    toast(l.name + " חזר ללידים הפעילים");
    load();
  }

  return (
    <>
      <Top title="ארכיון לידים" sub={rows ? list.length + " לידים בארכיון" : ""} crumb={{ href: "/leads", label: "לידים" }}
        right={<button className="btn" onClick={onBack}><Icon n="target" s={16} />חזרה ללידים הפעילים</button>} />
      <div className="content">
        <input className="inp" style={{ maxWidth: 300 }} placeholder="סינון לפי שם, עסק, טלפון, סיבה" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="panel" style={{ overflowX: "auto" }}>
          {!rows ? <p className="tiny">טוען…</p> : !list.length ? <p className="tiny" style={{ margin: 0 }}>אין לידים בארכיון</p> : (
            <table className="arch-table">
              <thead><tr><th>שם</th><th>עסק</th><th>טלפון</th><th>שלב אחרון</th><th>נשלח לארכיון</th><th></th></tr></thead>
              <tbody>
                {list.map((l) => (
                  <tr key={l.id}>
                    <td><Link href={"/leads/" + l.id}><b>{l.name}</b></Link></td>
                    <td>{l.biz || ""}{l.industry ? <span className="meta"> · {l.industry}</span> : null}</td>
                    <td className="ltr" style={{ textAlign: "right" }}>{l.phone || ""}</td>
                    <td><St cls={l.stage === "נפסל" ? "bad" : undefined}>{l.stage}</St>{l.reason ? <span className="meta" style={{ display: "block" }}>{l.reason}</span> : null}</td>
                    <td className="meta">{fmtDate(l.archived_at)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="btn sm" onClick={() => restore(l)}><Icon n="reset" s={14} />החזרה ללידים</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p className="tiny">ליד בארכיון לא מופיע בלוח, בחיפוש ובדופק היומי. כל הפרטים וההיסטוריה שלו נשמרים, ואפשר להחזיר אותו בלחיצה.</p>
      </div>
    </>
  );
}

function NewLead({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const { org, toast } = useApp();
  const [f, setF] = useState<Row>({ name: "", biz: "", phone: "", email: "", industry: "", source: "אתר ישיר", budget: "לא אמר", pain: "" });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const phone = f.phone.replace(/[^0-9+]/g, "") || null;
    const { data, error } = await sb().from("crm_leads").insert({ ...f, phone, email: f.email || null, org_id: org }).select("id").single();
    setBusy(false);
    if (error) return toast(error.message.includes("crm_leads_phone_uq") ? "כבר יש ליד פעיל עם הטלפון הזה" : error.message, true);
    await sb().from("crm_activities").insert({ org_id: org, lead_id: data.id, type: "מערכת", text: "ליד נוצר ידנית", by: "מערכת" });
    onDone(data.id);
  }
  return (
    <Modal title="ליד חדש" icon="target" onClose={onClose}>
      <form className="form" onSubmit={save}>
        <label className="field"><span>שם</span><input className="inp" required autoFocus value={f.name} onChange={(e) => set("name", e.target.value)} /></label>
        <label className="field"><span>עסק</span><input className="inp" value={f.biz} onChange={(e) => set("biz", e.target.value)} /></label>
        <label className="field"><span>טלפון</span><input className="inp ltr" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></label>
        <label className="field"><span>מייל</span><input className="inp ltr" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></label>
        <label className="field"><span>תחום</span><input className="inp" list="industries" value={f.industry} onChange={(e) => set("industry", e.target.value)} placeholder="בחירה או הקלדה חופשית" /></label>
        <label className="field"><span>מקור</span><select className="inp" value={f.source} onChange={(e) => set("source", e.target.value)}>{SOURCES.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label className="field"><span>תקציב</span><select className="inp" value={f.budget} onChange={(e) => set("budget", e.target.value)}>{BUDGETS.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label className="field full"><span>מה הכאב, במילים שלו</span><textarea className="inp" value={f.pain} onChange={(e) => set("pain", e.target.value)} /></label>
        <datalist id="industries">{INDUSTRIES.map((i) => <option key={i} value={i} />)}</datalist>
        <div className="full bar"><button className="btn primary" disabled={busy}>שמירה</button><button type="button" className="btn ghost" onClick={onClose}>ביטול</button></div>
      </form>
    </Modal>
  );
}
