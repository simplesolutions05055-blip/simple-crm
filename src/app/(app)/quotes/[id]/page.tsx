"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { sb } from "@/lib/supabase/browser";
import { Top, St } from "@/components/Shell";
import Icon from "@/components/Icon";
import QuoteDoc from "@/components/QuoteDoc";
import AiQuoteDoc from "@/components/AiQuoteDoc";
import { useApp } from "@/components/AppCtx";
import { computeQuote, normalizeInput, withPricing, withTemplate, nis, type QuoteInput, type Pricing } from "@/lib/quote-engine";
import { aiView, emptyAi, normalizeAi, withAi, computeAi, type AiInput, type AiPricing } from "@/lib/ai-campaign";
import { QUOTE_STATUS_CLS, fillTemplate, waLink, waTemplates, appUrl, fmtDateTime, type Row } from "@/lib/crm";

export default function QuoteEditor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { org, settings, toast } = useApp();
  const [q, setQ] = useState<Row | null>(null);
  const [who, setWho] = useState<Row | null>(null);
  const [sig, setSig] = useState<Row | null>(null);
  const [I, setI] = useState<QuoteInput | null>(null);
  const [saved, setSaved] = useState<"saved" | "dirty" | "saving">("saved");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await sb().from("crm_quotes").select("*,lead:crm_leads(id,name,biz,phone,email),client:crm_clients(id,biz,contact,phone,email)").eq("id", id).single();
      if (!data) return;
      setQ(data);
      const w = data.client ? { name: data.client.contact || data.client.biz, biz: data.client.biz, phone: data.client.phone } : data.lead ? { name: data.lead.name, biz: data.lead.biz, phone: data.lead.phone } : null;
      setWho(w);
      const inp = normalizeInput(data.input);
      if (!data.input || !Object.keys(data.input).length) {
        inp.client = w?.name || ""; inp.biz = w?.biz || ""; inp.validDays = settings.valid_days;
      }
      // the packages product is retired: anything not yet sent is edited as an AI campaign quote
      if (!data.sent_at && inp.product !== "ai") { inp.product = "ai"; inp.ai = emptyAi(withAi(settings.pricing.ai)); }
      setI(inp);
      if (data.status === "נחתמה") {
        const { data: s } = await sb().from("crm_signatures").select("name,biz,signed_at,signature_png,doc_hash,ip").eq("quote_id", id).single();
        setSig(s);
      }
    })();
  }, [id, settings.valid_days]); // eslint-disable-line react-hooks/exhaustive-deps

  const signed = q?.status === "נחתמה";
  // a signed quote always shows exactly what was signed
  const P: Pricing = useMemo(() => (signed && q?.pricing ? withPricing(q.pricing) : settings.pricing), [signed, q, settings.pricing]);
  const T = useMemo(() => (signed && q?.template ? withTemplate(q.template) : settings.template), [signed, q, settings.template]);
  const vat = signed && q?.vat != null ? Number(q.vat) : settings.vat;
  const ai = I?.product === "ai";
  const model = useMemo(() => (I && !ai ? computeQuote(P, I, vat, T) : null), [P, I, vat, T, ai]);
  const aiv = useMemo(() => (I && ai ? aiView(I as unknown as Record<string, unknown>, P, vat, T) : null), [P, I, vat, T, ai]);
  // a sent quote in the retired packages format can be viewed, not edited
  const locked = signed || (!ai && !!q?.sent_at);

  const persist = useCallback(async (inp: QuoteInput, extra?: Row) => {
    if (!q || signed) return false;
    setSaved("saving");
    const m = inp.product === "ai"
      ? computeAi(withAi(settings.pricing.ai), normalizeAi(inp.ai, withAi(settings.pricing.ai)), settings.vat, settings.template)
      : computeQuote(settings.pricing, inp, settings.vat, settings.template);
    const patch: Row = {
      input: inp, totals: m.totals, pricing: settings.pricing, template: settings.template, vat: settings.vat,
      valid_days: inp.validDays, updated_at: new Date().toISOString(), ...(extra || {}),
    };
    const { error } = await sb().from("crm_quotes").update(patch).eq("id", q.id);
    if (error) { setSaved("dirty"); toast("לא נשמר: " + error.message, true); return false; }
    setQ((x) => ({ ...x!, ...patch }));
    setSaved("saved");
    return true;
  }, [q, signed, settings, toast]);

  function upd(p: Partial<QuoteInput>) {
    if (locked || !I) return;
    const next = { ...I, ...p };
    setI(next);
    setSaved("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => persist(next), 700);
  }

  async function send(auto = false) {
    if (!I || !q) return;
    if (auto && !who?.phone) return toast("אין טלפון לליד או ללקוח", true);
    if (!who?.phone) toast("אין טלפון לליד או ללקוח. הקישור נפתח בוואטסאפ בלי מספר.", true);
    const first = !q.sent_at;
    const ok = await persist(I, first ? { sent_at: new Date().toISOString(), status: "נשלחה" } : q.status === "טיוטה" ? { status: "נשלחה" } : { version: (q.version || 1) + 1 });
    if (!ok) return;
    const url = appUrl() + "/q/" + q.token;
    const text = fillTemplate(settings.wa_template, { "שם": (I.client || who?.name || "").split(" ")[0], "מספר": q.no, "קישור": url });
    if (auto) {
      const t = waTemplates(settings.wa).find((x) => x.name === settings.wa.quote_template);
      const { error } = await sb().rpc("crm_wa_send", { p_phone: who!.phone, p_template: settings.wa.quote_template, p_lang: t?.lang || "he",
        p_params: [(I.client || who?.name || "").split(" ")[0] || "שלום", url].slice(0, t?.params ?? 2), p_text: null, p_lead: q.lead_id, p_client: q.client_id });
      if (error) return toast("לא נשלח: " + error.message, true);
      toast("ההצעה נשלחה בוואטסאפ");
    } else {
      await sb().from("crm_activities").insert({ org_id: org, lead_id: q.lead_id, client_id: q.client_id, type: "וואטסאפ", text: (first ? "נשלחה הצעה " : "נשלחה שוב הצעה ") + q.no, by: "מאור" });
    }
    if (first && q.lead_id) {
      const { data: l } = await sb().from("crm_leads").select("stage").eq("id", q.lead_id).single();
      if (l && ["חדש", "נוצר קשר", "כשיר", "פגישה נקבעה"].includes(l.stage)) await sb().from("crm_leads").update({ stage: "הצעה נשלחה" }).eq("id", q.lead_id);
    }
    if (!auto) window.open(waLink(who?.phone, text), "_blank");
  }

  async function sendPay() {
    if (!q || !aiv) return;
    const url = aiv.I.payUrl;
    const first = (I?.client || who?.name || "").split(" ")[0];
    const text = (first ? "היי " + first + ", " : "") + "זה הקישור לתשלום עבור הצעת המחיר " + q.no + ":\n" + url;
    await sb().from("crm_activities").insert({ org_id: org, lead_id: q.lead_id, client_id: q.client_id, type: "וואטסאפ", text: "נשלח קישור לתשלום, הצעה " + q.no, by: "מאור" });
    if (!who?.phone) toast("אין טלפון לליד או ללקוח. הקישור נפתח בוואטסאפ בלי מספר.", true);
    window.open(waLink(who?.phone, text), "_blank");
  }

  async function duplicate() {
    if (!q || !I) return;
    const base = ai ? I : { ...I, product: "ai" as const, ai: emptyAi(withAi(settings.pricing.ai)) };
    const { data, error } = await sb().from("crm_quotes").insert({ org_id: org, lead_id: q.lead_id, client_id: q.client_id, input: { ...base, date: new Date().toISOString().slice(0, 10) }, totals: ai ? q.totals : {} }).select("id").single();
    if (error) return toast(error.message, true);
    router.push("/quotes/" + data.id);
  }

  if (!q || !I || (!model && !aiv)) return <><Top title="הצעת מחיר" crumb={{ href: "/quotes", label: "הצעות מחיר" }} /><div className="loading" style={{ minHeight: 200 }}>טוען…</div></>;
  const link = appUrl() + "/q/" + q.token;

  return (
    <>
      <Top title={"הצעה " + q.no + (who ? " · " + (who.biz || who.name) : "")} crumb={{ href: "/quotes", label: "הצעות מחיר" }}
        sub={<><St cls={QUOTE_STATUS_CLS[q.status]}>{q.status}</St>{ai ? " · קמפיין AI" : " · חבילות (פורמט קודם)"}{q.sent_at ? " · נשלחה " + fmtDateTime(q.sent_at) : ""}{q.views ? " · " + q.views + " צפיות" : ""}{!locked ? " · " + (saved === "saved" ? "נשמר" : saved === "saving" ? "שומר…" : "יש שינויים") : ""}</>}
        right={<div className="bar">
          {q.lead_id ? <Link className="btn sm" href={"/leads/" + q.lead_id}><Icon n="target" s={15} />ליד</Link> : null}
          {q.client_id ? <Link className="btn sm" href={"/clients/" + q.client_id}><Icon n="brief" s={15} />לקוח</Link> : null}
        </div>} />
      <div className="content">
        <div className="bar">
          {!locked && settings.wa?.phone_number_id && settings.wa?.quote_template ? <button className="btn wa" onClick={() => send(true)}><Icon n="send" s={16} />{q.sent_at ? "שליחה שוב, אוטומטית" : "שליחה אוטומטית בוואטסאפ"}</button> : null}
          {!locked ? <button className={"btn" + (settings.wa?.phone_number_id ? "" : " wa")} onClick={() => send()}><Icon n="wa" s={16} />{q.sent_at ? "שליחה שוב בוואטסאפ" : "שליחה בוואטסאפ"}</button> : null}
          {q.sent_at ? <>
            <button className="btn" onClick={() => { navigator.clipboard.writeText(link); toast("הקישור הועתק"); }}><Icon n="copy" s={16} />העתקת קישור</button>
            <a className="btn" href={"/q/" + q.token} target="_blank" rel="noreferrer"><Icon n="eye" s={16} />כמו שהלקוח רואה</a>
          </> : <span className="tiny">הקישור ללקוח נפתח עם השליחה הראשונה.</span>}
          {aiv ? <>
            <button className="btn" onClick={sendPay}><Icon n="wallet" s={16} />שליחת קישור לתשלום</button>
            <button className="btn" onClick={() => { navigator.clipboard.writeText(aiv.I.payUrl); toast("קישור התשלום הועתק"); }}><Icon n="link" s={16} />העתקת קישור לתשלום</button>
          </> : null}
          <button className="btn" onClick={() => window.print()}><Icon n="file" s={16} />PDF</button>
          <button className="btn" onClick={duplicate}><Icon n="copy" s={16} />שכפול</button>
          {q.sent_at && !signed && q.status !== "נדחתה" ? <button className="btn danger" onClick={async () => {
            if (!confirm("לסמן שההצעה נדחתה?")) return;
            await sb().from("crm_quotes").update({ status: "נדחתה" }).eq("id", q.id); setQ({ ...q, status: "נדחתה" });
          }}>נדחתה</button> : null}
          {q.status === "טיוטה" ? <button className="btn ghost" style={{ marginInlineStart: "auto" }} onClick={async () => {
            if (!confirm("למחוק את הטיוטה?")) return;
            await sb().from("crm_quotes").delete().eq("id", q.id); router.push("/quotes");
          }}><Icon n="trash" s={15} />מחיקת טיוטה</button> : null}
        </div>
        {signed && sig ? (
          <div className="next" style={{ borderColor: "var(--ok)" }}>
            <span className="ic" style={{ borderColor: "var(--ok)", color: "var(--ok)" }}><Icon n="check" /></span>
            <div><small style={{ color: "var(--ok)" }}>נחתמה</small><div>{sig.name}{sig.biz ? ", " + sig.biz : ""} · {fmtDateTime(sig.signed_at)} · IP {sig.ip || "-"}</div>
              <div className="tiny mono">{sig.doc_hash}</div></div>
          </div>
        ) : null}
        {!ai && !signed && q.sent_at ? <p className="tiny" style={{ margin: 0 }}>ההצעה נשלחה במבנה החבילות הקודם ולכן אינה ניתנת לעריכה. ללקוח היא ממשיכה לעבוד כרגיל. &quot;שכפול&quot; יוצר ממנה הצעת קמפיין AI חדשה.</p> : null}
        <div className="split">
          {!locked && aiv ? <AiControls I={I} ai={aiv.I} A={withAi(P.ai)} vat={vat} upd={upd} /> : <div />}
          <div className="preview">
            {aiv ? <AiQuoteDoc m={aiv.m} T={T} to={aiv.to} biz={aiv.biz} date={aiv.date} until={aiv.until}
                signed={sig ? { name: sig.name, biz: sig.biz, signed_at: sig.signed_at, png: sig.signature_png, doc_hash: sig.doc_hash } : null} />
              : model ? <QuoteDoc m={model} T={T} signed={sig ? { name: sig.name, biz: sig.biz, signed_at: sig.signed_at, png: sig.signature_png, doc_hash: sig.doc_hash } : null} /> : null}
          </div>
        </div>
      </div>
    </>
  );
}

