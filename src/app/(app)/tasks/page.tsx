"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase/browser";
import { Top, Panel, Modal, Empty } from "@/components/Shell";
import Icon from "@/components/Icon";
import { useApp } from "@/components/AppCtx";
import { today, fmtDate, type Row } from "@/lib/crm";

export default function Tasks() {
  const { refreshCounts } = useApp();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [edit, setEdit] = useState<Row | null>(null);
  const [showDone, setShowDone] = useState(false);

  const load = async () => {
    const { data } = await sb().from("crm_tasks").select("*,lead:crm_leads(id,name),client:crm_clients(id,biz)").order("due_date");
    setRows(data || []);
    refreshCounts();
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const t = today();
  const open = (rows || []).filter((r) => !r.done);
  const groups = [
    { h: "באיחור", list: open.filter((r) => r.due_date < t), bad: true },
    { h: "היום", list: open.filter((r) => r.due_date === t) },
    { h: "בהמשך", list: open.filter((r) => r.due_date > t) },
    ...(showDone ? [{ h: "בוצעו", list: (rows || []).filter((r) => r.done).reverse() }] : []),
  ];

  async function toggle(r: Row) {
    setRows((x) => x!.map((y) => (y.id === r.id ? { ...y, done: !r.done } : y)));
    await sb().from("crm_tasks").update({ done: !r.done }).eq("id", r.id);
    refreshCounts();
  }

  return (
    <>
      <Top title="משימות" sub={rows ? open.length + " פתוחות" : ""} right={<button className="btn primary" onClick={() => setEdit({})}><Icon n="plus" s={16} />משימה חדשה</button>} />
      <div className="content">
        <div className="bar"><label className="pillck"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />להציג משימות שבוצעו</label></div>
        <Panel>
          {!rows ? <div className="loading" style={{ minHeight: 120 }}>טוען…</div> : !open.length && !showDone ? <Empty>אין משימות פתוחות</Empty> : groups.filter((g) => g.list.length).map((g) => (
            <div key={g.h} className="tasks-g" style={{ marginBottom: 12 }}>
              <h3 style={g.bad ? { color: "var(--bad)" } : undefined}>{g.h} · {g.list.length}</h3>
              {g.list.map((r) => (
                <div key={r.id} className={"task" + (r.done ? " done" : "")}>
                  <input type="checkbox" checked={r.done} onChange={() => toggle(r)} />
                  <div className="grow" onClick={() => setEdit(r)}>
                    <b>{r.title}</b>
                    {r.description ? <div className="tdesc">{r.description}</div> : null}
                    <div className="bar" style={{ marginTop: 4 }}>
                      <span className={"meta" + (!r.done && r.due_date < t ? " bad" : "")}><Icon n="cal" s={13} />{r.start_date !== r.due_date ? fmtDate(r.start_date) + " עד " : ""}{fmtDate(r.due_date)}</span>
                      {r.lead ? <Link className="rchip" href={"/leads/" + r.lead.id} onClick={(e) => e.stopPropagation()}><Icon n="target" s={12} />{r.lead.name}</Link> : null}
                      {r.client ? <Link className="rchip" href={"/clients/" + r.client.id} onClick={(e) => e.stopPropagation()}><Icon n="brief" s={12} />{r.client.biz}</Link> : null}
                      {r.auto ? <span className="st cus">אוטומטית</span> : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </Panel>
      </div>
      {edit ? <TaskModal task={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); load(); }} /> : null}
    </>
  );
}

function TaskModal({ task, onClose, onDone }: { task: Row; onClose: () => void; onDone: () => void }) {
  const { org, toast } = useApp();
  const [f, setF] = useState<Row>({
    title: task.title || "", description: task.description || "", start_date: task.start_date || today(), due_date: task.due_date || today(),
    link: task.lead_id ? "l:" + task.lead_id : task.client_id ? "c:" + task.client_id : "",
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
    };
    const { error } = task.id ? await sb().from("crm_tasks").update(row).eq("id", task.id) : await sb().from("crm_tasks").insert({ ...row, org_id: org });
    if (error) return toast(error.message, true);
    onDone();
  }
  return (
    <Modal title={task.id ? "עריכת משימה" : "משימה חדשה"} icon="tasks" onClose={onClose}>
      <form className="form" onSubmit={save}>
        <label className="field full"><span>כותרת</span><input className="inp" required autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
        <label className="field full"><span>תיאור</span><textarea className="inp" rows={4} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
        <label className="field"><span>תאריך התחלה</span><input className="inp" type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value, due_date: f.due_date < e.target.value ? e.target.value : f.due_date })} /></label>
        <label className="field"><span>תאריך סיום</span><input className="inp" type="date" value={f.due_date} min={f.start_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></label>
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
            await sb().from("crm_tasks").delete().eq("id", task.id); onDone();
          }}><Icon n="trash" s={15} />מחיקה</button> : null}
        </div>
      </form>
    </Modal>
  );
}
