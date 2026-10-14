"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { sb } from "@/lib/supabase/browser";
import { Panel, Modal, St, Empty } from "@/components/Shell";
import Icon from "@/components/Icon";
import { useApp } from "@/components/AppCtx";
import { fmtDate, appUrl, waLink, fillTemplate, waTemplates, type Row } from "@/lib/crm";
import IntakeFields, { type SecretApi } from "@/components/IntakeFields";
import { INTAKE_FORMS, formByKind, formText, filledCount, type Answers, type AnswerValue, type IntakeForm } from "@/lib/intake-forms";
import { clientForms, clientFormByKind, newToken, intakeStatus, autoBrief, INTAKE_MSG_DEFAULT } from "@/lib/client-forms";

const MAX_FILE = 25 * 1024 * 1024;
function fileSize(n: number) {
  return n >= 1048576 ? (n / 1048576).toFixed(1) + "MB" : Math.max(1, Math.round(n / 1024)) + "KB";
}

function downloadBrief(d: Row, form: IntakeForm, who: string) {
  const md = autoBrief(form, (d.data?.answers as Answers) || {}, who);
  const url = URL.createObjectURL(new Blob([md], { type: "text/markdown;charset=utf-8" }));
  const el = document.createElement("a");
  el.href = url;
  el.download = "brief-automations" + (who ? "-" + who.replace(/[^\p{L}\p{N}]+/gu, "-") : "") + ".md";
  document.body.appendChild(el); el.click(); el.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function openStored(f: { path: string; name: string }) {
  const { data } = await sb().storage.from("crm-docs").createSignedUrl(f.path, 300);
  if (data) window.open(data.signedUrl, "_blank", "noopener");
}

/* documents of a lead or a client: intake forms and signed quotes.
   A lead's documents stay visible on the client card after the lead becomes a client. */
/* intake=false (a lead): only files and signed quotes; intake forms live on the client card */
export function DocsBox({ leadId, clientId, who, intake = true }: { leadId?: string; clientId?: string; who: string; intake?: boolean }) {
  const { org, toast, settings } = useApp();
  const [rows, setRows] = useState<Row[]>([]);
  const [pick, setPick] = useState(false);
  const [sendPick, setSendPick] = useState(false);
  const [open, setOpen] = useState<{ doc: Row | null; form: IntakeForm } | null>(null);

  const load = async () => {
    let q = sb().from("crm_documents").select("id,kind,title,data,quote_id,path,size,mime,created_at,updated_at,token,sent_at,opened_at,submitted_at,views,reopened_at").order("created_at", { ascending: false });
    if (leadId && clientId) q = q.or(`lead_id.eq.${leadId},client_id.eq.${clientId}`);
    else if (leadId) q = q.eq("lead_id", leadId);
    else q = q.eq("client_id", clientId!);
    const { data, error } = await q;
    if (error) return toast("המסמכים לא נטענו: " + error.message, true);
    setRows(data || []);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [leadId, clientId]);

  const fileRef = useRef<HTMLInputElement>(null);
  const [upl, setUpl] = useState("");

  // uploaded files: private bucket, one folder per business, opened through short-lived links
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files);
    const big = list.filter((f) => f.size > MAX_FILE);
    if (big.length) toast("גדול מ-25MB ולא הועלה: " + big.map((f) => f.name).join(", "), true);
    const ok = list.filter((f) => f.size <= MAX_FILE);
    let n = 0;
    for (const f of ok) {
      setUpl("מעלה " + (n + 1) + " מתוך " + ok.length + "…");
      const ext = (f.name.match(/\.([a-z0-9]{1,8})$/i)?.[1] || "bin").toLowerCase();
      const path = org + "/" + crypto.randomUUID() + "." + ext;
      const up = await sb().storage.from("crm-docs").upload(path, f, { contentType: f.type || undefined, upsert: false });
      if (up.error) { toast("לא הועלה: " + f.name + " (" + up.error.message + ")", true); continue; }
      const { error } = await sb().from("crm_documents").insert({ org_id: org, lead_id: leadId || null, client_id: clientId || null, kind: "file", title: f.name, path, size: f.size, mime: f.type || null });
      if (error) { await sb().storage.from("crm-docs").remove([path]); toast("לא נשמר: " + f.name, true); continue; }
      n++;
    }
    setUpl("");
    if (fileRef.current) fileRef.current.value = "";
    if (n) {
      await sb().from("crm_activities").insert({ org_id: org, lead_id: leadId || null, client_id: clientId || null, type: "מערכת", text: n === 1 ? "הועלה קובץ: " + ok[0].name : "הועלו " + n + " קבצים", by: "מערכת" });
      toast(n === 1 ? "הקובץ הועלה" : n + " קבצים הועלו");
      load();
    }
  }
  async function openFile(d: Row, download = false) {
    const { data, error } = await sb().storage.from("crm-docs").createSignedUrl(d.path, 300, download ? { download: d.title } : undefined);
    if (error || !data) return toast("הקובץ לא נפתח: " + (error?.message || ""), true);
    window.open(data.signedUrl, "_blank", "noopener");
  }
  async function removeFile(d: Row) {
    if (!confirm("למחוק את הקובץ " + d.title + "?")) return;
    const r = await sb().storage.from("crm-docs").remove([d.path]);
    if (r.error) return toast("לא נמחק: " + r.error.message, true);
    await sb().from("crm_documents").delete().eq("id", d.id);
    load();
  }

  async function save(doc: Row | null, form: IntakeForm, answers: Answers) {
    const { n, all } = filledCount(form, answers);
    const body = { data: { ...(doc?.data || {}), answers, filled: n, total: all }, updated_at: new Date().toISOString() };
    const res = doc
      ? await sb().from("crm_documents").update(body).eq("id", doc.id).select("id").single()
      : await sb().from("crm_documents").insert({ ...body, org_id: org, lead_id: leadId || null, client_id: clientId || null, kind: "intake:" + form.kind, title: form.title }).select("id").single();
    if (res.error) { toast("האפיון לא נשמר: " + res.error.message, true); return false; }
    await sb().from("crm_activities").insert({ org_id: org, lead_id: leadId || null, client_id: clientId || null, type: "מערכת", text: (doc ? "עודכן: " : "נשמר: ") + form.title, by: "מערכת" });
    toast("נשמר");
    setOpen((o) => (o ? { ...o, doc: { ...(o.doc || {}), id: res.data.id, data: body.data } } : o));
    load();
    return true;
  }

  // the person the link goes to
  async function recipient() {
    const r = leadId
      ? await sb().from("crm_leads").select("name,biz,phone").eq("id", leadId).single()
      : await sb().from("crm_clients").select("contact,biz,phone").eq("id", clientId!).single();
    const d = (r.data || {}) as Row;
    return { phone: (d.phone as string) || "", first: String(d.name || d.contact || "").trim().split(" ")[0] || "" };
  }
  const linkOf = (d: Row) => appUrl() + "/f/" + d.token;
  async function deliver(d: Row, again: boolean) {
    const { phone, first } = await recipient();
    const url = linkOf(d);
    const tplName = settings.wa?.intake_template as string | undefined;
    if (tplName && phone) {
      const t = waTemplates(settings.wa).find((x) => x.name === tplName);
      const { error } = await sb().rpc("crm_wa_send", { p_phone: phone, p_template: tplName, p_lang: t?.lang || "he",
        p_params: [first || "שלום", url].slice(0, t?.params ?? 2), p_text: null, p_lead: leadId || null, p_client: clientId || null });
      if (error) return toast("לא נשלח: " + error.message, true);
      toast("השאלון נשלח בוואטסאפ");
    } else {
      await sb().from("crm_activities").insert({ org_id: org, lead_id: leadId || null, client_id: clientId || null, type: "וואטסאפ", text: (again ? "נשלח שוב: " : "נשלח ללקוח: ") + d.title, by: "מאור" });
      if (!phone) toast("אין טלפון. הקישור נפתח בוואטסאפ בלי מספר.", true);
      const text = fillTemplate((settings.wa?.intake_text as string) || INTAKE_MSG_DEFAULT, { "שם": first, "קישור": url }).replace(/^היי ,\s*/, "היי, ");
      window.open(waLink(phone, text), "_blank");
    }
  }
  async function sendIntake(form: IntakeForm) {
    setSendPick(false);
    const token = newToken();
    const { n, all } = filledCount(form, {});
    const { data, error } = await sb().from("crm_documents").insert({
      org_id: org, lead_id: leadId || null, client_id: clientId || null, kind: "intake:" + form.kind, title: form.title,
      token, sent_at: new Date().toISOString(), data: { form, answers: {}, filled: n, total: all },
    }).select("id,title,token").single();
    if (error) return toast("לא נוצר: " + error.message, true);
    await deliver(data, false);
    load();
  }
  async function copyLink(d: Row) {
    try { await navigator.clipboard.writeText(linkOf(d)); toast("הקישור הועתק"); } catch { toast(linkOf(d)); }
  }
  async function reopen(d: Row) {
    if (!confirm("לפתוח ללקוח את \"" + d.title + "\" למילוי חוזר? הוא ימשיך מאיפה שעצר, עם כל התשובות.")) return;
    const { error } = await sb().from("crm_documents").update({ submitted_at: null, reopened_at: new Date().toISOString() }).eq("id", d.id);
    if (error) return toast("לא נפתח: " + error.message, true);
    await sb().from("crm_activities").insert({ org_id: org, lead_id: leadId || null, client_id: clientId || null, type: "מערכת", text: "נפתח למילוי חוזר: " + d.title, by: "מאור" });
    toast("נפתח למילוי. אפשר לשלוח ללקוח את הקישור שוב");
    load();
  }
  function formOf(d: Row): IntakeForm | undefined {
    const k = d.kind?.startsWith("intake:") ? d.kind.slice(7) : "";
    if (!k) return undefined;
    return (d.data?.form?.sections ? (d.data.form as IntakeForm) : undefined) || clientFormByKind(k, settings.intake_templates) || formByKind(k);
  }

  // signed quotes live in the quotes box; here only intake forms and other documents
  const shown = rows.filter((d) => d.kind !== "quote_signed" && (intake || !String(d.kind || "").startsWith("intake:")));
  return (
    <Panel icon="note" title={intake ? "מסמכים ואפיונים" : "מסמכים"} right={<div className="bar">
      <input ref={fileRef} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
      <button className="btn sm" disabled={!!upl} onClick={() => fileRef.current?.click()}><Icon n="upload" s={15} />{upl || "העלאת קובץ"}</button>
      {intake ? <>
        <button className="btn sm" onClick={() => setPick(true)}><Icon n="plus" s={15} />אפיון חדש</button>
        <button className="btn sm primary" onClick={() => setSendPick(true)}><Icon n="send" s={15} />שליחת אפיון ללקוח</button>
      </> : null}
    </div>}>
      {!shown.length ? <Empty>אין מסמכים</Empty> : shown.map((d) => {
        if (d.kind === "file" && d.path) return (
          <div key={d.id} className="lrow">
            <button className="grow linkish" onClick={() => openFile(d)} title="פתיחה">
              <b>{d.title}</b><span className="meta">הועלה {fmtDate(d.created_at)}{d.size ? " · " + fileSize(d.size) : ""}</span>
            </button>
            <button className="btn icon sm ghost" title="הורדה" onClick={() => openFile(d, true)}><Icon n="download" s={15} /></button>
            <button className="btn icon sm ghost" title="מחיקה" onClick={() => removeFile(d)}><Icon n="trash" s={15} /></button>
            <St cls="">קובץ</St>
          </div>
        );
        const form = formOf(d);
        if (d.kind === "quote_signed" && d.quote_id) return (
          <Link key={d.id} href={"/quotes/" + d.quote_id} className="lrow link" style={{ textDecoration: "none", color: "inherit" }}>
            <span className="grow"><b>{d.title}</b><span className="meta">נחתמה {fmtDate(d.created_at)}</span></span>
            <St cls="ok">חתומה</St>
          </Link>
        );
        const ls = intakeStatus(d);
        if (ls) return (
          <div key={d.id} className="lrow">
            <button className="grow linkish" onClick={() => form && setOpen({ doc: d, form })} title="פתיחה">
              <b>{d.title}</b>
              <span className="meta">נשלח {fmtDate(d.sent_at || d.created_at)}
                {d.submitted_at ? " · מולא " + fmtDate(d.submitted_at) + " · נעול" : d.reopened_at ? " · נפתח שוב למילוי " + fmtDate(d.reopened_at) : d.opened_at ? " · נפתח" + (d.views > 1 ? " " + d.views + " פעמים" : "") : ""}
                {d.data?.total ? " · " + (d.data.filled || 0) + " מתוך " + d.data.total : ""}</span>
            </button>
            {d.kind === "intake:c_auto" && d.data?.filled ? <button className="btn icon sm ghost" title="הורדה כקובץ ל-Claude Code" onClick={() => downloadBrief(d, form!, who)}><Icon n="download" s={15} /></button> : null}
            {d.submitted_at ? <button className="btn sm ghost" title="הלקוח יוכל להיכנס שוב לקישור ולהמשיך מאיפה שעצר" onClick={() => reopen(d)}><Icon n="reset" s={15} />פתיחה למילוי חוזר</button> : null}
            {!d.submitted_at ? <>
              <button className="btn icon sm ghost" title="העתקת הקישור" onClick={() => copyLink(d)}><Icon n="copy" s={15} /></button>
              <button className="btn icon sm ghost" title="שליחה שוב בוואטסאפ" onClick={() => deliver(d, true)}><Icon n="wa" s={15} /></button>
            </> : null}
            <St cls={ls.cls}>{ls.label}</St>
          </div>
        );
        return (
          <button key={d.id} className="lrow link" style={{ width: "100%", background: "none", border: 0, textAlign: "inherit", font: "inherit" }}
            onClick={() => form && setOpen({ doc: d, form })} disabled={!form}>
            <span className="grow"><b>{d.title}</b><span className="meta">עודכן {fmtDate(d.updated_at || d.created_at)}{d.data?.total ? " · מולאו " + d.data.filled + " מתוך " + d.data.total : ""}</span></span>
            <St cls={d.data?.filled && d.data.filled === d.data.total ? "ok" : "info"}>אפיון</St>
          </button>
        );
      })}

      {pick ? (
        <Modal title="איזה אפיון לפתוח?" icon="note" onClose={() => setPick(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {INTAKE_FORMS.map((f) => (
              <button key={f.kind} className="btn" style={{ justifyContent: "flex-start", height: "auto", padding: "12px 14px", textAlign: "start", whiteSpace: "normal" }}
                onClick={() => { setPick(false); setOpen({ doc: null, form: f }); }}>
                <span><b style={{ display: "block" }}>{f.title}</b><span className="tiny">{f.intro}</span></span>
              </button>
            ))}
          </div>
        </Modal>
      ) : null}

      {sendPick ? (
        <Modal title="איזה אפיון לשלוח ללקוח?" icon="send" onClose={() => setSendPick(false)}>
          <p className="tiny" style={{ margin: "0 0 4px" }}>נפתחת הודעת וואטסאפ עם קישור. הלקוח ממלא בטלפון, והתשובות נכנסות לכאן.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {clientForms(settings.intake_templates).map((f) => (
              <button key={f.kind} className="btn" style={{ justifyContent: "flex-start", height: "auto", padding: "12px 14px", textAlign: "start", whiteSpace: "normal" }} onClick={() => sendIntake(f)}>
                <span><b style={{ display: "block" }}>{f.title}</b><span className="tiny">{f.sections.reduce((n, x) => n + x.fields.length, 0)} שאלות · {f.sections.map((x) => x.title).join(" · ")}</span></span>
              </button>
            ))}
          </div>
        </Modal>
      ) : null}

      {open ? <FormModal key={open.doc?.id || open.form.kind} doc={open.doc} form={open.form} who={who} onSave={(a) => save(open.doc, open.form, a)} onClose={() => setOpen(null)} /> : null}
    </Panel>
  );
}

function FormModal({ doc, form, who, onSave, onClose }: { doc: Row | null; form: IntakeForm; who: string; onSave: (a: Answers) => Promise<boolean>; onClose: () => void }) {
  const start = (doc?.data?.answers as Answers) || {};
  const [a, setA] = useState<Answers>(start);
  const [ro, setRo] = useState(!!doc?.id); // an existing document opens read only, "עריכה" unlocks it
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const set = (id: string, v: AnswerValue) => { setA((x) => ({ ...x, [id]: v })); setDirty(true); };
  const close = () => { if (dirty && !confirm("יש שינויים שלא נשמרו. לסגור בלי לשמור?")) return; onClose(); };
  const { n, all } = filledCount(form, a);
  const secret: SecretApi | undefined = doc?.id ? {
    save: async (key, label, url, user, value) => {
      const { error } = await sb().rpc("crm_intake_set_secret", { p_doc: doc.id, p_key: key, p_label: label, p_url: url, p_user: user, p_value: value });
      return !error;
    },
    reveal: async (key) => {
      const { data, error } = await sb().rpc("crm_intake_reveal", { p_doc: doc.id, p_key: key });
      return error ? null : (data as string | null);
    },
  } : undefined;

  return (
    <Modal title={form.title} icon="note" onClose={close} wide>
      <p className="tiny" style={{ margin: 0 }}>{form.intro} · מולאו {n} מתוך {all}{doc?.submitted_at ? " · הלקוח שלח, נעול אצלו" : ""}</p>
      {form.sections.map((s) => (
        <div key={s.title} style={s.internal ? { border: "2px dashed var(--gold-2)", borderRadius: 12, padding: 12 } : undefined}>
          <h3 style={{ fontSize: 15, margin: "4px 0 10px" }}>{s.title}{s.internal ? <span className="tiny"> · לא נשלח ללקוח</span> : null}</h3>
          <IntakeFields fields={s.fields} a={a} set={set} name={form.kind} onOpenFile={openStored} secret={secret} ro={ro} />
        </div>
      ))}
      <div className="bar" style={{ position: "sticky", bottom: -24, background: "var(--surface)", padding: "12px 0 0", justifyContent: "flex-end" }}>
        <button className="btn sm ghost" onClick={async () => {
          try { await navigator.clipboard.writeText(formText(form, a, who)); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ }
        }}><Icon n="copy" s={15} />{copied ? "הועתק" : "העתקה למשרד"}</button>
        {doc?.kind === "intake:c_auto" ? <button className="btn sm ghost" onClick={() => downloadBrief({ ...doc, data: { ...(doc.data || {}), answers: a } }, form, who)}><Icon n="download" s={15} />הורדה כקובץ ל-Claude Code</button> : null}
        {ro ? <>
          <button className="btn sm ghost" onClick={close}>סגירה</button>
          <button className="btn sm primary" onClick={() => setRo(false)}><Icon n="pen" s={15} />עריכה</button>
        </> : <>
          <button className="btn sm ghost" onClick={() => { if (doc?.id) { if (dirty && !confirm("לבטל את השינויים?")) return; setA(start); setDirty(false); setRo(true); } else close(); }}>{doc?.id ? "ביטול" : "סגירה"}</button>
          <button className="btn sm primary" disabled={busy} onClick={async () => { setBusy(true); const ok = await onSave(a); setBusy(false); if (ok) { setDirty(false); if (doc?.id) setRo(true); } }}>
            <Icon n="check" s={15} />{busy ? "שומר…" : "שמירה"}
          </button>
        </>}
      </div>
    </Modal>
  );
}
