"use client";
/* project checklist (the steps that make up the progress %) and the projects box shown in client and lead cards.
   Both read and write the same rows, so a step ticked in one place shows everywhere. */
import Link from "next/link";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase/browser";
import { Panel, St } from "./Shell";
import Icon from "./Icon";
import { useApp } from "./AppCtx";
import ProjectForm from "./ProjectForm";
import { PROJECT_ST_CLS, fmtDate, today, type Row } from "@/lib/crm";
import { progress } from "@/lib/projects";

export function Progress({ done, total, big }: { done: number; total: number; big?: boolean }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  if (!total) return <span className="meta faint">אין עדיין שלבים</span>;
  return (
    <div className={"pbar" + (big ? " big" : "")} title={done + " מתוך " + total + " שלבים"}>
      <span style={{ width: pct + "%" }} />
      <em>{big ? done + " מתוך " + total + " שלבים · " + pct + "%" : pct + "%"}</em>
    </div>
  );
}

/* the steps of one project. Ticking applies the rules: first tick moves "בתכנון" to "בעבודה",
   the last tick asks whether to mark the project "הושלם". */
export function Checklist({ project, onChange, compact }: { project: Row; onChange?: (p: { done: number; total: number; status: string }) => void; compact?: boolean }) {
  const { org, toast } = useApp();
  const [items, setItems] = useState<Row[] | null>(null);
  const [title, setTitle] = useState("");
  const [drag, setDrag] = useState<string | null>(null);
  const [status, setStatus] = useState<string>(project.status);
  useEffect(() => setStatus(project.status), [project.status]);

  const load = async () => {
    const { data } = await sb().from("crm_project_items").select("*").eq("project_id", project.id).order("pos").order("created_at");
    setItems(data || []);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [project.id]);

  const report = (list: Row[], st: string) => onChange?.({ done: list.filter((i) => i.done).length, total: list.length, status: st });

  async function setProjectStatus(st: string) {
    const { error } = await sb().from("crm_projects").update({ status: st }).eq("id", project.id);
    if (error) { toast(error.message, true); return status; }
    setStatus(st);
    toast("הסטטוס עודכן: " + st);
    return st;
  }

  async function toggle(it: Row) {
    if (!items) return;
    const done = !it.done;
    const list = items.map((x) => (x.id === it.id ? { ...x, done, done_at: done ? new Date().toISOString() : null } : x));
    setItems(list);
    const { error } = await sb().from("crm_project_items").update({ done, done_at: done ? new Date().toISOString() : null }).eq("id", it.id);
    if (error) { toast(error.message, true); load(); return; }
    let st = status;
    const n = list.filter((x) => x.done).length;
    if (done && st === "בתכנון") st = await setProjectStatus("בעבודה");
    if (done && n === list.length && st !== "הושלם" && confirm("כל השלבים סומנו. לסמן את הפרויקט כהושלם?")) st = await setProjectStatus("הושלם");
    report(list, st);
  }

  async function add() {
    const t = title.trim();
    if (!t || !items) return;
    const pos = items.length ? Math.max(...items.map((i) => i.pos || 0)) + 1 : 0;
    const { data, error } = await sb().from("crm_project_items").insert({ org_id: org, project_id: project.id, title: t, pos }).select("*").single();
    if (error) return toast(error.message, true);
    const list = [...items, data];
    setItems(list); setTitle("");
    report(list, status);
  }

  async function remove(it: Row) {
    if (!items || !confirm("למחוק את השלב \"" + it.title + "\"?")) return;
    const { error } = await sb().from("crm_project_items").delete().eq("id", it.id);
    if (error) return toast(error.message, true);
    const list = items.filter((x) => x.id !== it.id);
    setItems(list);
    report(list, status);
  }

  async function drop(targetId: string) {
    if (!items || !drag || drag === targetId) return;
    const list = [...items];
    const from = list.findIndex((x) => x.id === drag), to = list.findIndex((x) => x.id === targetId);
    const [m] = list.splice(from, 1);
    list.splice(to, 0, m);
    const next: Row[] = list.map((x, i) => ({ ...x, pos: i }));
    setItems(next);
    const changed = next.filter((x, i) => items.find((y) => y.id === x.id)?.pos !== i);
    const res = await Promise.all(changed.map((x) => sb().from("crm_project_items").update({ pos: x.pos }).eq("id", x.id)));
    if (res.some((r) => r.error)) { toast("הסדר לא נשמר", true); load(); }
  }

  if (!items) return <div className="loading" style={{ minHeight: 60 }}>טוען…</div>;
  const done = items.filter((i) => i.done).length;
  return (
    <div className={"chk" + (compact ? " compact" : "")}>
      {!compact ? <div style={{ marginBottom: 18 }}><Progress done={done} total={items.length} big /></div> : null}
      {items.map((it) => (
        <div key={it.id} className={"chk-row" + (it.done ? " done" : "") + (drag === it.id ? " drag" : "")}
          draggable onDragStart={() => setDrag(it.id)} onDragEnd={() => setDrag(null)}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); drop(it.id); setDrag(null); }}>
          <span className="grip" title="גוררים כדי לשנות סדר">⋮⋮</span>
          <label className="grow">
            <input type="checkbox" checked={!!it.done} onChange={() => toggle(it)} />
            <span>{it.title}</span>
          </label>
          {it.done && it.done_at ? <span className="meta faint">{fmtDate(it.done_at)}</span> : null}
          <button type="button" className="btn icon sm ghost" title="מחיקת שלב" onClick={() => remove(it)}><Icon n="x" s={14} /></button>
        </div>
      ))}
      <div className="taskadd">
        <input className="inp sm" placeholder="שלב חדש, ואז Enter" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button type="button" className="btn sm" onClick={add}><Icon n="plus" s={15} /></button>
      </div>
    </div>
  );
}

