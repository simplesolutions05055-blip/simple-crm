"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase/browser";
import { Top, Panel, Empty } from "@/components/Shell";
import Icon from "@/components/Icon";
import { useApp } from "@/components/AppCtx";
import AiPlanBox from "@/components/AiPlan";
import TaskModal from "@/components/TaskModal";
import { setTaskDone, doneNextStep } from "@/components/taskDone";
import { today, fmtDate, TASK_KINDS, taskKindCls, type Row, type TaskAttachment } from "@/lib/crm";
import { LinkPicker, AttachmentChips } from "@/components/TaskBits";

/* "הצעד הבא" written in a lead or client card shows here as an item, among the tasks, by its date and time */
const NEXT = "צעד הבא";
const OFF_LEAD = "(\"לקוח\",\"נפסל\",\"סגירת פנייה\")";
const when = (d?: string | null, tm?: string | null) => (d || "9999-99-99") + " " + (tm ? String(tm).slice(0, 5) : "00:00");

export default function Tasks() {
  const { org, toast, refreshCounts, settings } = useApp();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [nexts, setNexts] = useState<Row[]>([]);
  const [edit, setEdit] = useState<Row | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [kind, setKind] = useState("");
  const [assign, setAssign] = useState<string | null>(null);

  const load = async () => {
    const [{ data }, l, c] = await Promise.all([
      sb().from("crm_tasks").select("*,lead:crm_leads(id,name,biz),client:crm_clients(id,biz),project:crm_projects(id,name)").order("due_date"),
      sb().from("crm_leads").select("id,name,biz,next_step,next_at,next_time").not("next_at", "is", null).is("archived_at", null).not("stage", "in", OFF_LEAD),
      sb().from("crm_clients").select("id,biz,contact,next_step,next_at,next_time").not("next_at", "is", null).is("archived_at", null),
    ]);
    setNexts([
      ...(l.data || []).map((r: Row) => ({ id: "nl" + r.id, isNext: true, rec: "lead", recId: r.id, title: r.next_step || "צעד הבא", due_date: r.next_at, start_time: r.next_time, lead: { id: r.id, name: r.name, biz: r.biz } })),
      ...(c.data || []).map((r: Row) => ({ id: "nc" + r.id, isNext: true, rec: "client", recId: r.id, title: r.next_step || "צעד הבא", due_date: r.next_at, start_time: r.next_time, client: { id: r.id, biz: r.biz } })),
    ]);
    setRows(data || []);
    refreshCounts();
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const t = today();
  const ofKind = (r: Row) => !kind || (r.isNext ? NEXT : r.kind || "אחר") === kind;
  // nearest first: by date, then by the time that was set (no time = start of the day)
  const open = [...(rows || []), ...nexts].filter((r) => !r.done && ofKind(r)).sort((a, b) => when(a.due_date, a.start_time).localeCompare(when(b.due_date, b.start_time)));
  const groups = [
    { h: "באיחור", list: open.filter((r) => r.due_date < t), bad: true },
    { h: "היום", list: open.filter((r) => r.due_date === t) },
    { h: "בהמשך", list: open.filter((r) => r.due_date > t) },
    ...(showDone ? [{ h: "בוצעו", list: (rows || []).filter((r) => r.done && ofKind(r)).reverse() }] : []),
  ];

  async function link(r: Row, v: string) {
    const patch = { lead_id: v.startsWith("l:") ? v.slice(2) : null, client_id: v.startsWith("c:") ? v.slice(2) : null };
    setAssign(null);
    const { error } = await sb().from("crm_tasks").update(patch).eq("id", r.id);
    if (!error) load();
  }
  // done with a next step: clear it from the card and note it in the card's history
  async function doneNext(r: Row) {
    setNexts((x) => x.filter((y) => y.id !== r.id));
    const err = await doneNextStep(org, r.rec, r.recId, r.title);
    if (err) { toast("לא עודכן: " + err, true); load(); return; }
    refreshCounts();
    toast("סומן כבוצע. צעד הבא חדש קובעים בכרטיס");
  }
  async function toggle(r: Row) {
    if (r.isNext) return doneNext(r);
    const done = !r.done;
    setRows((x) => x!.map((y) => (y.id === r.id ? { ...y, done } : y)));
    const err = await setTaskDone(r, done, !!settings.gcal?.email);
    if (err) { setRows((x) => x!.map((y) => (y.id === r.id ? { ...y, done: r.done } : y))); return toast("לא עודכן: " + err, true); }
    refreshCounts();
    toast(done ? "סומנה כבוצעה" : "המשימה נפתחה מחדש");
  }

  return (
    <>
      <Top title="משימות" sub={rows ? open.length + " פתוחות" : ""} right={<button className="btn primary" onClick={() => setEdit({})}><Icon n="plus" s={16} />משימה חדשה</button>} />
      <div className="content">
        <AiPlanBox onChange={load} />
        <div className="bar">
          <div className="pills">
            <button type="button" className={"pillck" + (!kind ? " on" : "")} onClick={() => setKind("")}>כל הסוגים</button>
            <button type="button" className={"pillck" + (kind === NEXT ? " on" : "")} onClick={() => setKind(kind === NEXT ? "" : NEXT)}><span className="tkind tk-next dot" />{NEXT}</button>
            {TASK_KINDS.map((k) => <button key={k} type="button" className={"pillck" + (kind === k ? " on" : "")} onClick={() => setKind(kind === k ? "" : k)}><span className={taskKindCls(k) + " dot"} />{k}</button>)}
          </div>
          <label className="pillck" style={{ marginInlineStart: "auto" }}><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />להציג משימות שבוצעו</label>
        </div>
        <Panel>
          {!rows ? <div className="loading" style={{ minHeight: 120 }}>טוען…</div> : !open.length && !showDone ? <Empty>אין משימות פתוחות</Empty> : groups.filter((g) => g.list.length).map((g) => (
            <div key={g.h} className="tasks-g" style={{ marginBottom: 12 }}>
              <h3 style={g.bad ? { color: "var(--bad)" } : undefined}>{g.h} · {g.list.length}</h3>
              {g.list.map((r) => {
                const late = !r.done && r.due_date < t;
                const atts = (Array.isArray(r.attachments) ? r.attachments : []) as TaskAttachment[];
                return (
                  <div key={r.id} className={"tcard" + (r.done ? " done" : "")}>
                    <button type="button" className={"tcheck" + (r.done ? " on" : "")} onClick={() => toggle(r)} aria-label={r.done ? "פתיחה מחדש" : "סימון כבוצעה"} title={r.done ? "פתיחה מחדש" : "סימון כבוצעה"}><Icon n="check" s={15} /></button>
                    <div className="tcard-b">
                      {r.isNext ? <Link className="tcard-t" href={(r.rec === "lead" ? "/leads/" : "/clients/") + r.recId}>{r.title}</Link>
                        : <button type="button" className="tcard-t" onClick={() => setEdit(r)}>{r.title}</button>}
                      {r.description ? <div className="tdesc">{r.description}</div> : null}
                      <div className="tcard-m">
                        {r.isNext ? <span className="tkind tk-next">{NEXT}</span> : <span className={taskKindCls(r.kind)}>{r.kind || "אחר"}</span>}
                        {r.client ? <Link className="tlink c" href={"/clients/" + r.client.id}><Icon n="brief" s={12} />לקוח · {r.client.biz}</Link>
                          : r.lead ? <Link className="tlink l" href={"/leads/" + r.lead.id}><Icon n="target" s={12} />ליד · {r.lead.name}</Link>
                          : assign === r.id ? <div className="tlink-pick"><LinkPicker value="" autoFocus onPick={(v) => v ? link(r, v) : setAssign(null)} /></div>
                          : <button type="button" className="tlink add" onClick={() => setAssign(r.id)}>+ שיוך ללקוח או ליד</button>}
                        {r.project ? <Link className="tlink" href={"/projects/" + r.project.id}><Icon n="layout" s={12} />פרויקט · {r.project.name}</Link> : null}
                        <span className={"tdate" + (late ? " bad" : "")}><Icon n="cal" s={12} />{late ? "באיחור · " : ""}{r.start_date && r.start_date !== r.due_date ? fmtDate(r.start_date) + " עד " : ""}{fmtDate(r.due_date)}{r.start_time ? " · " + String(r.start_time).slice(0, 5) : ""}</span>
                        {r.auto ? <span className="st cus">אוטומטית</span> : null}
                        {r.source === "AI" ? <span className="st info">מהתוכנית</span> : null}
                        {r.gcal_event_id ? <span className="meta"><Icon n="cal" s={12} />ביומן</span> : null}
                      </div>
                      <AttachmentChips list={atts} task={r} />
                    </div>
                    {r.isNext ? <Link className="btn sm" href={(r.rec === "lead" ? "/leads/" : "/clients/") + r.recId}><Icon n="pen" s={14} />בכרטיס</Link>
                      : <button type="button" className="btn sm" onClick={() => setEdit(r)}><Icon n="pen" s={14} />עריכה</button>}
                  </div>
                );
              })}
            </div>
          ))}
        </Panel>
      </div>
      {edit ? <TaskModal task={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); load(); }} /> : null}
    </>
  );
}
