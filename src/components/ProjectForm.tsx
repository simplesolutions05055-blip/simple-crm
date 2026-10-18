"use client";
/* new / edit project window: name, linked client or lead, status, dates, value and a short description */
import { useState } from "react";
import { sb } from "@/lib/supabase/browser";
import { Modal } from "./Shell";
import { useApp } from "./AppCtx";
import { LinkPicker } from "./TaskBits";
import { PROJECT_STATUSES, today, type Row } from "@/lib/crm";

export default function ProjectForm({ project, onClose, onDone }: { project: Row; onClose: () => void; onDone: (id: string) => void }) {
  const { org, toast } = useApp();
  const [f, setF] = useState<Row>({
    name: project.name || "", status: project.status || PROJECT_STATUSES[0],
    link: project.client_id ? "c:" + project.client_id : project.lead_id ? "l:" + project.lead_id : "",
    start_date: project.start_date || (project.id ? "" : today()), due_date: project.due_date || "",
    value: project.value ?? "", description: project.description || "",
  });
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return toast("כותבים שם לפרויקט", true);
    if (f.start_date && f.due_date && f.due_date < f.start_date) return toast("תאריך היעד לפני תאריך ההתחלה", true);
    const row = {
      name: f.name.trim(), status: f.status, description: f.description.trim(),
      client_id: f.link.startsWith("c:") ? f.link.slice(2) : null, lead_id: f.link.startsWith("l:") ? f.link.slice(2) : null,
      start_date: f.start_date || null, due_date: f.due_date || null,
      value: f.value === "" || f.value == null ? null : Math.max(0, Number(f.value)) || 0,
    };
    setBusy(true);
    const { data, error } = project.id
      ? await sb().from("crm_projects").update(row).eq("id", project.id).select("id").single()
      : await sb().from("crm_projects").insert({ ...row, org_id: org }).select("id").single();
    setBusy(false);
    if (error) return toast(error.message, true);
    onDone(data.id);
  }
  return (
    <Modal title={project.id ? "עריכת פרויקט" : "פרויקט חדש"} icon="layout" onClose={onClose}>
      <form className="form" onSubmit={save}>
        <label className="field full"><span>שם הפרויקט</span><input className="inp" required autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="לדוגמה: אתר תדמית למספרה של דנה" /></label>
        <div className="field full"><span>לקוח או ליד</span><LinkPicker value={f.link} onPick={(v) => setF({ ...f, link: v })} /></div>
        <div className="field full"><span>סטטוס</span>
          <div className="pills">{PROJECT_STATUSES.map((s) => <button key={s} type="button" className={"pillck" + (f.status === s ? " on" : "")} onClick={() => setF({ ...f, status: s })}>{s}</button>)}</div>
        </div>
        <label className="field"><span>תאריך התחלה</span><input className="inp" type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></label>
        <label className="field"><span>תאריך יעד</span><input className="inp" type="date" min={f.start_date || undefined} value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></label>
        <label className="field"><span>שווי הפרויקט ₪ (לא חובה)</span><input className="inp" type="number" min={0} step="1" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></label>
        <label className="field full"><span>תיאור</span><textarea className="inp" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="מה נכלל, מה הלקוח צריך לספק, הערות" /></label>
        <div className="full bar">
          <button className="btn primary" disabled={busy}>{busy ? "שומר…" : project.id ? "שמירה" : "יצירת הפרויקט"}</button>
          <button type="button" className="btn ghost" onClick={onClose}>ביטול</button>
        </div>
      </form>
    </Modal>
  );
}
