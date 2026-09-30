"use client";
import { useEffect, useMemo, useState } from "react";
import { sb } from "@/lib/supabase/browser";
import { Top, Panel, Empty } from "@/components/Shell";
import Icon from "@/components/Icon";
import QuoteDoc from "@/components/QuoteDoc";
import { useApp } from "@/components/AppCtx";
import { computeQuote, emptyInput, DEFAULT_PRICING, type Pricing, type Template, type Pair, type QuoteInput } from "@/lib/quote-engine";
import { fmtDate, appUrl, type Row } from "@/lib/crm";

const TABS = ["מחירון ומוצרים", "תבנית ההצעה", "כללי", "אוטומציות"];

export default function Settings() {
  const [tab, setTab] = useState(TABS[0]);
  return (
    <>
      <Top title="הגדרות" />
      <div className="content">
        <div className="tabs">{TABS.map((t) => <button key={t} className={"btn sm" + (tab === t ? " on" : "")} onClick={() => setTab(t)}>{t}</button>)}</div>
        {tab === TABS[0] ? <PricingTab /> : tab === TABS[1] ? <TemplateTab /> : tab === TABS[2] ? <GeneralTab /> : <AutomationTab />}
      </div>
    </>
  );
}

/* ---------------- live preview ---------------- */
function Preview({ P, T, vat }: { P: Pricing; T: Template; vat: number }) {
  const [I, setI] = useState<QuoteInput>(emptyInput({ client: "ישראל ישראלי", biz: "העסק לדוגמה", brief: "תצוגה מקדימה של התבנית עם ההגדרות שעל המסך.", budget: "3000" }));
  const m = useMemo(() => computeQuote(P, I, vat, T), [P, I, vat, T]);
  return (
    <div className="col">
      <div className="panel" style={{ padding: 14 }}>
        <div className="f3">
          <label className="field"><span>מסלול לדוגמה</span>
            <select className="inp sm" value={I.track} onChange={(e) => setI({ ...I, track: e.target.value, items: e.target.value === "custom" ? P.items.slice(0, 2).map((x) => x.id) : [] })}>
              {P.tracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}<option value="custom">הרכבה אישית</option>
            </select>
          </label>
          <label className="field"><span>אתר</span>
            <select className="inp sm" value={I.web} onChange={(e) => setI({ ...I, web: e.target.value })}><option value="">אין</option>{P.web.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}</select>
          </label>
          <label className="field"><span>תוספת</span>
            <select className="inp sm" value={I.addons[0] || ""} onChange={(e) => setI({ ...I, addons: e.target.value ? [e.target.value] : [] })}><option value="">אין</option>{P.addons.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select>
          </label>
        </div>
      </div>
      <div className="preview"><QuoteDoc m={m} T={T} /></div>
    </div>
  );
}

/* ---------------- pricing ---------------- */
const pairsToText = (p: Pair[]) => p.map((x) => x.t + " | " + x.s).join("\n");
const textToPairs = (t: string) => t.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const [a, ...b] = l.split("|"); return { t: a.trim(), s: b.join("|").trim() }; });

function PairsArea({ value, onChange, rows = 5 }: { value: Pair[]; onChange: (p: Pair[]) => void; rows?: number }) {
  const [t, setT] = useState(pairsToText(value));
  useEffect(() => setT(pairsToText(value)), [value]);
  return <textarea className="inp" rows={rows} value={t} onChange={(e) => setT(e.target.value)} onBlur={() => onChange(textToPairs(t))} style={{ fontSize: 13 }} />;
}
function N({ v, on, w = 100 }: { v: number; on: (n: number) => void; w?: number }) {
  return <input className="inp sm" type="number" style={{ width: w }} value={v} onChange={(e) => on(Number(e.target.value) || 0)} />;
}
function S({ v, on, ph }: { v: string; on: (s: string) => void; ph?: string }) {
  return <input className="inp sm" value={v} placeholder={ph} onChange={(e) => on(e.target.value)} />;
}

