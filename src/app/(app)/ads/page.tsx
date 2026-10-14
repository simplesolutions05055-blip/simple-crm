"use client";
/* מודעות: the ad accounts of the business (through Zernio), its campaigns with spend and results,
   and the graphics studio for creatives. Read only for now: creating campaigns and changing budgets
   from here is the next stage. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Top, Panel, Empty, St } from "@/components/Shell";
import Icon from "@/components/Icon";
import { useApp } from "@/components/AppCtx";
import { type Row } from "@/lib/crm";
import { GraphicsStudio } from "@/components/Graphics";
import { CONNECT_HREF, n0, zName } from "@/components/SocialLive";

const TABS = ["קמפיינים", "גרפיקות", "חיבור חשבון מודעות"] as const;
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
        {tab === "קמפיינים" ? <Campaigns goConnect={() => setTab("חיבור חשבון מודעות")} /> : tab === "גרפיקות" ? <GraphicsStudio /> : <ConnectAds />}
      </div>
    </>
  );
}

function useAds(days: number) {
  const { org } = useApp();
  const [d, setD] = useState<Row | null>(null);
  useEffect(() => {
    setD(null);
    fetch("/api/zernio/ads?org=" + encodeURIComponent(org) + "&days=" + days).then((r) => r.json()).then(setD).catch(() => setD({ error: "load" }));
  }, [org, days]);
  return d;
}

function Campaigns({ goConnect }: { goConnect: () => void }) {
  const [days, setDays] = useState(30);
  const d = useAds(days);
  if (!d) return <div className="loading" style={{ minHeight: 200 }}>טוען קמפיינים…</div>;
  if (d.configured === false) return <Panel icon="link" title="קמפיינים"><p className="tiny">החיבור ל-Zernio עוד לא מוגדר בשרת.</p></Panel>;
  if (d.error && !d.adAccounts) return <Panel icon="alert" title="קמפיינים"><p className="tiny">לא נטען: {d.error}</p></Panel>;
  if (!(d.adAccounts || []).length) return (
    <Panel icon="target" title="עוד לא חובר חשבון מודעות">
      <p style={{ marginTop: 0 }}>אחרי החיבור יופיעו כאן כל הקמפיינים מהחשבון, גם אלה שנוצרו במנהל המודעות, עם הוצאה, חשיפות, קליקים ועלות לקליק.</p>
      <button className="btn primary" onClick={goConnect}><Icon n="link" s={15} />לחיבור חשבון מודעות</button>
    </Panel>
  );
  const list: Row[] = d.campaigns || [];
  const cur = list.find((c) => c.currency)?.currency || "";
  const sum = (k: string) => list.reduce((a, c) => a + (Number(c.m?.[k]) || 0), 0);
  const spend = sum("spend"), clicks = sum("clicks"), impressions = sum("impressions");
  return (
    <>
      <div className="bar" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div className="bar">{RANGES.map(([n, l]) => <button key={n} className={"btn sm" + (days === n ? " on" : "")} onClick={() => setDays(n)}>{l}</button>)}</div>
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
                  <thead><tr><th>קמפיין</th><th>רשת</th><th>מצב</th><th>תקציב</th><th>הוצאה</th><th>חשיפות</th><th>קליקים</th><th>CTR</th><th>עלות לקליק</th><th>המרות</th></tr></thead>
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
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
      <Panel icon="flag" title="מה מגיע בשלב הבא">
        <ul className="socrules" style={{ margin: 0 }}>
          <li>קידום פוסט קיים בלחיצה: תקציב יומי, משך וקהל.</li>
          <li>יצירת קמפיין חדש עם גרפיקה מהגלריה וטקסט המודעה.</li>
          <li>השהיה, הפעלה ושינוי תקציב לקמפיין קיים, עם אישור לפני כל פעולה שעולה כסף.</li>
        </ul>
      </Panel>
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
