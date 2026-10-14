"use client";
/* סושיאל: the weekly snapshot of the business's own networks, recommendations for next week,
   trends in the niche and the platforms' official updates. Written by the weekly scan; read here. */
import { useEffect, useMemo, useState } from "react";
import { sb } from "@/lib/supabase/browser";
import { Top, Panel, Empty, St } from "@/components/Shell";
import Icon from "@/components/Icon";
import { useApp } from "@/components/AppCtx";
import { fmtDate, today, type Row } from "@/lib/crm";
import { SocialLive } from "@/components/SocialLive";

const TABS = ["נתונים חיים", "סקירה", "המלצות לשבוע", "טרנדים ולהיטים", "עדכוני פלטפורמות", "מה לסרוק"] as const;
type Tab = (typeof TABS)[number];
const PLATFORMS = ["אינסטגרם", "פייסבוק", "טיקטוק"] as const;
const PRIO_CLS: Record<string, string> = { "גבוה": "bad", "בינוני": "warn", "נמוך": "info" };
const n0 = (v: unknown) => (typeof v === "number" ? v.toLocaleString("he-IL") : v == null || v === "" ? "-" : String(v));
const sign = (v: unknown, suffix = "") => (typeof v === "number" && v !== 0 ? (v > 0 ? "+" : "") + v.toLocaleString("he-IL") + suffix : "");
const local = (x: Date) => x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
const addDays = (d: string, n: number) => { const x = new Date(d + "T12:00:00"); x.setDate(x.getDate() + n); return local(x); };
const nextSunday = () => { const d = new Date(); d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7)); return local(d); };

export default function Social() {
  const { org, toast } = useApp();
  const [tab, setTab] = useState<Tab>("נתונים חיים");
  const [data, setData] = useState<{ reports: Row[]; snaps: Row[]; watch: Row[]; req: Row | null; social: Row } | null>(null);
  const [wi, setWi] = useState(0); // which report (0 = latest)

  const load = async () => {
    const [r, s, w, q, st] = await Promise.all([
      sb().from("crm_social_reports").select("*").order("week_start", { ascending: false }).limit(12),
      sb().from("crm_social_snapshots").select("*").order("week_start", { ascending: true }).limit(200),
      sb().from("crm_social_watch").select("*").order("created_at"),
      sb().from("crm_social_requests").select("*").is("done_at", null).order("requested_at", { ascending: false }).limit(1),
      sb().from("crm_settings").select("social").eq("org_id", org).single(),
    ]);
    setData({ reports: r.data || [], snaps: s.data || [], watch: w.data || [], req: (q.data || [])[0] || null, social: (st.data?.social as Row) || {} });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [org]);

  const rep = data?.reports[wi] || null;
  async function scanNow() {
    if (data?.req) return toast("כבר יש בקשה פתוחה. הסריקה תרוץ בבוקר הקרוב");
    const { error } = await sb().from("crm_social_requests").insert({ org_id: org });
    if (error) return toast(error.message, true);
    toast("הבקשה נשלחה. הסריקה תרוץ בבוקר הקרוב, או מיד אם תבקש ממני בצ'אט");
    load();
  }

  return (
    <>
      <Top title="סושיאל" sub={rep ? "סריקה אחרונה: " + fmtDate(rep.scanned_at) + " · הבאה: ראשון " + fmtDate(nextSunday()) : "סריקה אוטומטית כל ראשון בבוקר"}
        right={<div className="bar">
          <button className="btn" onClick={scanNow} disabled={!!data?.req}><Icon n="repeat" s={16} />{data?.req ? "סריקה בתור" : "סריקה עכשיו"}</button>
          <button className="btn primary" onClick={() => setTab("המלצות לשבוע")}><Icon n="star" s={16} />המלצות השבוע</button>
        </div>} />
      <div className="content">
        <div className="tabs">{TABS.map((t) => <button key={t} className={"btn sm" + (tab === t ? " on" : "")} onClick={() => setTab(t)}>{t}</button>)}</div>
        {data && data.reports.length > 1 && tab !== "מה לסרוק" && tab !== "נתונים חיים" ? (
          <div className="bar">
            <span className="tiny">שבוע:</span>
            <select className="inp sm" style={{ width: "auto" }} value={wi} onChange={(e) => setWi(Number(e.target.value))}>
              {data.reports.map((r, i) => <option key={r.id} value={i}>{fmtDate(r.week_start)} - {fmtDate(addDays(r.week_start, 6))}</option>)}
            </select>
          </div>
        ) : null}
        {!data ? <div className="loading" style={{ minHeight: 200 }}>טוען…</div>
          : tab === "נתונים חיים" ? <SocialLive />
          : tab === "מה לסרוק" ? <Watch data={data} reload={load} />
          : !rep ? <FirstRun />
          : tab === "סקירה" ? <Overview rep={rep} snaps={data.snaps} />
          : tab === "המלצות לשבוע" ? <Recs rep={rep} reload={load} />
          : tab === "טרנדים ולהיטים" ? <Trends rep={rep} />
          : <Updates rep={rep} />}
      </div>
    </>
  );
}