function PricingTab() {
  const { settings, saveSettings, toast } = useApp();
  const [P, setP] = useState<Pricing>(settings.pricing);
  const dirty = JSON.stringify(P) !== JSON.stringify(settings.pricing);
  const set = <K extends keyof Pricing>(k: K, v: Pricing[K]) => setP((x) => ({ ...x, [k]: v }));
  const setArr = <K extends "tracks" | "features" | "items" | "addons" | "web">(k: K, i: number, patch: Partial<Pricing[K][number]>) =>
    setP((x) => ({ ...x, [k]: (x[k] as Row[]).map((r, n) => (n === i ? { ...r, ...patch } : r)) }));

  return (
    <div className="split" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
      <div className="col">
        <div className="panel bar" style={{ position: "sticky", top: 92, zIndex: 5 }}>
          <button className="btn primary" disabled={!dirty} onClick={async () => { if (await saveSettings({ pricing: P })) toast("המחירון נשמר. הצעות חדשות ישתמשו בו."); }}><Icon n="check" s={16} />שמירת המחירון</button>
          {dirty ? <button className="btn ghost" onClick={() => setP(settings.pricing)}>ביטול שינויים</button> : <span className="tiny">אין שינויים שלא נשמרו</span>}
          <button className="btn ghost" style={{ marginInlineStart: "auto" }} onClick={() => confirm("לטעון מחדש את המחירון מהתבנית המקורית? שינויים שלא נשמרו יימחקו.") && setP(DEFAULT_PRICING)}>שחזור למחירון התבנית</button>
          <span className="tiny" style={{ width: "100%" }}>הצעה שכבר נחתמה נשארת עם המחירים שבהם נחתמה. הצעה פתוחה מתעדכנת בשמירה הבאה שלה.</span>
        </div>

        <Panel icon="pkg" title="מסלולים">
          {P.tracks.map((t, i) => (
            <div className="set-card" key={t.id}>
              <div className="hdr"><S v={t.name} on={(v) => setArr("tracks", i, { name: v })} /></div>
              <div className="f2">
                <label className="field"><span>לחודש, לפני מע&quot;מ</span><N v={t.price} on={(v) => setArr("tracks", i, { price: v })} w={140} /></label>
                <label className="field"><span>עלות הקמה</span><N v={t.setup} on={(v) => setArr("tracks", i, { setup: v })} w={140} /></label>
              </div>
              <label className="field"><span>תיאור קצר</span><S v={t.desc} on={(v) => setArr("tracks", i, { desc: v })} /></label>
            </div>
          ))}
        </Panel>

        <Panel icon="list" title="מה כלול בכל מסלול">
          <span className="tiny">מסמנים באיזה מסלול כל פריט כלול. &quot;לא כלול&quot; מופיע בתחתית הכרטיס; __BUDGET__ מוחלף בתקציב המומלץ.</span>
          {P.features.map((f, i) => (
            <div className="set-card" key={i}>
              <div className="hdr">
                <S v={f.t} on={(v) => setArr("features", i, { t: v })} />
                <button className="btn icon sm ghost" onClick={() => confirm("למחוק את הפריט?") && set("features", P.features.filter((_, n) => n !== i))}><Icon n="trash" s={15} /></button>
              </div>
              <S v={f.d} on={(v) => setArr("features", i, { d: v })} ph="תיאור" />
              <S v={f.x} on={(v) => setArr("features", i, { x: v })} ph="לא כלול (לא חובה)" />
              <div className="pills">
                {P.tracks.map((t) => (
                  <label key={t.id} className={"pillck" + (f.on[t.id] ? " on" : "")}>
                    <input type="checkbox" checked={!!f.on[t.id]} onChange={(e) => setArr("features", i, { on: { ...f.on, [t.id]: e.target.checked } })} />{t.name}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <button className="add" onClick={() => set("features", [...P.features, { t: "פריט חדש", d: "", x: "", on: {} }])}><Icon n="plus" s={15} />פריט חדש</button>
        </Panel>

        <Panel icon="sliders" title="שירותים להרכבה אישית">
          {P.items.map((it, i) => (
            <div className="set-card" key={it.id}>
              <S v={it.label} on={(v) => setArr("items", i, { label: v })} />
              <div className="f2">
                <label className="field"><span>לחודש</span><N v={it.price} on={(v) => setArr("items", i, { price: v })} w={140} /></label>
                <label className="field"><span>הקמה</span><N v={it.setup} on={(v) => setArr("items", i, { setup: v })} w={140} /></label>
              </div>
              <S v={it.d} on={(v) => setArr("items", i, { d: v })} ph="תיאור" />
              <S v={it.x} on={(v) => setArr("items", i, { x: v })} ph="לא כלול (לא חובה)" />
            </div>
          ))}
          <div className="set-card">
            <b>מענה אוטומטי ודיוור יחד (שורה אחת כששניהם נבחרים)</b>
            <div className="f2">
              <label className="field"><span>לחודש</span><N v={P.bundle.price} on={(v) => set("bundle", { ...P.bundle, price: v })} w={140} /></label>
              <label className="field"><span>הקמה</span><N v={P.bundle.setup} on={(v) => set("bundle", { ...P.bundle, setup: v })} w={140} /></label>
            </div>
            <label className="field"><span>הקמת דיוור שניתנת ללא עלות כששניהם יחד</span><N v={P.freeMailSetup} on={(v) => set("freeMailSetup", v)} w={140} /></label>
          </div>
        </Panel>

        <Panel icon="globe" title="אתרים ודפי נחיתה">
          {P.web.map((w, i) => (
            <div className="set-card" key={w.id}>
              <div className="hdr"><S v={w.label} on={(v) => setArr("web", i, { label: v })} /><N v={w.price} on={(v) => setArr("web", i, { price: v })} w={110} /></div>
              <div className="bar">
                {w.monthly.map((m, j) => (
                  <label key={j} className="field" style={{ width: 150 }}><span>{m.label}, לחודש</span>
                    <N v={m.price} on={(v) => setArr("web", i, { monthly: w.monthly.map((x, k) => (k === j ? { ...x, price: v } : x)) })} w={140} /></label>
                ))}
              </div>
              <label className="field"><span>מה כלול, שורה לכל פריט: כותרת | תיאור</span><PairsArea value={w.specs} onChange={(specs) => setArr("web", i, { specs })} rows={6} /></label>
              <S v={w.x} on={(v) => setArr("web", i, { x: v })} ph="לא כלול (לא חובה)" />
            </div>
          ))}
          <div className="f2">
            <label className="field"><span>דומיין, לשנה</span><N v={P.domain} on={(v) => set("domain", v)} w={140} /></label>
            <label className="field"><span>סשן תיקונים נוסף, לשעה</span><N v={P.hour} on={(v) => set("hour", v)} w={140} /></label>
          </div>
        </Panel>

        <Panel icon="plus" title="תוספות חד פעמיות">
          {P.addons.map((a, i) => (
            <div className="set-card" key={a.id}>
              <div className="hdr"><S v={a.label} on={(v) => setArr("addons", i, { label: v })} /><N v={a.price} on={(v) => setArr("addons", i, { price: v })} w={110} /></div>
              <S v={a.what} on={(v) => setArr("addons", i, { what: v })} ph="במשפט: מה זה" />
              <label className="field"><span>מה כלול: כותרת | תיאור</span><PairsArea value={a.specs} onChange={(specs) => setArr("addons", i, { specs })} /></label>
            </div>
          ))}
        </Panel>

        <Panel icon="wa" title="דיוור וואטסאפ">
          <div className="f2">
            <label className="field"><span>הודעות במתנה, חודש ראשון</span><N v={P.msg.free} on={(v) => set("msg", { ...P.msg, free: v })} w={140} /></label>
            <label className="field"><span>מספר דיוור, לחודש</span><N v={P.msg.phone} on={(v) => set("msg", { ...P.msg, phone: v })} w={140} /></label>
          </div>
          {P.msg.packs.map((p, i) => (
            <div className="bar" key={p.id} style={{ marginTop: 8 }}>
              <span className="tiny">חבילה</span><N v={p.n} on={(v) => set("msg", { ...P.msg, packs: P.msg.packs.map((x, k) => (k === i ? { ...x, n: v } : x)) })} />
              <span className="tiny">הודעות ב-</span><N v={p.price} on={(v) => set("msg", { ...P.msg, packs: P.msg.packs.map((x, k) => (k === i ? { ...x, price: v } : x)) })} /><span className="tiny">₪</span>
            </div>
          ))}
        </Panel>

        <Panel icon="clock" title="לוחות זמנים">
          {P.timelines.map((r, i) => (
            <div className="f2" key={r.id} style={{ marginBottom: 6 }}>
              <S v={r.t} on={(v) => set("timelines", P.timelines.map((x, k) => (k === i ? { ...x, t: v } : x)))} />
              <S v={r.s} on={(v) => set("timelines", P.timelines.map((x, k) => (k === i ? { ...x, s: v } : x)))} />
            </div>
          ))}
          <label className="field"><span>אתר: כותרת | זמן</span><PairsArea value={P.webTimelines.site} onChange={(v) => set("webTimelines", { ...P.webTimelines, site: v })} rows={3} /></label>
          <label className="field"><span>דף נחיתה: כותרת | זמן</span><PairsArea value={P.webTimelines.lp} onChange={(v) => set("webTimelines", { ...P.webTimelines, lp: v })} rows={2} /></label>
          <label className="field"><span>שניהם: כותרת | זמן</span><PairsArea value={P.webTimelines.both} onChange={(v) => set("webTimelines", { ...P.webTimelines, both: v })} rows={1} /></label>
        </Panel>

        <Panel icon="star" title="מתנת הצטרפות כשאין עלות הקמה">
          <div className="f2">
            <S v={P.gifts.simple.title} on={(v) => set("gifts", { ...P.gifts, simple: { ...P.gifts.simple, title: v } })} />
            <N v={P.gifts.simple.was} on={(v) => set("gifts", { ...P.gifts, simple: { ...P.gifts.simple, was: v } })} w={140} />
          </div>
          <S v={P.gifts.simple.sub} on={(v) => set("gifts", { ...P.gifts, simple: { ...P.gifts.simple, sub: v } })} />
        </Panel>
      </div>
      <div className="ctlp" style={{ position: "sticky", top: 92, maxHeight: "calc(100vh - 110px)", overflowY: "auto" }}>
        <Preview P={P} T={settings.template} vat={settings.vat} />
      </div>
    </div>
  );
}

/* ---------------- template texts ---------------- */
const TFIELDS: [keyof Template, string, boolean?][] = [
  ["name", "שם העסק בתחתית"], ["owner", "שם בעל העסק"], ["bizId", "מספר עוסק"], ["phone", "טלפון"], ["email", "מייל"], ["cta", "כפתור בתחתית"],
  ["tag", "תגית בראש ההצעה"], ["tracksNote", "הערה מתחת לטבלת המסלולים", true], ["tracksBinding", "שורה מודגשת מתחת לטבלה", true],
  ["customNote", "הערה בהרכבה אישית", true], ["giftNote", "הערה למתנת ההצטרפות", true], ["timelinesNote", "הערה ללוחות הזמנים", true],
  ["vatNote", "הערת מע\"מ"], ["signTitle", "כותרת החתימה"], ["agree", "משפט האישור"], ["signNote", "הערה מתחת לחתימה", true], ["thanks", "הודעה אחרי חתימה", true],
];
function TemplateTab() {
  const { settings, saveSettings, toast } = useApp();
  const [T, setT] = useState<Template>(settings.template);
  const [terms, setTerms] = useState((settings.template.extraTerms || []).join("\n"));
  const dirty = JSON.stringify(T) !== JSON.stringify(settings.template);
  return (
    <div className="split" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
      <div className="col">
        <div className="panel bar">
          <button className="btn primary" disabled={!dirty} onClick={async () => { if (await saveSettings({ template: T })) toast("התבנית נשמרה"); }}><Icon n="check" s={16} />שמירת התבנית</button>
          {dirty ? <button className="btn ghost" onClick={() => { setT(settings.template); setTerms((settings.template.extraTerms || []).join("\n")); }}>ביטול שינויים</button> : null}
        </div>
        <Panel icon="file" title="טקסטים בהצעה">
          <div className="form">
            {TFIELDS.map(([k, l, long]) => (
              <label key={k} className={"field" + (long ? " full" : "")}><span>{l}</span>
                {long ? <textarea className="inp" rows={2} value={String(T[k] ?? "")} onChange={(e) => setT({ ...T, [k]: e.target.value })} />
                  : <input className="inp" value={String(T[k] ?? "")} onChange={(e) => setT({ ...T, [k]: e.target.value })} />}
              </label>
            ))}
            <label className="field full"><span>תנאים נוספים, שורה לכל תנאי</span>
              <textarea className="inp" rows={4} value={terms} onChange={(e) => { setTerms(e.target.value); setT({ ...T, extraTerms: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) as never }); }} />
            </label>
            <label className="pillck full" style={{ justifySelf: "start" }}><input type="checkbox" checked={!!T.showIdno} onChange={(e) => setT({ ...T, showIdno: e.target.checked })} />לבקש ת.ז. או ח.פ. בחתימה</label>
          </div>
        </Panel>
      </div>
      <div className="ctlp" style={{ position: "sticky", top: 92, maxHeight: "calc(100vh - 110px)", overflowY: "auto" }}>
        <Preview P={settings.pricing} T={T} vat={settings.vat} />
      </div>
    </div>
  );
}

/* ---------------- general ---------------- */
function GeneralTab() {
  const { settings, saveSettings, toast } = useApp();
  const [f, setF] = useState({ vat: settings.vat, valid_days: settings.valid_days, wa_template: settings.wa_template, onboarding: settings.onboarding.join("\n") });
  return (
    <div className="grid g2b">
      <Panel icon="sliders" title="כללי">
        <div className="form">
          <label className="field"><span>מע&quot;מ באחוזים</span><input className="inp" type="number" value={f.vat} onChange={(e) => setF({ ...f, vat: Number(e.target.value) })} /></label>
          <label className="field"><span>תוקף הצעה ברירת מחדל, בימים</span><input className="inp" type="number" value={f.valid_days} onChange={(e) => setF({ ...f, valid_days: Number(e.target.value) })} /></label>
          <label className="field full"><span>הודעת וואטסאפ לשליחת הצעה. משתנים: {"{שם}"} {"{מספר}"} {"{קישור}"}</span>
            <textarea className="inp" rows={4} value={f.wa_template} onChange={(e) => setF({ ...f, wa_template: e.target.value })} /></label>
          <label className="field full"><span>רשימת קליטה ללקוח חדש, שורה לכל שלב</span>
            <textarea className="inp" rows={7} value={f.onboarding} onChange={(e) => setF({ ...f, onboarding: e.target.value })} /></label>
          <div className="full"><button className="btn primary" onClick={async () => {
            const ok = await saveSettings({ vat: f.vat, valid_days: f.valid_days, wa_template: f.wa_template, onboarding: f.onboarding.split("\n").map((x) => x.trim()).filter(Boolean) });
            if (ok) toast("נשמר");
          }}>שמירה</button></div>
        </div>
      </Panel>
      <Panel icon="wa" title="איך ההודעה נראית">
        <p className="bubble">{f.wa_template.replace("{שם}", "ישראל").replace("{מספר}", "2026-001").replace("{קישור}", appUrl() + "/q/…")}</p>
      </Panel>
    </div>
  );
}

/* ---------------- automations ---------------- */
function AutomationTab() {
  const { settings, saveSettings, toast } = useApp();
  const [keys, setKeys] = useState<Row[]>([]);
  const [fresh, setFresh] = useState("");
  const [hook, setHook] = useState(settings.n8n_webhook || "");
  const [events, setEvents] = useState<Row[]>([]);
  const load = async () => {
    const [k, e] = await Promise.all([sb().rpc("crm_list_api_keys"), sb().from("crm_events").select("*").order("at", { ascending: false }).limit(15)]);
    setKeys(k.data || []); setEvents(e.data || []);
  };
  useEffect(() => { load(); }, []);
  const base = appUrl();
  return (
    <div className="grid g2">
      <div className="col">
        <Panel icon="send" title="מה-CRM ל-n8n: Webhook">
          <p className="tiny" style={{ marginTop: 0 }}>כל אירוע נשלח לכתובת הזו כ-POST עם {"{event, at, data}"}. אירועים: lead_created, lead_returned, quote_sent, quote_viewed, quote_signed, quote_rejected.</p>
          <div className="bar">
            <input className="inp ltr" style={{ flex: 1 }} placeholder="https://simplesolution.app.n8n.cloud/webhook/..." value={hook} onChange={(e) => setHook(e.target.value)} />
            <button className="btn primary" onClick={async () => {
              if (hook && !hook.startsWith("https://")) return toast("הכתובת צריכה להתחיל ב-https://", true);
              if (await saveSettings({ n8n_webhook: hook || null })) toast("נשמר");
            }}>שמירה</button>
          </div>
        </Panel>
        <Panel icon="key" title="מ-n8n ל-CRM: מפתחות גישה" right={<button className="btn sm primary" onClick={async () => {
          const label = prompt("שם למפתח (למשל: n8n טופס אתר)");
          if (label === null) return;
          const { data, error } = await sb().rpc("crm_create_api_key", { p_label: label });
          if (error) return toast(error.message, true);
          setFresh(data as string); load();
        }}><Icon n="plus" s={15} />מפתח חדש</button>}>
          {fresh ? (
            <div className="keybox">
              <b>המפתח מוצג פעם אחת בלבד. מעתיקים עכשיו ל-n8n.</b>
              <div className="code">{fresh}</div>
              <div className="bar"><button className="btn sm" onClick={() => { navigator.clipboard.writeText(fresh); toast("הועתק"); }}><Icon n="copy" s={14} />העתקה</button><button className="btn sm ghost" onClick={() => setFresh("")}>סגירה</button></div>
            </div>
          ) : null}
          {!keys.length ? <Empty>אין מפתחות</Empty> : keys.map((k) => (
            <div className="lrow" key={k.id}>
              <span className="grow"><b>{k.label}</b><span className="meta">נוצר {fmtDate(k.created_at)}{k.revoked_at ? " · בוטל " + fmtDate(k.revoked_at) : ""}</span></span>
              {!k.revoked_at ? <button className="btn sm danger" onClick={async () => { if (!confirm("לבטל את המפתח? מה שמשתמש בו יפסיק לעבוד.")) return; await sb().rpc("crm_revoke_api_key", { p_id: k.id }); load(); }}>ביטול</button> : null}
            </div>
          ))}
        </Panel>
        <Panel icon="layout" title="כתובות לשימוש ב-n8n">
          <p className="tiny" style={{ marginTop: 0 }}>ליד חדש (POST, JSON או טופס). כותרת: x-api-key</p>
          <div className="code">{`POST ${base}/api/n8n/lead
x-api-key: sscrm_...
{"name":"","phone":"","email":"","biz":"","industry":"","source":"אתר ישיר","campaign":"","landing_page":"","message":"","consent":true}`}</div>
          <p className="tiny">סיכום יומי (GET): לידים חדשים, צעדים להיום, משימות, הצעות פתוחות, תשלומים באיחור</p>
          <div className="code">{`GET ${base}/api/n8n/digest
x-api-key: sscrm_...`}</div>
          <p className="tiny">חיובים חודשיים נפתחים לבד כל יום 1 לחודש, לפי השירותים החודשיים הפעילים של כל לקוח.</p>
        </Panel>
      </div>
      <Panel icon="pulse" title="אירועים אחרונים">
        {!events.length ? <Empty>עוד אין אירועים</Empty> : events.map((e) => (
          <div className="lrow" key={e.id}><span className="grow"><b className="mono" style={{ fontSize: 12 }}>{e.type}</b><span className="meta">{e.payload?.name || e.payload?.no || ""}</span></span><span className="meta">{fmtDate(e.at)}</span></div>
        ))}
      </Panel>
    </div>
  );
}
