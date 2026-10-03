"use client";
/* AI-proposed tasks from the active business plan. Nothing shows when there is no active plan. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { sb } from "@/lib/supabase/browser";
import Icon from "./Icon";
import { Panel, St } from "./Shell";
import { useApp } from "./AppCtx";
import { fmtDate, today, type Row } from "@/lib/crm";

export async function pushToCalendar(taskId: string, remove = false) {
  const r = await fetch("/api/gcal/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ task_id: taskId, remove }) });
  return r.ok;
}

const KIND_CLS: Record<string, string> = { "מכירות": "ok", "תוכן": "cus", "הצעת מחיר": "info", "לקוחות": "warn" };

export default function AiPlanBox({ onChange }: { onChange?: () => void }) {
  const { settings, toast, refreshCounts } = useApp();
  const [plan, setPlan] = useState<Row | null | undefined>(undefined);
  const [rows, setRows] = useState<Row[]>([]);
  const [edits, setEdits] = useState<Record<string, Row>>({});
  const [busy, setBusy] = useState("");
  const [openPlan, setOpenPlan] = useState(false);
  const gcal = !!settings.gcal?.email;

  const load = async () => {
    const { data: p } = await sb().from("crm_plans").select("*").eq("status", "פעילה").order("created_at", { ascending: false }).limit(1).maybeSingle();
    setPlan(p || null);
    if (!p) { setRows([]); return; }
    const { data } = await sb().from("crm_ai_suggestions").select("*,lead:crm_leads(id,name),client:crm_clients(id,biz)")
      .eq("plan_id", p.id).eq("status", "מוצעת").order("due_date").order("start_time", { nullsFirst: false });
    setRows(data || []);
  };
  useEffect(() => { load(); }, []);

  const ed = (r: Row) => edits[r.id] || { due_date: r.due_date, start_time: r.start_time ? String(r.start_time).slice(0, 5) : "" };
  const setEd = (r: Row, patch: Row) => setEdits((x) => ({ ...x, [r.id]: { ...ed(r), ...patch } }));

  async function approve(r: Row, quiet = false) {
    setBusy(r.id);
    const e = ed(r);
    const { data: taskId, error } = await sb().rpc("crm_ai_approve", { p_id: r.id, p_patch: { due_date: e.due_date, start_time: e.start_time || "" } });
    setBusy("");
    if (error) { toast("לא אושר: " + error.message, true); return false; }
    if (gcal && taskId) await pushToCalendar(String(taskId));
    if (!quiet) { toast("נוספה למשימות" + (gcal ? " וליומן" : "")); load(); onChange?.(); refreshCounts(); }
    return true;
  }
  async function reject(r: Row) {
    await sb().from("crm_ai_suggestions").update({ status: "נדחתה" }).eq("id", r.id);
    setRows((x) => x.filter((y) => y.id !== r.id));
  }

  if (plan === undefined) return null;
  if (!plan) {
    return (
      <div className="ai-empty">
        <Icon n="star" s={15} />
        <span>אין תוכנית עבודה פעילה, ולכן אין משימות מוצעות. כשתבנה תוכנית בצ&apos;אט, המשימות שנגזרות ממנה יופיעו כאן לאישור.</span>
      </div>
    );
  }

  const goals: Row[] = Array.isArray(plan.goals) ? plan.goals : [];
  const days = Array.from(new Set(rows.map((r) => ed(r).due_date))).sort();
  const t = today();

  return (
    <Panel icon="star" title="משימות מוצעות לפי התוכנית" className="ai-box"
      right={rows.length > 1 ? <button className="btn sm primary" disabled={!!busy} onClick={async () => {
        for (const r of rows) await approve(r, true);
        toast("כל המשימות נוספו" + (gcal ? " וליומן" : "")); load(); onChange?.(); refreshCounts();
      }}><Icon n="check" s={15} />אישור הכל ({rows.length})</button> : null}>
      <button className="ai-plan" onClick={() => setOpenPlan(!openPlan)}>
        <span className="grow">
          <b>{plan.title}</b>
          <span className="meta">{plan.period_start ? fmtDate(plan.period_start) + " עד " + fmtDate(plan.period_end) : "תוכנית פעילה"} · {goals.length} יעדים</span>
        </span>
        <Icon n="chev" s={15} />
      </button>
      {openPlan ? (
        <div className="ai-goals">
          {plan.summary ? <p className="tiny" style={{ margin: "0 0 10px", whiteSpace: "pre-wrap" }}>{plan.summary}</p> : null}
          {goals.map((g, i) => (
            <div key={i} className="ai-goal"><b>{g.goal || g.title}</b>{g.target ? <span className="meta">{g.metric ? g.metric + ": " : ""}{g.target}</span> : null}</div>
          ))}
        </div>
      ) : null}

      {!rows.length ? <p className="tiny" style={{ marginBottom: 0 }}>אין כרגע משימות שמחכות לאישור. משימות חדשות מגיעות כשמעדכנים את התוכנית בצ&apos;אט.</p> : days.map((d) => (
        <div key={d} className="tasks-g">
          <h3 style={d < t ? { color: "var(--bad)" } : undefined}>{d === t ? "היום" : fmtDate(d)}</h3>
          {rows.filter((r) => ed(r).due_date === d).map((r) => (
            <div key={r.id} className="ai-row">
              <div className="grow">
                <div className="bar" style={{ gap: 8 }}>
                  <St cls={KIND_CLS[r.kind]}>{r.kind}</St>
                  <b>{r.title}</b>
                </div>
                {r.description ? <div className="tdesc">{r.description}</div> : null}
                {r.reason ? <div className="meta" style={{ marginTop: 4 }}>למה עכשיו: {r.reason}</div> : null}
                <div className="bar" style={{ marginTop: 8 }}>
                  {r.goal ? <span className="rchip" style={{ cursor: "default" }}><Icon n="flag" s={12} />{r.goal}</span> : null}
                  {r.lead ? <Link className="rchip" href={"/leads/" + r.lead.id}><Icon n="target" s={12} />{r.lead.name}</Link> : null}
                  {r.client ? <Link className="rchip" href={"/clients/" + r.client.id}><Icon n="brief" s={12} />{r.client.biz}</Link> : null}
                </div>
              </div>
              <div className="ai-act">
                <input className="inp sm" type="date" value={ed(r).due_date} onChange={(e) => setEd(r, { due_date: e.target.value })} />
                <input className="inp sm" type="time" value={ed(r).start_time} onChange={(e) => setEd(r, { start_time: e.target.value })} title="שעה (לא חובה)" />
                <div className="bar" style={{ gap: 6 }}>
                  <button className="btn sm primary" disabled={busy === r.id} onClick={() => approve(r)}><Icon n="check" s={14} />אישור</button>
                  <button className="btn sm ghost" onClick={() => reject(r)}>דחייה</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </Panel>
  );
}
