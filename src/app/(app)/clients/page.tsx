"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { sb } from "@/lib/supabase/browser";
import { Top, Panel, Modal, St, Empty } from "@/components/Shell";
import Icon from "@/components/Icon";
import { useApp } from "@/components/AppCtx";
import { CLIENT_STATUS, CLIENT_STATUS_CLS, INDUSTRIES, fmtDate, money, ago, type Row } from "@/lib/crm";

export default function Clients() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [status, setStatus] = useState("פעילים");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await sb().from("crm_clients")
        .select("*,services:crm_client_services(price,billing,status),payments:crm_payments(amount,due,paid_at)")
        .is("archived_at", null).order("created_at", { ascending: false });
      setRows(data || []);
    })();
  }, []);

  const list = useMemo(() => (rows || []).filter((c) =>
    status === "הכל" ? true : status === "פעילים" ? ["בקליטה", "פעיל", "בסיכון"].includes(c.status) : c.status === status), [rows, status]);
  const t = new Date().toISOString().slice(0, 10);

  return (
    <>
      <Top title="לקוחות" sub={rows ? list.length + " לקוחות" : ""} right={<button className="btn primary" onClick={() => setAdding(true)}><Icon n="plus" s={16} />לקוח חדש</button>} />
      <div className="content">
        <div className="tabs">
          {["פעילים", ...CLIENT_STATUS, "הכל"].map((s) => (
            <button key={s} className={"btn sm" + (status === s ? " on" : "")} onClick={() => setStatus(s)}>{s}</button>
          ))}
        </div>
        <Panel>
          {!rows ? <div className="loading" style={{ minHeight: 120 }}>טוען…</div> : !list.length ? <Empty>אין לקוחות בתצוגה הזו</Empty> : (
            <div className="scroll">
              <table className="tbl">
                <thead><tr><th>לקוח</th><th>סטטוס</th><th>חודשי, לפני מע&quot;מ</th><th>פתוח לגבייה</th><th>נגיעה אחרונה</th><th>מאז</th></tr></thead>
                <tbody>
                  {list.map((c) => {
                    const monthly = (c.services || []).filter((s: Row) => s.billing === "חודשי" && s.status === "פעיל").reduce((a: number, s: Row) => a + Number(s.price), 0);
                    const open = (c.payments || []).filter((p: Row) => !p.paid_at);
                    const late = open.some((p: Row) => p.due < t);
                    return (
                      <tr key={c.id} className="click" onClick={() => router.push("/clients/" + c.id)}>
                        <td><b>{c.biz}</b><div className="sub">{c.contact}{c.industry ? " · " + c.industry : ""}</div></td>
                        <td><St cls={CLIENT_STATUS_CLS[c.status]}>{c.status}</St></td>
                        <td>{monthly ? money(monthly) : "-"}</td>
                        <td>{open.length ? <span className={"meta" + (late ? " bad" : "")}>{money(open.reduce((a: number, p: Row) => a + Number(p.amount), 0))}</span> : "-"}</td>
                        <td><span className="meta">{ago(c.last_contact_at)}</span></td>
                        <td><span className="meta">{fmtDate(c.since)}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
      {adding ? <NewClient onClose={() => setAdding(false)} onDone={(id) => router.push("/clients/" + id)} /> : null}
    </>
  );
}

function NewClient({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const { org, toast, settings } = useApp();
  const [f, setF] = useState<Row>({ biz: "", contact: "", phone: "", email: "", industry: "" });
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { data, error } = await sb().from("crm_clients").insert({ ...f, phone: f.phone.replace(/[^0-9+]/g, "") || null, email: f.email || null, org_id: org }).select("id").single();
    if (error) return toast(error.message, true);
    await sb().from("crm_onboarding_items").insert(settings.onboarding.map((t, i) => ({ org_id: org, client_id: data.id, title: t, sort: i + 1 })));
    onDone(data.id);
  }
  return (
    <Modal title="לקוח חדש" icon="brief" onClose={onClose}>
      <p className="tiny" style={{ margin: 0 }}>לקוח שחותם על הצעה נפתח כאן לבד. הטופס הזה ללקוחות קיימים או לעבודה בלי הצעה.</p>
      <form className="form" onSubmit={save}>
        <label className="field"><span>שם העסק</span><input className="inp" required autoFocus value={f.biz} onChange={(e) => set("biz", e.target.value)} /></label>
        <label className="field"><span>איש קשר</span><input className="inp" value={f.contact} onChange={(e) => set("contact", e.target.value)} /></label>
        <label className="field"><span>טלפון</span><input className="inp ltr" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></label>
        <label className="field"><span>מייל</span><input className="inp ltr" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></label>
        <label className="field full"><span>תחום</span><input className="inp" list="industries" value={f.industry} onChange={(e) => set("industry", e.target.value)} /></label>
        <datalist id="industries">{INDUSTRIES.map((i) => <option key={i} value={i} />)}</datalist>
        <div className="full bar"><button className="btn primary">שמירה</button><button type="button" className="btn ghost" onClick={onClose}>ביטול</button></div>
      </form>
    </Modal>
  );
}
