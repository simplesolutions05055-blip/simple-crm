"use client";
/* Simple Ads: one campaign opened from the CRM. Ad sets and ads with numbers, pause / resume, budget (only the
   user, at least 40 a day), audience (warning while Meta is learning), add or replace an ad (up to 5 active),
   work modes for the automatic engine, ads waiting for approval, and the journal of every action. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Panel, Empty, St, Modal } from "@/components/Shell";
import Icon from "@/components/Icon";
import { useApp } from "@/components/AppCtx";
import { fmtDateTime, type Row } from "@/lib/crm";
import { sb } from "@/lib/supabase/browser";
import { AD_CTAS } from "@/lib/ads";
import { ENGINE, GOAL_LABEL, MODES, type Goal } from "@/lib/ads-engine";
import { AudienceSearch, LeadFormPicker, type Pick } from "@/components/AdBuilder";
import { GraphicPicker } from "@/components/Graphics";

const STATUS: Record<string, [string, string]> = {
  active: ["פעיל", "ok"], paused: ["מושהה", "warn"], pending_review: ["בבדיקת מטא", "info"], rejected: ["נדחה", "bad"],
  completed: ["הסתיים", ""], cancelled: ["בוטל", ""], error: ["שגיאה", "bad"], archived: ["בארכיון", ""],
};
const DRAFT: Record<string, [string, string]> = {
  generating: ["בהכנה", "info"], pending: ["ממתינה לאישור", "warn"], approved: ["אושרה", "ok"], live: ["באוויר", "ok"],
  rejected: ["נדחתה", ""], change: ["התבקש שינוי", "info"], failed: ["נכשלה", "bad"],
};
const ACTION: Record<string, string> = {
  boost: "קידום פוסט", create: "יצירת קמפיין", status: "הפעלה / השהיה", budget: "תקציב", targeting: "קהל", settings: "הגדרות",
  "ad:active": "מודעה הופעלה", "ad:paused": "מודעה הושהתה", "ad:add": "מודעה נוספה", "ad:replace": "מודעה הוחלפה",
  "adset:active": "קבוצה הופעלה", "adset:paused": "קבוצה הושהתה", "adset:duplicate": "שכפול קבוצה",
  "engine:skip": "בדיקה לילית", "engine:stable": "בדיקה לילית", "engine:recommend": "המלצה", "engine:error": "בדיקה נכשלה",
  "draft:new": "בקשה למודעה", "draft:ready": "מודעה מוכנה", "draft:failed": "יצירה נכשלה", "draft:approved": "אישור", "draft:rejected": "דחייה", "draft:change": "בקשת שינוי",
  lead: "ליד חדש", mail: "מייל", "account:disconnected": "החשבון התנתק", "account:reconnected": "החשבון חובר", "account:sync_failed": "סנכרון נכשל",
};
const actionLabel = (a: string) => ACTION[a] || (a.startsWith("status:") ? "סטטוס ממטא: " + a.slice(7) : a);

const money = (v: unknown, cur = "") => typeof v === "number" || (typeof v === "string" && v !== "") ? Number(v).toLocaleString("he-IL", { maximumFractionDigits: 2 }) + (cur ? " " + cur : "") : "-";
const n0 = (v: unknown) => (Number(v) || 0).toLocaleString("he-IL");
const r2 = (v: unknown) => (Math.round((Number(v) || 0) * 100) / 100).toLocaleString("he-IL");

async function post(org: string, campaignId: string, body: Row) {
  const r = await fetch("/api/zernio/ads/manage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ org, campaignId, ...body }) }).catch(() => null);
  const j = r ? await r.json().catch(() => ({})) : { error: "אין חיבור" };
  return { ok: !!r && r.ok, status: r?.status || 0, j };
}

export function CampaignManage({ id }: { id: string }) {
  const { org, toast } = useApp();
  const [d, setD] = useState<Row | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [addFor, setAddFor] = useState<{ adSetId: string; replace?: Row } | null>(null);
  const [audFor, setAudFor] = useState<Row | null>(null);

  const load = async () => {
    const r = await fetch("/api/zernio/ads/manage?" + new URLSearchParams({ org, campaignId: id })).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok) { setErr(j.error || "הקמפיין לא נטען"); return; }
    setErr(""); setD(j);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setD(null); load(); }, [org, id]);

  async function act(key: string, body: Row, okMsg: string) {
    setBusy(key);
    const r = await post(org, id, body);
    setBusy("");
    if (!r.ok) { toast("לא בוצע: " + (r.j.message || r.j.error || r.status), true); return r; }
    toast(okMsg); load();
    return r;
  }

  if (err) return <Panel icon="alert" title="הקמפיין לא נטען"><p style={{ margin: 0 }}>{err}</p><Link href="/ads">חזרה לקמפיינים</Link></Panel>;
  if (!d) return <div className="loading" style={{ minHeight: 240 }}>טוען את הקמפיין…</div>;
  const c = d.campaign as Row, s = d.settings as Row, cur = c.currency || "";
  const goal = c.goal as Goal;
  const spend = Number(c.m?.spend) || 0, results = Number(c.results) || 0;
  const lastRun = (s.last_run || {}) as Row;
  const pending = (d.drafts as Row[]).filter((x) => x.status === "pending");
  const meta = c.platform === "facebook" || c.platform === "instagram";

  const budget = (set: Row | null) => {
    const cb = set ? set.budget : c.budget;
    const v = prompt("תקציב יומי חדש" + (cur ? " (" + cur + ")" : "") + ". מינימום " + ENGINE.minDailyBudget + ". רק אתה משנה תקציב, המערכת לא נוגעת בו.", cb?.amount ? String(cb.amount) : "");
    if (v == null) return;
    const n = Number(v);
    if (!(n >= ENGINE.minDailyBudget)) return toast("מינימום " + ENGINE.minDailyBudget + " ליום", true);
    if (!confirm("לשנות את התקציב היומי ל-" + n + " " + cur + "?")) return;
    act("budget" + (set?.id || ""), { op: "budget", adSetId: set?.id || "", amount: n }, "התקציב עודכן");
  };

  return (
    <>
      {s.disconnected ? <Panel icon="alert" title="חשבון המודעות התנתק"><p style={{ margin: 0 }}>המערכת לא מבצעת פעולות עד שתחבר מחדש. <Link href={"/ads?tab=" + encodeURIComponent("חיבור חשבון מודעות")}>לחיבור מחדש</Link></p></Panel> : null}
      <div className="grid g4">
        <Stat l="הוצאה ב-14 יום" v={money(spend, cur)} />
        <Stat l={GOAL_LABEL[goal] || "תוצאות"} v={n0(results)} />
        <Stat l="עלות לתוצאה" v={results ? money(spend / results, cur) : "-"} />
        <Stat l="CTR" v={typeof c.m?.ctr === "number" ? r2(c.m.ctr) + "%" : "-"} />
      </div>

      <div className="grid g2b">
        <Panel icon="sliders" title="מצב עבודה" right={<St cls={(STATUS[c.status] || ["", ""])[1]}>{(STATUS[c.status] || [c.status])[0]}</St>}>
          <div className="bar" style={{ flexWrap: "wrap" }}>
            {MODES.map(([k, l]) => <button key={k} className={"btn sm" + (s.manage_mode === k ? " on" : "")} disabled={!!busy} onClick={() => { if (k === "auto" && !confirm("במצב אוטומטי המערכת מחליפה ומוסיפה מודעות לפי הכללים (בתקציב היא לא נוגעת). להפעיל?")) return; act("mode", { op: "settings", manage_mode: k }, "המצב עודכן"); }}>{l}</button>)}
          </div>
          <p className="tiny" style={{ margin: "6px 0 10px" }}>{(MODES.find((m) => m[0] === s.manage_mode) || MODES[0])[2]}</p>
          <label className="bar tiny" style={{ cursor: "pointer", marginBottom: 6 }}><input type="checkbox" checked={!!s.auto_creatives} disabled={!!busy || !meta} onChange={(e) => act("ac", { op: "settings", auto_creatives: e.target.checked }, "עודכן")} />המערכת יוצרת מודעות חדשות בעצמה (צריך מפתח OpenAI){!meta ? " - זמין רק במטא" : ""}</label>
          <label className="bar tiny" style={{ cursor: "pointer" }}><input type="checkbox" checked={s.approve_before_swap !== false} disabled={!!busy} onChange={(e) => { if (!e.target.checked && !confirm("בלי אישור, מודעה שעברה את כל הבדיקות עולה לבד. לכבות את האישור?")) return; act("ab", { op: "settings", approve_before_swap: e.target.checked }, "עודכן"); }} />כל מודעה חדשה מחכה לאישור שלי במייל</label>
          <div className="set-card" style={{ marginTop: 10 }}>
            <b>הבדיקה הלילית האחרונה</b>
            {lastRun.at ? <span className="tiny">{fmtDateTime(lastRun.at)} · {lastRun.reason}{(lastRun.hints || []).map((h: string) => <span key={h} style={{ display: "block", marginTop: 4 }}>• {h}</span>)}</span> : <span className="tiny">עוד לא רצה. הבדיקה רצה כל לילה ובודקת כל קמפיין לפי הכללים: לא נוגעת בשלב הלמידה, ממתינה 48 שעות בין פעולות, פעולה אחת לכל היותר.</span>}
          </div>
          <div className="bar" style={{ marginTop: 10, flexWrap: "wrap" }}>
            {meta ? <button className="btn sm" disabled={!!busy || pending.length > 0} onClick={() => act("draft", { op: "draft", adSetId: (d.adSets as Row[])[0]?.id }, "המערכת מכינה מודעה חדשה. זה לוקח כמה דקות")}><Icon n="plus" s={14} />בקשת מודעה חדשה מהמערכת</button> : null}
            <span className="tiny">מטרה: {GOAL_LABEL[goal]}</span>
          </div>
          {goal === "leads" && c.accountId ? <LeadFormPicker org={org} accountId={c.accountId} value={s.lead_form_id || ""} onChange={(v) => { if (v !== (s.lead_form_id || "")) act("lf", { op: "settings", lead_form_id: v }, "הטופס נשמר"); }} /> : null}
        </Panel>
        <Brief s={s} busy={!!busy} save={(brief) => act("brief", { op: "settings", brief }, "התדריך נשמר")} />
      </div>

      {(d.drafts as Row[]).length ? (
        <Panel icon="eye" title="מודעות חדשות מהמערכת" right={pending.length ? <St cls="warn">{pending.length} ממתינות</St> : null}>
          {(d.drafts as Row[]).map((x) => <DraftRow key={x.id} x={x} busy={!!busy} decide={(decision, note) => act("dd" + x.id, { op: "draft_decide", draftId: x.id, decision, note }, decision === "approved" ? "אושרה ועלתה" : "נשמר")} />)}
        </Panel>
      ) : null}

      {(d.adSets as Row[]).map((set) => {
        const activeN = (set.ads as Row[]).filter((a) => a.status === "active").length;
        return (
          <Panel key={set.id} icon="target" title={set.name || "קבוצת מודעות"} right={
            <span className="bar" style={{ flexWrap: "wrap" }}>
              {set.learning ? <St cls={set.learning === "learning" ? "info" : set.learning === "limited" ? "warn" : "ok"}>{set.learningLabel}</St> : null}
              <St cls={(STATUS[set.status] || ["", ""])[1]}>{(STATUS[set.status] || [set.status])[0]}</St>
            </span>}>
            <div className="bar" style={{ flexWrap: "wrap", marginBottom: 8 }}>
              <span className="tiny">תקציב: {set.budget?.amount ? money(set.budget.amount, cur) + (set.budget.type === "lifetime" ? " כולל" : " ליום") : c.budget?.amount ? "ברמת הקמפיין: " + money(c.budget.amount, cur) : "-"}</span>
              <span className="tiny">· {activeN}/{ENGINE.maxActiveAds} מודעות פעילות</span>
              <span style={{ flex: 1 }} />
              <button className="btn sm ghost" disabled={!!busy} onClick={() => budget(set.budget?.amount ? set : null)}>תקציב</button>
              <button className="btn sm ghost" disabled={!!busy} onClick={() => setAudFor(set)}>קהל</button>
              <button className="btn sm ghost" disabled={!!busy} title="עותק מושהה לבדיקת קהל אחר, בלי לאפס את הלמידה של המקור" onClick={() => confirm("ליצור עותק מושהה של קבוצת המודעות לבדיקת קהל חדש? כשתפעיל אותו הוא יוציא תקציב משלו.") && act("dup" + set.id, { op: "duplicate_adset", adSetId: set.id }, "נוצר עותק מושהה")}>שכפול לקהל חדש</button>
              {set.status === "active" || set.status === "paused" ? <button className="btn sm" disabled={!!busy} onClick={() => confirm(set.status === "active" ? "להשהות את כל קבוצת המודעות?" : "להפעיל את קבוצת המודעות? היא תתחיל להוציא כסף.") && act("as" + set.id, { op: "adset_status", adSetId: set.id, status: set.status === "active" ? "paused" : "active" }, "עודכן")}>{set.status === "active" ? "השהיית הקבוצה" : "הפעלת הקבוצה"}</button> : null}
              <button className="btn sm primary" disabled={!!busy || activeN >= ENGINE.maxActiveAds} title={activeN >= ENGINE.maxActiveAds ? "יש כבר 5 מודעות פעילות. מחליפים מודעה במקום להוסיף" : ""} onClick={() => setAddFor({ adSetId: set.id })}><Icon n="plus" s={14} />מודעה חדשה</button>
            </div>
            {!(set.ads as Row[]).length ? <Empty>אין מודעות בקבוצה</Empty> : (
              <div className="scroll">
                <table className="tbl fin adtbl">
                  <thead><tr><th>מודעה</th><th>מצב</th><th>הוצאה 7 ימים</th><th>{GOAL_LABEL[goal]} 7 ימים</th><th>עלות לתוצאה</th><th>CTR</th><th>תדירות 3 ימים</th><th></th></tr></thead>
                  <tbody>{(set.ads as Row[]).map((a) => {
                    const st = STATUS[a.status] || [a.status || "-", ""], w = a.week as Row | null;
                    return (
                      <tr key={a.id}>
                        <td><div className="bar" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
                          {a.image ? <img src={a.image} alt="" className="adthumb" loading="lazy" /> : null}
                          <span><b dir="auto">{a.name || a.id}</b><span className="meta" dir="auto">{String(a.body || "").slice(0, 90)}</span>{a.rejection ? <span className="meta" style={{ color: "var(--bad)" }}>{a.rejection}</span> : null}</span>
                        </div></td>
                        <td><St cls={st[1]}>{st[0]}</St></td>
                        <td>{w ? money(w.spend, cur) : "-"}</td>
                        <td>{w ? n0(w.results) : "-"}</td>
                        <td>{w && w.results ? money(w.spend / w.results, cur) : "-"}</td>
                        <td>{w ? r2(w.ctr) + "%" : "-"}</td>
                        <td>{w && w.freq3 ? r2(w.freq3) : "-"}</td>
                        <td><span className="bar" style={{ flexWrap: "nowrap" }}>
                          {a.status === "active" || a.status === "paused" ? <button className="btn sm" disabled={!!busy} onClick={() => act("ad" + a.id, { op: "ad_status", adId: a.id, status: a.status === "active" ? "paused" : "active" }, a.status === "active" ? "המודעה הושהתה" : "המודעה הופעלה")}>{a.status === "active" ? "השהיה" : "הפעלה"}</button> : null}
                          <button className="btn sm ghost" disabled={!!busy} title="מודעה חדשה במקומה. הישנה נעצרת רק אחרי שהחדשה עלתה" onClick={() => setAddFor({ adSetId: set.id, replace: a })}>החלפה</button>
                        </span></td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            )}
          </Panel>
        );
      })}

      <Journal rows={d.journal as Row[]} />

      {addFor ? <AddAd c={c} goal={goal} adSetId={addFor.adSetId} replace={addFor.replace} sample={(d.adSets as Row[]).find((x) => x.id === addFor.adSetId)?.ads?.find((a: Row) => a.link)?.link || (s.brief || {}).site || ""} onClose={() => setAddFor(null)} onDone={() => { setAddFor(null); load(); }} /> : null}
      {audFor ? <Audience c={c} set={audFor} onClose={() => setAudFor(null)} onDone={() => { setAudFor(null); load(); }} /> : null}
    </>
  );
}

function Stat({ l, v }: { l: string; v: string }) {
  return (
    <div className="panel stat">
      <span className="hi" style={{ color: "var(--navy)", borderColor: "var(--navy)" }}><Icon n="trend" s={18} /></span>
      <div><b>{v}</b><span className="sub">{l}</span></div>
    </div>
  );
}

/* what the creative engine writes from */
function Brief({ s, busy, save }: { s: Row; busy: boolean; save: (b: Row) => void }) {
  const [b, setB] = useState<Row>({ offer: "", audience: "", site: "", siteSummary: "", angles: "", notes: "", ...(s.brief || {}) });
  const f = (k: string, l: string, ph: string, area = false) => (
    <label className="field full"><span>{l}</span>
      {area ? <textarea className="inp" dir="auto" rows={3} value={b[k] || ""} placeholder={ph} onChange={(e) => setB({ ...b, [k]: e.target.value })} />
        : <input className="inp" dir="auto" value={b[k] || ""} placeholder={ph} onChange={(e) => setB({ ...b, [k]: e.target.value })} />}
    </label>
  );
  return (
    <Panel icon="brief" title="תדריך למודעות חדשות">
      <p className="tiny" style={{ marginTop: 0 }}>המערכת כותבת מודעות רק מתוך מה שכתוב כאן ובהגדרות המנוע. מספר, מחיר או הבטחה שלא כתובים כאן לא ייכנסו למודעה.</p>
      <div className="form">
        {f("offer", "מה מציעים", "לדוגמה: בניית אתר תדמית לעסקים קטנים, כולל דומיין לשנה", true)}
        {f("audience", "למי", "לדוגמה: בעלי עסקים קטנים באזור המרכז שאין להם אתר")}
        {f("site", "קישור ליעד", "https://")}
        {f("siteSummary", "מה יש באתר / בדף הנחיתה", "שתיים-שלוש שורות", true)}
        {f("angles", "זוויות שאתה אוהב (לא חובה)", "לדוגמה: חיסכון בזמן, מקצועיות, ליווי אישי")}
        {f("notes", "מה אסור לכתוב (לא חובה)", "לדוגמה: לא להזכיר מחירים")}
      </div>
      <button className="btn primary" style={{ marginTop: 10 }} disabled={busy} onClick={() => save(b)}>שמירת התדריך</button>
    </Panel>
  );
}

