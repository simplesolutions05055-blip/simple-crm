"use client";
import { useEffect, useRef, useState } from "react";
import { sb } from "@/lib/supabase/browser";
import { Modal } from "./Shell";
import Icon from "./Icon";
import { useApp } from "./AppCtx";
import { pushToCalendar } from "./AiPlan";
import { setTaskDone } from "./taskDone";
import { today, TASK_KINDS, taskKindCls, type Row, type TaskAttachment } from "@/lib/crm";
import { LinkPicker, AttachmentChips } from "./TaskBits";

export default function TaskModal({ task, onClose, onDone }: { task: Row; onClose: () => void; onDone: () => void }) {
  const { org, toast, settings } = useApp();
  const gcal = !!settings.gcal?.email;
  const [f, setF] = useState<Row>({
    title: task.title || "", description: task.description || "", start_date: task.start_date || today(), due_date: task.due_date || today(),
    link: task.lead_id ? "l:" + task.lead_id : task.client_id ? "c:" + task.client_id : "",
    start_time: task.start_time ? String(task.start_time).slice(0, 5) : "", duration_min: task.duration_min || 30,
    to_cal: !!task.gcal_event_id || (!task.id && gcal),
    kind: task.kind || "", attachments: (Array.isArray(task.attachments) ? task.attachments : []) as TaskAttachment[],
  });
  // attachments: a link, an uploaded file, or a document that already exists on the linked lead/client
  const [add, setAdd] = useState<"" | "link" | "doc">("");
  const [lk, setLk] = useState({ name: "", url: "" });
  const [docs, setDocs] = useState<Row[]>([]);
  const [busy, setBusy] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const atts = f.attachments as TaskAttachment[];
  const setAtts = (a: TaskAttachment[]) => setF((x: Row) => ({ ...x, attachments: a }));
  useEffect(() => {
    if (add !== "doc" || !f.link) return;
    const col = f.link.startsWith("c:") ? "client_id" : "lead_id";
    sb().from("crm_documents").select("id,title,kind").eq(col, f.link.slice(2)).neq("kind", "quote_signed").order("created_at", { ascending: false })
      .then(({ data }: { data: Row[] | null }) => setDocs(data || []));
  }, [add, f.link]);
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const out: TaskAttachment[] = [];
    for (const file of Array.from(files)) {
      if (file.size > 25 * 1024 * 1024) { toast("גדול מ-25MB: " + file.name, true); continue; }
      setBusy("מעלה " + file.name + "…");
      const ext = (file.name.match(/\.([a-z0-9]{1,8})$/i)?.[1] || "bin").toLowerCase();
      const path = org + "/" + crypto.randomUUID() + "." + ext;
      const up = await sb().storage.from("crm-docs").upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (up.error) { toast("לא הועלה: " + file.name, true); continue; }
      out.push({ t: "file", name: file.name, path });
    }
    setBusy("");
    if (out.length) setAtts([...atts, ...out]);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (f.due_date < f.start_date) return toast("תאריך הסיום לפני תאריך ההתחלה", true);
    const row = {
      title: f.title.trim(), description: f.description, start_date: f.start_date, due_date: f.due_date,
      lead_id: f.link.startsWith("l:") ? f.link.slice(2) : null, client_id: f.link.startsWith("c:") ? f.link.slice(2) : null,
      start_time: f.start_time || null, duration_min: f.start_time ? Number(f.duration_min) || 30 : null,
      kind: f.kind || null, attachments: atts,
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
        <div className="field full"><span>סוג</span>
          <div className="pills">{TASK_KINDS.map((k) => (
            <button key={k} type="button" className={"pillck" + ((f.kind || "") === k ? " on" : "")} onClick={() => setF({ ...f, kind: f.kind === k ? "" : k })}>
              <span className={taskKindCls(k) + " dot"} />{k}
            </button>
          ))}</div>
          {!f.kind ? <small className="tiny">לא נבחר: המערכת תבחר לפי הכותרת</small> : null}
        </div>
        <div className="field full"><span>שיוך ללקוח או לליד</span><LinkPicker value={f.link} onPick={(v) => setF({ ...f, link: v })} /></div>
        <label className="field"><span>תאריך התחלה</span><input className="inp" type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value, due_date: f.due_date < e.target.value ? e.target.value : f.due_date })} /></label>
        <label className="field"><span>תאריך סיום</span><input className="inp" type="date" value={f.due_date} min={f.start_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></label>
        <label className="field"><span>שעה (לא חובה)</span><input className="inp" type="time" value={f.start_time} onChange={(e) => setF({ ...f, start_time: e.target.value })} /></label>
        <label className="field"><span>משך בדקות</span><input className="inp" type="number" min={5} step={5} disabled={!f.start_time} value={f.duration_min} onChange={(e) => setF({ ...f, duration_min: e.target.value })} /></label>
        {gcal ? <label className={"pillck full" + (f.to_cal ? " on" : "")} style={{ justifySelf: "start" }}><input type="checkbox" checked={f.to_cal} onChange={(e) => setF({ ...f, to_cal: e.target.checked })} />להציג ביומן גוגל</label> : null}
        <label className="field full"><span>תיאור</span><textarea className="inp" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
        <div className="field full"><span>מצורפים</span>
          <AttachmentChips list={atts} task={{ lead_id: f.link.startsWith("l:") ? f.link.slice(2) : null, client_id: f.link.startsWith("c:") ? f.link.slice(2) : null }} onRemove={(i) => setAtts(atts.filter((_, n) => n !== i))} />
          <div className="pills">
            <button type="button" className={"pillck" + (add === "link" ? " on" : "")} onClick={() => setAdd(add === "link" ? "" : "link")}><Icon n="link" s={13} />קישור</button>
            <input ref={fileRef} type="file" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
            <button type="button" className="pillck" disabled={!!busy} onClick={() => fileRef.current?.click()}><Icon n="upload" s={13} />{busy || "העלאת קובץ"}</button>
            <button type="button" className={"pillck" + (add === "doc" ? " on" : "")} disabled={!f.link} title={!f.link ? "קודם משייכים ללקוח או לליד" : ""} onClick={() => setAdd(add === "doc" ? "" : "doc")}><Icon n="file" s={13} />מסמך מהלקוח</button>
          </div>
          {add === "link" ? (
            <div className="f3" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1.4fr) auto" }}>
              <input className="inp sm" placeholder="שם" value={lk.name} onChange={(e) => setLk({ ...lk, name: e.target.value })} />
              <input className="inp sm ltr" type="url" placeholder="https://" value={lk.url} onChange={(e) => setLk({ ...lk, url: e.target.value })} />
              <button type="button" className="btn sm primary" onClick={() => {
                if (!lk.url.trim()) return toast("צריך כתובת", true);
                setAtts([...atts, { t: "link", name: lk.name.trim() || lk.url.trim(), url: lk.url.trim() }]); setLk({ name: "", url: "" }); setAdd("");
              }}>הוספה</button>
            </div>
          ) : null}
          {add === "doc" ? (
            !docs.length ? <span className="tiny">אין מסמכים אצל {f.link.startsWith("c:") ? "הלקוח" : "הליד"}</span> : (
              <div className="pills">{docs.map((d) => {
                const on = atts.some((a) => a.t === "doc" && a.doc_id === d.id);
                return <button key={d.id} type="button" className={"pillck" + (on ? " on" : "")} onClick={() => setAtts(on ? atts.filter((a) => !(a.t === "doc" && a.doc_id === d.id)) : [...atts, { t: "doc", name: d.title, doc_id: d.id }])}>{on ? "✓ " : ""}{d.title}</button>;
              })}</div>
            )
          ) : null}
        </div>
        <div className="full bar">
          <button className="btn primary">שמירה</button>
          <button type="button" className="btn ghost" onClick={onClose}>ביטול</button>
          {task.id ? <button type="button" className={"btn" + (task.done ? "" : " ok")} onClick={async () => {
            const err = await setTaskDone(task, !task.done, gcal);
            if (err) return toast("לא עודכן: " + err, true);
            toast(task.done ? "המשימה נפתחה מחדש" : "סומנה כבוצעה");
            onDone();
          }}><Icon n={task.done ? "reset" : "check"} s={15} />{task.done ? "פתיחה מחדש" : "סימון כבוצעה"}</button> : null}
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
