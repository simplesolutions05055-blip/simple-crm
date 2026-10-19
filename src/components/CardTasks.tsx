"use client";
/* "המשימות שלי" in a lead or client card: a private checklist for that card only.
   Items here have no date and do not show on the Tasks page or in the menu count.
   Dated tasks linked to the card (made on the Tasks page) are listed underneath. */
import Link from "next/link";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase/browser";
import { Panel } from "./Shell";
import Icon from "./Icon";
import { useApp } from "./AppCtx";
import { fmtDate, today, type Row } from "@/lib/crm";

export default function CardTasks({ leadId, clientId }: { leadId?: string; clientId?: string }) {
  const { org, toast, refreshCounts } = useApp();
  const [items, setItems] = useState<Row[] | null>(null);
  const [dated, setDated] = useState<Row[]>([]);
  const [title, setTitle] = useState("");

  const load = async () => {
    const col = clientId ? "client_id" : "lead_id", val = (clientId || leadId)!;
    const [a, b] = await Promise.all([
      sb().from("crm_card_items").select("*").eq(col, val).order("pos").order("created_at"),
      sb().from("crm_tasks").select("id,title,done,due_date,start_time").eq(col, val).order("done").order("due_date"),
    ]);
    setItems(a.data || []);
    setDated(b.data || []);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [leadId, clientId]);

  async function add() {
    const t = title.trim();
    if (!t || !items) return;
    const pos = items.length ? Math.max(...items.map((i) => i.pos || 0)) + 1 : 0;
    const { data, error } = await sb().from("crm_card_items")
      .insert({ org_id: org, title: t, pos, lead_id: leadId || null, client_id: clientId || null }).select("*").single();
    if (error) return toast(error.message, true);
    setItems([...items, data]); setTitle("");
  }
  async function toggle(it: Row) {
    const done = !it.done, done_at = done ? new Date().toISOString() : null;
    setItems((x) => (x || []).map((y) => (y.id === it.id ? { ...y, done, done_at } : y)));
    const { error } = await sb().from("crm_card_items").update({ done, done_at }).eq("id", it.id);
    if (error) { toast(error.message, true); load(); }
  }
  async function remove(it: Row) {
    if (!confirm("למחוק את \"" + it.title + "\"?")) return;
    setItems((x) => (x || []).filter((y) => y.id !== it.id));
    const { error } = await sb().from("crm_card_items").delete().eq("id", it.id);
    if (error) { toast(error.message, true); load(); }
  }
  async function toggleDated(t: Row) {
    setDated((x) => x.map((y) => (y.id === t.id ? { ...y, done: !t.done } : y)));
    await sb().from("crm_tasks").update({ done: !t.done }).eq("id", t.id);
    refreshCounts();
  }

  // open items first, in the order they were written; done ones after them
  const list = [...(items || [])].sort((a, b) => Number(a.done) - Number(b.done));
  const done = list.filter((i) => i.done).length;
  return (
    <Panel icon="tasks" title="המשימות שלי" right={list.length ? <span className="tiny">{done}/{list.length} בוצעו</span> : null}>
      <p className="tiny" style={{ margin: "0 0 8px" }}>רשימה פרטית לכרטיס הזה. לא מופיעה במסך המשימות ולא בהתראות.</p>
      {!items ? <div className="loading" style={{ minHeight: 50 }}>טוען…</div> : list.map((it) => (
        <div key={it.id} className={"chk-row" + (it.done ? " done" : "")}>
          <label className="grow">
            <input type="checkbox" checked={!!it.done} onChange={() => toggle(it)} />
            <span>{it.title}</span>
          </label>
          {it.done && it.done_at ? <span className="meta faint">{fmtDate(it.done_at)}</span> : null}
          <button type="button" className="btn icon sm ghost" title="מחיקה" onClick={() => remove(it)}><Icon n="x" s={14} /></button>
        </div>
      ))}
      <div className="taskadd">
        <input className="inp sm" placeholder="משימה חדשה, ואז Enter" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button type="button" className="btn sm" onClick={add}><Icon n="plus" s={15} /></button>
      </div>
      {dated.length ? (
        <div style={{ marginTop: 14 }}>
          <div className="tiny" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <b>משימות עם תאריך</b><span className="grow" style={{ flex: 1 }} /><Link href="/tasks">למסך המשימות</Link>
          </div>
          {dated.map((t) => (
            <div key={t.id} className={"chk-row" + (t.done ? " done" : "")}>
              <label className="grow">
                <input type="checkbox" checked={!!t.done} onChange={() => toggleDated(t)} />
                <span>{t.title}</span>
              </label>
              <span className={"meta" + (!t.done && t.due_date < today() ? " bad" : "")}><Icon n="cal" s={12} /> {fmtDate(t.due_date)}{t.start_time ? " · " + String(t.start_time).slice(0, 5) : ""}</span>
            </div>
          ))}
        </div>
      ) : null}
    </Panel>
  );
}
