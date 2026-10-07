"use client";
/* daily schedule: Google Calendar events + CRM tasks, in Israel time */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { sb } from "@/lib/supabase/browser";
import { Top, Panel, Empty } from "@/components/Shell";
import Icon from "@/components/Icon";
import { useApp } from "@/components/AppCtx";
import TaskModal from "@/components/TaskModal";
import { today, type Row } from "@/lib/crm";

type Item = { key: string; kind: "g" | "t"; title: string; start: number; end: number; allDay: boolean; date: string; done?: boolean; link?: string; task?: Row; sub?: string };

const HOUR_PX = 56;
const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const addDays = (d: string, n: number) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10) + n)).toISOString().slice(0, 10);
const dow = (d: string) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))).getUTCDay();
const label = (d: string) => DAYS[dow(d)] + ", " + +d.slice(8, 10) + "." + +d.slice(5, 7);
/* minutes since midnight, Israel time */
function ilParts(iso: string) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(new Date(iso)).reduce<Record<string, string>>((a, x) => ((a[x.type] = x.value), a), {});
  return { date: p.year + "-" + p.month + "-" + p.day, min: +p.hour * 60 + +p.minute };
}
const hhmm = (m: number) => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");

export default function Calendar() {
  const { settings, org, orgs, switchOrg, toast } = useApp();
  const [day, setDay] = useState(today());
  const [view, setView] = useState<"day" | "week">("day");
  const [g, setG] = useState<{ connected: boolean; reason?: string; events: Row[] } | null>(null);
  const [tasks, setTasks] = useState<Row[]>([]);
  const [pending, setPending] = useState(0);
  const [edit, setEdit] = useState<Row | null>(null);
  const [now, setNow] = useState(() => ilParts(new Date().toISOString()));

  const from = view === "day" ? day : addDays(day, -dow(day));
  const to = view === "day" ? day : addDays(from, 6);

  const load = useCallback(async () => {
    const [ev, t, s] = await Promise.all([
      settings.gcal?.email ? fetch(`/api/gcal/events?from=${from}&to=${to}`).then((r) => r.json()).catch(() => ({ connected: true, reason: "error", events: [] })) : Promise.resolve({ connected: false, events: [] }),
      sb().rpc("crm_calendar_tasks", { p_from: from, p_to: to }), // shared calendar: tasks of every business
      sb().from("crm_ai_suggestions").select("id", { count: "exact", head: true }).eq("status", "מוצעת"),
    ]);
    setG(ev); setTasks((t.data as Row[]) || []); setPending(s.count || 0);
  }, [from, to, settings.gcal?.email]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const h = setInterval(() => setNow(ilParts(new Date().toISOString())), 60000); return () => clearInterval(h); }, []);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const e of g?.events || []) {
      if (e.crmTask) continue; // shown as the CRM task itself
      if (e.allDay) {
        for (let d = e.start; d < (e.end || addDays(e.start, 1)); d = addDays(d, 1)) out.push({ key: "g" + e.id + d, kind: "g", title: e.title, start: 0, end: 0, allDay: true, date: d, link: e.link });
      } else {
        const s = ilParts(e.start), en = ilParts(e.end || e.start);
        out.push({ key: "g" + e.id, kind: "g", title: e.title, start: s.min, end: en.date === s.date ? Math.max(en.min, s.min + 15) : 24 * 60, allDay: false, date: s.date, link: e.link, sub: e.location });
      }
    }
    for (const t of tasks) {
      const st = t.start_time ? +String(t.start_time).slice(0, 2) * 60 + +String(t.start_time).slice(3, 5) : 0;
      const other = orgs.length > 1 && t.org_id !== org ? (t.org_brand?.short || t.org_name) : "";
      out.push({ key: "t" + t.id, kind: "t", title: (other ? "[" + other + "] " : "") + t.title, start: st, end: st + (t.duration_min || 30), allDay: !t.start_time, date: t.due_date, done: t.done, task: t, sub: t.client?.biz || t.lead?.name || "" });
    }
    return out;
  }, [g, tasks, org, orgs.length]);

  const dayItems = items.filter((i) => i.date === day);
  const timed = dayItems.filter((i) => !i.allDay).sort((a, b) => a.start - b.start);
  const untimed = dayItems.filter((i) => i.allDay);
  const startH = Math.min(7, ...timed.map((i) => Math.floor(i.start / 60)));
  const endH = Math.max(21, ...timed.map((i) => Math.ceil(i.end / 60)));
  // side-by-side columns for overlapping items
  const lanes: { it: Item; col: number; cols: number }[] = [];
  let group: { it: Item; col: number }[] = []; let groupEnd = -1;
  const flush = () => { const n = Math.max(...group.map((x) => x.col)) + 1; group.forEach((x) => lanes.push({ ...x, cols: n })); group = []; };
  for (const it of timed) {
    if (group.length && it.start >= groupEnd) flush();
    const used = new Set(group.filter((x) => x.it.end > it.start).map((x) => x.col));
    let c = 0; while (used.has(c)) c++;
    group.push({ it, col: c }); groupEnd = Math.max(groupEnd, it.end);
  }
  if (group.length) flush();

  const openItem = (i: Item) => {
    if (i.kind === "t" && i.task!.org_id !== org) {
      // a task of the other business opens there
      const name = i.task!.org_brand?.short || i.task!.org_name;
      toast("המשימה שייכת ל-" + name + ". עובר אליו…");
      switchOrg(i.task!.org_id, "/calendar");
      return;
    }
    if (i.kind === "t") return setEdit(i.task!);
    if (i.link) window.open(i.link, "_blank", "noopener");
  };
  const connected = !!settings.gcal?.email && g?.connected !== false && g?.reason !== "reconnect";

  return (
    <>
      <Top title="יומן" sub={settings.gcal?.email ? "מסונכרן עם יומן גוגל" : "יומן גוגל עוד לא מחובר"}
        right={<button className="btn primary" onClick={() => setEdit({ due_date: day, start_date: day })}><Icon n="plus" s={16} />משימה ביומן</button>} />
      <div className="content">
        <div className="cal-head">
          <button className="btn sm" onClick={() => setDay(addDays(day, view === "day" ? 1 : 7))} aria-label="הבא"><Icon n="chev" s={15} /></button>
          <button className="btn sm" onClick={() => setDay(addDays(day, view === "day" ? -1 : -7))} aria-label="הקודם"><span style={{ display: "inline-flex", transform: "scaleX(-1)" }}><Icon n="chev" s={15} /></span></button>
          <button className="btn sm ghost" onClick={() => setDay(today())}>היום</button>
          <h2>{view === "day" ? label(day) : label(from) + " עד " + label(to)}</h2>
          <input className="inp sm" type="date" style={{ width: 150 }} value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
          <div className="tabs" style={{ border: 0, padding: 0, marginInlineStart: "auto" }}>
            <button className={"btn sm" + (view === "day" ? " on" : "")} onClick={() => setView("day")}>יום</button>
            <button className={"btn sm" + (view === "week" ? " on" : "")} onClick={() => setView("week")}>שבוע</button>
          </div>
        </div>

        {view === "week" ? (
          <div className="cal-week">
            {Array.from({ length: 7 }, (_, i) => addDays(from, i)).map((d) => {
              const list = items.filter((x) => x.date === d).sort((a, b) => Number(!a.allDay) - Number(!b.allDay) || a.start - b.start);
              return (
                <div key={d} className={"cal-day" + (d === today() ? " today" : "")} onClick={() => { setDay(d); setView("day"); }}>
                  <h4>{label(d)}</h4>
                  {list.map((x) => <div key={x.key} className={"cal-chip " + x.kind}>{x.allDay ? "" : hhmm(x.start) + " "}{x.title}</div>)}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="cal-wrap">
            <Panel>
              {untimed.length ? (
                <div className="cal-allday">
                  {untimed.map((i) => <button key={i.key} className={"cal-chip " + i.kind} style={{ border: 0, cursor: "pointer" }} onClick={() => openItem(i)}>{i.kind === "t" ? "משימה: " : ""}{i.title}</button>)}
                </div>
              ) : null}
              <div className="cal-grid" style={{ height: (endH - startH) * HOUR_PX }}>
                {Array.from({ length: endH - startH }, (_, k) => (
                  <div key={k} className="cal-hour" onDoubleClick={() => setEdit({ due_date: day, start_date: day, start_time: hhmm((startH + k) * 60) })}><span>{hhmm((startH + k) * 60)}</span></div>
                ))}
                {day === now.date && now.min >= startH * 60 && now.min <= endH * 60 ? <div className="cal-now" style={{ top: ((now.min - startH * 60) / 60) * HOUR_PX }} /> : null}
                {lanes.map(({ it, col, cols }) => {
                  const top = ((it.start - startH * 60) / 60) * HOUR_PX;
                  const h = Math.max(((it.end - it.start) / 60) * HOUR_PX - 2, 22);
                  return (
                    <a key={it.key} className={"cal-ev " + it.kind + (it.done ? " done" : "")} onClick={() => openItem(it)}
                      style={{ top, height: h, right: `calc(52px + (100% - 56px) * ${col / cols})`, left: "auto", width: `calc((100% - 56px) / ${cols} - 4px)` }}>
                      <b>{it.title}</b>
                      <span>{hhmm(it.start)} עד {hhmm(Math.min(it.end, 24 * 60 - 1))}{it.sub ? " · " + it.sub : ""}</span>
                    </a>
                  );
                })}
              </div>
              {!dayItems.length ? <p className="tiny" style={{ marginBottom: 0 }}>אין אירועים ומשימות ביום הזה. לחיצה כפולה על שעה פותחת משימה חדשה בשעה הזו.</p> : null}
            </Panel>
            <div className="col">
              {!settings.gcal?.email ? (
                <Panel icon="cal" title="חיבור יומן גוגל">
                  <p className="tiny lead" style={{ marginTop: 0 }}>אחרי החיבור, הפגישות מהיומן שלך יופיעו כאן, ומשימות שאישרת עם שעה ייכנסו ליומן הגוגל.</p>
                  <a className="btn primary" href="/api/gcal/connect"><Icon n="link" s={15} />חיבור יומן גוגל</a>
                </Panel>
              ) : !connected ? (
                <Panel icon="alert" title="החיבור ליומן נותק">
                  <p className="tiny" style={{ marginTop: 0 }}>צריך לחבר מחדש כדי לראות את הפגישות.</p>
                  <a className="btn primary" href="/api/gcal/connect">חיבור מחדש</a>
                </Panel>
              ) : null}
              <Panel icon="tasks" title="סיכום היום">
                <div className="lrow"><span className="grow">פגישות מהיומן</span><b>{dayItems.filter((i) => i.kind === "g").length}</b></div>
                <div className="lrow"><span className="grow">משימות פתוחות</span><b>{dayItems.filter((i) => i.kind === "t" && !i.done).length}</b></div>
                <div className="lrow"><span className="grow">בוצעו</span><b>{dayItems.filter((i) => i.kind === "t" && i.done).length}</b></div>
              </Panel>
              {pending ? (
                <Panel icon="star" title="משימות מחכות לאישור">
                  <p className="tiny" style={{ marginTop: 0 }}>{pending} משימות מהתוכנית מחכות לך במסך המשימות. אחרי אישור הן נכנסות ליומן.</p>
                  <Link className="btn sm" href="/tasks">למשימות</Link>
                </Panel>
              ) : null}
              {!g ? null : g.reason && g.reason !== "not_connected" && connected ? <Empty>לא הצלחתי לטעון את היומן כרגע</Empty> : null}
            </div>
          </div>
        )}
      </div>
      {edit ? <TaskModal task={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); load(); }} /> : null}
    </>
  );
}
