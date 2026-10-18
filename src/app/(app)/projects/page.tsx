"use client";
/* פרויקטים: a board of the business's projects by status. Each card shows the client, the target date
   and the checklist progress %. Drag a card between columns to change its status. */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { sb } from "@/lib/supabase/browser";
import { Top } from "@/components/Shell";
import Icon from "@/components/Icon";
import { useApp } from "@/components/AppCtx";
import ProjectForm from "@/components/ProjectForm";
import { PROJECT_STATUSES, fmtDate, money, projectWho, today, type Row } from "@/lib/crm";
import { progress } from "@/lib/projects";

export default function Projects() {
  const { toast } = useApp();
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");
  const [showFrozen, setShowFrozen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [over, setOver] = useState<string | null>(null);

  const load = async () => {
    const { data } = await sb().from("crm_projects")
      .select("*,client:crm_clients(id,biz),lead:crm_leads(id,name,biz),items:crm_project_items(id,done)")
      .is("archived_at", null).order("due_date", { ascending: true, nullsFirst: false });
    setRows(data || []);
  };
  useEffect(() => { load(); }, []);

  const cols = PROJECT_STATUSES.filter((s) => showFrozen || s !== "מוקפא");
  const filtered = useMemo(() => {
    const t = q.trim();
    return (rows || []).filter((p) => !t || [p.name, projectWho(p), p.description].join(" ").includes(t));
  }, [rows, q]);
  const active = (rows || []).filter((p) => p.status !== "הושלם" && p.status !== "מוקפא");

  async function move(id: string, status: string) {
    const p = (rows || []).find((x) => x.id === id);
    if (!p || p.status === status) return;
    setRows((x) => x!.map((y) => (y.id === id ? { ...y, status } : y)));
    const { error } = await sb().from("crm_projects").update({ status }).eq("id", id);
    if (error) { toast(error.message, true); load(); }
  }

  return (
    <>
      <Top title="פרויקטים" sub={rows ? active.length + " פעילים" : ""} right={<button className="btn primary" onClick={() => setAdding(true)}><Icon n="plus" s={16} />פרויקט חדש</button>} />
      <div className="content">
        <div className="bar" style={{ flexWrap: "wrap" }}>
          <input className="inp" style={{ maxWidth: 280 }} placeholder="חיפוש לפי שם פרויקט או לקוח" value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="pillck"><input type="checkbox" checked={showFrozen} onChange={(e) => setShowFrozen(e.target.checked)} />להציג גם פרויקטים מוקפאים</label>
        </div>
        {!rows ? <div className="loading" style={{ minHeight: 200 }}>טוען…</div> : (
          <div className="kanban" style={{ gridTemplateColumns: cols.map(() => "minmax(200px,1fr)").join(" ") }}>
            {cols.map((s) => {
              const list = filtered.filter((p) => p.status === s);
              return (
                <div key={s} className={"kcol" + (over === s ? " over" : "")}
                  onDragOver={(e) => { e.preventDefault(); setOver(s); }} onDragLeave={() => setOver(null)}
                  onDrop={(e) => { e.preventDefault(); setOver(null); move(e.dataTransfer.getData("id"), s); }}>
                  <h3>{s}<span className="n">{list.length}</span></h3>
                  {!list.length && s === cols[0] && !(rows || []).length ? <div className="kdrop">עוד אין פרויקטים.<br />לוחצים &quot;פרויקט חדש&quot; למעלה.</div> : null}
                  {list.map((p) => {
                    const pr = progress(p);
                    const late = p.due_date && p.due_date < today() && p.status !== "הושלם";
                    const who = projectWho(p);
                    return (
                      <Link key={p.id} href={"/projects/" + p.id} draggable onDragStart={(e) => e.dataTransfer.setData("id", p.id)}
                        className={"kcard" + (late ? " alert" : "")} style={{ textDecoration: "none" }}>
                        <b className="kname">{p.name}</b>
                        {who ? <span className="sub"><Icon n={p.client ? "brief" : "target"} s={12} /> {who}</span> : <span className="sub faint">בלי לקוח</span>}
                        <div className="kf">
                          <span className={"meta" + (late ? " bad" : "")} style={late ? { color: "var(--bad)" } : undefined}>
                            <Icon n="cal" s={12} /> {p.due_date ? (late ? "באיחור · " : "") + fmtDate(p.due_date) : "בלי תאריך יעד"}
                          </span>
                          {p.value ? <span className="meta">{money(Number(p.value))}</span> : null}
                        </div>
                        {pr.total ? (
                          <div className="pbar" title={pr.done + " מתוך " + pr.total + " שלבים"}>
                            <span style={{ width: pr.pct + "%" }} />
                            <em>{pr.pct}% · {pr.done}/{pr.total} שלבים</em>
                          </div>
                        ) : <span className="meta faint">אין שלבים</span>}
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
        <p className="tiny">גוררים כרטיס בין העמודות כדי לשנות סטטוס.</p>
      </div>
      {adding ? <ProjectForm project={{}} onClose={() => setAdding(false)} onDone={(id) => router.push("/projects/" + id)} /> : null}
    </>
  );
}
