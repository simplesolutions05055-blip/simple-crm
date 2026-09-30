"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { sb } from "@/lib/supabase/browser";
import { Top, Modal, St } from "@/components/Shell";
import Icon from "@/components/Icon";
import { useApp } from "@/components/AppCtx";
import { STAGES, OFF_STAGES, SOURCES, INDUSTRIES, BUDGETS, ago, fmtDate, today, money, FIT, type Row } from "@/lib/crm";

export default function Leads() {
  const { org, toast } = useApp();
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");
  const [showOff, setShowOff] = useState(false);
  const [adding, setAdding] = useState(false);
  const [over, setOver] = useState<string | null>(null);

  const load = async () => {
    const { data } = await sb().from("crm_leads").select("*").is("archived_at", null).order("created_at", { ascending: false });
    setRows(data || []);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const t = q.trim();
    return (rows || []).filter((l) => !t || [l.name, l.biz, l.phone, l.industry, l.source].join(" ").includes(t));
  }, [rows, q]);
  const cols = showOff ? [...STAGES, ...OFF_STAGES] : [...STAGES];

  async function move(id: string, stage: string) {
    const l = rows?.find((r) => r.id === id);
    if (!l || l.stage === stage) return;
    if (stage === "נפסל") return router.push("/leads/" + id + "?disq=1");
    setRows((rs) => rs!.map((r) => (r.id === id ? { ...r, stage } : r)));
    const { error } = await sb().from("crm_leads").update({ stage }).eq("id", id);
    if (error) { toast(error.message, true); load(); return; }
    await sb().from("crm_activities").insert({ org_id: org, lead_id: id, type: "מערכת", text: "שלב: " + l.stage + " ← " + stage, by: "מערכת" });
  }

  return (
    <>
      <Top title="לידים" sub={rows ? filtered.length + " לידים פעילים" : ""}
        right={<button className="btn primary" onClick={() => setAdding(true)}><Icon n="plus" s={16} />ליד חדש</button>} />
      <div className="content">
        <div className="bar">
          <input className="inp" style={{ maxWidth: 300 }} placeholder="סינון לפי שם, עסק, תחום, מקור" value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="pillck"><input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} />להציג גם &quot;לא עכשיו&quot; ו&quot;נפסל&quot;</label>
        </div>
        <div className="kanban" style={{ gridTemplateColumns: `repeat(${cols.length},minmax(220px,1fr))` }}>
          {cols.map((s) => {
            const list = filtered.filter((l) => l.stage === s);
            return (
              <div key={s} className={"kcol" + (over === s ? " over" : "")}
                onDragOver={(e) => { e.preventDefault(); setOver(s); }} onDragLeave={() => setOver(null)}
                onDrop={(e) => { e.preventDefault(); setOver(null); move(e.dataTransfer.getData("id"), s); }}>
                <h3>{s}<span className="n">{list.length}</span></h3>
                {list.map((l) => {
                  const late = l.next_at && l.next_at < today();
                  const untouched = l.stage === "חדש" && !l.last_contact_at;
                  return (
                    <Link key={l.id} href={"/leads/" + l.id} draggable onDragStart={(e) => e.dataTransfer.setData("id", l.id)}
                      className={"kcard" + (late || untouched ? " alert" : "")} style={{ textDecoration: "none" }}>
                      <div className="kf"><b>{l.name}</b><span className="dots" title="התאמה">{FIT.map(([k]) => <i key={k} className={l.fit?.[k] ? "on" : ""} />)}</span></div>
                      {l.biz ? <span className="sub">{l.biz}{l.industry ? " · " + l.industry : ""}</span> : null}
                      <div className="kf">
                        <span className="meta">{l.source}</span>
                        {l.value ? <span className="meta">{money(l.value)}</span> : null}
                      </div>
                      {l.next_step ? <span className={"meta" + (late ? " bad" : "")}><Icon n="flag" s={13} />{l.next_step}{l.next_at ? " · " + fmtDate(l.next_at) : ""}</span>
                        : untouched ? <span className="meta bad"><Icon n="alert" s={13} />לא נוצר קשר · {ago(l.created_at)}</span> : null}
                      {l.reason && l.stage === "נפסל" ? <St cls="bad">{l.reason}</St> : null}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>
        <p className="tiny">גוררים כרטיס בין העמודות כדי לשנות שלב. הנקודות בכרטיס הן ההתאמה לפי 5 הקריטריונים.</p>
      </div>
      {adding ? <NewLead onClose={() => setAdding(false)} onDone={(id) => router.push("/leads/" + id)} /> : null}
    </>
  );
}

function NewLead({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const { org, toast } = useApp();
  const [f, setF] = useState<Row>({ name: "", biz: "", phone: "", email: "", industry: "", source: "אתר ישיר", budget: "לא אמר", pain: "" });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const phone = f.phone.replace(/[^0-9+]/g, "") || null;
    const { data, error } = await sb().from("crm_leads").insert({ ...f, phone, email: f.email || null, org_id: org }).select("id").single();
    setBusy(false);
    if (error) return toast(error.message.includes("crm_leads_phone_uq") ? "כבר יש ליד פעיל עם הטלפון הזה" : error.message, true);
    await sb().from("crm_activities").insert({ org_id: org, lead_id: data.id, type: "מערכת", text: "ליד נוצר ידנית", by: "מערכת" });
    onDone(data.id);
  }
  return (
    <Modal title="ליד חדש" icon="target" onClose={onClose}>
      <form className="form" onSubmit={save}>
        <label className="field"><span>שם</span><input className="inp" required autoFocus value={f.name} onChange={(e) => set("name", e.target.value)} /></label>
        <label className="field"><span>עסק</span><input className="inp" value={f.biz} onChange={(e) => set("biz", e.target.value)} /></label>
        <label className="field"><span>טלפון</span><input className="inp ltr" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></label>
        <label className="field"><span>מייל</span><input className="inp ltr" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></label>
        <label className="field"><span>תחום</span><input className="inp" list="industries" value={f.industry} onChange={(e) => set("industry", e.target.value)} placeholder="בחירה או הקלדה חופשית" /></label>
        <label className="field"><span>מקור</span><select className="inp" value={f.source} onChange={(e) => set("source", e.target.value)}>{SOURCES.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label className="field"><span>תקציב</span><select className="inp" value={f.budget} onChange={(e) => set("budget", e.target.value)}>{BUDGETS.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label className="field full"><span>מה הכאב, במילים שלו</span><textarea className="inp" value={f.pain} onChange={(e) => set("pain", e.target.value)} /></label>
        <datalist id="industries">{INDUSTRIES.map((i) => <option key={i} value={i} />)}</datalist>
        <div className="full bar"><button className="btn primary" disabled={busy}>שמירה</button><button type="button" className="btn ghost" onClick={onClose}>ביטול</button></div>
      </form>
    </Modal>
  );
}
