"use client";
/* live numbers of the business's own pages, read through Zernio (accounts connected in
   settings > connections > social networks). Shared by the social screen and the ads screen. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Panel, Empty, St } from "@/components/Shell";
import Icon from "@/components/Icon";
import { useApp } from "@/components/AppCtx";
import { fmtDate, type Row } from "@/lib/crm";

export const Z_NAMES: Record<string, string> = {
  facebook: "פייסבוק", instagram: "אינסטגרם", tiktok: "טיקטוק", linkedin: "לינקדאין", youtube: "יוטיוב",
  metaads: "מודעות מטא", tiktokads: "מודעות טיקטוק", googleads: "Google Ads", linkedinads: "מודעות לינקדאין",
};
export const zName = (p: string) => Z_NAMES[p] || p;
export const CONNECT_HREF = "/settings/connections?tab=" + encodeURIComponent("רשתות חברתיות");
export const n0 = (v: unknown) => (typeof v === "number" && isFinite(v) ? Math.round(v).toLocaleString("he-IL") : "-");

function delta(cur: unknown, prev: unknown) {
  if (typeof cur !== "number" || typeof prev !== "number" || prev === 0) return null;
  return Math.round(((cur - prev) / prev) * 100);
}
function Kpi({ l, v, d, sub }: { l: string; v: string; d?: number | null; sub?: string }) {
  return (
    <div className="panel stat">
      <span className="hi" style={{ color: "var(--navy)", borderColor: "var(--navy)" }}><Icon n="pulse" s={18} /></span>
      <div>
        <b>{v}{d != null && d !== 0 ? <span className={d > 0 ? "up" : "dn"} dir="ltr" style={{ fontSize: 13, marginInlineStart: 8, color: d > 0 ? "var(--ok)" : "var(--bad)" }}>{(d > 0 ? "+" : "") + d + "%"}</span> : null}</b>
        <span className="sub">{l}</span>{sub ? <span className="sub tiny">{sub}</span> : null}
      </div>
    </div>
  );
}

const RANGES: [number, string][] = [[7, "7 ימים"], [30, "30 יום"], [90, "90 יום"]];

export function SocialLive() {
  const { org } = useApp();
  const [days, setDays] = useState(30);
  const [d, setD] = useState<Row | null>(null);
  const [metric, setMetric] = useState("reach");
  useEffect(() => {
    setD(null);
    fetch("/api/zernio/analytics?org=" + encodeURIComponent(org) + "&days=" + days)
      .then((r) => r.json()).then(setD).catch(() => setD({ error: "load" }));
  }, [org, days]);

  if (!d) return <div className="loading" style={{ minHeight: 200 }}>טוען נתונים מהרשתות…</div>;
  if (d.configured === false) return <Panel icon="link" title="נתונים חיים"><p className="tiny">החיבור לרשתות עוד לא מוגדר בשרת.</p></Panel>;
  const accs: Row[] = d.accounts || [];
  if (!accs.length) return (
    <Panel icon="link" title="נתונים חיים">
      <Empty>עוד לא חוברו עמודים. <Link href={CONNECT_HREF}>לחיבור העמודים</Link></Empty>
    </Panel>
  );
  const dash: Row | null = d.dashboard;
  const t: Row = dash?.totals || {}, pt: Row = dash?.previousTotals || {};
  const daily: Row[] = dash?.daily || [];
  const followersBy: Row[] = dash?.followers?.byAccount || [];

  return (
    <>
      <div className="bar" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div className="bar">{RANGES.map(([n, l]) => <button key={n} className={"btn sm" + (days === n ? " on" : "")} onClick={() => setDays(n)}>{l}</button>)}</div>
        <span className="tiny">{dash?.dataAsOf ? "מעודכן ל-" + fmtDate(dash.dataAsOf) : "נתוני חשבון מתעדכנים פעם ביום"}</span>
      </div>

      <div className="socplats">
        {accs.map((a) => {
          const f = followersBy.find((x) => x.accountId === a.id);
          return (
            <section key={a.id} className="panel socplat">
              <div className="bar" style={{ justifyContent: "space-between" }}>
                <div className="bar">
                  {a.picture ? <img src={a.picture} alt="" width={32} height={32} style={{ borderRadius: "50%", objectFit: "cover" }} /> : null}
                  <div><h3 style={{ margin: 0 }}>{zName(a.platform)}</h3><span className="tiny">{a.name || a.username}</span></div>
                </div>
                <St cls={a.active ? "ok" : "bad"}>{a.active ? "מחובר" : "צריך חיבור מחדש"}</St>
              </div>
              <div className="socrow"><span>עוקבים</span><b>{n0(f?.current ?? a.followers)}
                {typeof f?.gained === "number" && f.gained !== 0 ? <span className={f.gained > 0 ? "up" : "dn"} dir="ltr" style={{ marginInlineStart: 6 }}>{(f.gained > 0 ? "+" : "") + f.gained.toLocaleString("he-IL")}</span> : null}</b></div>
              {a.url ? <a className="tiny" href={a.url} target="_blank" rel="noopener noreferrer">לעמוד ברשת</a> : null}
            </section>
          );
        })}
      </div>

      {!dash ? (
        <Panel icon="alert" title="חשיפה, מעורבות ופוסטים">
          {d.addon
            ? <p style={{ margin: 0 }}>מספרי העוקבים כבר כאן. חשיפה, צפיות, מעורבות והפוסטים החזקים דורשים את תוספת ה-Analytics בחשבון ה-Zernio. מפעילים אותה בחשבון שלך ב-<a href="https://zernio.com/dashboard" target="_blank" rel="noopener noreferrer">zernio.com</a>, והנתונים יופיעו כאן לבד.</p>
            : <p style={{ margin: 0 }}>הנתונים המפורטים לא נטענו{d.analyticsError ? ": " + d.analyticsError : ""}.</p>}
        </Panel>
      ) : (
        <>
          <div className="grid g4">
            <Kpi l="חשיפה (Reach)" v={n0(t.reach)} d={delta(t.reach, pt.reach)} />
            <Kpi l="הופעות (Impressions)" v={n0(t.impressions)} d={delta(t.impressions, pt.impressions)} />
            <Kpi l="צפיות" v={n0(t.views)} d={delta(t.views, pt.views)} />
            <Kpi l="אחוז מעורבות" v={typeof t.engagementRate === "number" ? t.engagementRate.toFixed(1) + "%" : "-"}
              sub={"לייקים " + n0(t.likes) + " · תגובות " + n0(t.comments) + " · שיתופים " + n0(t.shares)} />
          </div>
          <span className="tiny">השינוי באחוזים הוא מול התקופה הקודמת באותו אורך.</span>
          <div className="grid g2">
            <Panel icon="trend" title="יום אחרי יום" right={
              <select className="inp sm" style={{ width: "auto" }} value={metric} onChange={(e) => setMetric(e.target.value)}>
                <option value="reach">חשיפה</option><option value="impressions">הופעות</option><option value="views">צפיות</option><option value="engagement">מעורבות</option><option value="followersGained">עוקבים חדשים</option>
              </select>}>
              {daily.length < 2 ? <Empty>אין מספיק ימים עם נתונים</Empty> : <DayChart rows={daily} k={metric} />}
            </Panel>
            <Panel icon="star" title="הפוסטים החזקים בתקופה">
              {!(d.posts || []).length ? <Empty>אין פוסטים בתקופה</Empty> : (d.posts as Row[]).map((p) => (
                <div key={p.id + p.platform} className="lrow">
                  {p.thumb ? <img src={p.thumb} alt="" width={44} height={44} style={{ borderRadius: 8, objectFit: "cover", flex: "none" }} /> : null}
                  <span className="grow">
                    <b dir="auto" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.url ? <a href={p.url} target="_blank" rel="noopener noreferrer">{p.content || "פוסט"}</a> : p.content || "פוסט"}</b>
                    <span className="meta">{zName(p.platform)}{p.at ? " · " + fmtDate(p.at) : ""} · חשיפה {n0(p.m?.reach)} · לייקים {n0(p.m?.likes)} · תגובות {n0(p.m?.comments)}</span>
                  </span>
                </div>
              ))}
            </Panel>
          </div>
        </>
      )}
    </>
  );
}

function DayChart({ rows, k }: { rows: Row[]; k: string }) {
  const [hov, setHov] = useState<string | null>(null);
  const s = rows.map((r) => ({ key: String(r.date || ""), v: Number(r[k]) || 0 }));
  const max = Math.max(1, ...s.map((x) => x.v));
  const h = s.find((x) => x.key === hov);
  const step = Math.ceil(s.length / 10);
  return (
    <div className="fchart">
      <div className="fplot" style={{ height: 180 }}>
        <div className="fbars">
          {s.map((x) => (
            <button key={x.key} className="fcol" onMouseEnter={() => setHov(x.key)} onMouseLeave={() => setHov(null)} onFocus={() => setHov(x.key)} onBlur={() => setHov(null)} aria-label={fmtDate(x.key) + ": " + n0(x.v)}>
              <span className="b in" style={{ height: (x.v / max) * 100 + "%", width: "70%", maxWidth: 22 }} />
            </button>
          ))}
        </div>
        {h ? <div className="ftip"><b>{fmtDate(h.key)}</b><span>{n0(h.v)}</span></div> : null}
      </div>
      <div className="flabels">{s.map((x, i) => <span key={x.key}>{i % step === 0 ? x.key.slice(8, 10) + "/" + x.key.slice(5, 7) : ""}</span>)}</div>
    </div>
  );
}