function DraftRow({ x, busy, decide }: { x: Row; busy: boolean; decide: (decision: string, note?: string) => void }) {
  const st = DRAFT[x.status] || [x.status, ""];
  const copy = (x.copy || {}) as Row;
  return (
    <div className="set-card draftrow">
      <div className="bar" style={{ flexWrap: "wrap" }}><St cls={st[1]}>{st[0]}</St><span className="tiny">{fmtDateTime(x.created_at)} · {x.by}</span>{x.status === "generating" ? <span className="tiny">שלב: {x.stage}</span> : null}</div>
      <span className="tiny"><b>למה: </b>{x.reason}</span>
      {x.error ? <span className="tiny" style={{ color: "var(--bad)" }}>{x.error}</span> : null}
      {copy.meta_headline ? (
        <div className="bar" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          {x.image_feed ? <img src={x.image_feed} alt="" className="draftimg" /> : null}
          {x.image_story ? <img src={x.image_story} alt="" className="draftimg story" /> : null}
          <span style={{ flex: 1, minWidth: 200 }}><span dir="auto" style={{ display: "block", whiteSpace: "pre-wrap" }}>{copy.meta_body}</span><b dir="auto">{copy.meta_headline}</b>{copy.meta_description ? <span className="tiny" style={{ display: "block" }}>{copy.meta_description}</span> : null}</span>
        </div>
      ) : null}
      {x.status === "pending" ? (
        <div className="bar" style={{ flexWrap: "wrap" }}>
          <button className="btn sm primary" disabled={busy} onClick={() => confirm("להעלות את המודעה לאוויר?" + (x.replaces_ad_id ? " המודעה הקודמת תיעצר אחרי שהחדשה תעלה." : "")) && decide("approved")}>אישור והעלאה</button>
          <button className="btn sm" disabled={busy} onClick={() => { const n = prompt("מה לשנות?"); if (n && n.trim()) decide("change", n.trim()); }}>בקשת שינוי</button>
          <button className="btn sm ghost" disabled={busy} onClick={() => confirm("לדחות?") && decide("rejected")}>דחייה</button>
        </div>
      ) : null}
    </div>
  );
}

