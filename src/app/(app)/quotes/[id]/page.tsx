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
import { computeQuote, normalizeInput, toggleableCards, withPricing, withTemplate, nis, type QuoteInput, type Pricing, type ExtraLine } from "@/lib/quote-engine";
import { aiView, emptyAi, normalizeAi, withAi, computeAi, type AiInput, type AiPricing } from "@/lib/ai-campaign";
import { packView, emptyPack, normalizePack, withPack, computePack, newLine, basePrice, priceOf, offeredAddons, addonPriceOf, type PackInput, type PackLine, type PackPricing, type ProdId } from "@/lib/products";
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
      // a brand-new quote starts with the AI campaign as its product (other products can be added next to it);
      // the three fixed packages are retired, so an unsent draft that used one continues as a custom build
      if (!data.input || !Object.keys(data.input).length) { inp.product = "pack"; inp.prods = emptyPack(withAi(settings.pricing.ai).payUrl, ["ai"]); }
      else if (!data.sent_at && inp.product !== "ai" && inp.product !== "pack" && inp.track !== "custom") inp.track = "custom";
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
  const pk = I?.product === "pack";
  const model = useMemo(() => (I && !ai && !pk ? computeQuote(P, I, vat, T) : null), [P, I, vat, T, ai, pk]);
  const aiv = useMemo(() => (I && ai ? aiView(I as unknown as Record<string, unknown>, P, vat, T) : null), [P, I, vat, T, ai]);
  const pkv = useMemo(() => (I && pk ? packView(I as unknown as Record<string, unknown>, P, vat, T) : null), [P, I, vat, T, pk]);
  // a sent quote in the retired packages format can be viewed, not edited
  const locked = signed || (!ai && !pk && !!q?.sent_at && I?.track !== "custom");

  const persist = useCallback(async (inp: QuoteInput, extra?: Row) => {
    if (!q || signed) return false;
    setSaved("saving");
    const m = inp.product === "ai"
      ? computeAi(withAi(settings.pricing.ai), normalizeAi(inp.ai, withAi(settings.pricing.ai)), settings.vat, settings.template)
      : inp.product === "pack"
      ? computePack(withPack(settings.pricing.pack, settings.pricing.ai), normalizePack(inp.prods, withAi(settings.pricing.ai).payUrl), settings.vat, settings.template)
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

  async function duplicate() {
    if (!q || !I) return;
    const base = ai || pk || I.track === "custom" ? I : { ...I, track: "custom" };
    const { data, error } = await sb().from("crm_quotes").insert({ org_id: org, lead_id: q.lead_id, client_id: q.client_id, input: { ...base, date: new Date().toISOString().slice(0, 10) }, totals: base === I ? q.totals : {} }).select("id").single();
    if (error) return toast(error.message, true);
    router.push("/quotes/" + data.id);
  }

  const hasMail = !!I && !ai && !pk && (I.track === "custom" ? I.items.includes("mail") : I.track === "more" || I.track === "max");
  // which product the quote is: the AI campaign, one or more of the products, or a custom build.
  // A sent quote keeps its type, so the switch shows only before the first send.
  const PP = withPack(settings.pricing.pack, settings.pricing.ai);
  const lines = pkv?.I.lines || [];
  // an unsent quote made as a standalone AI campaign moves into the products quote with its price, promo and add-ons
  function fromAi(): PackInput {
    const A = withAi(settings.pricing.ai);
    const a = normalizeAi(I?.ai, A);
    const ids = new Set(PP.addons.map((x) => x.id));
    return { ...emptyPack(a.payUrl, []), lines: [{ ...newLine("ai"), price: a.price !== A.price ? a.price : null, promo: a.promo },
      ...(a.addons.includes("lp") ? [newLine("lp")] : []), ...(a.addons.includes("site5") ? [newLine("site")] : [])],
      addons: [...new Set(a.addons.map((x) => (x === "anim3" ? "vid3" : x)).filter((x) => ids.has(x)))] };
  }
  function toggleProd(id: ProdId) {
    const cur = pk ? normalizePack(I?.prods, withAi(settings.pricing.ai).payUrl) : ai ? fromAi() : emptyPack(withAi(settings.pricing.ai).payUrl);
    const on = cur.lines.some((l) => l.id === id);
    let next = on ? cur.lines.filter((l) => l.id !== id) : [...cur.lines, newLine(id)];
    if (!on && id === "soc") next = next.filter((l) => l.id !== "socfull");
    if (!on && id === "socfull") next = next.filter((l) => l.id !== "soc");
    if ((pk || ai) && !next.length && !cur.extras) return toast("בהצעה צריך להישאר לפחות מוצר אחד", true);
    upd({ product: "pack", prods: { ...cur, lines: next } });
  }
  // "תוספות" as a product of its own: every add-on is offered, each with its own price
  function toggleExtras() {
    const cur = pk ? normalizePack(I?.prods, withAi(settings.pricing.ai).payUrl) : ai ? fromAi() : emptyPack(withAi(settings.pricing.ai).payUrl);
    if (cur.extras && !cur.lines.length) return toast("בהצעה צריך להישאר לפחות מוצר אחד", true);
    upd({ product: "pack", prods: { ...cur, extras: !cur.extras, addons: cur.extras ? cur.addons.filter((a) => offeredAddons(PP, cur.lines.map((l) => l.id)).some((x) => x.id === a)) : cur.addons } });
  }
  const extrasOn = !!pkv?.I.extras;
  const product = !locked && !q?.sent_at ? (
    <div className="cgroup">
      <b>מה בהצעה</b>
      <div className="pills">
        {PP.products.map((p) => {
          const on = lines.some((l) => l.id === p.id) || (ai && p.id === "ai");
          return <button key={p.id} type="button" className={"pillck" + (on ? " on" : "")} onClick={() => toggleProd(p.id)}>{on ? "✓ " : ""}{p.short}</button>;
        })}
        <button type="button" className={"pillck" + (extrasOn ? " on" : "")} onClick={toggleExtras}>{extrasOn ? "✓ " : ""}תוספות</button>
        <button type="button" className={"pillck" + (!ai && !pk ? " on" : "")} onClick={() => (ai || pk) && upd({ product: "packages", track: "custom" })}>הרכבה אישית</button>
      </div>
      <span className="tiny">אפשר לסמן כמה מוצרים יחד, כולל קמפיין AI עם המבצע. &quot;תוספות&quot; מוסיף את כל התוספות לבחירה, עם פירוט ומחיר לכל אחת, וגם לבד בלי מוצר אחר. הרכבה אישית היא הצעה נפרדת.</span>
    </div>
  ) : null;
  if (!q || !I || (!model && !aiv && !pkv)) return <><Top title="הצעת מחיר" crumb={{ href: "/quotes", label: "הצעות מחיר" }} /><div className="loading" style={{ minHeight: 200 }}>טוען…</div></>;
  const link = appUrl() + "/q/" + q.token;

  return (
    <>
      <Top title={"הצעה " + q.no + (who ? " · " + (who.biz || who.name) : "")} crumb={{ href: "/quotes", label: "הצעות מחיר" }}
        sub={<><St cls={QUOTE_STATUS_CLS[q.status]}>{q.status}</St>{ai ? " · קמפיין AI" : pkv ? " · " + pkv.m.totals.title : I.track === "custom" ? " · הרכבה אישית" : " · חבילה (הוסרה)"}{q.sent_at ? " · נשלחה " + fmtDateTime(q.sent_at) : ""}{q.views ? " · " + q.views + " צפיות" : ""}{!locked ? " · " + (saved === "saved" ? "נשמר" : saved === "saving" ? "שומר…" : "יש שינויים") : ""}</>}
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
        {!ai && !pk && !signed && q.sent_at && I.track !== "custom" ? <p className="tiny" style={{ margin: 0 }}>ההצעה נשלחה על אחת משלוש החבילות שהוסרו, ולכן אינה ניתנת לעריכה. ללקוח היא ממשיכה לעבוד כרגיל. &quot;שכפול&quot; יוצר ממנה הצעה חדשה בהרכבה אישית.</p> : null}
        <div className="split">
          {locked ? <div /> : aiv ? <AiControls I={I} ai={aiv.I} A={withAi(P.ai)} vat={vat} upd={upd} top={product} />
            : pkv ? <PackControls I={I} pi={pkv.I} P={pkv.P} vat={vat} upd={upd} top={product} />
            : <Controls I={I} P={P} upd={upd} hasMail={hasMail} vat={vat} T={T} top={product} />}
          <div className="preview">
            {aiv || pkv ? <AiQuoteDoc m={(aiv || pkv)!.m} T={T} to={(aiv || pkv)!.to} biz={(aiv || pkv)!.biz} date={(aiv || pkv)!.date} until={(aiv || pkv)!.until}
                signed={sig ? { name: sig.name, biz: sig.biz, signed_at: sig.signed_at, png: sig.signature_png, doc_hash: sig.doc_hash } : null} />
              : model ? <QuoteDoc m={model} T={T} signed={sig ? { name: sig.name, biz: sig.biz, signed_at: sig.signed_at, png: sig.signature_png, doc_hash: sig.doc_hash } : null} /> : null}
          </div>
        </div>
      </div>
    </>
  );
}

function Pill({ on, label, onChange }: { on: boolean; label: React.ReactNode; onChange: (v: boolean) => void }) {
  return <label className={"pillck" + (on ? " on" : "")}><input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />{label}</label>;
}

function Controls({ I, P, upd, hasMail, vat, T, top }: { I: QuoteInput; P: Pricing; upd: (p: Partial<QuoteInput>) => void; hasMail: boolean; vat: number; T: ReturnType<typeof withTemplate>; top: React.ReactNode }) {
  const custom = I.track === "custom";
  const tog = (arr: string[], v: string, on: boolean) => (on ? [...new Set([...arr, v])] : arr.filter((x) => x !== v));
  const setItem = (id: string, on: boolean) => {
    let items = tog(I.items, id, on);
    if (on && id === "soc") items = items.filter((x) => x !== "socfull");
    if (on && id === "socfull") items = items.filter((x) => x !== "soc");
    upd({ items });
  };
  const groups = useMemo(() => toggleableCards(P, I, vat, T), [P, I, vat, T]);

  // price overrides that apply to what is selected right now
  const ovRows: { k: string; l: string; d: number }[] = [];
  if (!custom) {
    const tr = P.tracks.find((t) => t.id === I.track);
    if (tr) { ovRows.push({ k: "track:" + tr.id, l: tr.name + ", לחודש", d: tr.price }); if (tr.setup) ovRows.push({ k: "setup:" + tr.id, l: "עלות הקמה, מלאה", d: tr.setup }); }
  } else {
    const both = P.bundle.ids.every((b) => I.items.includes(b));
    P.items.filter((it) => I.items.includes(it.id) && !(both && P.bundle.ids.includes(it.id))).forEach((it) => {
      ovRows.push({ k: "item:" + it.id, l: it.label.split(",")[0] + ", לחודש", d: it.price });
      if (it.setup) ovRows.push({ k: "itemsetup:" + it.id, l: it.label.split(",")[0] + ", הקמה", d: it.setup });
    });
    if (both) { ovRows.push({ k: "bundle", l: "מענה ודיוור יחד, לחודש", d: P.bundle.price }); ovRows.push({ k: "bundlesetup", l: "מענה ודיוור יחד, הקמה", d: P.bundle.setup }); }
  }
  if (hasMail) {
    ovRows.push({ k: "phone", l: "מספר דיוור, לחודש", d: P.msg.phone });
    const pk = P.msg.packs.find((p) => p.id === I.pack);
    if (pk) ovRows.push({ k: "pack:" + pk.id, l: pk.n.toLocaleString("he-IL") + " הודעות", d: pk.price });
  }
  const W = P.web.find((w) => w.id === I.web);
  if (W) {
    ovRows.push({ k: "web:" + W.id, l: W.label, d: W.price });
    W.monthly.forEach((m, i) => ovRows.push({ k: "webm:" + W.id + ":" + i, l: m.label + ", לחודש", d: m.price }));
    if (I.domain === "need") ovRows.push({ k: "domain", l: "דומיין, לשנה", d: P.domain });
  }
  P.addons.filter((a) => I.addons.includes(a.id)).forEach((a) => ovRows.push({ k: "addon:" + a.id, l: a.label, d: a.price }));

  const setOv = (k: string, v: string) => {
    const o = { ...I.overrides };
    if (v === "" || isNaN(Number(v))) delete o[k]; else o[k] = Number(v);
    upd({ overrides: o });
  };
  const setExtra = (i: number, p: Partial<ExtraLine>) => upd({ extra: I.extra.map((e, n) => (n === i ? { ...e, ...p } : e)) });

  return (
    <div className="panel ctlp">
      {top}
      <div className="cgroup">
        <b>פרטי ההצעה</b>
        <div className="f2">
          <label className="field"><span>שם הלקוח</span><input className="inp sm" value={I.client} onChange={(e) => upd({ client: e.target.value })} /></label>
          <label className="field"><span>שם העסק</span><input className="inp sm" value={I.biz} onChange={(e) => upd({ biz: e.target.value })} /></label>
          <label className="field"><span>תאריך</span><input className="inp sm" type="date" value={I.date} onChange={(e) => upd({ date: e.target.value })} /></label>
          <label className="field"><span>תוקף, בימים</span><input className="inp sm" type="number" min={1} value={I.validDays} onChange={(e) => upd({ validDays: Math.max(1, Number(e.target.value) || 14) })} /></label>
          <label className="field"><span>תקציב פרסום מומלץ, לחודש</span><input className="inp sm" type="number" value={I.budget} onChange={(e) => upd({ budget: e.target.value })} /></label>
        </div>
        <label className="field"><span>מה הבנו מהשיחה</span>
          <textarea className="inp" rows={2} value={I.brief} placeholder="שתי שורות בלשון הלקוח: מה הוא מוכר, למי, ומה לא עובד לו היום" onChange={(e) => upd({ brief: e.target.value })} />
        </label>
      </div>

      {custom ? (
        <div className="cgroup">
          <b>שירותים חודשיים בהרכבה</b>
          <div className="pills">{P.items.map((it) => <Pill key={it.id} on={I.items.includes(it.id)} onChange={(v) => setItem(it.id, v)} label={<>{it.label.split(",")[0]} <b>{nis(it.price)}</b></>} />)}</div>
          {P.bundle.ids.every((b) => I.items.includes(b)) ? <p className="tiny" style={{ margin: 0 }}>שני מוצרי הוואטסאפ נבחרו: הם מוצגים כשורה אחת ב-{nis(P.bundle.price)}, וההקמה לדיוור ללא עלות.</p> : null}
        </div>
      ) : null}

      {hasMail ? (
        <div className="cgroup">
          <b>דיוור וואטסאפ</b>
          <div className="f2">
            <label className="field"><span>מספרי טלפון לדיוור</span><input className="inp sm" type="number" min={1} value={I.phones} onChange={(e) => upd({ phones: Math.max(1, Number(e.target.value) || 1) })} /></label>
            <label className="field"><span>חבילת הודעות בכניסה</span>
              <select className="inp sm" value={I.pack} onChange={(e) => upd({ pack: e.target.value })}>
                <option value="">רק המתנה, {P.msg.free.toLocaleString("he-IL")} הודעות בחודש הראשון</option>
                {P.msg.packs.map((p) => <option key={p.id} value={p.id}>{p.n.toLocaleString("he-IL")} הודעות נוספות</option>)}
              </select>
            </label>
          </div>
        </div>
      ) : null}

      <div className="cgroup">
        <b>אתר, תוספות והתחייבות</b>
        <div className="f2">
          <label className="field"><span>אתר או דף נחיתה</span>
            <select className="inp sm" value={I.web} onChange={(e) => upd({ web: e.target.value })}>
              <option value="">אין</option>
              {P.web.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
            </select>
          </label>
          <label className="field"><span>דומיין</span>
            <select className="inp sm" value={I.domain} disabled={!I.web} onChange={(e) => upd({ domain: e.target.value as "has" | "need" })}>
              <option value="has">ללקוח יש דומיין</option><option value="need">צריך לרכוש דומיין</option>
            </select>
          </label>
        </div>
        <div className="pills">
          <Pill on={I.commit} onChange={(v) => upd({ commit: v })} label="התחייבות לשלושה חודשים" />
          {P.addons.map((a) => <Pill key={a.id} on={I.addons.includes(a.id)} onChange={(v) => upd({ addons: tog(I.addons, a.id, v) })} label={a.label} />)}
        </div>
      </div>

      <div className="cgroup">
        <b>הנחה</b>
        <div className="f2">
          <label className="field"><span>הנחה על המחיר החודשי</span>
            <select className="inp sm" value={I.discType} onChange={(e) => upd({ discType: e.target.value as QuoteInput["discType"] })}>
              <option value="">ללא הנחה</option><option value="pct">אחוז</option><option value="amt">סכום בשקלים</option>
            </select>
          </label>
          <label className="field"><span>גובה ההנחה</span><input className="inp sm" type="number" min={0} disabled={!I.discType} value={I.discVal} onChange={(e) => upd({ discVal: Number(e.target.value) || 0 })} /></label>
        </div>
        {I.discType ? <label className="field"><span>סיבת ההנחה (מופיעה בהצעה)</span><input className="inp sm" value={I.discReason} placeholder="למשל: לקוח חוזר" onChange={(e) => upd({ discReason: e.target.value })} /></label> : null}
        <div className="pills"><Pill on={I.waiveSetup} onChange={(v) => upd({ waiveSetup: v })} label="ויתור מלא על עלות ההקמה" /></div>
      </div>

      <div className="cgroup">
        <b>מחירים להצעה הזו</b>
        <span className="tiny">ריק = המחיר מההגדרות. מה שמשנים כאן חל רק על ההצעה הזו.</span>
        {ovRows.map((r) => (
          <div className="ov" key={r.k}>
            <span>{r.l}</span>
            {I.overrides[r.k] !== undefined ? <s>{nis(r.d)}</s> : null}
            <input className="inp sm" type="number" placeholder={String(r.d)} value={I.overrides[r.k] ?? ""} onChange={(e) => setOv(r.k, e.target.value)} />
          </div>
        ))}
      </div>

      <div className="cgroup">
        <b>שורות נוספות</b>
        {I.extra.map((e, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div className="xline">
              <input className="inp sm" placeholder="שם השורה" value={e.name} onChange={(ev) => setExtra(i, { name: ev.target.value })} />
              <input className="inp sm" type="number" placeholder="מחיר" value={e.price || ""} onChange={(ev) => setExtra(i, { price: Number(ev.target.value) || 0 })} />
              <select className="inp sm" value={e.billing} onChange={(ev) => setExtra(i, { billing: ev.target.value as ExtraLine["billing"] })}><option value="monthly">חודשי</option><option value="oneoff">חד פעמי</option></select>
              <button className="btn icon sm ghost" onClick={() => upd({ extra: I.extra.filter((_, n) => n !== i) })}><Icon n="trash" s={15} /></button>
            </div>
            <input className="inp sm" placeholder="מה כולל (לא חובה)" value={e.desc} onChange={(ev) => setExtra(i, { desc: ev.target.value })} />
          </div>
        ))}
        <button className="add" style={{ marginTop: 0 }} onClick={() => upd({ extra: [...I.extra, { name: "", desc: "", price: 0, billing: "oneoff" }] })}><Icon n="plus" s={15} />שורה חדשה</button>
      </div>

      <div className="cgroup">
        <b>מה נכנס להצעה</b>
        <span className="tiny">מורידים סימון מפריט שלא רלוונטי ללקוח הזה.</span>
        {groups.map((g) => (
          <div key={g.group}>
            <div className="tiny" style={{ fontWeight: 700, margin: "6px 0" }}>{g.group}</div>
            {g.cards.map((c) => {
              const off = I.hidden.includes(c.key);
              return (
                <label key={c.key} className={"hidrow" + (off ? " off" : "")}>
                  <input type="checkbox" checked={!off} onChange={(e) => upd({ hidden: e.target.checked ? I.hidden.filter((x) => x !== c.key) : [...I.hidden, c.key] })} />
                  <span>{c.t}</span>
                </label>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function AiControls({ I, ai, A, vat, upd, top }: { I: QuoteInput; ai: AiInput; A: AiPricing; vat: number; upd: (p: Partial<QuoteInput>) => void; top: React.ReactNode }) {
  const set = (p: Partial<AiInput>) => upd({ ai: { ...ai, ...p } });
  const g = (n: number) => Math.round(n * (1 + vat / 100));
  return (
    <div className="panel ctlp">
      {top}
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
              <span style={{ flex: 1 }}>{x.label}</span>
              {on ? <input className="inp sm num" style={{ width: 96 }} type="number" min={0} aria-label="מחיר בהצעה" value={ai.addonPrices?.[x.id] ?? x.price}
                onChange={(e) => { const n = Math.max(0, Math.round(Number(e.target.value) || 0)); const ap = { ...(ai.addonPrices || {}) }; if (n === x.price) delete ap[x.id]; else ap[x.id] = n; set({ addonPrices: ap }); }} />
                : <b className="num">{nis(x.price)}</b>}
            </label>
          );
        })}
        <span className="tiny">תוספת שלא סומנה מופיעה בהצעה בטבלת &quot;תוספות אפשריות&quot;. מה שסומן נכנס לסיכום לתשלום.</span>
      </div>

    </div>
  );
}

/* one price: the original (filled with the catalog price, editable) and an optional sale price */
function PriceIn({ label, def, orig, sale, set }: { label: string; def: number; orig: number | null; sale: number | null; set: (o: number | null, s: number | null) => void }) {
  const val = (v: string) => (v.trim() === "" || isNaN(Number(v)) ? null : Math.max(0, Math.round(Number(v))));
  const [o, setO] = useState(String(orig ?? def));
  useEffect(() => setO(String(orig ?? def)), [orig, def]);
  // the original is stored only when it differs from the catalog, so a later catalog change still reaches it
  const commit = (v: string) => { const n = val(v); set(n == null || n === def ? null : n, sale); };
  return (
    <div className="f2">
      <label className="field"><span>{label}, מחיר מקורי</span>
        <input className="inp sm" type="number" min={0} value={o} onChange={(e) => { setO(e.target.value); if (val(e.target.value) != null) commit(e.target.value); }}
          onBlur={() => { if (val(o) == null) { setO(String(def)); commit(""); } }} />
      </label>
      <label className="field"><span>מחיר מבצע (לא חובה)</span>
        <input className="inp sm" type="number" min={0} placeholder="ריק = בלי מבצע" value={sale ?? ""} onChange={(e) => set(orig, val(e.target.value))} />
      </label>
    </div>
  );
}

function PackControls({ I, pi, P, vat, upd, top }: { I: QuoteInput; pi: PackInput; P: PackPricing; vat: number; upd: (p: Partial<QuoteInput>) => void; top: React.ReactNode }) {
  const set = (p: Partial<PackInput>) => upd({ prods: { ...pi, ...p } });
  const setLine = (id: ProdId, p: Partial<PackLine>) => set({ lines: pi.lines.map((l) => (l.id === id ? { ...l, ...p } : l)) });
  const g = (n: number) => Math.round(n * (1 + vat / 100));
  const hasSite = pi.lines.some((l) => l.id === "site");
  const hasMail = pi.lines.some((l) => l.id === "mail");
  const bundled = hasMail && pi.lines.some((l) => l.id === "bot");
  return (
    <div className="panel ctlp">
      {top}
      <div className="cgroup">
        <b>פרטי ההצעה</b>
        <div className="f2">
          <label className="field"><span>לכבוד</span><input className="inp sm" value={I.client} onChange={(e) => upd({ client: e.target.value })} /></label>
          <label className="field"><span>שם העסק</span><input className="inp sm" value={I.biz} onChange={(e) => upd({ biz: e.target.value })} /></label>
          <label className="field"><span>תאריך</span><input className="inp sm" type="date" value={I.date} onChange={(e) => upd({ date: e.target.value })} /></label>
          <label className="field"><span>תוקף, בימים</span><input className="inp sm" type="number" min={1} value={I.validDays} onChange={(e) => upd({ validDays: Math.max(1, Number(e.target.value) || 14) })} /></label>
        </div>
      </div>

      {pi.lines.map((l) => {
        const d = P.products.find((x) => x.id === l.id)!;
        const def = basePrice(P, pi, l.id);
        const p = priceOf(l.price, l.sale, def);
        return (
          <div className="cgroup pline" key={l.id}>
            <b>{d.label}</b>
            {l.id === "mail" && bundled && l.price == null ? <span className="tiny">מחיר חבילה עם הצ&apos;אטבוט: {nis(P.bundleMail)} במקום {nis(d.price)}.</span> : null}
            <PriceIn label={d.kind === "monthly" ? "לחודש" : "חד פעמי"} def={def} orig={l.price} sale={l.sale} set={(o, s) => setLine(l.id, { price: o, sale: s })} />
            <span className="tiny">{p.was != null ? "בהצעה: " + nis(p.was) + " מחוק, ולידו " + nis(p.eff) + "." : "בהצעה: " + nis(p.eff) + (d.kind === "monthly" ? " לחודש" : "") + ", " + nis(g(p.eff)) + " כולל מע\"מ."}</span>
            {l.id === "ai" ? <>
              <label className={"pillck" + (l.promo ? " on" : "")} style={{ alignSelf: "flex-start" }}>
                <input type="checkbox" checked={l.promo} onChange={(e) => setLine(l.id, { promo: e.target.checked })} />מבצע הצטרפות: {P.aiPct}% הנחה על החודש הראשון
              </label>
              {l.promo ? <span className="tiny">חודש ראשון {nis(Math.round(p.eff * (100 - P.aiPct) / 100))} לפני מע&quot;מ, משולם בהצטרפות. מהחודש השני {nis(p.eff)}.</span> : null}
            </> : d.kind === "monthly" ? <>
              <label className={"pillck" + (l.setupOn ? " on" : "")} style={{ alignSelf: "flex-start" }}>
                <input type="checkbox" checked={l.setupOn} onChange={(e) => setLine(l.id, { setupOn: e.target.checked })} />להוסיף עלות הקמה
              </label>
              {l.setupOn ? <>
                <PriceIn label="הקמה" def={d.setup} orig={l.setup} sale={l.setupSale} set={(o, s) => setLine(l.id, { setup: o, setupSale: s })} />
                <span className="tiny">&quot;0&quot; אחרי הנחה מוצג כ&quot;ללא עלות&quot; ליד המחיר המקורי המחוק.</span>
              </> : null}
            </> : null}
            {d.fee ? <PriceIn label="אחסון ותחזוקה לחודש" def={d.fee} orig={l.fee} sale={l.feeSale} set={(o, s) => setLine(l.id, { fee: o, feeSale: s })} /> : null}
            {l.id === "site" ? (
              <label className="field"><span>דפים נוספים מעבר ל-5, {nis(P.extraPage)} לדף</span>
                <input className="inp sm" type="number" min={0} value={pi.pages || ""} placeholder="0" onChange={(e) => set({ pages: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
              </label>
            ) : null}
            {l.id === "mail" ? (
              <label className="field"><span>חבילת הודעות, חד פעמי ({P.freeMsgs.toLocaleString("he-IL")} בחודש כלולות תמיד)</span>
                <select className="inp sm" value={pi.msgPack} onChange={(e) => set({ msgPack: e.target.value })}>
                  <option value="">בלי חבילה</option>
                  {P.packs.map((x) => <option key={x.id} value={x.id}>{x.n.toLocaleString("he-IL")} הודעות, {nis(x.price)}</option>)}
                </select>
              </label>
            ) : null}
          </div>
        );
      })}

      <div className={"cgroup" + (pi.extras ? " pline" : "")}>
        <b>{pi.extras ? "תוספות" : "תוספות חד פעמיות"}</b>
        {offeredAddons(P, pi.lines.map((l) => l.id), pi.extras).map((x) => {
          const on = pi.addons.includes(x.id);
          const ov = pi.addonPrices[x.id];
          const p = addonPriceOf(x, ov);
          return (
            <div key={x.id} className="addrow">
              <label className="hidrow">
                <input type="checkbox" checked={on} onChange={(e) => set({ addons: e.target.checked ? [...new Set([...pi.addons, x.id])] : pi.addons.filter((a) => a !== x.id) })} />
                <span style={{ flex: 1 }}>{x.label}{pi.extras && x.d ? <span className="tiny" style={{ display: "block" }}>{x.d}</span> : null}</span>
                {p.was != null ? <s className="num tiny">{nis(p.was)}</s> : null}<b className="num">{p.eff === 0 && p.was ? "ללא עלות" : nis(p.eff)}</b>
              </label>
              {on ? <PriceIn label="חד פעמי" def={x.was ?? x.price} orig={ov ? ov.price : null} sale={ov ? ov.sale : x.was != null ? x.price : null}
                set={(o, sl) => set({ addonPrices: { ...pi.addonPrices, [x.id]: { price: o, sale: sl } } })} /> : null}
            </div>
          );
        })}
        <span className="tiny">מסמנים תוספת כדי להכניס אותה לסיכום לתשלום, ואז אפשר לשנות לה מחיר או לתת מחיר מבצע. תוספת שלא סומנה מופיעה בהצעה בטבלת &quot;תוספות אפשריות&quot;.{hasSite || hasMail ? " דפים נוספים וחבילות הודעות נבחרים בכרטיס של המוצר." : ""}</span>
      </div>

      <div className="cgroup">
        <b>באנר מבצע</b>
        <label className={"pillck" + (pi.promo ? " on" : "")} style={{ alignSelf: "flex-start" }}>
          <input type="checkbox" checked={pi.promo} onChange={(e) => set({ promo: e.target.checked })} />להציג באנר מבצע
        </label>
        {pi.promo ? <input className="inp sm" value={pi.promoText} onChange={(e) => set({ promoText: e.target.value })} /> : <span className="tiny">כבוי. ההצעה מוצגת בלי באנר.</span>}
      </div>

    </div>
  );
}
