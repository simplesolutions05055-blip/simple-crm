"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { sb } from "@/lib/supabase/browser";
import { Top, Panel, St, Empty, Modal } from "@/components/Shell";
import Icon from "@/components/Icon";
import { useApp } from "@/components/AppCtx";
import { EditField, FieldRow, CustomFields, LinksBox, ActivityLog, QuotesBox, TasksBox, Collapse, type CField } from "@/components/Blocks";
import { AccessBox } from "@/components/ClientAccess";
import WaBox from "@/components/WaBox";
import { DocsBox } from "@/components/DocsBox";
import ClientProducts, { monthlyOf } from "@/components/ClientProducts";
import ClientPayments, { owedOf } from "@/components/ClientPayments";
import { STAGES, CLIENT_STATUS, CLIENT_STATUS_CLS, INDUSTRIES, fmtDate, money, today, waLink, type Row } from "@/lib/crm";

export default function ClientPage() {
  const { id } = useParams<{ id: string }>();
  const { org, toast, settings } = useApp();
  const [c, setC] = useState<Row | null>(null);
  const [onb, setOnb] = useState<Row[]>([]);
  const [svc, setSvc] = useState<Row[]>([]);
  const [pays, setPays] = useState<Row[]>([]);
  const [tick, setTick] = useState(0);
  const [back, setBack] = useState(false);
  const [del, setDel] = useState(false);
  const [counts, setCounts] = useState<{ quotes: number | null; signed: number; docs: number | null; access?: number | null; accessOk?: number }>({ quotes: null, signed: 0, docs: null });
  const router = useRouter();

  const load = async () => {
    const [a, b, s, p] = await Promise.all([
      sb().from("crm_clients").select("*").eq("id", id).single(),
      sb().from("crm_onboarding_items").select("*").eq("client_id", id).order("sort"),
      sb().from("crm_client_services").select("*").eq("client_id", id).order("start_date", { ascending: false }),
      sb().from("crm_payments").select("*").eq("client_id", id).order("due", { ascending: false }),
    ]);
    setC(a.data); setOnb(b.data || []); setSvc(s.data || []); setPays(p.data || []);
    const lead = a.data?.lead_id as string | undefined;
    const [qs, ds, ac] = await Promise.all([
      sb().from("crm_quotes").select("status").or("client_id.eq." + id + (lead ? ",lead_id.eq." + lead : "")),
      sb().from("crm_documents").select("id", { count: "exact", head: true }).neq("kind", "quote_signed").or("client_id.eq." + id + (lead ? ",lead_id.eq." + lead : "")),
      sb().from("crm_client_access").select("status").eq("client_id", id),
    ]);
    setCounts({ quotes: (qs.data || []).length, signed: (qs.data || []).filter((q: Row) => q.status === "נחתמה").length, docs: ds.count ?? 0,
      access: (ac.data || []).length, accessOk: (ac.data || []).filter((x: Row) => x.status === "יש גישה").length });
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
  const monthly = svc.filter((s) => s.status === "פעיל").reduce((a, s) => a + monthlyOf(s), 0);
  const vat = settings.vat / 100;
  const rets = svc.filter((x) => x.billing === "חודשי" && x.status !== "הסתיים");
  const retainerUntil = rets.length && rets.every((x) => x.end_date) ? rets.map((x) => String(x.end_date).slice(0, 7)).sort().pop() : undefined;
  const paid = pays.reduce((t, p) => t + (p.paid_at ? Number(p.paid_amount ?? p.amount) : 0), 0);
  const open = pays.filter((p) => p.due <= today()).reduce((t, p) => t + owedOf(p), 0);

  return (
    <>
      <Top title={c.biz} crumb={{ href: "/clients", label: "לקוחות" }} sub={<>{c.contact}{c.industry ? " · " + c.industry : ""} · לקוח מאז {fmtDate(c.since)}{c.left_at ? " · עזב " + fmtDate(c.left_at) : ""}</>}
        right={<div className="bar">
          <select className="inp sm" style={{ width: 150 }} value={c.status} onChange={(e) => e.target.value === "__lead" ? setBack(true) : save({ status: e.target.value }, "סטטוס: " + c.status + " ← " + e.target.value)}>
            {CLIENT_STATUS.map((s) => <option key={s}>{s}</option>)}
            <option value="__lead">↩ החזרה ללידים</option>
          </select>
          {c.wa_group ? <a className="btn wa" href={c.wa_group} target="_blank" rel="noreferrer"><Icon n="wa" s={16} />קבוצת הלקוח</a>
            : c.phone ? <a className="btn wa" href={waLink(c.phone, "היי " + (c.contact || "").split(" ")[0] + ", ")} target="_blank" rel="noreferrer"><Icon n="wa" s={16} />וואטסאפ</a> : null}
          {c.lead_id ? <Link className="btn" href={"/leads/" + c.lead_id}><Icon n="target" s={16} />הליד המקורי</Link> : null}
          <button className="btn danger" onClick={() => setDel(true)}><Icon n="trash" s={15} />מחיקה לצמיתות</button>
        </div>} />
      {del ? <DeleteClient c={c} onClose={() => setDel(false)} onDone={() => router.push("/clients")} /> : null}
      <div className="content">
        <div className="grid g4">
          <div className="panel stat"><span className="hi" style={{ color: "var(--ok)" }}><Icon n="repeat" s={18} /></span><div><b>{money(monthly)}</b><span className="sub">לחודש, לפני מע&quot;מ</span></div></div>
          <div className="panel stat"><span className="hi"><Icon n="wallet" s={18} /></span><div><b>{money(pays.filter((p) => p.due <= today()).reduce((a, p) => a + owedOf(p), 0))}</b><span className="sub">פתוח לגבייה</span></div></div>
          <div className="panel stat"><span className="ring" style={{ ["--p" as string]: onb.length ? Math.round((done / onb.length) * 100) : 0 }}><span>{done}/{onb.length}</span></span><div><b>קליטה</b><span className="sub">{onb.length && done === onb.length ? "הושלמה" : "בתהליך"}</span></div></div>
          <div className="panel stat"><span className="hi"><Icon n="pkg" s={18} /></span><div><b>{svc.filter((s) => s.status === "פעיל").length}</b><span className="sub">שירותים פעילים</span></div></div>
        </div>

        <div className="pair nextwa">
          <div className={"next" + (c.next_at && c.next_at < today() ? " miss" : "")}>
            <span className="ic"><Icon n="flag" /></span>
            <div className="next-f">
              <div><small>הצעד הבא</small><EditField value={c.next_step} placeholder="מה הצעד הבא מול הלקוח?" onSave={(v) => save({ next_step: v })} /></div>
              <div><small>מתי</small><EditField type="date" value={c.next_at} onSave={(v) => save({ next_at: v || null })} /></div>
              <div><small>שעה (לא חובה)</small><EditField type="time" value={c.next_time ? String(c.next_time).slice(0, 5) : ""} onSave={(v) => save({ next_time: v || null })} /></div>
            </div>
          </div>
          <WaBox clientId={id} leadId={c.lead_id || undefined} phone={c.phone} name={c.contact} onLog={() => setTick((t) => t + 1)} />
        </div>

        <Panel icon="list" title="קליטה" right={onb.length ? <span className="tiny">{done}/{onb.length}</span> : null}>
                <div className="onb-grid">
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

        <div className="grid g2 even">
              <Panel icon="user" title="פרטים">
              <FieldRow icon="build" label="שם העסק"><EditField value={c.biz} onSave={(v) => v.trim() && save({ biz: v.trim() })} /></FieldRow>
              <FieldRow icon="user" label="איש קשר"><EditField value={c.contact} onSave={(v) => save({ contact: v })} /></FieldRow>
              <FieldRow icon="phone" label="טלפון"><EditField className="fi ltr" phone value={c.phone} onSave={(v) => save({ phone: v.replace(/[^0-9+]/g, "") || null })} /></FieldRow>
              <FieldRow icon="mail" label="מייל"><EditField className="fi ltr" value={c.email} onSave={(v) => save({ email: v || null })} /></FieldRow>
              <FieldRow icon="tag" label="תחום"><EditField value={c.industry} list="industries" onSave={(v) => save({ industry: v })} /></FieldRow>
              <FieldRow icon="wa" label="קבוצת וואטסאפ"><EditField className="fi ltr" value={c.wa_group} placeholder="קישור לקבוצה" onSave={(v) => save({ wa_group: v })} /></FieldRow>
              <datalist id="industries">{INDUSTRIES.map((i) => <option key={i} value={i} />)}</datalist>
              <div style={{ marginTop: 8 }}><CustomFields fields={custom.info || []} onChange={(f) => save({ custom: { ...custom, info: f } })} /></div>
            </Panel>
              <Panel icon="globe" title="נוכחות דיגיטלית">
              <LinksBox links={c.info?.links || {}} custom={custom.links || []} onLinks={(x) => save({ info: { ...(c.info || {}), links: x } })} onCustom={(l) => save({ custom: { ...custom, links: l } })} />
            </Panel>
        </div>

        <div className="grid g2 even">
          <ClientProducts clientId={id} client={c} svc={svc} onDone={load} />
          <Collapse icon="key" title="גישה לחשבונות" summary={counts.access == null ? "" : counts.access ? counts.access + " נכסים · " + counts.accessOk + " עם גישה" : "אין נכסים"}>
            <AccessBox clientId={id} contact={c.contact} phone={c.phone} onLog={() => { setTick((t) => t + 1); load(); }} />
          </Collapse>
        </div>

        <Collapse icon="wallet" title="תשלומים" summary={"שולם " + money(paid) + " · פתוח " + money(open) + (c.retainer_amount ? " · ריטיינר " + money(Number(c.retainer_amount)) : "")}>
          <ClientPayments client={c} pays={pays} onSave={save} onDone={load} until={retainerUntil}
            retainerDefault={Math.round(svc.filter((x) => x.status === "פעיל").reduce((t, x) => t + monthlyOf(x), 0) * (1 + vat))} />
        </Collapse>
        <Collapse icon="file" title="הצעות מחיר" summary={counts.quotes == null ? "" : counts.quotes ? counts.quotes + (counts.quotes === 1 ? " הצעה" : " הצעות") + (counts.signed ? " · " + counts.signed + " חתומות" : "") : "אין הצעות"}>
          <QuotesBox clientId={id} leadId={c.lead_id || undefined} />
        </Collapse>
        <Collapse icon="note" title="מסמכים ואפיונים" summary={counts.docs == null ? "" : counts.docs ? counts.docs + " מסמכים" : "אין מסמכים"}>
          <DocsBox clientId={id} leadId={c.lead_id || undefined} who={c.biz} />
        </Collapse>

        <div className="grid g2 even">
          <ActivityLog clientId={id} leadId={c.lead_id || undefined} reload={tick} />
          <div className="col">
            <TasksBox clientId={id} />
              {c.status === "עזב" ? (
              <Panel icon="alert" title="למה עזב">
                <EditField className="inp" value={c.churn_reason} placeholder="סיבת העזיבה" onSave={(v) => save({ churn_reason: v })} />
              </Panel>
            ) : null}
          </div>
        </div>
      </div>
      {back ? <BackToLeads biz={c.biz} onClose={() => setBack(false)} onGo={async (stage) => {
        const { data, error } = await sb().rpc("crm_client_to_lead", { p_client: id, p_stage: stage });
        if (error) return toast("לא הוחזר: " + error.message, true);
        toast(c.biz + " הוחזר לרשימת הלידים");
        router.push("/leads/" + data);
      }} /> : null}
    </>
  );
}

function BackToLeads({ biz, onClose, onGo }: { biz: string; onClose: () => void; onGo: (stage: string) => void }) {
  const [stage, setStage] = useState("הצעה נשלחה");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={"להחזיר את " + biz + " לרשימת הלידים?"} icon="target" onClose={onClose}>
      <label className="field"><span>לאיזה שלב בפייפליין</span>
        <select className="inp" value={stage} onChange={(e) => setStage(e.target.value)}>
          {[...STAGES.filter((s) => s !== "לקוח"), "לא עכשיו"].map((s) => <option key={s}>{s}</option>)}
        </select>
      </label>
      <p className="tiny" style={{ margin: 0 }}>כרטיס הלקוח יוסתר מרשימת הלקוחות. השירותים, התשלומים וההצעות שלו נשמרים. אם הליד יחזור להיות לקוח, אותו כרטיס יחזור.</p>
      <div className="bar"><button className="btn primary" disabled={busy} onClick={async () => { setBusy(true); await onGo(stage); setBusy(false); }}>החזרה ללידים</button><button className="btn ghost" onClick={onClose}>ביטול</button></div>
    </Modal>
  );
}