function FirstRun() {
  return (
    <Panel icon="pulse" title="עוד אין סריקה">
      <p style={{ margin: 0 }}>הסריקה הראשונה תרוץ אחרי שהרשתות יחוברו ל-Supermetrics. אחר כך היא רצה לבד כל ראשון בבוקר.</p>
      <p className="tiny" style={{ marginBottom: 0 }}>בינתיים אפשר להגדיר בלשונית &quot;מה לסרוק&quot; את החשבונות שלך, חשבונות לעקוב אחריהם והאשטגים.</p>
    </Panel>
  );
}

/* ---------- overview ---------- */
const METRIC_ROWS: Record<string, [string, string, string?][]> = {
  "אינסטגרם": [["followers", "עוקבים", "followers_change"], ["reach", "חשיפה בשבוע", "reach_change_pct"], ["engagement_rate", "אחוז מעורבות", "engagement_change"], ["posts", "פוסטים השבוע"]],
  "פייסבוק": [["followers", "עוקבים", "followers_change"], ["reach", "חשיפה בשבוע", "reach_change_pct"], ["engagement_rate", "אחוז מעורבות", "engagement_change"], ["posts", "פוסטים השבוע"]],
  "טיקטוק": [["followers", "עוקבים", "followers_change"], ["views", "צפיות בשבוע", "views_change_pct"], ["avg_watch_sec", "זמן צפייה ממוצע (שנ')"], ["posts", "סרטונים השבוע"]],
};
const CHART_METRICS: [string, string][] = [["reach", "חשיפה"], ["views", "צפיות"], ["followers", "עוקבים"], ["engagement_rate", "מעורבות %"]];