function AiControls({ I, ai, A, vat, upd }: { I: QuoteInput; ai: AiInput; A: AiPricing; vat: number; upd: (p: Partial<QuoteInput>) => void }) {
  const set = (p: Partial<AiInput>) => upd({ ai: { ...ai, ...p } });
  const g = (n: number) => Math.round(n * (1 + vat / 100));
  return (
    <div className="panel ctlp">
      <div className="cgroup">
        <b>פרטי ההצעה</b>
        <div className="f2">
          <label className="field"><span>לכבוד</span><input className="inp sm" value={I.client} onChange={(e) => upd({ client: e.target.value })} /></label>
          <label className="field"><span>שם העסק</span><input className="inp sm" value={I.biz} onChange={(e) => upd({ biz: e.target.value })} /></label>
          <label className="field"><span>תאריך</span><input className="inp sm" type="date" value={I.date} onChange={(e) => upd({ date: e.target.value })} /></label>
          <label className="field"><span>תוקף, בימים</span><input className="inp sm" type="number" min={1} value={I.validDays} onChange={(e) => upd({ validDays: Math.max(1, Number(e.target.value) || 14) })} /></label>
        </div>
      </div>

      <div className="cgroup">
        <b>הקמפיין</b>
        <div className="f2">
          <label className="field"><span>מחיר חודשי, לפני מע&quot;מ</span>
            <input className="inp sm" type="number" min={1} value={ai.price || ""} placeholder={String(A.price)} onChange={(e) => set({ price: Math.max(0, Number(e.target.value) || 0) })} />
          </label>
          <label className="field"><span>פלטפורמה</span>
            <select className="inp sm" value={ai.platform} onChange={(e) => set({ platform: e.target.value as AiInput["platform"] })}>
              <option value="either">מטא או טיקטוק</option><option value="meta">מטא (פייסבוק ואינסטגרם)</option><option value="tiktok">טיקטוק</option>
            </select>
          </label>
        </div>
        <label className={"pillck" + (ai.promo ? " on" : "")} style={{ alignSelf: "flex-start" }}>
          <input type="checkbox" checked={ai.promo} onChange={(e) => set({ promo: e.target.checked })} />מבצע הצטרפות: {A.promoPct}% הנחה על החודש הראשון
        </label>
        <span className="tiny">{ai.promo
          ? "חודש ראשון " + nis(Math.round(ai.price * (100 - A.promoPct) / 100)) + " לפני מע\"מ, " + nis(g(Math.round(ai.price * (100 - A.promoPct) / 100))) + " כולל. מהחודש השני " + nis(ai.price) + "."
          : nis(ai.price) + " לחודש לפני מע\"מ, " + nis(g(ai.price)) + " כולל מע\"מ."}</span>
      </div>

      <div className="cgroup">
        <b>תוספות חד פעמיות</b>
        {A.addons.map((x) => {
          const on = ai.addons.includes(x.id);
          return (
            <label key={x.id} className="hidrow">
              <input type="checkbox" checked={on} onChange={(e) => set({ addons: e.target.checked ? [...new Set([...ai.addons, x.id])] : ai.addons.filter((a) => a !== x.id) })} />
              <span style={{ flex: 1 }}>{x.label}</span><b className="num">{nis(x.price)}</b>
            </label>
          );
        })}
        <span className="tiny">תוספת שלא סומנה מופיעה בהצעה בטבלת &quot;תוספות אפשריות&quot;. מה שסומן נכנס לסיכום לתשלום.</span>
      </div>

      <div className="cgroup">
        <b>קישור לתשלום</b>
        <input className="inp sm ltr" value={ai.payUrl} onChange={(e) => set({ payUrl: e.target.value.trim() })} />
        <span className="tiny">אחרי החתימה הלקוח רואה כפתור &quot;מעבר לתשלום&quot; עם הקישור הזה. אפשר גם לשלוח אותו ישירות בוואטסאפ מהכפתור למעלה.</span>
      </div>
    </div>
  );
}
