"use client";
/* מודעות: the ad accounts of the business (through Zernio), its campaigns with spend and results,
   pause / resume / budget per campaign, the campaign builder (Meta) and the graphics studio. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Top, Panel, Empty, St } from "@/components/Shell";
import Icon from "@/components/Icon";
import { useApp } from "@/components/AppCtx";
import { fmtDate, type Row } from "@/lib/crm";
import { sb } from "@/lib/supabase/browser";
import { AdBuilder, CampaignActions } from "@/components/AdBuilder";
import { GraphicsStudio } from "@/components/Graphics";
import { CONNECT_HREF, n0, zName } from "@/components/SocialLive";

const TABS = ["קמפיינים", "קמפיין חדש", "גרפיקות", "חיבור חשבון מודעות"] as const;
type Tab = (typeof TABS)[number];
const STATUS: Record<string, [string, string]> = {
  active: ["פעיל", "ok"], paused: ["מושהה", "warn"], pending_review: ["בבדיקה", "info"], rejected: ["נדחה", "bad"],
  completed: ["הסתיים", ""], cancelled: ["בוטל", ""], error: ["שגיאה", "bad"],
};
const RANGES: [number, string][] = [[7, "7 ימים"], [30, "30 יום"], [90, "90 יום"]];
const AD_NETS: [string, string, string][] = [
  ["facebook", "מטא (פייסבוק ואינסטגרם)", "דרך עמוד הפייסבוק שכבר מחובר. נפתח חלון של פייסבוק לאישור הרשאת מודעות ובחירת חשבון המודעות."],
  ["tiktok", "טיקטוק", "חשבון TikTok Ads Manager. אם חשבון הטיקטוק מחובר גם לפוסטים, אפשר יהיה לקדם פוסטים קיימים (Spark Ads)."],
  ["googleads", "Google Ads", "המשתמש בגוגל צריך גישה לחשבון המודעות או לחשבון המנהל שלו."],
];

const money = (v: unknown, cur: string) => typeof v === "number" ? v.toLocaleString("he-IL", { maximumFractionDigits: 2 }) + (cur ? " " + cur : "") : "-";

export default function Ads() {
  const [tab, setTab] = useState<Tab>("קמפיינים");
  useEffect(() => {
    const t = new URLSearchParams(location.search).get("tab");
    if (t && (TABS as readonly string[]).includes(t)) setTab(t as Tab);
  }, []);
  return (
    <>
      <Top title="מודעות" sub="קמפיינים ממומנים, תקציבים וקריאייטיב, ממקום אחד" />
      <div className="content">
        <div className="tabs">{TABS.map((t) => <button key={t} className={"btn sm" + (tab === t ? " on" : "")} onClick={() => setTab(t)}>{t}</button>)}</div>
        {tab === "קמפיינים" ? <Campaigns goConnect={() => setTab("חיבור חשבון מודעות")} goNew={() => setTab("קמפיין חדש")} />
          : tab === "קמפיין חדש" ? <AdBuilder onDone={() => setTab("קמפיינים")} />
          : tab === "גרפיקות" ? <GraphicsStudio /> : <ConnectAds />}
      </div>
    </>
  );
}

function useAds(days: number, tick = 0) {
  const { org } = useApp();
  const [d, setD] = useState<Row | null>(null);
  useEffect(() => {
    if (!tick) setD(null);
    fetch("/api/zernio/ads?org=" + encodeURIComponent(org) + "&days=" + days).then((r) => r.json()).then(setD).catch(() => setD({ error: "load" }));
  }, [org, days, tick]);
  return d;
}

function Campaigns({ goConnect, goNew }: { goConnect: () => void; goNew: () => void }) {
  const [days, setDays] = useState(30);
  const [tick, setTick] = useState(0);
  const d = useAds(days, tick);
  const reload = () => setTick((t) => t + 1);
  if (!d) return <div className="loading" style={{ minHeight: 200 }}>טוען קמפיינים…</div>;
  if (d.configured === false) return <Panel icon="link" title="קמפיינים"><p className="tiny">החיבור ל-Zernio עוד לא מוגדר בשרת.</p></Panel>;
  if (d.error && !d.adAccounts) return <Panel icon="alert" title="קמפיינים"><p className="tiny">לא נטען: {d.error}</p></Panel>;
  if (!d.hasAds && !d.error) return (
    <Panel icon="target" title="עוד לא חובר חשבון מודעות">
      <p style={{ marginTop: 0 }}>אחרי החיבור יופיעו כאן כל הקמפיינים מהחשבון, גם אלה שנוצרו במנהל המודעות, עם הוצאה, חשיפות, קליקים ועלות לקליק. אם כבר חיברת ואין עדיין קמפיינים, אפשר ליצור את הראשון.</p>
      <div className="bar"><button className="btn primary" onClick={goNew}><Icon n="plus" s={15} />קמפיין חדש</button><button className="btn" onClick={goConnect}><Icon n="link" s={15} />לחיבור חשבון מודעות</button></div>
    </Panel>
  );
  const list: Row[] = d.campaigns || [];
  const cur = list.find((c) => c.currency)?.currency || "";
  const sum = (k: string) => list.reduce((a, c) => a + (Number(c.m?.[k]) || 0), 0);
  const spend = sum("spend"), clicks = sum("clicks"), impressions = sum("impressions");
  return (
    <>
      <div className="bar" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div className="bar">{RANGES.map(([n, l]) => <button key={n} className={"btn sm" + (days === n ? " on" : "")} onClick={() => setDays(n)}>{l}</button>)}
          <button className="btn sm primary" onClick={goNew}><Icon n="plus" s={14} />קמפיין חדש</button></div>
        <span className="tiny">{(d.adAccounts as Row[]).map((a) => zName(a.platform) + (a.name ? " · " + a.name : "")).join("  |  ")}</span>
      </div>
      {d.error ? (
        <Panel icon="alert" title="הקמפיינים לא נטענו">
          {d.addon
            ? <p style={{ margin: 0 }}>חשבון ה-Zernio צריך את תוספת המודעות (Ads). מפעילים אותה ב-<a href="https://zernio.com/dashboard" target="_blank" rel="noopener noreferrer">zernio.com</a> ומרעננים את העמוד.</p>
            : <p style={{ margin: 0 }}>{d.error}</p>}
        </Panel>
      ) : (
        <>
          <div className="grid g4">
            <Stat l="הוצאה בתקופה" v={money(spend, cur)} />
            <Stat l="חשיפות" v={n0(impressions)} />
            <Stat l="קליקים" v={n0(clicks)} />
            <Stat l="עלות ממוצעת לקליק" v={clicks ? money(spend / clicks, cur) : "-"} />
          </div>
          <Panel icon="target" title="קמפיינים" right={<span className="tiny">{list.length}</span>}>
            {!list.length ? <Empty>אין קמפיינים בתקופה הזאת</Empty> : (
              <div className="scroll">
                <table className="tbl fin">
                  <thead><tr><th>קמפיין</th><th>רשת</th><th>מצב</th><th>תקציב</th><th>הוצאה</th><th>חשיפות</th><th>קליקים</th><th>CTR</th><th>עלות לקליק</th><th>המרות</th><th></th></tr></thead>
                  <tbody>{list.map((c) => {
                    const s = STATUS[c.status] || [c.status || "-", ""];
                    return (
                      <tr key={c.platform + c.id}>
                        <td><b dir="auto">{c.name || c.id}</b><span className="meta">{c.adAccount}{c.ads ? " · " + c.ads + " מודעות" : ""}</span></td>
                        <td>{zName(c.platform)}</td>
                        <td><St cls={s[1]}>{s[0]}</St></td>
                        <td>{c.budget ? money(c.budget.amount, c.currency) + (c.budget.type === "daily" ? " ליום" : " כולל") : "-"}</td>
                        <td>{money(c.m?.spend, c.currency)}</td>
                        <td>{n0(c.m?.impressions)}</td>
                        <td>{n0(c.m?.clicks)}</td>
                        <td>{typeof c.m?.ctr === "number" ? c.m.ctr.toFixed(2) + "%" : "-"}</td>
                        <td>{money(c.m?.cpc, c.currency)}</td>
                        <td>{n0(c.m?.conversions)}</td>
                        <td><CampaignActions c={c} onDone={reload} /></td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
      <History tick={tick} />
    </>
  );
}

function Stat({ l, v }: { l: string; v: string }) {
  return (
    <div className="panel stat">
      <span className="hi" style={{ color: "var(--navy)", borderColor: "var(--navy)" }}><Icon n="money" s={18} /></span>
      <div><b>{v}</b><span className="sub">{l}</span></div>
    </div>
  );
}

function ConnectAds() {
  const { org } = useApp();
  const d = useAds(7);
  const [msg, setMsg] = useState<[string, boolean] | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.get("connected")) setMsg([(q.get("already") ? "כבר מחובר: " : "חובר: ") + zName(q.get("connected")!), false]);
    else if (q.get("error")) setMsg(["החיבור לא הושלם: " + (q.get("error_message") || q.get("error")), true]);
    else if (q.get("zernio") === "fail") setMsg(["Zernio החזיר שגיאה: " + (q.get("reason") || ""), true]);
  }, []);
  const accs: Row[] = d?.adAccounts || [];
  const href = (p: string, force = false) => "/api/zernio/connect?mode=ads&org=" + encodeURIComponent(org) + "&platform=" + p + (force ? "&force=1" : "");
  return (
    <div className="grid g2b">
      <Panel icon="link" title="חשבונות מודעות מחוברים">
        {msg ? <p className="tiny lead" style={{ color: msg[1] ? "var(--bad)" : "var(--ok)", fontWeight: 600 }}>{msg[0]}</p> : null}
        {!d ? <p className="tiny">טוען…</p> : !accs.length ? <Empty>עוד לא חובר חשבון מודעות</Empty> : accs.map((a) => (
          <div key={a.id} className="set-card adacc">
            <span><b>{zName(a.platform)}</b><span className="tiny" style={{ display: "block" }}>{a.name || a.username}</span></span>
            <St cls={a.active ? "ok" : "bad"}>{a.active ? "מחובר" : "צריך חיבור מחדש"}</St>
          </div>
        ))}
        <p className="tiny" style={{ marginBottom: 0 }}>העמודים עצמם (לפוסטים ולנתונים) מתחברים ב<Link href={CONNECT_HREF}>הגדרות &gt; חיבורים &gt; רשתות חברתיות</Link>.</p>
      </Panel>
      <Panel icon="target" title="חיבור חשבון מודעות">
        {AD_NETS.map(([id, l, note]) => (
          <div key={id} className="set-card">
            <div className="adacc"><b>{l}</b>
              <span className="bar">
                <a className="btn sm primary" href={href(id)}><Icon n="link" s={14} />חיבור</a>
                <a className="btn sm ghost" href={href(id, true)} title="מתחיל את ההתחברות מחדש גם אם כבר מחובר">התחברות מחדש</a>
              </span>
            </div>
            <span className="tiny">{note}</span>
          </div>
        ))}
        <p className="tiny" style={{ marginBottom: 0 }}>החיבור עובר דרך Zernio. ההרשאה היא לקריאת הקמפיינים ולניהול מודעות; שום כסף לא יוצא בלי פעולה שאתה מאשר כאן.</p>
      </Panel>
    </div>
  );
}

const ACTIONS: Record<string, string> = { boost: "קידום פוסט", create: "מודעה חדשה", "create:validate": "בדיקה", status: "הפעלה / השהיה", budget: "שינוי תקציב" };
function History({ tick }: { tick: number }) {
  const { org } = useApp();
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    sb().from("crm_ad_launches").select("id,action,name,ok,result,request,created_at").eq("org_id", org).order("created_at", { ascending: false }).limit(15)
      .then(({ data }: { data: Row[] | null }) => setRows(data || []));
  }, [org, tick]);
  if (!rows?.length) return null;
  return (
    <Panel icon="list" title="פעולות אחרונות מה-CRM">
      {rows.map((r) => (
        <div key={r.id} className="lrow">
          <St cls={r.ok ? "ok" : "bad"}>{r.ok ? "בוצע" : "נכשל"}</St>
          <span className="grow"><b dir="auto">{r.name || "-"}</b>
            <span className="meta">{ACTIONS[r.action] || r.action} · {fmtDate(r.created_at)}{r.action === "status" && r.request?.status ? " · " + (r.request.status === "active" ? "הופעל" : "הושהה") : ""}{r.action === "budget" && r.request?.budget ? " · " + r.request.budget.amount : ""}{!r.ok && r.result?.error ? " · " + String(r.result.error).slice(0, 160) : ""}</span></span>
        </div>
      ))}
    </Panel>
  );
}
