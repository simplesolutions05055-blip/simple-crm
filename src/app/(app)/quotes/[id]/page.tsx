"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { sb } from "@/lib/supabase/browser";
import { Top, St } from "@/components/Shell";
import Icon from "@/components/Icon";
import QuoteDoc from "@/components/QuoteDoc";
import { useApp } from "@/components/AppCtx";
import { computeQuote, normalizeInput, toggleableCards, withPricing, withTemplate, nis, type QuoteInput, type Pricing, type ExtraLine } from "@/lib/quote-engine";
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
      setI(inp);
      if (data.status === "נחתמה") {
        const { data: s } = await sb().from("crm_signatures").select("name,biz,signed_at,signature_png,doc_hash,ip").eq("quote_id", id).single();
        setSig(s);
      }
    })();
  }, [id, settings.valid_days]);

  const signed = q?.status === "נחתמה";
  // a signed quote always shows exactly what was signed
  const P: Pricing = useMemo(() => (signed && q?.pricing ? withPricing(q.pricing) : settings.pricing), [signed, q, settings.pricing]);
  const T = useMemo(() => (signed && q?.template ? withTemplate(q.template) : settings.template), [signed, q, settings.template]);
  const vat = signed && q?.vat != null ? Number(q.vat) : settings.vat;
  const model = useMemo(() => (I ? computeQuote(P, I, vat, T) : null), [P, I, vat, T]);

  const persist = useCallback(async (inp: QuoteInput, extra?: Row) => {
    if (!q || signed) return false;
    setSaved("saving");
    const m = computeQuote(settings.pricing, inp, settings.vat, settings.template);
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
    if (signed || !I) return;
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
    const { data, error } = await sb().from("crm_quotes").insert({ org_id: org, lead_id: q.lead_id, client_id: q.client_id, input: { ...I, date: new Date().toISOString().slice(0, 10) }, totals: q.totals }).select("id").single();
    if (error) return toast(error.message, true);
    router.push("/quotes/" + data.id);
  }

  if (!q || !I || !model) return <><Top title="הצעת מחיר" crumb={{ href: "/quotes", label: "הצעות מחיר" }} /><div className="loading" style={{ minHeight: 200 }}>טוען…</div></>;
  const link = appUrl() + "/q/" + q.token;
  const hasMail = I.track === "custom" ? I.items.includes("mail") : I.track === "more" || I.track === "max";

  return (
    <>
      <Top title={"הצעה " + q.no + (who ? " · " + (who.biz || who.name) : "")} crumb={{ href: "/quotes", label: "הצעות מחיר" }}
        sub={<><St cls={QUOTE_STATUS_CLS[q.status]}>{q.status}</St> {q.sent_at ? " · נשלחה " + fmtDateTime(q.sent_at) : ""}{q.views ? " · " + q.views + " צפיות" : ""}{!signed ? " · " + (saved === "saved" ? "נשמר" : saved === "saving" ? "שומר…" : "יש שינויים") : ""}</>}
        right={<div className="bar">
          {q.lead_id ? <Link className="btn sm" href={"/leads/" + q.lead_id}><Icon n="target" s={15} />ליד</Link> : null}
          {q.client_id ? <Link className="btn sm" href={"/clients/" + q.client_id}><Icon n="brief" s={15} />לקוח</Link> : null}
        </div>} />
      <div className="content">
        <div className="bar">
          {!signed && settings.wa?.phone_number_id && settings.wa?.quote_template ? <button className="btn wa" onClick={() => send(true)}><Icon n="send" s={16} />{q.sent_at ? "שליחה שוב, אוטומטית" : "שליחה אוטומטית בוואטסאפ"}</button> : null}
          {!signed ? <button className={"btn" + (settings.wa?.phone_number_id ? "" : " wa")} onClick={() => send()}><Icon n="wa" s={16} />{q.sent_at ? "שליחה שוב בוואטסאפ" : "שליחה בוואטסאפ"}</button> : null}
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
        <div className="split">
          {!signed ? <Controls I={I} P={P} upd={upd} hasMail={hasMail} vat={vat} T={T} /> : <div />}
          <div className="preview">
            <QuoteDoc m={model} T={T} signed={sig ? { name: sig.name, biz: sig.biz, signed_at: sig.signed_at, png: sig.signature_png, doc_hash: sig.doc_hash } : null} />
          </div>
        </div>
      </div>
    </>
  );
}

function Pill({ on, label, onChange }: { on: boolean; label: React.ReactNode; onChange: (v: boolean) => void }) {
  return <label className={"pillck" + (on ? " on" : "")}><input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />{label}</label>;
}

function Controls({ I, P, upd, hasMail, vat, T }: { I: QuoteInput; P: Pricing; upd: (p: Partial<QuoteInput>) => void; hasMail: boolean; vat: number; T: ReturnType<typeof withTemplate> }) {
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
      <div className="cgroup">
        <b>פרטי ההצעה</b>
        <div className="f2">
          <label className="field"><span>שם הלקוח</span><input className="inp sm" value={I.client} onChange={(e) => upd({ client: e.target.value })} /></label>
          <label className="field"><span>שם העסק</span><input className="inp sm" value={I.biz} onChange={(e) => upd({ biz: e.target.value })} /></label>
          <label className="field"><span>תאריך</span><input className="inp sm" type="date" value={I.date} onChange={(e) => upd({ date: e.target.value })} /></label>
          <label className="field"><span>תוקף, בימים</span><input className="inp sm" type="number" min={1} value={I.validDays} onChange={(e) => upd({ validDays: Math.max(1, Number(e.target.value) || 14) })} /></label>
          <label className="field"><span>תקציב פרסום מומלץ, לחודש</span><input className="inp sm" type="number" value={I.budget} onChange={(e) => upd({ budget: e.target.value })} /></label>
          <label className="field"><span>המסלול</span>
            <select className="inp sm" value={I.track} onChange={(e) => upd({ track: e.target.value })}>
              {P.tracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              <option value="custom">הרכבה אישית</option>
            </select>
          </label>
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
