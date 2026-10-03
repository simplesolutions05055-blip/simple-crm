"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase/browser";
import { Top, Panel, Empty } from "@/components/Shell";
import Icon from "@/components/Icon";
import { useApp } from "@/components/AppCtx";
import AiPlanBox, { pushToCalendar } from "@/components/AiPlan";
import TaskModal from "@/components/TaskModal";
import { today, fmtDate, type Row } from "@/lib/crm";

export default function Tasks() {
  const { refreshCounts, settings } = useApp();
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
    if (settings.gcal?.email && r.gcal_event_id && !r.done) pushToCalendar(r.id, true);
  }

  return (
    <>
      <Top title="משימות" sub={rows ? open.length + " פתוחות" : ""} right={<button className="btn primary" onClick={() => setEdit({})}><Icon n="plus" s={16} />משימה חדשה</button>} />
      <div className="content">
        <AiPlanBox onChange={load} />
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
                      <span className={"meta" + (!r.done && r.due_date < t ? " bad" : "")}><Icon n="cal" s={13} />{r.start_date !== r.due_date ? fmtDate(r.start_date) + " עד " : ""}{fmtDate(r.due_date)}{r.start_time ? " · " + String(r.start_time).slice(0, 5) : ""}</span>
                      {r.lead ? <Link className="rchip" href={"/leads/" + r.lead.id} onClick={(e) => e.stopPropagation()}><Icon n="target" s={12} />{r.lead.name}</Link> : null}
                      {r.client ? <Link className="rchip" href={"/clients/" + r.client.id} onClick={(e) => e.stopPropagation()}><Icon n="brief" s={12} />{r.client.biz}</Link> : null}
                      {r.auto ? <span className="st cus">אוטומטית</span> : null}
                      {r.source === "AI" ? <span className="st info">מהתוכנית</span> : null}
                      {r.gcal_event_id ? <span className="meta"><Icon n="cal" s={12} />ביומן</span> : null}
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
