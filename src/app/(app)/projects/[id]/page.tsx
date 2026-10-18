"use client";
/* one project: status, client, dates, value and description, with its own task list */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { sb } from "@/lib/supabase/browser";
import { Top, Panel, St } from "@/components/Shell";
import Icon from "@/components/Icon";
import { useApp } from "@/components/AppCtx";
import { TasksBox } from "@/components/Blocks";
import ProjectForm from "@/components/ProjectForm";
import { PROJECT_STATUSES, PROJECT_ST_CLS, fmtDate, money, projectWho, today, type Row } from "@/lib/crm";

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useApp();
  const [p, setP] = useState<Row | null>(null);
  const [edit, setEdit] = useState(false);

  const load = async () => {
    const { data } = await sb().from("crm_projects")
      .select("*,client:crm_clients(id,biz,contact,phone),lead:crm_leads(id,name,biz,phone),tasks:crm_tasks(id,done)").eq("id", id).single();
    setP(data || { missing: true });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [id]);

  async function setStatus(status: string) {
    if (!p || p.status === status) return;
    setP({ ...p, status });
    const { error } = await sb().from("crm_projects").update({ status }).eq("id", p.id);
    if (error) { toast(error.message, true); load(); } else toast("הסטטוס עודכן: " + status);
  }
  async function archive() {
    if (!p || !confirm("להעביר את \"" + p.name + "\" לארכיון? המשימות שלו נשארות.")) return;
    const { error } = await sb().from("crm_projects").update({ archived_at: new Date().toISOString() }).eq("id", p.id);
    if (error) return toast(error.message, true);
    toast("הפרויקט הועבר לארכיון");
    router.push("/projects");
  }

  if (!p) return <><Top title="פרויקט" crumb={{ href: "/projects", label: "פרויקטים" }} /><div className="loading" style={{ minHeight: 200 }}>טוען…</div></>;
  if (p.missing) return <><Top title="פרויקט" crumb={{ href: "/projects", label: "פרויקטים" }} /><div className="content"><Panel><p>הפרויקט לא נמצא.</p></Panel></div></>;

  const tasks = (p.tasks || []) as Row[];
  const done = tasks.filter((t) => t.done).length;
  const late = p.due_date && p.due_date < today() && p.status !== "הושלם";
  const who = projectWho(p);
  const whoHref = p.client ? "/clients/" + p.client.id : p.lead ? "/leads/" + p.lead.id : "";

  return (
    <>
      <Top title={p.name} crumb={{ href: "/projects", label: "פרויקטים" }}
        sub={<><St cls={PROJECT_ST_CLS[p.status]}>{p.status}</St>{who ? " · " + who : ""}{p.archived_at ? " · בארכיון" : ""}</>}
        right={<>
          <button className="btn" onClick={() => setEdit(true)}><Icon n="pen" s={16} />עריכה</button>
          {!p.archived_at ? <button className="btn ghost" onClick={archive}><Icon n="trash" s={16} />לארכיון</button> : null}
        </>} />
      <div className="content">
        <div className="split">
          <div className="col">
            <Panel icon="flag" title="סטטוס">
              <div className="pills">{PROJECT_STATUSES.map((s) => <button key={s} type="button" className={"pillck" + (p.status === s ? " on" : "")} onClick={() => setStatus(s)}>{s}</button>)}</div>
            </Panel>
            <Panel icon="layout" title="פרטי הפרויקט">
              <div className="lrow"><span className="grow">לקוח</span><b>{who ? (whoHref ? <Link href={whoHref}>{who}</Link> : who) : <span className="faint">לא שויך</span>}</b></div>
              <div className="lrow"><span className="grow">התחלה</span><b>{p.start_date ? fmtDate(p.start_date) : "-"}</b></div>
              <div className="lrow"><span className="grow">תאריך יעד</span><b style={late ? { color: "var(--bad)" } : undefined}>{p.due_date ? (late ? "באיחור · " : "") + fmtDate(p.due_date) : "-"}</b></div>
              <div className="lrow"><span className="grow">שווי</span><b>{p.value ? money(Number(p.value)) : "-"}</b></div>
              <div className="lrow"><span className="grow">משימות</span><b>{tasks.length ? done + " מתוך " + tasks.length + " בוצעו" : "אין עדיין"}</b></div>
              {tasks.length ? <div className="pbar" style={{ marginTop: 8 }}><span style={{ width: Math.round((done / tasks.length) * 100) + "%" }} /></div> : null}
              {p.description ? <p style={{ whiteSpace: "pre-wrap", marginBottom: 0 }} dir="auto">{p.description}</p> : null}
            </Panel>
          </div>
          <div className="col">
            <TasksBox projectId={p.id} clientId={p.client?.id} leadId={p.client ? undefined : p.lead?.id} onChange={load} />
          </div>
        </div>
      </div>
      {edit ? <ProjectForm project={p} onClose={() => setEdit(false)} onDone={() => { setEdit(false); load(); }} /> : null}
    </>
  );
}