function Journal({ rows }: { rows: Row[] }) {
  const [all, setAll] = useState(false);
  const list = all ? rows : rows.slice(0, 12);
  return (
    <Panel icon="list" title="יומן פעולות" right={<span className="tiny">מי עשה מה ולמה</span>}>
      {!rows.length ? <Empty>עוד אין פעולות</Empty> : list.map((r) => (
        <div key={r.id} className="lrow">
          <St cls={r.ok ? (String(r.action).startsWith("engine:") ? "info" : "ok") : "bad"}>{actionLabel(r.action)}</St>
          <span className="grow"><b dir="auto">{r.actor || "משתמש"}</b>{r.name ? <span dir="auto"> · {r.name}</span> : null}
            <span className="meta">{fmtDateTime(r.created_at)}{r.reason ? " · " + r.reason : ""}{!r.ok && r.result?.error ? " · " + String(r.result.error).slice(0, 200) : ""}</span></span>
        </div>
      ))}
      {rows.length > 12 ? <button className="btn sm ghost" onClick={() => setAll(!all)}>{all ? "פחות" : "הכל (" + rows.length + ")"}</button> : null}
    </Panel>
  );
}

/* a new ad in the ad set, or one in place of an existing ad */
function AddAd({ c, goal, adSetId, replace, sample, onClose, onDone }: { c: Row; goal: Goal; adSetId: string; replace?: Row; sample: string; onClose: () => void; onDone: () => void }) {
  const { org, toast } = useApp();
  const [f, setF] = useState({ headline: "", body: "", description: "", cta: goal === "leads" ? "SIGN_UP" : "LEARN_MORE", linkUrl: sample, imageFeed: "", imageStory: "", phone: "" });
  const tiktok = c.platform === "tiktok";
  const [busy, setBusy] = useState("");
  const [idem] = useState(() => crypto.randomUUID());
  async function upload(file: File | undefined, k: "imageFeed" | "imageStory") {
    if (!file) return;
    if (!/^image\/(jpeg|png)$/.test(file.type)) return toast("רק JPG או PNG", true);
    if (file.size > 8 * 1024 * 1024) return toast("עד 8MB", true);
    setBusy(k);
    const b64 = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(file); });
    const r = await post(org, c.id, { op: "upload", imageBase64: b64, filename: file.name });
    setBusy("");
    if (!r.ok) return toast("ההעלאה נכשלה: " + (r.j.error || r.status), true);
    setF((x) => ({ ...x, [k]: r.j.url }));
  }
  async function uploadVideo(file: File | undefined) {
    if (!file) return;
    if (!/^video\/(mp4|quicktime)$/.test(file.type)) return toast("רק קובץ MP4 או MOV", true);
    if (file.size > 50 * 1024 * 1024) return toast("עד 50MB", true);
    setBusy("imageFeed");
    const path = org + "/video-" + crypto.randomUUID() + (file.type === "video/quicktime" ? ".mov" : ".mp4");
    const { error } = await sb().storage.from("crm-graphics").upload(path, file, { contentType: file.type, upsert: false });
    setBusy("");
    if (error) return toast("ההעלאה נכשלה: " + error.message, true);
    setF((x) => ({ ...x, imageFeed: sb().storage.from("crm-graphics").getPublicUrl(path).data.publicUrl }));
  }
  async function send() {
    if (!f.body.trim() || (!tiktok && !f.headline.trim())) return toast(tiktok ? "טקסט הוא חובה" : "כותרת וטקסט הם חובה", true);
    if (!f.imageFeed) return toast(tiktok ? "חסר סרטון" : "חסרה תמונה לפיד", true);
    if (!confirm(replace ? "להעלות את המודעה החדשה? \"" + (replace.name || replace.id) + "\" תיעצר אחרי שהחדשה תעלה." : "להעלות את המודעה לאוויר? היא תרוץ על התקציב והקהל של הקבוצה.")) return;
    setBusy("send");
    const r = await post(org, c.id, { op: "add_ad", adSetId, replaceAdId: replace?.id || "", idem, ...f });
    setBusy("");
    if (!r.ok) return toast("לא עלתה: " + (r.j.error || r.status), true);
    toast(replace ? "המודעה החדשה עלתה והישנה הושהתה" : "המודעה נשלחה למטא ועוברת בדיקה");
    onDone();
  }
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title={replace ? "החלפת מודעה" : "מודעה חדשה בקבוצה"} icon="plus" onClose={onClose} wide>
      {replace ? <p className="tiny" style={{ marginTop: 0 }}>במקום: <b dir="auto">{replace.name}</b>. הישנה נעצרת רק אחרי שהחדשה עלתה.</p> : null}
      <div className="form">
        {!tiktok ? <label className="field"><span>כותרת (עד 40 תווים) · {f.headline.length}</span><input className="inp" dir="auto" maxLength={40} value={f.headline} onChange={set("headline")} /></label> : null}
        {!tiktok ? <label className="field"><span>תיאור (עד 30, לא חובה) · {f.description.length}</span><input className="inp" dir="auto" maxLength={30} value={f.description} onChange={set("description")} /></label> : null}
        <label className="field full"><span>{tiktok ? "טקסט המודעה (עד 100 תווים)" : "טקסט ראשי (מומלץ עד 125 תווים)"} · {f.body.length}</span><textarea className="inp" dir="auto" rows={3} maxLength={tiktok ? 100 : undefined} value={f.body} onChange={set("body")} /></label>
        {goal !== "whatsapp" ? <label className="field"><span>כפתור</span><select className="inp" value={f.cta} onChange={set("cta")}>{AD_CTAS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label> : null}
        {goal !== "whatsapp" ? <label className="field"><span>קישור{goal === "leads" ? " (לא חובה)" : ""}</span><input className="inp ltr" value={f.linkUrl} onChange={set("linkUrl")} placeholder="https://" /></label> : null}
        {goal === "calls" ? <label className="field"><span>טלפון בפורמט בינלאומי</span><input className="inp ltr" value={f.phone} onChange={set("phone")} placeholder="+972501234567" /></label> : null}
        {tiktok ? (
          <div className="field full"><span>סרטון אנכי 9:16 (MP4 או MOV, עד 50MB)</span>
            <div className="bar" style={{ flexWrap: "wrap" }}>
              <label className="btn sm">{busy === "imageFeed" ? "מעלה…" : "העלאת סרטון"}<input type="file" accept="video/mp4,video/quicktime" hidden onChange={(e) => uploadVideo(e.target.files?.[0])} /></label>
              <input className="inp ltr" style={{ flex: 1, minWidth: 200 }} value={f.imageFeed} onChange={set("imageFeed")} placeholder="או קישור https לסרטון" />
            </div>
          </div>
        ) : <>
        <div className="field full"><span>תמונה לפיד 4:5 (1080×1350)</span>
          <div className="bar" style={{ flexWrap: "wrap" }}>
            {f.imageFeed ? <img src={f.imageFeed} alt="" className="draftimg" /> : null}
            <label className="btn sm">{busy === "imageFeed" ? "מעלה…" : "העלאה מהמחשב"}<input type="file" accept="image/jpeg,image/png" hidden onChange={(e) => upload(e.target.files?.[0], "imageFeed")} /></label>
          </div>
          <GraphicPicker value={f.imageFeed} onPick={(u) => setF({ ...f, imageFeed: u })} />
        </div>
        {goal !== "whatsapp" && goal !== "calls" ? (
          <div className="field full"><span>תמונה לסטורי ורילס 9:16 (1080×1920, לא חובה). בלי טקסט ב-14% העליונים וב-35% התחתונים</span>
            <div className="bar" style={{ flexWrap: "wrap" }}>
              {f.imageStory ? <img src={f.imageStory} alt="" className="draftimg story" /> : null}
              <label className="btn sm">{busy === "imageStory" ? "מעלה…" : "העלאה מהמחשב"}<input type="file" accept="image/jpeg,image/png" hidden onChange={(e) => upload(e.target.files?.[0], "imageStory")} /></label>
              {f.imageStory ? <button className="btn sm ghost" onClick={() => setF({ ...f, imageStory: "" })}>הסרה</button> : null}
            </div>
            <span className="tiny">בלי תמונה אנכית, הסטורי והרילס יציגו את תמונת הפיד.</span>
          </div>
        ) : null}
        </>}
      </div>
      <div className="bar" style={{ marginTop: 12 }}>
        <button className="btn primary" disabled={!!busy} onClick={send}>{busy === "send" ? "מעלה…" : replace ? "העלאה והחלפה" : "העלאה"}</button>
        <button className="btn ghost" onClick={onClose}>ביטול</button>
      </div>
    </Modal>
  );
}