/* permanent delete: the client with everything under it, and by default the lead it came from.
   Order matters: everything that blocks the client row goes first, the files go last. */
function DeleteClient({ c, onClose, onDone }: { c: Row; onClose: () => void; onDone: () => void }) {
  const { org, toast } = useApp();
  const [withLead, setWithLead] = useState(true);
  const [busy, setBusy] = useState("");
  async function run() {
    const db = sb();
    const fail = (what: string, e: { message: string } | null) => { setBusy(""); toast("לא נמחק (" + what + "): " + (e?.message || ""), true); return false; };
    setBusy("מוחק…");
    const ors = (col: string, ids: string[]) => (ids.length ? "," + col + ".in.(" + ids.join(",") + ")" : "");
    const { data: ls } = await db.from("crm_leads").select("id").or("client_id.eq." + c.id + (c.lead_id ? ",id.eq." + c.lead_id : ""));
    const leads = (ls || []).map((x: Row) => x.id as string);
    const lw = withLead ? leads : [];
    const { data: qs } = await db.from("crm_quotes").select("id").or("client_id.eq." + c.id + ors("lead_id", lw));
    const qids = (qs || []).map((x: Row) => x.id as string);
    const { data: ds } = await db.from("crm_documents").select("id,path").or("client_id.eq." + c.id + ors("quote_id", qids) + ors("lead_id", lw));
    const paths = (ds || []).map((x: Row) => x.path).filter(Boolean) as string[];
    if (ds?.length) { const r = await db.from("crm_documents").delete().in("id", ds.map((x: Row) => x.id)); if (r.error) return fail("מסמכים", r.error); }
    if (qids.length) {
      await db.from("crm_client_services").update({ quote_id: null }).in("quote_id", qids);
      await db.from("crm_documents").update({ quote_id: null }).in("quote_id", qids);
      await db.from("crm_quotes").update({ replaced_by: null }).in("replaced_by", qids);
      const r = await db.from("crm_quotes").delete().in("id", qids);
      if (r.error) return fail("הצעות מחיר", r.error);
    }
    await db.from("crm_tasks").delete().or("client_id.eq." + c.id + ors("lead_id", lw));
    await db.from("crm_ai_suggestions").delete().or("client_id.eq." + c.id + ors("lead_id", lw));
    const { data: vs } = await db.from("crm_vault_items").select("id").eq("client_id", c.id);
    for (const v of vs || []) { const r = await db.rpc("crm_vault_delete", { p_id: v.id }); if (r.error) return fail("כספת", r.error); }
    if (leads.length) await db.from("crm_leads").update({ client_id: null }).in("id", leads);
    if (c.lead_id) await db.from("crm_clients").update({ lead_id: null }).eq("id", c.id);
    const r = await db.from("crm_clients").delete().eq("id", c.id);
    if (r.error) return fail("לקוח", r.error);
    if (leads.length) {
      if (withLead) await db.from("crm_leads").delete().in("id", leads);
      else {
        await db.from("crm_leads").update({ stage: "סגירת פנייה", reason: "הלקוח נמחק" }).in("id", leads);
        await db.from("crm_leads").update({ archived_at: null }).in("id", leads); // stays archived if an active lead has the same phone
        await db.from("crm_activities").insert(leads.map((l: string) => ({ org_id: org, lead_id: l, type: "מערכת", text: "הלקוח שנוצר מהליד נמחק לצמיתות", by: "מערכת" })));
      }
    }
    if (paths.length) await db.storage.from("crm-docs").remove(paths);
    setBusy("");
    toast((c.biz || c.contact || "הלקוח") + " נמחק לצמיתות");
    onDone();
  }
  return (
    <Modal title="מחיקה לצמיתות" icon="x" onClose={() => !busy && onClose()}>
      <p style={{ margin: 0 }}>הלקוח <b>{c.biz || c.contact}</b> יימחק לגמרי, יחד עם המוצרים, התשלומים, הצעות המחיר, המסמכים והאפיונים, הכספת, המשימות וההיסטוריה שלו.</p>
      {c.lead_id ? (
        <label className={"pillck" + (withLead ? " on" : "")} style={{ alignSelf: "flex-start", marginTop: 10 }}>
          <input type="checkbox" checked={withLead} onChange={(e) => setWithLead(e.target.checked)} />למחוק גם את הליד שממנו הלקוח נוצר
        </label>
      ) : null}
      {c.lead_id && !withLead ? <p className="tiny" style={{ margin: "6px 0 0" }}>הליד יישאר במאגר הלידים בסטטוס &quot;סגירת פנייה&quot;.</p> : null}
      <p style={{ margin: "8px 0 0", color: "var(--soft)" }}>אי אפשר לשחזר את זה.</p>
      <div className="bar" style={{ marginTop: 14 }}>
        <button className="btn danger" disabled={!!busy} onClick={run}>{busy || "כן, למחוק לצמיתות"}</button>
        <button className="btn ghost" disabled={!!busy} onClick={onClose}>ביטול</button>
      </div>
    </Modal>
  );
}
