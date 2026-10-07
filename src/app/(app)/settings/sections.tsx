"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { sb } from "@/lib/supabase/browser";
import { Top, Panel, Empty } from "@/components/Shell";
import Icon from "@/components/Icon";
import QuoteDoc from "@/components/QuoteDoc";
import { useApp } from "@/components/AppCtx";
import { computeQuote, emptyInput, DEFAULT_PRICING, type Pricing, type Template, type Pair, type QuoteInput } from "@/lib/quote-engine";
import { fmtDate, appUrl, accessMessage, ACCESS_MSG_DEFAULT, waTemplates, type Row } from "@/lib/crm";

/* settings sub-pages: the sidebar shows them under "הגדרות" */
export const SETTINGS_NAV = [
  { slug: "business", label: "פרטי העסק", icon: "brief", sub: "הפרטים שמופיעים בהצעות, מע\"מ, תוקף, והמזהים שלך כשותף" },
  { slug: "quotes", label: "תבניות הצעת מחיר", icon: "file", sub: "המחירון, הטקסטים בהצעה, והודעת השליחה ללקוח" },
  { slug: "connections", label: "חיבורים וקשר", icon: "link", sub: "הוואטסאפ שממנו נשלחות הודעות, המייל שממנו נשלחים מיילים, והסיסמה שלך" },
  { slug: "automations", label: "אוטומציות", icon: "send", sub: "החיבור ל-n8n: מפתחות, כתובות ואירועים" },
] as const;