/* audience of one ad set. While Meta is learning a change restarts it, so the safer path is a duplicate */
function Audience({ c, set, onClose, onDone }: { c: Row; set: Row; onClose: () => void; onDone: () => void }) {
  const { org, toast } = useApp();
  const t = (set.targeting || {}) as Row;
  const [ageMin, setAgeMin] = useState<number>(t.ageMin || 18);
  const [ageMax, setAgeMax] = useState<number>(t.ageMax || 65);
  const [cities, setCities] = useState<Pick[]>((t.cities || []).map((x: Row) => ({ id: x.id, name: x.name, radius: x.radius || 25 })));
  const [interests, setInterests] = useState<Pick[]>((t.interests || []).map((x: Row) => ({ id: x.id, name: x.name })));
  const [busy, setBusy] = useState(false);
  async function save(force = false) {
    setBusy(true);
    const r = await post(org, c.id, { op: "targeting", adSetId: set.id, force, targeting: { ageMin, ageMax, cities: cities.map((x) => ({ ...x, radius: x.radius || 25 })), interests } });
    setBusy(false);
    if (r.status === 409 && r.j.error === "learning") {
      if (confirm(r.j.message + ".\nעדיף לשכפל את הקבוצה לקהל חדש. לשנות בכל זאת?")) return save(true);
      return;
    }
    if (!r.ok) return toast("לא עודכן: " + (r.j.error || r.status), true);
    toast("הקהל עודכן"); onDone();
  }
  return (
    <Modal title={"קהל · " + (set.name || "")} icon="user" onClose={onClose} wide>
      {set.learning === "learning" ? <p className="tiny" style={{ marginTop: 0, color: "var(--warn)", fontWeight: 600 }}>הקבוצה בשלב הלמידה של מטא. שינוי קהל עכשיו יתחיל את הלמידה מחדש. הדרך הבטוחה: &quot;שכפול לקהל חדש&quot;.</p> : <p className="tiny" style={{ marginTop: 0 }}>שינוי קהל מאפס את הלמידה של מטא. משנים רק כשיש סיבה ברורה.</p>}
      <div className="form">
        <label className="field"><span>גיל מ-</span><input className="inp" type="number" min={18} max={65} value={ageMin} onChange={(e) => setAgeMin(Number(e.target.value))} /></label>
        <label className="field"><span>עד</span><input className="inp" type="number" min={18} max={65} value={ageMax} onChange={(e) => setAgeMax(Number(e.target.value))} /></label>
      </div>
      <AudienceSearch kind="city" label="ערים (ריק = כל הארץ)" org={org} accountId={c.accountId} adAccountId={c.adAccountId} picks={cities} setPicks={setCities} radius defRadius={25} />
      <AudienceSearch kind="interest" label="תחומי עניין (לא חובה)" org={org} accountId={c.accountId} adAccountId={c.adAccountId} picks={interests} setPicks={setInterests} />
      <div className="bar" style={{ marginTop: 12 }}>
        <button className="btn primary" disabled={busy} onClick={() => save(false)}>{busy ? "שומר…" : "שמירת הקהל"}</button>
        <button className="btn ghost" onClick={onClose}>ביטול</button>
      </div>
    </Modal>
  );
}

