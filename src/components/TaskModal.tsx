"use client";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase/browser";
import { Modal } from "./Shell";
import Icon from "./Icon";
import { useApp } from "./AppCtx";
import { pushToCalendar } from "./AiPlan";
import { today, type Row } from "@/lib/crm";

export default function TaskModal({ task, onClose, onDone }: { task: Row; onClose: () => void; onDone: () => void }) {
  const { org, toast, settings } = useApp();
  const gcal = !!settings.gcal?.email;
  const [f, setF] = useState<Row>({
    title: task.title || "", description: task.description || "", start_date: task.start_date || today(), due_date: task.due_date || today(),
    link: task.lead_id ? "l:" + task.lead_id : task.client_id ? "c:" + task.client_id : "",
    start_time: task.start_time ? String(task.start_time).slice(0, 5) : "", duration_min: task.duration_min || 30,
    to_cal: !!task.gcal_event_id || (!task.id && gcal),
  });
  const [opts, setOpts] = useState<{ v: string; l: string }[]>([]);
  useEffect(() => {
    (async () => {
      const [l, c] = await Promise.all([
        sb().from("crm_leads").select("id,name,biz").is("archived_at", null).order("name"),
        sb().from("crm_clients").select("id,biz").is("archived_at", null).order("biz"),
      ]);
      setOpts([...(c.data || []).map((x: Row) => ({ v: "c:" + x.id, l: "לקוח · " + x.biz })), ...(l.data || []).map((x: Row) => ({ v: "l:" + x.id, l: "ליד · " + x.name + (x.biz ? " (" + x.biz + ")" : "") }))]);
    })();
  }, []);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (f.due_date < f.start_date) return toast("תאריך הסיום לפני תאריך ההתחלה", true);
    const row = {
      title: f.title.trim(), description: f.description, start_date: f.start_date, due_date: f.due_date,
      lead_id: f.link.startsWith("l:") ? f.link.slice(2) : null, client_id: f.link.startsWith("c:") ? f.link.slice(2) : null,
      start_time: f.start_time || null, duration_min: f.start_time ? Number(f.duration_min) || 30 : null,
    };
    const { data, error } = task.id ? await sb().from("crm_tasks").update(row).eq("id", task.id).select("id").single() : await sb().from("crm_tasks").insert({ ...row, org_id: org }).select("id").single();
    if (error) return toast(error.message, true);
    if (gcal && (f.to_cal || task.gcal_event_id)) {
      const ok = await pushToCalendar(data.id, !f.to_cal);
      if (!ok) toast("נשמר, אבל העדכון ביומן גוגל נכשל", true);
    }
    onDone();
  }
  return (
    <Modal title={task.id ? "עריכת משימה" : "משימה חדשה"} icon="tasks" onClose={onClose}>
      <form className="form" onSubmit={save}>
        <label className="field full"><span>כותרת</span><input className="inp" required autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
        <label className="field full"><span>תיאור</span><textarea className="inp" rows={4} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
        <label className="field"><span>תאריך התחלה</span><input className="inp" type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value, due_date: f.due_date < e.target.value ? e.target.value : f.due_date })} /></label>
        <label className="field"><span>תאריך סיום</span><input className="inp" type="date" value={f.due_date} min={f.start_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></label>
        <label className="field"><span>שעה (לא חובה)</span><input className="inp" type="time" value={f.start_time} onChange={(e) => setF({ ...f, start_time: e.target.value })} /></label>
        <label className="field"><span>משך בדקות</span><input className="inp" type="number" min={5} step={5} disabled={!f.start_time} value={f.duration_min} onChange={(e) => setF({ ...f, duration_min: e.target.value })} /></label>
        {gcal ? <label className={"pillck full" + (f.to_cal ? " on" : "")} style={{ justifySelf: "start" }}><input type="checkbox" checked={f.to_cal} onChange={(e) => setF({ ...f, to_cal: e.target.checked })} />להציג ביומן גוגל</label> : null}
        <label className="field full"><span>שיוך לליד או ללקוח</span>
          <select className="inp" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })}>
            <option value="">ללא שיוך</option>
            {opts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
        </label>
        <div className="full bar">
          <button className="btn primary">שמירה</button>
          <button type="button" className="btn ghost" onClick={onClose}>ביטול</button>
          {task.id ? <button type="button" className="btn danger" style={{ marginInlineStart: "auto" }} onClick={async () => {
            if (!confirm("למחוק את המשימה?")) return;
            if (task.gcal_event_id) await pushToCalendar(task.id, true);
            await sb().from("crm_tasks").delete().eq("id", task.id); onDone();
          }}><Icon n="trash" s={15} />מחיקה</button> : null}
        </div>
      </form>
    </Modal>
  );
}
