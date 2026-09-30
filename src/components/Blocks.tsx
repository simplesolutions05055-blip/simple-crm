"use client";
/* building blocks shared by the lead and client cards */
import { useEffect, useState } from "react";
import Link from "next/link";
import { sb } from "@/lib/supabase/browser";
import Icon from "./Icon";
import { Panel, Empty, St } from "./Shell";
import { useApp } from "./AppCtx";
import { FTYPES, LINKS, TOUCH, fmtDateTime, fmtDate, today, QUOTE_STATUS_CLS, money, type Row } from "@/lib/crm";

/* inline text field that saves on blur */
export function EditField({ value, onSave, type = "text", placeholder, className, list }: {
  value: string | number | null | undefined; onSave: (v: string) => void; type?: string; placeholder?: string; className?: string; list?: string;
}) {
  const [v, setV] = useState(value ?? "");
  useEffect(() => setV(value ?? ""), [value]);
  return (
    <input className={className || "fi"} type={type} value={v as string} placeholder={placeholder} list={list}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (String(v) !== String(value ?? "")) onSave(String(v)); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
  );
}
export function EditArea({ value, onSave, placeholder, rows = 3 }: { value: string | null | undefined; onSave: (v: string) => void; placeholder?: string; rows?: number }) {
  const [v, setV] = useState(value ?? "");
  useEffect(() => setV(value ?? ""), [value]);
  return <textarea className="inp" rows={rows} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={() => v !== (value ?? "") && onSave(v)} />;
}

export function FieldRow({ icon, label, children }: { icon?: string; label: string; children: React.ReactNode }) {
  return (
    <div className="lrow">
      <span className="lbl">{icon ? <Icon n={icon} s={16} /> : null}{label}</span>
      <div className="grow">{children}</div>
    </div>
  );
}

/* "+" fields: user-named fields stored as [{id,label,type,value}] */
export type CField = { id: string; label: string; type: string; value: string };
export function CustomFields({ fields, onChange, addLabel = "הוספת שדה" }: { fields: CField[]; onChange: (f: CField[]) => void; addLabel?: string }) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [type, setType] = useState("text");
  const upd = (id: string, value: string) => onChange(fields.map((f) => (f.id === id ? { ...f, value } : f)));
  return (
    <div>
      {fields.map((f) => (
        <div className="cf" key={f.id} style={{ padding: "6px 0" }}>
          <span className="tiny" style={{ fontSize: 13 }}>{f.label}</span>
          <div className="linkrow">
            <EditField value={f.value} type={f.type} onSave={(v) => upd(f.id, v)} className={"fi" + (f.type === "url" ? " ltr" : "")} />
            {f.type === "url" && f.value ? <a href={f.value.startsWith("http") ? f.value : "https://" + f.value} target="_blank" rel="noreferrer"><Icon n="link" s={16} /></a> : null}
          </div>
          <button className="btn icon sm ghost" title="מחיקה" onClick={() => confirm("למחוק את השדה " + f.label + "?") && onChange(fields.filter((x) => x.id !== f.id))}><Icon n="trash" s={15} /></button>
        </div>
      ))}
      {adding ? (
        <div className="f3" style={{ marginTop: 10, gridTemplateColumns: "1.3fr 1fr auto" }}>
          <input className="inp sm" autoFocus placeholder="שם השדה" value={label} onChange={(e) => setLabel(e.target.value)} />
          <select className="inp sm" value={type} onChange={(e) => setType(e.target.value)}>{FTYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <div className="bar">
            <button className="btn sm primary" disabled={!label.trim()} onClick={() => { onChange([...fields, { id: crypto.randomUUID(), label: label.trim(), type, value: "" }]); setLabel(""); setAdding(false); }}>הוספה</button>
            <button className="btn sm ghost" onClick={() => setAdding(false)}>ביטול</button>
          </div>
        </div>
      ) : (
        <button className="add" onClick={() => setAdding(true)}><Icon n="plus" s={15} />{addLabel}</button>
      )}
    </div>
  );
}

/* digital presence: fixed platforms + "+" links */
export function LinksBox({ links, custom, onLinks, onCustom }: { links: Row; custom: CField[]; onLinks: (l: Row) => void; onCustom: (c: CField[]) => void }) {
  return (
    <div>
      {LINKS.map(([k, l, ic]) => (
        <div className="lrow" key={k}>
          <span className="lbl"><Icon n={ic} s={16} />{l}</span>
          <div className="grow linkrow">
            <EditField value={links?.[k] || ""} className="fi ltr" placeholder="הדבקת קישור" onSave={(v) => onLinks({ ...(links || {}), [k]: v.trim() })} />
            {links?.[k] ? <a href={links[k].startsWith("http") ? links[k] : "https://" + links[k]} target="_blank" rel="noreferrer" title="פתיחה"><Icon n="link" s={16} /></a> : null}
          </div>
        </div>
      ))}
      <CustomFields fields={custom.map((c) => ({ ...c, type: c.type || "url" }))} onChange={onCustom} addLabel="הוספת קישור" />
    </div>
  );
}