/* the main colors of a logo: pixels grouped into coarse buckets, transparent and near-white skipped,
   the biggest groups first, near-duplicates merged */
async function logoColors(file: File): Promise<string[]> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const W = 120, H = Math.max(1, Math.round((img.height / img.width) * W));
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");
    if (!ctx) return [];
    ctx.drawImage(img, 0, 0, W, H);
    const px = ctx.getImageData(0, 0, W, H).data;
    const groups = new Map<string, { n: number; r: number; g: number; b: number }>();
    for (let i = 0; i < px.length; i += 4) {
      const [r, g, b, a] = [px[i], px[i + 1], px[i + 2], px[i + 3]];
      if (a < 128 || (r > 240 && g > 240 && b > 240)) continue;
      const k = (r >> 5) + "," + (g >> 5) + "," + (b >> 5);
      const x = groups.get(k) || { n: 0, r: 0, g: 0, b: 0 };
      x.n++; x.r += r; x.g += g; x.b += b; groups.set(k, x);
    }
    const hex = (v: number) => Math.round(v).toString(16).padStart(2, "0");
    const out: { c: number[]; h: string }[] = [];
    const total = [...groups.values()].reduce((a, x) => a + x.n, 0);
    for (const x of [...groups.values()].sort((a, b) => b.n - a.n)) {
      if (x.n < total * 0.04) break; /* edge pixels and small details are not brand colors */
      const c = [x.r / x.n, x.g / x.n, x.b / x.n];
      if (out.some((o) => Math.hypot(o.c[0] - c[0], o.c[1] - c[1], o.c[2] - c[2]) < 60)) continue;
      out.push({ c, h: "#" + c.map(hex).join("") });
      if (out.length === 4) break;
    }
    return out.map((o) => o.h);
  } catch { return []; } finally { URL.revokeObjectURL(url); }
}

