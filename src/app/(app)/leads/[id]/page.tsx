"use client";
import { useEffect, useState } from "react";
import { REGIONS, CITIES, regionOf, placeLabel } from "@/lib/regions";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { sb } from "@/lib/supabase/browser";
import { Top, Panel, Modal, St } from "@/components/Shell";
import Icon from "@/components/Icon";
import { useApp } from "@/components/AppCtx";
import { EditField, EditArea, FieldRow, CustomFields, LinksBox, ActivityLog, QuotesBox, TasksBox, type CField } from "@/components/Blocks";
import WaBox from "@/components/WaBox";
import { DocsBox } from "@/components/DocsBox";
import { STAGES, SOURCES, INDUSTRIES, BUDGETS, DISQ, FIT, fmtDate, today, waLink, type Row } from "@/lib/crm";

export default function LeadPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { org, toast } = useApp();
  const [l, setL] = useState<Row | null>(null);
  const [disq, setDisq] = useState(false);
  const [del, setDel] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [logTick, setLogTick] = useState(0);

  useEffect(() => {
    (async () => {
      const { data } = await sb().from("crm_leads").select("*").eq("id", id).single();
      setL(data);
      if (typeof window !== "undefined" && new URLSearchParams(location.search).get("disq")) setDisq(true);
    })();
  }, [id]);

  async function save(patch: Row, log?: string) {
    setL((x) => ({ ...x!, ...patch }));
    const { error } = await sb().from("crm_leads").update(patch).eq("id", id);
    if (error) return toast(error.message.includes("phone_uq") ? "כבר יש ליד פעיל עם הטלפון הזה" : "לא נשמר: " + error.message, true);
    if (log) { await sb().from("crm_activities").insert({ org_id: org, lead_id: id, type: "מערכת", text: log, by: "מערכת" }); setLogTick((t) => t + 1); }
  }

  // reaching "לקוח" turns the lead into a client card and takes it off the pipeline
  async function toClient() {
    const { data, error } = await sb().rpc("crm_lead_to_client", { p_lead: id });
    if (error) return toast("לא נוצר לקוח: " + error.message, true);
    toast(l!.name + " הפך ללקוח");
    router.push("/clients/" + data);
  }

  // permanent delete: removes the lead with its quotes, tasks, messages and history (documents stay, unlinked)
  async function deleteForever() {
    if (l?.client_id) return toast("הליד כבר הפך ללקוח, ולכן אי אפשר למחוק אותו לצמיתות", true);
    setDeleting(true);
    const db = sb();
    const { data: qs } = await db.from("crm_quotes").select("id").eq("lead_id", id);
    const qids = (qs || []).map((q: Row) => q.id);
    if (qids.length) {
      await db.from("crm_documents").update({ quote_id: null }).in("quote_id", qids);
      await db.from("crm_quotes").update({ replaced_by: null }).in("replaced_by", qids);
      const r = await db.from("crm_quotes").delete().eq("lead_id", id);
      if (r.error) { setDeleting(false); return toast("לא נמחק: " + r.error.message, true); }
    }
    await db.from("crm_tasks").delete().eq("lead_id", id);
    await db.from("crm_wa_messages").delete().eq("lead_id", id);
    await db.from("crm_ai_suggestions").delete().eq("lead_id", id);
    const { error } = await db.from("crm_leads").delete().eq("id", id);
    setDeleting(false);
    if (error) return toast("לא נמחק: " + error.message, true);
    toast(l!.name + " נמחק לצמיתות");
    router.push("/leads");
  }

  if (!l) return <><Top title="ליד" crumb={{ href: "/leads", label: "לידים" }} /><div className="loading" style={{ minHeight: 200 }}>טוען…</div></>;
  const idx = STAGES.indexOf(l.stage);
  const custom = (l.custom || {}) as { details?: CField[]; links?: CField[] };

  return (
    <>
      <Top title={l.name} crumb={{ href: "/leads", label: "לידים" }} sub={<>{l.biz}{l.industry ? " · " + l.industry : ""}{l.city || l.region ? " · " + placeLabel(l.city, l.region) : ""} · נוצר {fmtDate(l.created_at)}</>}
        right={<div className="bar">
          {l.phone ? <a className="btn wa" href={waLink(l.phone, "היי " + l.name.split(" ")[0] + ", ")} target="_blank" rel="noreferrer"><Icon n="wa" s={16} />וואטסאפ</a> : null}
          {l.phone ? <a className="btn" href={"tel:" + l.phone}><Icon n="phone" s={16} />חיוג</a> : null}
          {l.client_id ? <Link className="btn primary" href={"/clients/" + l.client_id}><Icon n="brief" s={16} />לכרטיס הלקוח</Link> : null}
        </div>} />
      <div className="content">
        <Panel>
          <ol className="steps">
            {STAGES.map((s, i) => (
              <li key={s} className={i < idx ? "passed" : ""}>
                <button className={i < idx ? "done" : i === idx ? "cur" : ""} onClick={() => s !== l.stage && (s === "לקוח" ? toClient() : save({ stage: s }, "שלב: " + l.stage + " ← " + s))}>
                  <span className="numw">{i < idx ? <Icon n="check" s={15} /> : i + 1}</span>{s}
                </button>
              </li>
            ))}
          </ol>
          <div className="bar" style={{ marginTop: 14, justifyContent: "flex-end" }}>
            {l.stage === "לא עכשיו" || l.stage === "נפסל" || l.stage === "סגירת פנייה" ? <St cls={l.stage === "נפסל" ? "bad" : l.stage === "סגירת פנייה" ? "ok" : "warn"}>{l.stage}{l.reason ? ": " + l.reason : ""}</St> : null}
            <button className="btn sm" onClick={() => save({ stage: "לא עכשיו" }, "שלב: לא עכשיו")}>לא עכשיו</button>
            <button className="btn sm" onClick={() => save({ stage: "סגירת פנייה" }, "שלב: " + l.stage + " ← סגירת פנייה")}>סגירת פנייה</button>
            <button className="btn sm danger" onClick={() => setDisq(true)}>פסילה</button>
            <button className="btn sm ghost" onClick={async () => { if (!confirm("להעביר את הליד לארכיון?")) return; await save({ archived_at: new Date().toISOString() }); router.push("/leads"); }}>ארכיון</button>
            <button className="btn sm danger" onClick={() => setDel(true)}>מחיקה לצמיתות</button>
          </div>
        </Panel>

        <div className={"next" + (l.next_at && l.next_at < today() ? " miss" : "")}>
          <span className="ic"><Icon n="flag" /></span>
          <div className="next-f">
            <div><small>הצעד הבא</small><EditField value={l.next_step} placeholder="מה הצעד הבא עם הליד?" onSave={(v) => save({ next_step: v })} /></div>
            <div><small>מתי</small><EditField type="date" value={l.next_at} onSave={(v) => save({ next_at: v || null })} /></div>
            <div><small>שעה (לא חובה)</small><EditField type="time" value={l.next_time ? String(l.next_time).slice(0, 5) : ""} onSave={(v) => save({ next_time: v || null })} /></div>
          </div>
        </div>

        <div className="grid g2">
          <div className="col">
            <Panel icon="user" title="פרטים">
              <FieldRow icon="user" label="שם"><EditField value={l.name} onSave={(v) => v.trim() && save({ name: v.trim() })} /></FieldRow>
              <FieldRow icon="build" label="עסק"><EditField value={l.biz} onSave={(v) => save({ biz: v })} /></FieldRow>
              <FieldRow icon="phone" label="טלפון"><EditField className="fi ltr" phone value={l.phone} onSave={(v) => save({ phone: v.replace(/[^0-9+]/g, "") || null })} /></FieldRow>
              <FieldRow icon="mail" label="מייל"><EditField className="fi ltr" value={l.email} onSave={(v) => save({ email: v || null })} /></FieldRow>
              <FieldRow icon="tag" label="תחום"><EditField value={l.industry} list="industries" placeholder="בחירה או הקלדה חופשית" onSave={(v) => save({ industry: v })} /></FieldRow>
              <FieldRow icon="pin" label="עיר"><EditField value={l.city} list="cities" placeholder="בחירה או הקלדה חופשית" onSave={(v) => { const c = v.trim(); save({ city: c || null, region: regionOf(c) || l.region || null }); }} /></FieldRow>
              <FieldRow icon="pin" label="אזור">
                <select className="fi" value={l.region || ""} onChange={(e) => save({ region: e.target.value || null })}><option value="">לא ידוע</option>{REGIONS.map((r) => <option key={r}>{r}</option>)}</select>
              </FieldRow>
              <FieldRow icon="home" label="כתובת"><EditField value={l.address} placeholder="רחוב ומספר" onSave={(v) => save({ address: v.trim() || null })} /></FieldRow>
              <datalist id="cities">{CITIES.map((c) => <option key={c} value={c} />)}</datalist>
              <FieldRow icon="inbox" label="מקור">
                <select className="fi" value={l.source} onChange={(e) => save({ source: e.target.value })}>{[...new Set([...SOURCES, l.source])].map((s) => <option key={s}>{s}</option>)}</select>
              </FieldRow>
              <FieldRow icon="send" label="קמפיין"><EditField value={l.campaign} onSave={(v) => save({ campaign: v })} /></FieldRow>
              <FieldRow icon="wallet" label="תקציב">
                <select className="fi" value={l.budget} onChange={(e) => save({ budget: e.target.value })}>{BUDGETS.map((s) => <option key={s}>{s}</option>)}</select>
              </FieldRow>
              <FieldRow icon="money" label="שווי צפוי"><EditField type="number" value={l.value} onSave={(v) => save({ value: Number(v) || 0 })} /></FieldRow>
              <datalist id="industries">{INDUSTRIES.map((i) => <option key={i} value={i} />)}</datalist>
              <div style={{ marginTop: 8 }}>
                <CustomFields fields={custom.details || []} onChange={(f) => save({ custom: { ...custom, details: f } })} />
              </div>
            </Panel>
            <Panel icon="globe" title="נוכחות דיגיטלית">
              <LinksBox links={l.links || {}} custom={custom.links || []} onLinks={(x) => save({ links: x })} onCustom={(c) => save({ custom: { ...custom, links: c } })} />
            </Panel>
            <div className="pair">
              <QuotesBox leadId={id} clientId={l.client_id || undefined} />
              <DocsBox leadId={id} clientId={l.client_id || undefined} who={l.biz || l.name} />
            </div>
            <Panel icon="check" title="התאמה">
              <div className="checks">
                {FIT.map(([k, lbl]) => (
                  <label key={k} className={"check" + (l.fit?.[k] ? " on" : "")}>
                    <input type="checkbox" checked={!!l.fit?.[k]} onChange={(e) => save({ fit: { ...(l.fit || {}), [k]: e.target.checked } })} />{lbl}
                  </label>
                ))}
              </div>
              <div style={{ marginTop: 12 }}>
                <span className="tiny">הכאב, במילים שלו</span>
                <EditArea value={l.pain} onSave={(v) => save({ pain: v })} />
              </div>
            </Panel>
          </div>
          <div className="col">
            <ActivityLog leadId={id} reload={logTick} />
            <WaBox leadId={id} phone={l.phone} name={l.name} onLog={() => setLogTick((t) => t + 1)} />
            <TasksBox leadId={id} />
          </div>
        </div>
      </div>
      {disq ? (
        <Modal title="פסילת ליד" icon="x" onClose={() => setDisq(false)}>
          <p style={{ margin: 0, color: "var(--soft)" }}>למה הליד נפסל? זה נכנס לדוחות.</p>
          <div className="pills">
            {DISQ.map((r) => (
              <button key={r} className="btn sm" onClick={async () => { await save({ stage: "נפסל", reason: r }, "נפסל: " + r); setDisq(false); }}>{r}</button>
            ))}
          </div>
        </Modal>
      ) : null}
      {del ? (
        <Modal title="מחיקה לצמיתות" icon="x" onClose={() => !deleting && setDel(false)}>
          <p style={{ margin: 0 }}>הליד <b>{l.name}</b> יימחק לגמרי, יחד עם הצעות המחיר, המשימות, ההודעות וההיסטוריה שלו.</p>
          <p style={{ margin: "8px 0 0", color: "var(--soft)" }}>אי אפשר לשחזר את זה. אם רק רוצים להוריד אותו מהלוח, עדיף &quot;סגירת פנייה&quot; או ארכיון.</p>
          <div className="bar" style={{ marginTop: 14 }}>
            <button className="btn danger" disabled={deleting} onClick={deleteForever}>{deleting ? "מוחק…" : "כן, למחוק לצמיתות"}</button>
            <button className="btn ghost" disabled={deleting} onClick={() => setDel(false)}>ביטול</button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
