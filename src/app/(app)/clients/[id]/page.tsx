"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { sb } from "@/lib/supabase/browser";
import { Top, Panel, St, Empty } from "@/components/Shell";
import Icon from "@/components/Icon";
import { useApp } from "@/components/AppCtx";
import { EditField, FieldRow, CustomFields, LinksBox, ActivityLog, QuotesBox, TasksBox, type CField } from "@/components/Blocks";
import { AccessBox, VaultBox } from "@/components/ClientAccess";
import WaBox from "@/components/WaBox";
import { DocsBox } from "@/components/DocsBox";
import { CLIENT_STATUS, CLIENT_STATUS_CLS, INDUSTRIES, fmtDate, money, today, waLink, type Row } from "@/lib/crm";

export default function ClientPage() {
  const { id } = useParams<{ id: string }>();
  const { org, toast, settings } = useApp();
  const [c, setC] = useState<Row | null>(null);
  const [onb, setOnb] = useState<Row[]>([]);
  const [svc, setSvc] = useState<Row[]>([]);
  const [pays, setPays] = useState<Row[]>([]);
  const [tick, setTick] = useState(0);

  const load = async () => {
    const [a, b, s, p] = await Promise.all([
      sb().from("crm_clients").select("*").eq("id", id).single(),
      sb().from("crm_onboarding_items").select("*").eq("client_id", id).order("sort"),
      sb().from("crm_client_services").select("*").eq("client_id", id).order("start_date", { ascending: false }),
      sb().from("crm_payments").select("*").eq("client_id", id).order("due", { ascending: false }),
    ]);
    setC(a.data); setOnb(b.data || []); setSvc(s.data || []); setPays(p.data || []);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [id]);

  async function save(patch: Row, log?: string) {
    setC((x) => ({ ...x!, ...patch }));
    const { error } = await sb().from("crm_clients").update(patch).eq("id", id);
    if (error) return toast("לא נשמר: " + error.message, true);
    if (log) { await sb().from("crm_activities").insert({ org_id: org, client_id: id, type: "מערכת", text: log, by: "מערכת" }); setTick((t) => t + 1); }
  }

  if (!c) return <><Top title="לקוח" crumb={{ href: "/clients", label: "לקוחות" }} /><div className="loading" style={{ minHeight: 200 }}>טוען…</div></>;
  const custom = (c.custom || {}) as { info?: CField[]; links?: CField[] };
  const done = onb.filter((o) => o.done).length;
  const monthly = svc.filter((s) => s.billing === "חודשי" && s.status === "פעיל").reduce((a, s) => a + Number(s.price), 0);
  const vat = settings.vat / 100;

  return (
    <>
      <Top title={c.biz} crumb={{ href: "/clients", label: "לקוחות" }} sub={<>{c.contact}{c.industry ? " · " + c.industry : ""} · לקוח מאז {fmtDate(c.since)}</>}
        right={<div className="bar">
          <select className="inp sm" style={{ width: 130 }} value={c.status} onChange={(e) => save({ status: e.target.value }, "סטטוס: " + c.status + " ← " + e.target.value)}>
            {CLIENT_STATUS.map((s) => <option key={s}>{s}</option>)}
          </select>
          {c.wa_group ? <a className="btn wa" href={c.wa_group} target="_blank" rel="noreferrer"><Icon n="wa" s={16} />קבוצת הלקוח</a>
            : c.phone ? <a className="btn wa" href={waLink(c.phone, "היי " + (c.contact || "").split(" ")[0] + ", ")} target="_blank" rel="noreferrer"><Icon n="wa" s={16} />וואטסאפ</a> : null}
          {c.lead_id ? <Link className="btn" href={"/leads/" + c.lead_id}><Icon n="target" s={16} />הליד המקורי</Link> : null}
        </div>} />
      <div className="content">
        <div className="grid g4">
          <div className="panel stat"><span className="hi" style={{ color: "var(--ok)" }}><Icon n="repeat" s={18} /></span><div><b>{money(monthly)}</b><span className="sub">לחודש, לפני מע&quot;מ</span></div></div>
          <div className="panel stat"><span className="hi"><Icon n="wallet" s={18} /></span><div><b>{money(pays.filter((p) => !p.paid_at).reduce((a, p) => a + Number(p.amount), 0))}</b><span className="sub">פתוח לגבייה</span></div></div>
          <div className="panel stat"><span className="ring" style={{ ["--p" as string]: onb.length ? Math.round((done / onb.length) * 100) : 0 }}><span>{done}/{onb.length}</span></span><div><b>קליטה</b><span className="sub">{onb.length && done === onb.length ? "הושלמה" : "בתהליך"}</span></div></div>
          <div className="panel stat"><span className="hi"><Icon n="pkg" s={18} /></span><div><b>{svc.filter((s) => s.status === "פעיל").length}</b><span className="sub">שירותים פעילים</span></div></div>
        </div>

        <div className={"next" + (c.next_at && c.next_at < today() ? " miss" : "")}>
          <span className="ic"><Icon n="flag" /></span>
          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 170px", gap: 10 }}>
            <div><small>הצעד הבא</small><EditField value={c.next_step} placeholder="מה הצעד הבא מול הלקוח?" onSave={(v) => save({ next_step: v })} /></div>
            <div><small>מתי</small><EditField type="date" value={c.next_at} onSave={(v) => save({ next_at: v || null })} /></div>
          </div>
        </div>

        <div className="grid g2">
          <div className="col">
            <Panel icon="list" title="קליטה">
              <div className="checks">
                {onb.map((o) => (
                  <label key={o.id} className={"check" + (o.done ? " on" : "")}>
                    <input type="checkbox" checked={o.done} onChange={async (e) => {
                      setOnb((x) => x.map((y) => (y.id === o.id ? { ...y, done: e.target.checked } : y)));
                      await sb().from("crm_onboarding_items").update({ done: e.target.checked }).eq("id", o.id);
                    }} />{o.title}
                  </label>
                ))}
              </div>
              {!onb.length ? <button className="add" onClick={async () => {
                await sb().from("crm_onboarding_items").insert(settings.onboarding.map((t, i) => ({ org_id: org, client_id: id, title: t, sort: i + 1 })));
                load();
              }}><Icon n="plus" s={15} />יצירת רשימת קליטה</button> : null}
            </Panel>

            <Panel icon="pkg" title="שירותים">
              {!svc.length ? <Empty>אין שירותים. הם נוצרים לבד כשהלקוח חותם על הצעה.</Empty> : svc.map((s) => (
                <div className="lrow" key={s.id}>
                  <span className="grow"><b>{s.name}</b><span className="meta">{s.billing} · מ-{fmtDate(s.start_date)}{s.end_date ? " עד " + fmtDate(s.end_date) : ""}</span></span>
                  <b>{money(s.price)}</b>
                  <select className="inp sm" style={{ width: 100 }} value={s.status} onChange={async (e) => {
                    const patch: Row = { status: e.target.value };
                    if (e.target.value === "הסתיים" && !s.end_date) patch.end_date = today();
                    await sb().from("crm_client_services").update(patch).eq("id", s.id); load();
                  }}>{["פעיל", "מושהה", "הסתיים"].map((x) => <option key={x}>{x}</option>)}</select>
                </div>
              ))}
              <AddService clientId={id} onDone={load} />
            </Panel>

            <Panel icon="wallet" title="תשלומים" right={<span className="tiny">סכומים כולל מע&quot;מ</span>}>
              {!pays.length ? <Empty>אין תשלומים</Empty> : pays.map((p) => {
                const late = !p.paid_at && p.due < today();
                return (
                  <div className="pay" key={p.id}>
                    <span className="grow" style={{ flex: 1 }}><b>{p.what}</b>
                      <span className={"meta" + (late ? " bad" : "")}> · {p.paid_at ? "שולם " + fmtDate(p.paid_at) : "לתשלום " + fmtDate(p.due)}</span></span>
                    <EditField className="fi" value={p.invoice} placeholder="מס' חשבונית" onSave={async (v) => { await sb().from("crm_payments").update({ invoice: v }).eq("id", p.id); }} />
                    <b style={{ whiteSpace: "nowrap" }}>{money(p.amount)}</b>
                    {p.paid_at ? <St cls="ok">שולם</St> : (
                      <button className="btn sm" onClick={async () => { await sb().from("crm_payments").update({ paid_at: today() }).eq("id", p.id); load(); }}><Icon n="check" s={14} />שולם</button>
                    )}
                  </div>
                );
              })}
              <AddPayment clientId={id} vat={vat} onDone={load} />
            </Panel>
            <ActivityLog clientId={id} leadId={c.lead_id || undefined} reload={tick} />
          </div>
          <div className="col">
            <Panel icon="user" title="פרטים">
              <FieldRow icon="build" label="שם העסק"><EditField value={c.biz} onSave={(v) => v.trim() && save({ biz: v.trim() })} /></FieldRow>
              <FieldRow icon="user" label="איש קשר"><EditField value={c.contact} onSave={(v) => save({ contact: v })} /></FieldRow>
              <FieldRow icon="phone" label="טלפון"><EditField className="fi ltr" value={c.phone} onSave={(v) => save({ phone: v.replace(/[^0-9+]/g, "") || null })} /></FieldRow>
              <FieldRow icon="mail" label="מייל"><EditField className="fi ltr" value={c.email} onSave={(v) => save({ email: v || null })} /></FieldRow>
              <FieldRow icon="tag" label="תחום"><EditField value={c.industry} list="industries" onSave={(v) => save({ industry: v })} /></FieldRow>
              <FieldRow icon="wa" label="קבוצת וואטסאפ"><EditField className="fi ltr" value={c.wa_group} placeholder="קישור לקבוצה" onSave={(v) => save({ wa_group: v })} /></FieldRow>
              <datalist id="industries">{INDUSTRIES.map((i) => <option key={i} value={i} />)}</datalist>
              <div style={{ marginTop: 8 }}><CustomFields fields={custom.info || []} onChange={(f) => save({ custom: { ...custom, info: f } })} /></div>
            </Panel>
            <Panel icon="globe" title="נוכחות דיגיטלית">
              <LinksBox links={c.info?.links || {}} custom={custom.links || []} onLinks={(x) => save({ info: { ...(c.info || {}), links: x } })} onCustom={(l) => save({ custom: { ...custom, links: l } })} />
            </Panel>
            <WaBox clientId={id} leadId={c.lead_id || undefined} phone={c.phone} name={c.contact} onLog={() => setTick((t) => t + 1)} />
            <AccessBox clientId={id} contact={c.contact} phone={c.phone} onLog={() => setTick((t) => t + 1)} />
            <VaultBox clientId={id} onLog={() => setTick((t) => t + 1)} />
            <QuotesBox clientId={id} leadId={c.lead_id || undefined} />
            <DocsBox clientId={id} leadId={c.lead_id || undefined} who={c.biz} />
            <TasksBox clientId={id} />
            {c.status === "עזב" ? (
              <Panel icon="alert" title="למה עזב">
                <EditField className="inp" value={c.churn_reason} placeholder="סיבת העזיבה" onSave={(v) => save({ churn_reason: v })} />
              </Panel>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

function AddService({ clientId, onDone }: { clientId: string; onDone: () => void }) {
  const { org, toast } = useApp();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", billing: "חודשי", price: "" });
  if (!open) return <button className="add" onClick={() => setOpen(true)}><Icon n="plus" s={15} />הוספת שירות</button>;
  return (
    <div className="f3" style={{ gridTemplateColumns: "1fr 110px 100px auto", marginTop: 10 }}>
      <input className="inp sm" placeholder="שם השירות" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <select className="inp sm" value={f.billing} onChange={(e) => setF({ ...f, billing: e.target.value })}><option>חודשי</option><option>חד-פעמי</option></select>
      <input className="inp sm" type="number" placeholder="מחיר" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
      <button className="btn sm primary" onClick={async () => {
        if (!f.name.trim()) return;
        const { error } = await sb().from("crm_client_services").insert({ org_id: org, client_id: clientId, name: f.name.trim(), billing: f.billing, price: Number(f.price) || 0 });
        if (error) return toast(error.message, true);
        setOpen(false); setF({ name: "", billing: "חודשי", price: "" }); onDone();
      }}>הוספה</button>
    </div>
  );
}

function AddPayment({ clientId, vat, onDone }: { clientId: string; vat: number; onDone: () => void }) {
  const { org, toast } = useApp();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ what: "", amount: "", due: today(), withVat: true });
  if (!open) return <button className="add" onClick={() => setOpen(true)}><Icon n="plus" s={15} />הוספת תשלום</button>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
      <div className="f3" style={{ gridTemplateColumns: "1fr 110px 150px" }}>
        <input className="inp sm" placeholder="על מה" value={f.what} onChange={(e) => setF({ ...f, what: e.target.value })} />
        <input className="inp sm" type="number" placeholder="סכום" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
        <input className="inp sm" type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} />
      </div>
      <div className="bar">
        <label className="pillck"><input type="checkbox" checked={f.withVat} onChange={(e) => setF({ ...f, withVat: e.target.checked })} />הסכום לפני מע&quot;מ, להוסיף מע&quot;מ</label>
        <button className="btn sm primary" onClick={async () => {
          const amount = Math.round((Number(f.amount) || 0) * (f.withVat ? 1 + vat : 1));
          if (!f.what.trim() || !amount) return;
          const { error } = await sb().from("crm_payments").insert({ org_id: org, client_id: clientId, what: f.what.trim(), amount, due: f.due });
          if (error) return toast(error.message, true);
          setOpen(false); onDone();
        }}>הוספה</button>
        <button className="btn sm ghost" onClick={() => setOpen(false)}>ביטול</button>
      </div>
    </div>
  );
}