function LogoField({ url, onChange }: { url: string; onChange: (url: string, colors?: string) => void }) {
  const { org, toast } = useApp();
  const [busy, setBusy] = useState(false);
  async function pick(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return toast("PNG, JPG או WEBP", true);
    if (file.size > 5 * 1024 * 1024) return toast("עד 5MB", true);
    setBusy(true);
    const ext = file.type.split("/")[1].replace("jpeg", "jpg");
    const path = org + "/brand-logo-" + crypto.randomUUID() + "." + ext;
    const [{ error }, colors] = await Promise.all([
      sb().storage.from("crm-graphics").upload(path, file, { contentType: file.type, upsert: false }),
      logoColors(file),
    ]);
    setBusy(false);
    if (error) return toast("ההעלאה נכשלה: " + error.message, true);
    onChange(sb().storage.from("crm-graphics").getPublicUrl(path).data.publicUrl, colors.join(", ") || undefined);
    toast(colors.length ? "הלוגו הועלה והצבעים נלקחו ממנו. לוחצים שמירה" : "הלוגו הועלה. לוחצים שמירה");
  }
  return (
    <div className="field full"><span>לוגו</span>
      <div className="bar" style={{ flexWrap: "wrap" }}>
        {url ? <img src={url} alt="לוגו" className="logoprev" /> : null}
        <label className="btn sm">{busy ? "מעלה…" : url ? "החלפת לוגו" : "העלאת קובץ לוגו"}<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(ev) => { pick(ev.target.files?.[0]); ev.target.value = ""; }} /></label>
        {url ? <button type="button" className="btn sm ghost" onClick={() => onChange("")}>הסרה</button> : null}
      </div>
      <span className="tiny">עדיף PNG עם רקע שקוף.</span>
    </div>
  );
}