/* "פרויקטים" box in a client or lead card: one row per project, a tap opens its checklist in place */
export function ProjectsBox({ clientId, leadId }: { clientId?: string; leadId?: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = async () => {
    let q = sb().from("crm_projects").select("*,items:crm_project_items(id,done)").is("archived_at", null);
    q = clientId ? q.eq("client_id", clientId) : q.eq("lead_id", leadId!);
    const { data } = await q.order("created_at", { ascending: false });
    const list = (data || []) as Row[];
    // finished projects go to the bottom
    list.sort((a, b) => Number(a.status === "הושלם") - Number(b.status === "הושלם"));
    setRows(list);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [clientId, leadId]);

  function patch(id: string, p: { done: number; total: number; status: string }) {
    setRows((r) => (r || []).map((x) => (x.id === id
      ? { ...x, status: p.status, items: Array.from({ length: p.total }, (_, i) => ({ id: String(i), done: i < p.done })) }
      : x)));
  }

  return (
    <Panel icon="layout" title="פרויקטים" right={<button className="btn sm" onClick={() => setAdding(true)}><Icon n="plus" s={15} />פרויקט חדש</button>}>
      {!rows ? <div className="loading" style={{ minHeight: 60 }}>טוען…</div> : !rows.length ? <p className="faint" style={{ margin: 0 }}>אין עדיין פרויקטים.</p> : rows.map((p) => {
        const pr = progress(p);
        const late = p.due_date && p.due_date < today() && p.status !== "הושלם";
        const isOpen = open === p.id;
        return (
          <div key={p.id} className={"prow" + (p.status === "הושלם" ? " fin" : "") + (isOpen ? " open" : "")}>
            <button type="button" className="prow-h" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : p.id)}>
              <span className="grow">
                <b>{p.name}</b>
                <span className="meta" style={late ? { color: "var(--bad)" } : undefined}>
                  <St cls={PROJECT_ST_CLS[p.status]}>{p.status}</St>
                  {p.due_date ? " · " + (late ? "באיחור · " : "יעד ") + fmtDate(p.due_date) : ""}
                </span>
              </span>
              <span className="prow-pct">{pr.total ? pr.pct + "%" : "-"}</span>
              <span className="btn sm ghost">{isOpen ? "▴" : "▾"}</span>
            </button>
            {pr.total ? <div className="pbar"><span style={{ width: pr.pct + "%" }} /></div> : null}
            {isOpen ? (
              <div className="prow-b">
                <Checklist project={p} compact onChange={(x) => patch(p.id, x)} />
                <Link className="btn sm" href={"/projects/" + p.id} style={{ marginTop: 8 }}>לעמוד הפרויקט<Icon n="chev" s={14} /></Link>
              </div>
            ) : null}
          </div>
        );
      })}
      {adding ? (
        <ProjectForm project={clientId ? { client_id: clientId } : { lead_id: leadId }} onClose={() => setAdding(false)}
          onDone={(id) => { setAdding(false); setOpen(id); load(); }} />
      ) : null}
    </Panel>
  );
}