function Overview({ rep, snaps }: { rep: Row; snaps: Row[] }) {
  const week = snaps.filter((s) => s.week_start === rep.week_start);
  const [plat, setPlat] = useState<string>(PLATFORMS[0]);
  const [metric, setMetric] = useState("reach");
  const series = useMemo(() => snaps.filter((s) => s.platform === plat && s.week_start <= rep.week_start).slice(-12)
    .map((s) => ({ key: s.week_start, v: Number(s.metrics?.[metric]) || 0, has: s.metrics?.[metric] != null })), [snaps, plat, metric, rep.week_start]);
  const top: Row[] = week.flatMap((s): Row[] => (Array.isArray(s.top_posts) ? s.top_posts.map((p: Row): Row => ({ ...p, platform: s.platform })) : [])).slice(0, 6);
  return (
    <>
      {rep.summary ? <div className="socsum"><Icon n="pulse" s={18} /><p>{rep.summary}</p></div> : null}
      <div className="socplats">
        {PLATFORMS.map((p) => {
          const s = week.find((x) => x.platform === p);
          const on = rep.sources?.[p];
          return (
            <section key={p} className="panel socplat">
              <div className="bar" style={{ justifyContent: "space-between" }}><h3>{p}</h3><St cls={on ? "ok" : ""}>{on ? "מחובר" : "לא מחובר"}</St></div>
              {s ? METRIC_ROWS[p].map(([k, l, ch]) => {
                const v = s.metrics?.[k];
                const c = ch ? s.metrics?.[ch] : null;
                const pct = ch?.endsWith("_pct");
                return (
                  <div key={k} className="socrow"><span>{l}</span>
                    <b>{k === "engagement_rate" && typeof v === "number" ? v.toFixed(1) + "%" : n0(v)}
                      {typeof c === "number" && c !== 0 ? <span className={c > 0 ? "up" : "dn"} dir="ltr" style={{ marginInlineStart: 6 }}>{sign(c, pct ? "%" : "")}</span> : null}</b></div>
                );
              }) : <span className="tiny">{on ? "אין נתונים לשבוע הזה" : "מחברים את הרשת ב-Supermetrics, והנתונים יופיעו בסריקה הבאה"}</span>}
            </section>
          );
        })}
      </div>
      <div className="grid g2">
        <Panel icon="trend" title="לאורך זמן" right={<div className="bar">
          <select className="inp sm" style={{ width: "auto" }} value={plat} onChange={(e) => setPlat(e.target.value)}>{PLATFORMS.map((p) => <option key={p}>{p}</option>)}</select>
          <select className="inp sm" style={{ width: "auto" }} value={metric} onChange={(e) => setMetric(e.target.value)}>{CHART_METRICS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </div>}>
          {series.filter((x) => x.has).length < 2 ? <Empty>הגרף מתמלא משבוע לשבוע. אחרי שתי סריקות יופיעו כאן עמודות.</Empty> : <WeekChart series={series} pct={metric === "engagement_rate"} />}
        </Panel>
        <Panel icon="star" title="הפוסטים החזקים של השבוע">
          {!top.length ? <Empty>אין עדיין</Empty> : top.map((p, i) => (
            <div key={i} className="lrow">
              <span className="grow"><b>{p.url ? <a href={p.url} target="_blank" rel="noopener noreferrer">{p.title || "פוסט"}</a> : p.title || "פוסט"}</b>
                <span className="meta">{p.platform}{p.type ? " · " + p.type : ""}{p.metric_label ? " · " + p.metric_label : ""}</span></span>
            </div>
          ))}
        </Panel>
      </div>
    </>
  );
}

function WeekChart({ series, pct }: { series: { key: string; v: number; has: boolean }[]; pct: boolean }) {
  const [hov, setHov] = useState<string | null>(null);
  const max = Math.max(1, ...series.map((s) => s.v));
  const h = series.find((s) => s.key === hov);
  const fmt = (v: number) => (pct ? v.toFixed(1) + "%" : v.toLocaleString("he-IL"));
  return (
    <div className="fchart">
      <div className="fplot" style={{ height: 180 }}>
        <div className="fbars">
          {series.map((s) => (
            <button key={s.key} className="fcol" onMouseEnter={() => setHov(s.key)} onMouseLeave={() => setHov(null)} onFocus={() => setHov(s.key)} onBlur={() => setHov(null)}
              aria-label={"שבוע " + fmtDate(s.key) + ": " + fmt(s.v)}>
              <span className="b in" style={{ height: (s.v / max) * 100 + "%", width: "60%", maxWidth: 30 }} />
            </button>
          ))}
        </div>
        {h ? <div className="ftip"><b>שבוע {fmtDate(h.key)}</b><span>{fmt(h.v)}</span></div> : null}
      </div>
      <div className="flabels">{series.map((s) => <span key={s.key}>{s.key.slice(8, 10) + "/" + s.key.slice(5, 7)}</span>)}</div>
    </div>
  );
}

/* ---------- recommendations ---------- */
function Recs({ rep, reload }: { rep: Row; reload: () => void }) {
  const { org, toast } = useApp();
  const list: Row[] = Array.isArray(rep.recommendations) ? rep.recommendations : [];
  async function toTask(r: Row, i: number) {
    const start = rep.week_start < today() ? today() : rep.week_start;
    const { data, error } = await sb().from("crm_tasks").insert({
      org_id: org, title: r.title, description: [r.why, r.platform ? "פלטפורמה: " + r.platform : "", r.source_url || ""].filter(Boolean).join("\n"),
      start_date: start, due_date: addDays(start, 5), source: "סושיאל",
    }).select("id").single();
    if (error) return toast(error.message, true);
    const next = list.map((x, k) => (k === i ? { ...x, task_id: data.id } : x));
    await sb().from("crm_social_reports").update({ recommendations: next }).eq("id", rep.id);
    toast("נוספה משימה");
    reload();
  }
  return (
    <Panel icon="star" title={"המלצות לשבוע של " + fmtDate(rep.week_start)}>
      {!list.length ? <Empty>אין המלצות בסריקה הזאת</Empty> : list.map((r, i) => (
        <div key={r.id || i} className="socrec">
          <St cls={PRIO_CLS[r.priority] || ""}>{r.priority || "המלצה"}</St>
          <div className="grow">
            <b>{r.title}</b>
            {r.why ? <span className="meta">{r.why}</span> : null}
            <span className="meta">{r.platform || "כל הרשתות"}{r.source_url ? <> · <a href={r.source_url} target="_blank" rel="noopener noreferrer">מקור</a></> : null}</span>
          </div>
          {r.task_id ? <St cls="ok">במשימות</St> : <button className="btn sm" onClick={() => toTask(r, i)}><Icon n="plus" s={14} />למשימות</button>}
        </div>
      ))}
    </Panel>
  );
}

/* ---------- trends ---------- */
function Trends({ rep }: { rep: Row }) {
  const list: Row[] = Array.isArray(rep.trends) ? rep.trends : [];
  const tags = list.filter((t) => t.kind === "האשטג");
  const rest = list.filter((t) => t.kind !== "האשטג");
  return (
    <>
      {!rest.length && !tags.length ? <Empty>אין טרנדים בסריקה הזאת</Empty> : null}
      <div className="soctrends">
        {rest.map((t, i) => (
          <section key={i} className="panel soctrend">
            <div className="bar" style={{ justifyContent: "space-between" }}><St cls="gold">{t.kind || "טרנד"}</St><span className="tiny">{t.platform}</span></div>
            <b>{t.url ? <a href={t.url} target="_blank" rel="noopener noreferrer">{t.title}</a> : t.title}</b>
            {t.metric ? <span className="meta">{t.metric}</span> : null}
            {t.why ? <p><span className="tiny">למה זה עבד: </span>{t.why}</p> : null}
            {t.adapt ? <p className="socadapt"><span className="tiny">איך להתאים אצלך: </span>{t.adapt}</p> : null}
          </section>
        ))}
      </div>
      {tags.length ? <Panel icon="tag" title="האשטגים שעולים">
        <div className="pills">{tags.map((t, i) => <span key={i} className="pillck">{t.title}{t.metric ? <span className="tiny"> · {t.metric}</span> : null}</span>)}</div>
      </Panel> : null}
    </>
  );
}

/* ---------- official updates + rules ---------- */
function Updates({ rep }: { rep: Row }) {
  const ups: Row[] = Array.isArray(rep.updates) ? rep.updates : [];
  const rules: Row = rep.rules || {};
  return (
    <>
      <Panel icon="flag" title="מה השתנה השבוע" right={<span className="tiny">מהמקורות הרשמיים בלבד</span>}>
        {!ups.length ? <Empty>לא נמצאו עדכונים רשמיים השבוע</Empty> : (
          <div className="socups">{ups.map((u, i) => (
            <div key={i} className="socup">
              <div className="bar" style={{ justifyContent: "space-between" }}><St cls="info">{u.platform}</St>
                <span className="tiny">{u.url ? <a href={u.url} target="_blank" rel="noopener noreferrer">{u.source || "מקור"}</a> : u.source}{u.date ? " · " + fmtDate(u.date) : ""}</span></div>
              <b>{u.change}</b>
              {u.meaning ? <p className="socadapt"><span className="tiny">מה זה אומר לך: </span>{u.meaning}</p> : null}
            </div>
          ))}</div>
        )}
      </Panel>
      <div className="socplats">
        {PLATFORMS.map((p) => {
          const r = rules[p];
          return (
            <Panel key={p} icon="list" title={"חוקי המשחק · " + p} right={r?.updated ? <span className="tiny">עודכן {fmtDate(r.updated)}</span> : undefined}>
              {!r?.items?.length ? <Empty>יתמלא בסריקה הבאה</Empty> : (
                <ul className="socrules">{r.items.map((it: Row, i: number) => (
                  <li key={i}>{it.rule}{it.url ? <> <a href={it.url} target="_blank" rel="noopener noreferrer" className="tiny">מקור</a></> : null}</li>
                ))}</ul>
              )}
            </Panel>
          );
        })}
      </div>
    </>
  );
}

/* ---------- what to scan ---------- */
function Watch({ data, reload }: { data: { watch: Row[]; social: Row; reports: Row[] }; reload: () => void }) {
  const { org, toast } = useApp();
  const [niche, setNiche] = useState<string>(data.social.niche || "");
  const sources: Row = data.reports[0]?.sources || {};
  async function saveNiche() {
    const { error } = await sb().from("crm_settings").update({ social: { ...data.social, niche: niche.trim() } }).eq("org_id", org);
    if (error) return toast(error.message, true);
    toast("נשמר"); reload();
  }
  async function del(id: string) {
    const { error } = await sb().from("crm_social_watch").delete().eq("id", id);
    if (error) return toast(error.message, true);
    reload();
  }
  const group = (kind: string) => data.watch.filter((w) => w.kind === kind);
  return (
    <div className="grid g2">
      <div className="col">
        <Panel icon="user" title="החשבונות שלך">
          <p className="tiny" style={{ marginTop: 0 }}>החשבונות שהסריקה מושכת מהם נתונים. שם המשתמש בדיוק כמו ברשת.</p>
          <WatchList rows={group("mine")} onDel={del} />
          <AddWatch kind="mine" org={org} onDone={reload} placeholder="@simple.solution" />
        </Panel>
        <Panel icon="eye" title="חשבונות לעקוב אחריהם" right={<span className="tiny">{group("account").length} מתוך 10</span>}>
          <p className="tiny" style={{ marginTop: 0 }}>מתחרים והשראה. הסריקה בודקת מה עבד אצלם השבוע.</p>
          <WatchList rows={group("account")} onDel={del} />
          {group("account").length < 10 ? <AddWatch kind="account" org={org} onDone={reload} placeholder="@שם_חשבון" /> : null}
        </Panel>
      </div>
      <div className="col">
        <Panel icon="target" title="התחום שלך">
          <div className="bar">
            <input className="inp" style={{ flex: 1 }} value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="לדוגמה: שיווק דיגיטלי לעסקים קטנים" />
            <button className="btn primary" disabled={niche.trim() === (data.social.niche || "")} onClick={saveNiche}>שמירה</button>
          </div>
        </Panel>
        <Panel icon="tag" title="האשטגים ומילות מפתח">
          <WatchList rows={group("hashtag")} onDel={del} hash />
          <AddWatch kind="hashtag" org={org} onDone={reload} placeholder="שיווקדיגיטלי" />
        </Panel>
        <Panel icon="link" title="מצב החיבורים">
          {PLATFORMS.map((p) => (
            <div key={p} className="lrow"><span className="grow">{p}</span><St cls={sources[p] ? "ok" : ""}>{sources[p] ? "מחובר" : data.reports.length ? "לא מחובר" : "ייבדק בסריקה הראשונה"}</St></div>
          ))}
          <p className="tiny" style={{ marginBottom: 0 }}>החיבור עצמו נעשה ב-Supermetrics. המצב מתעדכן בכל סריקה.</p>
        </Panel>
      </div>
    </div>
  );
}

function WatchList({ rows, onDel, hash }: { rows: Row[]; onDel: (id: string) => void; hash?: boolean }) {
  if (!rows.length) return <Empty>אין עדיין</Empty>;
  return <>{rows.map((w) => (
    <div key={w.id} className="lrow">
      <span className="grow"><b dir="auto" style={{ unicodeBidi: "plaintext" }}>{hash ? "#" + w.value : w.value}</b><span className="meta">{w.platform}</span></span>
      <button className="btn icon sm ghost" title="הסרה" onClick={() => onDel(w.id)}><Icon n="x" s={15} /></button>
    </div>
  ))}</>;
}

function AddWatch({ kind, org, onDone, placeholder }: { kind: string; org: string; onDone: () => void; placeholder: string }) {
  const { toast } = useApp();
  const [platform, setPlatform] = useState<string>(PLATFORMS[0]);
  const [value, setValue] = useState("");
  async function add() {
    const v = value.trim().replace(/^#/, "");
    if (!v) return;
    const { error } = await sb().from("crm_social_watch").insert({ org_id: org, kind, platform, value: v });
    if (error) return toast(error.message, true);
    setValue(""); onDone();
  }
  return (
    <div className="socadd">
      <select className="inp sm" value={platform} onChange={(e) => setPlatform(e.target.value)}>{PLATFORMS.map((p) => <option key={p}>{p}</option>)}</select>
      <input className="inp sm" dir="auto" value={value} placeholder={placeholder} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
      <button className="btn sm" onClick={add}><Icon n="plus" s={14} />הוספה</button>
    </div>
  );
}