/* engine settings for the whole business: who gets the approval emails and the brand details for new ads */
export function EngineSettingsPanel() {
  const { org, toast } = useApp();
  const [e, setE] = useState<Row | null>(null);
  const [social, setSocial] = useState<Row>({});
  const [hasPass, setHasPass] = useState(false);
  const [pass, setPass] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const load = async () => {
    const [{ data }, { data: hp }, { data: cs }] = await Promise.all([
      sb().from("crm_settings").select("social").eq("org_id", org).maybeSingle(),
      sb().rpc("crm_has_org_secret", { p_org: org, p_name: "smtp_app_password" }),
      sb().from("crm_ad_campaigns").select("campaign_id,name,manage_mode,auto_creatives,approve_before_swap,learning,last_run,disconnected").eq("org_id", org).order("updated_at", { ascending: false }),
    ]);
    setSocial(data?.social || {});
    setE({ business: "", site: "", colors: "", logo_url: "", brand_in_ads: false, smtp_user: "", notify_email: "", ...((data?.social || {}).ads_engine || {}) });
    setHasPass(!!hp); setRows(cs || []);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [org]);
  if (!e) return <div className="loading" style={{ minHeight: 160 }}>טוען…</div>;
  async function save() {
    const clean = Object.fromEntries(Object.entries(e!).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v]));
    const { error } = await sb().from("crm_settings").update({ social: { ...social, ads_engine: clean } }).eq("org_id", org);
    if (error) return toast(error.message, true);
    if (pass.trim()) {
      const r = await sb().rpc("crm_set_org_secret", { p_org: org, p_name: "smtp_app_password", p_value: pass.replace(/\s+/g, "") });
      if (r.error) return toast(r.error.message === "not allowed" ? "רק בעל העסק יכול לשמור סיסמה" : r.error.message, true);
      setPass("");
    }
    toast("נשמר"); load();
  }
  const f = (k: string, l: string, ph = "", ltr = false) => <label className="field"><span>{l}</span><input className={"inp" + (ltr ? " ltr" : "")} dir={ltr ? undefined : "auto"} value={e[k] || ""} placeholder={ph} onChange={(ev) => setE({ ...e, [k]: ev.target.value })} /></label>;
  return (
    <div className="grid g2b">
      <Panel icon="sliders" title="הגדרות המנוע האוטומטי">
        <div className="form">
          {f("business", "שם העסק במודעות", "Simple Solution")}
          {f("site", "אתר ברירת מחדל", "https://", true)}
          <LogoField url={e.logo_url || ""} onChange={(logo_url, colors) => setE({ ...e, logo_url, ...(colors ? { colors } : {}) })} />
          <label className="field full"><span>צבעי המותג (נלקחים מהלוגו, אפשר לערוך)</span>
            <div className="bar" style={{ flexWrap: "nowrap" }}>
              {String(e.colors || "").match(/#[0-9a-f]{6}/gi)?.map((c) => <span key={c} className="swatch" style={{ background: c }} title={c} />)}
              <input className="inp ltr" style={{ flex: 1 }} value={e.colors || ""} placeholder="#1f3c88, #ffffff" onChange={(ev) => setE({ ...e, colors: ev.target.value })} />
            </div>
          </label>
          <label className="bar tiny full" style={{ cursor: "pointer" }}><input type="checkbox" checked={!!e.brand_in_ads} onChange={(ev) => setE({ ...e, brand_in_ads: ev.target.checked })} />לשים את הלוגו ושם העסק בגרפיקות</label>
        </div>
        <h3 className="tiny" style={{ margin: "14px 0 6px" }}><b>מיילים לאישור מודעות ולהתראות</b></h3>
        <div className="form">
          {f("smtp_user", "כתובת ה-Gmail שממנה נשלח", "name@gmail.com", true)}
          {f("notify_email", "לאן לשלוח (ריק = לאותה כתובת)", "", true)}
          <label className="field full"><span>סיסמת אפליקציה של Gmail {hasPass ? "(שמורה בכספת. ממלאים רק כדי להחליף)" : ""}</span>
            <input className="inp ltr" type="password" autoComplete="off" value={pass} onChange={(ev) => setPass(ev.target.value)} placeholder={hasPass ? "••••••••••••••••" : "16 תווים"} /></label>
        </div>
        <p className="tiny">יוצרים סיסמת אפליקציה ב-<a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer">myaccount.google.com/apppasswords</a> (צריך אימות דו-שלבי פעיל בחשבון). מפתח OpenAI ליצירת מודעות נשמר בלשונית &quot;גרפיקות&quot;.</p>
        <button className="btn primary" onClick={save}>שמירה</button>
      </Panel>
      <Panel icon="pulse" title="קמפיינים בניהול המערכת" right={<span className="tiny">{rows.length}</span>}>
        {!rows.length ? <Empty>עוד אין. כל קמפיין שמוקם מה-CRM, או שנפתח כאן ב&quot;ניהול&quot;, נכנס לרשימה במצב המלצות בלבד.</Empty> : rows.map((r) => (
          <Link key={r.campaign_id} href={"/ads/campaign/" + encodeURIComponent(r.campaign_id)} className="lrow" style={{ textDecoration: "none", color: "inherit" }}>
            <St cls={r.disconnected ? "bad" : r.manage_mode === "auto" ? "ok" : "info"}>{r.disconnected ? "מנותק" : r.manage_mode === "auto" ? "אוטומטי" : "המלצות"}</St>
            <span className="grow"><b dir="auto">{r.name || r.campaign_id}</b><span className="meta">{r.last_run?.at ? fmtDateTime(r.last_run.at) + " · " + r.last_run.reason : "עוד לא נבדק"}</span></span>
            <Icon n="chev" s={14} />
          </Link>
        ))}
        <p className="tiny" style={{ marginBottom: 0 }}>הכללים: לא נוגעים בתקציב, לא נוגעים בשלב הלמידה, 48 שעות בין פעולות, פעולה אחת בלילה לכל קמפיין, עד {ENGINE.maxActiveAds} מודעות פעילות, המודעה הכי טובה לא נעצרת אף פעם.</p>
      </Panel>
    </div>
  );
}