/* touch log */
export function ActivityLog({ leadId, clientId, reload }: { leadId?: string; clientId?: string; reload?: number }) {
  const { org, toast } = useApp();
  const [rows, setRows] = useState<Row[]>([]);
  const [type, setType] = useState("שיחה");
  const [text, setText] = useState("");
  const load = async () => {
    let q = sb().from("crm_activities").select("*").order("at", { ascending: false }).limit(100);
    if (leadId && clientId) q = q.or(`lead_id.eq.${leadId},client_id.eq.${clientId}`);
    else if (leadId) q = q.eq("lead_id", leadId);
    else if (clientId) q = q.eq("client_id", clientId);
    const { data } = await q;
    setRows(data || []);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [leadId, clientId, reload]);
  async function add() {
    if (!text.trim()) return;
    const { error } = await sb().from("crm_activities").insert({ org_id: org, lead_id: leadId || null, client_id: clientId || null, type, text: text.trim(), by: "מאור" });
    if (error) return toast("לא נשמר: " + error.message, true);
    setText(""); load();
  }
  const color: Record<string, string> = { "שיחה": "var(--navy)", "וואטסאפ": "var(--ok)", "פגישה": "var(--gold)", "מייל": "var(--info)", "מערכת": "var(--faint)" };
  return (
    <Panel icon="pulse" title="יומן נגיעות">
      <div className="f3" style={{ gridTemplateColumns: "120px 1fr auto", marginBottom: 14 }}>
        <select className="inp sm" value={type} onChange={(e) => setType(e.target.value)}>{TOUCH.map((t) => <option key={t}>{t}</option>)}</select>
        <input className="inp sm" value={text} onChange={(e) => setText(e.target.value)} placeholder="מה היה? מה סוכם?" onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="btn sm primary" onClick={add}>תיעוד</button>
      </div>
      {!rows.length ? <Empty>עוד אין תיעוד</Empty> : (
        <div className="tline">
          {rows.map((r) => (
            <div className="ev" key={r.id} style={{ ["--c" as string]: color[r.type] || "var(--faint)" }}>
              <div className="meta"><b style={{ color: "var(--fg)" }}>{r.type}</b> · {fmtDateTime(r.at)} · {r.by}</div>
              <div style={{ whiteSpace: "pre-wrap" }}>{r.text}</div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* quotes linked to a lead/client */
export function QuotesBox({ leadId, clientId }: { leadId?: string; clientId?: string }) {
  const { org, toast } = useApp();
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    (async () => {
      let q = sb().from("crm_quotes").select("id,no,status,totals,views,created_at").order("created_at", { ascending: false });
      if (leadId && clientId) q = q.or(`lead_id.eq.${leadId},client_id.eq.${clientId}`);
      else if (leadId) q = q.eq("lead_id", leadId);
      else q = q.eq("client_id", clientId!);
      const { data } = await q;
      setRows(data || []);
    })();
  }, [leadId, clientId]);
  async function create() {
    const { data, error } = await sb().from("crm_quotes").insert({ org_id: org, lead_id: leadId || null, client_id: clientId || null }).select("id").single();
    if (error) return toast("לא נוצרה הצעה: " + error.message, true);
    location.href = "/quotes/" + data.id;
  }
  return (
    <Panel icon="file" title="הצעות מחיר" right={<button className="btn sm primary" onClick={create}><Icon n="plus" s={15} />הצעה חדשה</button>}>
      {!rows.length ? <Empty>אין הצעות</Empty> : rows.map((q) => (
        <Link key={q.id} href={"/quotes/" + q.id} className="lrow link" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="grow"><b>{q.no} · {q.totals?.title || "טיוטה"}</b>
            <span className="meta">{q.totals?.monthly ? money(q.totals.monthly) + " לחודש" : ""}{q.totals?.oneoff ? " · " + money(q.totals.oneoff) + " חד פעמי" : ""} · {fmtDate(q.created_at)}</span></span>
          <St cls={QUOTE_STATUS_CLS[q.status]}>{q.status}</St>
        </Link>
      ))}
    </Panel>
  );
}

/* tasks linked to a lead/client */
export function TasksBox({ leadId, clientId }: { leadId?: string; clientId?: string }) {
  const { org, toast, refreshCounts } = useApp();
  const [rows, setRows] = useState<Row[]>([]);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(today());
  const load = async () => {
    let q = sb().from("crm_tasks").select("*").order("done").order("due_date");
    q = leadId ? q.eq("lead_id", leadId) : q.eq("client_id", clientId!);
    const { data } = await q;
    setRows(data || []);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [leadId, clientId]);
  async function add() {
    if (!title.trim()) return;
    const { error } = await sb().from("crm_tasks").insert({ org_id: org, title: title.trim(), start_date: today() > due ? due : today(), due_date: due, lead_id: leadId || null, client_id: clientId || null });
    if (error) return toast(error.message, true);
    setTitle(""); load(); refreshCounts();
  }
  async function toggle(t: Row) {
    await sb().from("crm_tasks").update({ done: !t.done }).eq("id", t.id);
    load(); refreshCounts();
  }
  return (
    <Panel icon="tasks" title="משימות" right={<Link className="btn sm" href="/tasks">כל המשימות</Link>}>
      {rows.map((t) => (
        <div className={"task" + (t.done ? " done" : "")} key={t.id}>
          <input type="checkbox" checked={t.done} onChange={() => toggle(t)} />
          <div className="grow"><b>{t.title}</b><span className={"meta" + (!t.done && t.due_date < today() ? " bad" : "")}><Icon n="cal" s={13} />{fmtDate(t.due_date)}</span>
            {t.description ? <div className="tdesc">{t.description}</div> : null}</div>
        </div>
      ))}
      <div className="f3" style={{ gridTemplateColumns: "1fr 150px auto", marginTop: 10 }}>
        <input className="inp sm" placeholder="משימה חדשה" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <input className="inp sm" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        <button className="btn sm" onClick={add}><Icon n="plus" s={15} /></button>
      </div>
    </Panel>
  );
}