function SubTabs({ tabs, tab, setTab }: { tabs: string[]; tab: string; setTab: (t: string) => void }) {
  useEffect(() => {
    const want = new URLSearchParams(location.search).get("tab");
    if (want && tabs.includes(want)) setTab(want);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div className="tabs">{tabs.map((t) => <button key={t} className={"btn" + (tab === t ? " on" : "")} onClick={() => setTab(t)}>{t}</button>)}</div>;
}

export function SettingsSection({ slug }: { slug: string }) {
  const meta = SETTINGS_NAV.find((s) => s.slug === slug) || SETTINGS_NAV[0];
  return (
    <>
      <Top title={meta.label} sub={meta.sub} crumb={{ href: "/settings", label: "הגדרות" }} />
      <div className="content roomy">
        <div className="tabs only-m">
          {SETTINGS_NAV.map((s) => <Link key={s.slug} href={"/settings/" + s.slug} className={"btn sm" + (s.slug === meta.slug ? " on" : "")}>{s.label}</Link>)}
        </div>
        {meta.slug === "business" ? <BusinessSection /> : meta.slug === "quotes" ? <QuotesSection /> : meta.slug === "connections" ? <ConnectionsSection /> : <AutomationTab />}
      </div>
    </>
  );
}

/* ---------------- business details ---------------- */
const BIZ_FIELDS: [keyof Template, string, boolean?][] = [
  ["name", "שם העסק"], ["owner", "שם בעל העסק"], ["bizId", "מספר עוסק", true], ["phone", "טלפון", true], ["email", "מייל", true],
];
function BusinessSection() {
  const { settings, saveSettings, toast } = useApp();
  const [T, setT] = useState<Template>(settings.template);
  const [vat, setVat] = useState(settings.vat);
  const [days, setDays] = useState(settings.valid_days);
  const dirty = JSON.stringify(T) !== JSON.stringify(settings.template) || vat !== settings.vat || days !== settings.valid_days;
  return (
    <div className="col narrow">
      <Panel icon="brief" title="פרטי העסק">
        <p className="tiny lead">הפרטים האלה מופיעים בתחתית כל הצעת מחיר שנשלחת ללקוח.</p>
        <div className="form">
          {BIZ_FIELDS.map(([k, l, ltr]) => (
            <label key={k} className="field"><span>{l}</span>
              <input className={"inp" + (ltr ? " ltr" : "")} value={String(T[k] ?? "")} onChange={(e) => setT({ ...T, [k]: e.target.value })} /></label>
          ))}
          <label className="field"><span>מע&quot;מ באחוזים</span><input className="inp" type="number" value={vat} onChange={(e) => setVat(Number(e.target.value))} /></label>
          <label className="field"><span>תוקף הצעה, בימים</span><input className="inp" type="number" value={days} onChange={(e) => setDays(Number(e.target.value))} /></label>
          <div className="full bar">
            <button className="btn primary" disabled={!dirty} onClick={async () => { if (await saveSettings({ template: T, vat, valid_days: days })) toast("פרטי העסק נשמרו"); }}><Icon n="check" s={16} />שמירה</button>
            {dirty ? <button className="btn ghost" onClick={() => { setT(settings.template); setVat(settings.vat); setDays(settings.valid_days); }}>ביטול שינויים</button> : null}
          </div>
        </div>
      </Panel>
      <AgencyTab />
    </div>
  );
}

/* ---------------- quote templates ---------------- */
const QTABS = ["מחירון ומוצרים", "טקסטים בהצעה", "שליחה ללקוח וקליטה"];
function QuotesSection() {
  const [tab, setTab] = useState(QTABS[0]);
  return (
    <>
      <SubTabs tabs={QTABS} tab={tab} setTab={setTab} />
      {tab === QTABS[0] ? <PricingTab /> : tab === QTABS[1] ? <TemplateTab /> : <GeneralTab />}
    </>
  );
}

/* ---------------- connections ---------------- */
const CTABS = ["וואטסאפ", "יומן גוגל", "מייל", "סיסמה וכניסה"];
function ConnectionsSection() {
  const [tab, setTab] = useState(CTABS[0]);
  return (
    <>
      <SubTabs tabs={CTABS} tab={tab} setTab={setTab} />
      {tab === CTABS[0] ? <WhatsAppTab /> : tab === CTABS[1] ? <GcalTab /> : tab === CTABS[2] ? <EmailTab /> : <LoginTab />}
    </>
  );
}

const GCAL_MSG: Record<string, [string, boolean]> = {
  ok: ["היומן חובר בהצלחה", false],
  denied: ["החיבור בוטל בחלון של גוגל", true],
  state: ["החיבור פג תוקף. מנסים שוב", true],
  token: ["גוגל לא החזיר הרשאה קבועה. מנסים שוב", true],
  save: ["לא הצלחתי לשמור את החיבור", true],
  missing: ["חסרים פרטי החיבור של גוגל בשרת. ראה את השלבים למטה", true],
};
function GcalTab() {
  const { settings, toast } = useApp();
  const g = settings.gcal || {};
  const [msg, setMsg] = useState<[string, boolean] | null>(null);
  useEffect(() => { const k = new URLSearchParams(location.search).get("gcal"); if (k && GCAL_MSG[k]) setMsg(GCAL_MSG[k]); }, []);
  return (
    <div className="grid g2b">
      <div className="col">
        <Panel icon="cal" title="יומן גוגל">
          {msg ? <p className="tiny lead" style={{ color: msg[1] ? "var(--bad)" : "var(--ok)", fontWeight: 600 }}>{msg[0]}</p> : null}
          {g.email ? (
            <>
              <div className="set-card">
                <b>מחובר</b>
                <div className="code">{g.email}</div>
                <span className="tiny">מחובר מאז {fmtDate(g.connected_at)}. היומן הראשי בחשבון.</span>
              </div>
              <div className="bar" style={{ marginTop: 14 }}>
                <a className="btn" href="/calendar"><Icon n="cal" s={15} />למסך היומן</a>
                <button className="btn ghost danger" onClick={async () => {
                  if (!confirm("לנתק את יומן גוגל? משימות שכבר נכנסו ליומן יישארו שם.")) return;
                  const { error } = await sb().rpc("crm_gcal_disconnect");
                  if (error) return toast(error.message, true);
                  location.href = "/settings/connections?tab=" + encodeURIComponent("יומן גוגל");
                }}>ניתוק</button>
              </div>
            </>
          ) : (
            <>
              <p className="tiny lead">אחרי החיבור: הפגישות מהיומן מופיעות במסך היומן, ומשימות שאישרת עם שעה נכנסות ליומן הגוגל שלך.</p>
              <a className="btn primary" href="/api/gcal/connect"><Icon n="link" s={15} />חיבור יומן גוגל</a>
            </>
          )}
        </Panel>
      </div>
      <Panel icon="list" title="מה עובר בין המערכות">
        <div className="set-card"><b>מגוגל ל-CRM</b><span className="tiny">כל האירועים ביומן הראשי, מוצגים במסך היומן. לא נשמרים ב-CRM.</span></div>
        <div className="set-card"><b>מה-CRM לגוגל</b><span className="tiny">משימות שאישרת או יצרת עם הסימון &quot;להציג ביומן גוגל&quot;. שינוי שעה או תאריך במשימה מעדכן את האירוע, וסימון &quot;בוצע&quot; מוריד אותו מהיומן.</span></div>
        <div className="set-card"><b>הרשאה</b><span className="tiny">גישה לאירועים ביומן בלבד. בלי מייל, בלי קבצים.</span></div>
      </Panel>
    </div>
  );
}

function EmailTab() {
  const { email, toast } = useApp();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState("");
  return (
    <div className="grid g2b">
      <div className="col">
        <Panel icon="mail" title="מיילים שהמערכת שולחת">
          <div className="set-card">
            <b>מיילי כניסה ואיפוס סיסמה</b>
            <span className="tiny">נשלחים מתיבת הג&apos;ימייל של העסק, דרך חיבור עם סיסמת אפליקציה.</span>
            <div className="code">{email || "simple.solutions05055@gmail.com"}</div>
          </div>
          <div className="set-card">
            <b>התראות אליך</b>
            <span className="tiny">ליד שחזר, הצעה שנצפתה, נחתמה או נדחתה, הודעת וואטסאפ נכנסת. נשלחות מ-n8n מאותו ג&apos;ימייל, אל המייל שלך.</span>
          </div>
          <div className="set-card">
            <b>דופק יומי</b>
            <span className="tiny">סיכום כל בוקר: לידים חדשים מהיממה ולידים שממתינים לטיפול.</span>
          </div>
        </Panel>
      </div>
      <div className="col">
        <Panel icon="send" title="בדיקה שהמייל עובד">
          <p className="tiny lead">שולח אליך מייל כניסה אמיתי. אם הוא מגיע, החיבור תקין. אם מופיעה שגיאה, סיסמת האפליקציה בג&apos;ימייל לא נכונה וצריך ליצור חדשה.</p>
          <button className="btn primary" disabled={busy || !email} onClick={async () => {
            setBusy(true); setSent("");
            const { error } = await sb().auth.signInWithOtp({ email: email!, options: { shouldCreateUser: false, emailRedirectTo: location.origin + "/auth/callback" } });
            setBusy(false);
            if (error) {
              if (/rate|security purposes|seconds/i.test(error.message)) return toast("נשלח מייל לפני רגע. מחכים דקה ומנסים שוב.", true);
              setSent("bad"); return toast("השליחה נכשלה: " + error.message, true);
            }
            setSent("ok");
          }}><Icon n="send" s={15} />{busy ? "שולח…" : "שליחת מייל בדיקה"}</button>
          {sent === "ok" ? <p className="tiny" style={{ color: "var(--ok)" }}>נשלח. בודקים בתיבה (גם בספאם).</p> : null}
          {sent === "bad" ? <p className="tiny" style={{ color: "var(--bad)" }}>השליחה לא עובדת. בדף ההוראות יש את השלבים לתיקון החיבור.</p> : null}
        </Panel>
        <Panel icon="alert" title="החלפת כתובת השולח">
          <p className="tiny" style={{ margin: 0 }}>כתובת השולח מוגדרת בחיבורי המערכת ולא מהמסך הזה, כי היא דורשת סיסמת אפליקציה חדשה מהתיבה החדשה. אם תרצה לעבור לכתובת אחרת, זה שינוי שעושים יחד.</p>
        </Panel>
      </div>
    </div>
  );
}

function LoginTab() {
  const { email, toast } = useApp();
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid g2b">
      <div className="col">
        <Panel icon="lock" title="למה אי אפשר להציג את הסיסמה">
          <p className="tiny" style={{ margin: 0 }}>הסיסמה נשמרת מוצפנת בצורה חד כיוונית. אף אחד לא יכול לקרוא אותה, גם לא המערכת עצמה. מה שאפשר: להחליף אותה כאן (עם כפתור עין כדי לראות מה מקלידים), או לשלוח קישור איפוס למייל.</p>
        </Panel>
        <Panel icon="mail" title="איפוס דרך המייל">
          <p className="tiny lead">שולח קישור למייל שלך. לחיצה עליו מחזירה אותך למסך הזה, ושם בוחרים סיסמה חדשה.</p>
          <div className="code">{email}</div>
          <button className="btn" style={{ marginTop: 12 }} disabled={busy || !email} onClick={async () => {
            setBusy(true);
            try { localStorage.setItem("sscrm_next", "/settings/connections?tab=" + encodeURIComponent("סיסמה וכניסה")); } catch { /* */ }
            const { error } = await sb().auth.resetPasswordForEmail(email!, { redirectTo: location.origin + "/auth/callback" });
            setBusy(false);
            if (error) return toast(/rate|security purposes|seconds/i.test(error.message) ? "נשלח מייל לפני רגע. מחכים דקה ומנסים שוב." : "השליחה נכשלה: " + error.message, true);
            toast("נשלח קישור איפוס למייל");
          }}><Icon n="send" s={15} />{busy ? "שולח…" : "שליחת קישור איפוס"}</button>
        </Panel>
      </div>
      <PasswordPanel />
    </div>
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
    <div className="split" style={{ gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1fr)" }}>
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
const TGROUPS: [string, string, [keyof Template, string, boolean?][]][] = [
  ["tag", "ראש ותחתית ההצעה", [["tag", "תגית בראש ההצעה"], ["cta", "כפתור בתחתית"], ["vatNote", "הערת מע\"מ"]]],
  ["pkg", "מסלולים והרכבה", [["tracksNote", "הערה מתחת לטבלת המסלולים", true], ["tracksBinding", "שורה מודגשת מתחת לטבלה", true], ["customNote", "הערה בהרכבה אישית", true]]],
  ["star", "מתנה ולוחות זמנים", [["giftNote", "הערה למתנת ההצטרפות", true], ["timelinesNote", "הערה ללוחות הזמנים", true]]],
  ["pen", "חתימה", [["signTitle", "כותרת החתימה"], ["agree", "משפט האישור", true], ["signNote", "הערה מתחת לחתימה", true], ["thanks", "הודעה אחרי חתימה", true]]],
];
function TemplateTab() {
  const { settings, saveSettings, toast } = useApp();
  const [T, setT] = useState<Template>(settings.template);
  const [terms, setTerms] = useState((settings.template.extraTerms || []).join("\n"));
  const dirty = JSON.stringify(T) !== JSON.stringify(settings.template);
  return (
    <div className="split" style={{ gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1fr)" }}>
      <div className="col">
        <div className="panel bar">
          <button className="btn primary" disabled={!dirty} onClick={async () => { if (await saveSettings({ template: T })) toast("התבנית נשמרה"); }}><Icon n="check" s={16} />שמירת התבנית</button>
          {dirty ? <button className="btn ghost" onClick={() => { setT(settings.template); setTerms((settings.template.extraTerms || []).join("\n")); }}>ביטול שינויים</button> : null}
        </div>
        {TGROUPS.map(([icon, title, fields]) => (
          <Panel key={title} icon={icon} title={title}>
            <div className="form one">
              {fields.map(([k, l, long]) => (
                <label key={k} className="field"><span>{l}</span>
                  {long ? <textarea className="inp" rows={3} value={String(T[k] ?? "")} onChange={(e) => setT({ ...T, [k]: e.target.value })} />
                    : <input className="inp" value={String(T[k] ?? "")} onChange={(e) => setT({ ...T, [k]: e.target.value })} />}
                </label>
              ))}
            </div>
          </Panel>
        ))}
        <Panel icon="list" title="תנאים">
          <div className="form one">
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
  const [f, setF] = useState({ wa_template: settings.wa_template, onboarding: settings.onboarding.join("\n") });
  return (
    <div className="grid g2b">
      <Panel icon="send" title="שליחה ללקוח וקליטה">
        <div className="form one">
          <label className="field full"><span>הודעת וואטסאפ לשליחת הצעה. משתנים: {"{שם}"} {"{מספר}"} {"{קישור}"}</span>
            <textarea className="inp" rows={4} value={f.wa_template} onChange={(e) => setF({ ...f, wa_template: e.target.value })} /></label>
          <label className="field full"><span>רשימת קליטה ללקוח חדש, שורה לכל שלב</span>
            <textarea className="inp" rows={7} value={f.onboarding} onChange={(e) => setF({ ...f, onboarding: e.target.value })} /></label>
          <div className="full"><button className="btn primary" onClick={async () => {
            const ok = await saveSettings({ wa_template: f.wa_template, onboarding: f.onboarding.split("\n").map((x) => x.trim()).filter(Boolean) });
            if (ok) toast("נשמר");
          }}>שמירה</button></div>
        </div>
      </Panel>
      <div className="col">
        <Panel icon="wa" title="איך ההודעה נראית">
          <p className="bubble">{f.wa_template.replace("{שם}", "ישראל").replace("{מספר}", "2026-001").replace("{קישור}", appUrl() + "/q/…")}</p>
        </Panel>
      </div>
    </div>
  );
}

function PasswordPanel() {
  const { toast } = useApp();
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const type = show ? "text" : "password";
  return (
    <Panel icon="lock" title="החלפת סיסמה" right={<button type="button" className="btn sm ghost" onClick={() => setShow(!show)}><Icon n={show ? "eyeoff" : "eye"} s={15} />{show ? "הסתרה" : "הצגת מה שמוקלד"}</button>}>
      <p className="tiny lead">עם סיסמה נכנסים מכל מכשיר בלי לחכות למייל. לפחות 8 תווים.</p>
      <form className="form" onSubmit={async (e) => {
        e.preventDefault();
        if (p1.length < 8) return toast("הסיסמה צריכה לפחות 8 תווים", true);
        if (p1 !== p2) return toast("הסיסמאות לא זהות", true);
        setBusy(true);
        const { error } = await sb().auth.updateUser({ password: p1 });
        setBusy(false);
        if (error) return toast("לא נשמר: " + error.message, true);
        setP1(""); setP2(""); toast("הסיסמה נשמרה");
      }}>
        <label className="field"><span>סיסמה חדשה</span><input className="inp ltr" type={type} autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} /></label>
        <label className="field"><span>שוב, לאימות</span><input className="inp ltr" type={type} autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} /></label>
        <div className="full"><button className="btn primary" disabled={busy}>שמירת סיסמה</button></div>
      </form>
    </Panel>
  );
}

/* ---------------- automations ---------------- */
function AutomationTab() {
  const { settings, saveSettings, toast, biz, orgs } = useApp();
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
          <p className="tiny" style={{ marginTop: 0 }}>כל אירוע נשלח לכתובת הזו כ-POST עם {"{event, at, data}"}. אירועים: lead_created, lead_returned, quote_sent, quote_viewed, quote_signed, quote_rejected, wa_inbound.</p>
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
          {orgs.length > 1 ? <p className="tiny" style={{ marginTop: 0 }}>המפתחות כאן שייכים ל-<b>{biz.brand.short || biz.name}</b> בלבד. ליד שנשלח עם מפתח של {biz.brand.short || biz.name} נכנס רק לכאן.</p> : null}
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

/* ---------------- WhatsApp (official API) ---------------- */
const WA_TPL_DEFAULT = "lead_welcome | he | 1 | פתיחה לליד חדש\nquote_link | he | 2 | שליחת הצעת מחיר";
function WhatsAppTab() {
  const { settings, saveSettings, toast } = useApp();
  const w = settings.wa || {};
  const [f, setF] = useState({
    display_phone: w.display_phone || "", phone_number_id: w.phone_number_id || "", waba_id: w.waba_id || "", api_version: w.api_version || "v23.0",
    verify_token: w.verify_token || "", templates: w.templates || WA_TPL_DEFAULT,
    welcome_template: w.welcome_template || "lead_welcome", welcome_lang: w.welcome_lang || "he",
    quote_template: w.quote_template || "quote_link", auto_welcome: !!w.auto_welcome,
  });
  const [st, setSt] = useState<{ has_token?: boolean; has_app_secret?: boolean }>({});
  const [token, setToken] = useState("");
  const [secret, setSecret] = useState("");
  const [testPhone, setTestPhone] = useState("");
  const [log, setLog] = useState<Row[]>([]);
  const loadSt = async () => {
    const [a, b] = await Promise.all([sb().rpc("crm_wa_status"), sb().from("crm_wa_messages").select("*").order("at", { ascending: false }).limit(12)]);
    setSt((a.data as Row) || {}); setLog(b.data || []);
  };
  useEffect(() => { loadSt(); }, []);
  const hook = appUrl() + "/api/wa/webhook";
  const tpls = waTemplates({ templates: f.templates });

  async function saveAll() {
    const vt = f.verify_token || ("ss_" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2));
    const next = { ...f, verify_token: vt, phone_number_id: f.phone_number_id.trim(), waba_id: f.waba_id.trim() };
    if (!(await saveSettings({ wa: next }))) return;
    setF(next);
    for (const [kind, v] of [["token", token], ["app_secret", secret]] as const) {
      if (!v.trim()) continue;
      const { error } = await sb().rpc("crm_wa_set_secret", { p_kind: kind, p_value: v.trim() });
      if (error) return toast("לא נשמר: " + error.message, true);
    }
    setToken(""); setSecret(""); loadSt(); toast("נשמר");
  }

  return (
    <div className="grid g2">
      <div className="col">
        <Panel icon="phone" title="המספר שממנו נשלחות ההודעות">
          <p className="tiny lead">המספר שהלקוחות רואים כשמגיעה מהם הודעה. המספר עצמו נקבע בחשבון הוואטסאפ העסקי במטא, לפי מזהה מספר הטלפון שלמטה. כאן רושמים אותו לתצוגה.</p>
          <div className="bar">
            <input className="inp ltr" style={{ flex: 1 }} placeholder="05X-XXXXXXX" value={f.display_phone} onChange={(e) => setF({ ...f, display_phone: e.target.value })} />
            <button className="btn primary" onClick={saveAll}>שמירה</button>
          </div>
          <p className="tiny" style={{ marginBottom: 0 }}>{f.phone_number_id ? "מחובר: יש מזהה מספר טלפון." : "עוד לא מחובר: חסר מזהה מספר טלפון."} {st.has_token ? "הטוקן שמור." : "הטוקן עוד לא נשמר."}</p>
        </Panel>
        <Panel icon="wa" title="חיבור לממשק הרשמי של מטא">
          <div className="form">
            <label className="field"><span>מזהה מספר הטלפון</span><input className="inp ltr" value={f.phone_number_id} onChange={(e) => setF({ ...f, phone_number_id: e.target.value })} /></label>
            <label className="field"><span>מזהה חשבון הוואטסאפ העסקי</span><input className="inp ltr" value={f.waba_id} onChange={(e) => setF({ ...f, waba_id: e.target.value })} /></label>
            <label className="field full"><span>טוקן גישה קבוע {st.has_token ? "(שמור. מזינים רק כדי להחליף)" : "(עוד לא נשמר)"}</span>
              <input className="inp ltr" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} /></label>
            <label className="field full"><span>סוד האפליקציה {st.has_app_secret ? "(שמור. מזינים רק כדי להחליף)" : "(עוד לא נשמר)"}</span>
              <input className="inp ltr" type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} /></label>
            <label className="field"><span>גרסת הממשק</span><input className="inp ltr" value={f.api_version} onChange={(e) => setF({ ...f, api_version: e.target.value })} /></label>
            <div className="full"><button className="btn primary" onClick={saveAll}><Icon n="check" s={16} />שמירה</button></div>
          </div>
          <p className="tiny">הטוקן והסוד נשמרים מוצפנים ולא מוצגים שוב, גם לא כאן.</p>
        </Panel>
        <Panel icon="link" title="כתובת לקבלת הודעות (Webhook)">
          <p className="tiny" style={{ marginTop: 0 }}>מדביקים את שתי השורות האלה בהגדרות ה-Webhook של האפליקציה במטא, ונרשמים לשדה messages.</p>
          <div className="code">{hook}</div>
          <div className="code" style={{ marginTop: 6 }}>{f.verify_token || "יופיע אחרי השמירה הראשונה"}</div>
        </Panel>
        <Panel icon="list" title="תבניות">
          <p className="tiny" style={{ marginTop: 0 }}>שורה לכל תבנית מאושרת: שם | שפה | כמה משתנים | כינוי. השם בדיוק כמו במטא.</p>
          <textarea className="inp ltr" rows={4} value={f.templates} onChange={(e) => setF({ ...f, templates: e.target.value })} />
          <div className="form" style={{ marginTop: 10 }}>
            <label className="field"><span>תבנית פתיחה לליד חדש</span>
              <select className="inp" value={f.welcome_template} onChange={(e) => setF({ ...f, welcome_template: e.target.value, welcome_lang: tpls.find((t) => t.name === e.target.value)?.lang || "he" })}>
                <option value="">ללא</option>{tpls.map((t) => <option key={t.name} value={t.name}>{t.label}</option>)}</select></label>
            <label className="field"><span>תבנית לשליחת הצעת מחיר</span>
              <select className="inp" value={f.quote_template} onChange={(e) => setF({ ...f, quote_template: e.target.value })}>
                <option value="">ללא</option>{tpls.map((t) => <option key={t.name} value={t.name}>{t.label}</option>)}</select></label>
            <label className={"pillck full" + (f.auto_welcome ? " on" : "")} style={{ justifySelf: "start" }}>
              <input type="checkbox" checked={f.auto_welcome} onChange={(e) => setF({ ...f, auto_welcome: e.target.checked })} />
              לשלוח אוטומטית את תבנית הפתיחה לכל ליד חדש מהאתר (לא לפניות שסומנו כחשודות)</label>
            <div className="full"><button className="btn primary" onClick={saveAll}>שמירה</button></div>
          </div>
        </Panel>
      </div>
      <div className="col">
        <Panel icon="send" title="בדיקת שליחה">
          <p className="tiny" style={{ marginTop: 0 }}>שולח את התבנית hello_world (קיימת בכל חשבון חדש) למספר שתזין. מתאים לבדיקה ראשונה.</p>
          <div className="bar">
            <input className="inp ltr" style={{ flex: 1 }} placeholder="05X-XXXXXXX" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} />
            <button className="btn primary" onClick={async () => {
              const { error } = await sb().rpc("crm_wa_send", { p_phone: testPhone, p_template: "hello_world", p_lang: "en_US", p_params: [], p_text: null, p_lead: null, p_client: null });
              if (error) return toast("לא נשלח: " + error.message, true);
              toast("נשלח. התוצאה תופיע למטה תוך דקה."); setTimeout(loadSt, 65000);
            }}>שליחה</button>
          </div>
        </Panel>
        <Panel icon="pulse" title="הודעות אחרונות" right={<button className="btn icon sm ghost" onClick={loadSt}><Icon n="reset" s={15} /></button>}>
          {!log.length ? <Empty>עוד אין הודעות</Empty> : log.map((m) => (
            <div className="lrow" key={m.id}>
              <span className="grow"><b className="ltr" style={{ fontSize: 13 }}>{m.direction === "in" ? "← " : "→ "}{m.phone}</b><span className="meta">{m.body.slice(0, 80)}{m.error ? " · " + m.error : ""}</span></span>
              <span className="meta">{m.status}</span>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}

/* ---------------- partner access (agency IDs + client instructions) ---------------- */
function AgencyTab() {
  const { settings, saveSettings, toast } = useApp();
  const a = settings.agency || {};
  const [f, setF] = useState({ meta_bm: a.meta_bm || "", google_mcc: a.google_mcc || "", tiktok_bc: a.tiktok_bc || "", access_msg: a.access_msg || ACCESS_MSG_DEFAULT });
  return (
    <div className="grid g2b">
      <Panel icon="key" title="המזהים שלך כשותף">
        <div className="form">
          <label className="field"><span>מזהה מנהל העסקים במטא</span><input className="inp ltr" value={f.meta_bm} onChange={(e) => setF({ ...f, meta_bm: e.target.value })} /></label>
          <label className="field"><span>מזהה חשבון הניהול בגוגל אדס</span><input className="inp ltr" placeholder="123-456-7890" value={f.google_mcc} onChange={(e) => setF({ ...f, google_mcc: e.target.value })} /></label>
          <label className="field"><span>מזהה מרכז העסקים בטיקטוק</span><input className="inp ltr" value={f.tiktok_bc} onChange={(e) => setF({ ...f, tiktok_bc: e.target.value })} /></label>
          <label className="field full"><span>הודעת ההוראות ללקוח. משתנים: {"{שם}"} {"{מטא}"} {"{גוגל}"} {"{טיקטוק}"}</span>
            <textarea className="inp" rows={8} value={f.access_msg} onChange={(e) => setF({ ...f, access_msg: e.target.value })} /></label>
          <div className="full bar">
            <button className="btn primary" onClick={async () => { if (await saveSettings({ agency: f })) toast("נשמר"); }}>שמירה</button>
            <button className="btn ghost" onClick={() => setF({ ...f, access_msg: ACCESS_MSG_DEFAULT })}>שחזור הנוסח המקורי</button>
          </div>
        </div>
      </Panel>
      <Panel icon="wa" title="איך ההודעה נראית">
        <p className="bubble">{accessMessage(f, "ישראל ישראלי", [])}</p>
      </Panel>
    </div>
  );
}
