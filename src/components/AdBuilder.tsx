"use client";
/* campaign builder for Meta (Facebook and Instagram) through Zernio: boost an existing post or
   create a new ad with an image from the gallery. Nothing is sent without an explicit confirm. */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Panel, Empty, St } from "@/components/Shell";
import Icon from "@/components/Icon";
import { useApp } from "@/components/AppCtx";
import { fmtDate, type Row } from "@/lib/crm";
import { GraphicPicker } from "@/components/Graphics";
import { CONNECT_HREF, zName } from "@/components/SocialLive";
import { AD_CTAS, AD_GENDERS, AD_GOALS } from "@/lib/ads";

type Pick = { id: string; name: string; radius?: number };
const pad = (n: number) => String(n).padStart(2, "0");
const local = (d: Date) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());

export function AdBuilder({ onDone }: { onDone: () => void }) {
  const { org, toast } = useApp();
  const [kind, setKind] = useState<"boost" | "create">("boost");
  const [accs, setAccs] = useState<Row[] | null>(null);
  const [accountId, setAccountId] = useState("");
  const [setup, setSetup] = useState<Row | null>(null);
  const [adAccountId, setAdAccountId] = useState("");
  const [postId, setPostId] = useState("");
  const [goal, setGoal] = useState("engagement");
  const [ad, setAd] = useState({ headline: "", body: "", description: "", imageUrl: "", linkUrl: "", cta: "LEARN_MORE" });
  const [boostLink, setBoostLink] = useState({ linkUrl: "", cta: "" });
  const [cities, setCities] = useState<Pick[]>([]);
  const [interests, setInterests] = useState<Pick[]>([]);
  const [ageMin, setAgeMin] = useState(18);
  const [ageMax, setAgeMax] = useState(65);
  const [gender, setGender] = useState("all");
  const [budgetType, setBudgetType] = useState<"daily" | "lifetime">("daily");
  const [budget, setBudget] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [name, setName] = useState("");
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState("");
  const [check, setCheck] = useState<Row | null>(null);

  useEffect(() => {
    fetch("/api/zernio/accounts?org=" + encodeURIComponent(org)).then((r) => r.json()).then((j) => {
      const list = ((j.accounts || []) as Row[]).filter((a) => a.platform === "facebook" || a.platform === "instagram");
      setAccs(list);
      if (list.length) setAccountId((list.find((a) => a.platform === "facebook") || list[0]).id);
    }).catch(() => setAccs([]));
  }, [org]);
  useEffect(() => {
    if (!accountId) return;
    setSetup(null); setPostId(""); setAdAccountId("");
    fetch("/api/zernio/ads/setup?org=" + encodeURIComponent(org) + "&accountId=" + encodeURIComponent(accountId)).then((r) => r.json()).then((j) => {
      setSetup(j);
      const usable = ((j.adAccounts || []) as Row[]).filter((a) => a.selectable);
      if (usable.length === 1) setAdAccountId(usable[0].id);
    }).catch(() => setSetup({ error: "load" }));
  }, [org, accountId]);

  const acc = accs?.find((a) => a.id === accountId);
  const adAcc: Row | undefined = (setup?.adAccounts || []).find((a: Row) => a.id === adAccountId);
  const cur = adAcc?.currency || "";
  const post: Row | undefined = (setup?.posts || []).find((p: Row) => p.id === postId);
  const autoName = useMemo(() => (kind === "boost" ? "קידום פוסט" : "מודעה") + " · " + (AD_GOALS.find((g) => g[0] === goal)?.[1] || "") + " · " + fmtDate(new Date().toISOString()), [kind, goal]);
  const amount = Number(budget);

  const problems: string[] = [];
  if (!acc) problems.push("בוחרים עמוד");
  if (!adAccountId) problems.push("בוחרים חשבון מודעות");
  if (kind === "boost" && !postId) problems.push("בוחרים פוסט לקידום");
  if (kind === "boost" && goal === "traffic" && (!boostLink.linkUrl || !boostLink.cta)) problems.push("לתנועה לאתר: קישור וכפתור");
  if (kind === "create" && (!ad.headline.trim() || !ad.body.trim())) problems.push("כותרת וטקסט למודעה");
  if (kind === "create" && !ad.imageUrl) problems.push("תמונה למודעה");
  if (kind === "create" && !/^https?:\/\//.test(ad.linkUrl)) problems.push("קישור למודעה");
  if (!(amount > 0)) problems.push("תקציב");
  if (adAcc?.minDaily && budgetType === "daily" && amount > 0 && amount < adAcc.minDaily) problems.push("תקציב יומי מינימלי בחשבון: " + adAcc.minDaily + " " + cur);
  if (budgetType === "lifetime" && !end) problems.push("תאריך סיום לתקציב כולל");

  const payload = (validate: boolean) => ({
    org, kind, validate, accountId, adsVia: setup?.adsVia || "", adAccountId, name: name.trim() || autoName, goal,
    budgetAmount: amount, budgetType, start, end, paused,
    audience: { cities, interests, ageMin, ageMax, gender },
    ...(kind === "boost" ? { postId, linkUrl: boostLink.linkUrl.trim(), cta: boostLink.cta } : { ad: { ...ad, headline: ad.headline.trim(), body: ad.body.trim(), linkUrl: ad.linkUrl.trim() } }),
  });
  async function send(validate: boolean) {
    if (problems.length) return toast("חסר: " + problems.join(", "), true);
    if (!validate) {
      const sum = (budgetType === "daily" ? amount + " " + cur + " ליום" : amount + " " + cur + " לכל התקופה") + (end ? " עד " + fmtDate(end) : " בלי תאריך סיום");
      if (!confirm((paused ? "ליצור את הקמפיין במצב מושהה?" : "להעלות את הקמפיין לאוויר עכשיו?") + "\n\nתקציב: " + sum + "\nחשבון מודעות: " + (adAcc?.name || adAccountId) + "\n\nהחיוב הוא בחשבון המודעות שלך במטא.")) return;
    }
    setBusy(validate ? "בודק…" : "שולח…"); setCheck(null);
    const r = await fetch("/api/zernio/ads/launch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload(validate)) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy("");
    if (!r || !r.ok) { setCheck({ ok: false, error: j.error || (r ? r.status : "אין חיבור") }); return toast("לא עבר: " + (j.error || (r ? r.status : "")), true); }
    if (validate) { setCheck({ ok: true, ...j }); return toast(j.note || "הבדיקה עברה"); }
    toast(paused ? "הקמפיין נוצר במצב מושהה" : "הקמפיין נשלח למטא ועובר בדיקה שלהם");
    onDone();
  }

  if (!accs) return <div className="loading" style={{ minHeight: 200 }}>טוען…</div>;
  if (!accs.length) return <Panel icon="link" title="קמפיין חדש"><Empty>צריך קודם לחבר עמוד פייסבוק או אינסטגרם. <Link href={CONNECT_HREF}>לחיבור</Link></Empty></Panel>;

  return (
    <div className="grid g2b">
      <div className="col">
        <Panel icon="target" title="1. מה מקדמים">
          <div className="bar" style={{ flexWrap: "wrap" }}>
            <button className={"btn" + (kind === "boost" ? " on" : "")} onClick={() => setKind("boost")}><Icon n="repeat" s={15} />קידום פוסט קיים</button>
            <button className={"btn" + (kind === "create" ? " on" : "")} onClick={() => { setKind("create"); if (goal === "video_views") setGoal("traffic"); }}><Icon n="plus" s={15} />מודעה חדשה</button>
          </div>
          <div className="form" style={{ marginTop: 12 }}>
            <label className="field"><span>עמוד</span>
              <select className="inp" value={accountId} onChange={(e) => setAccountId(e.target.value)}>{accs.map((a) => <option key={a.id} value={a.id}>{zName(a.platform)} · {a.name || a.username}</option>)}</select></label>
            <label className="field"><span>חשבון מודעות</span>
              {!setup ? <span className="tiny">טוען…</span> : !(setup.adAccounts || []).length
                ? <span className="tiny" style={{ color: "var(--bad)" }}>לא נמצא חשבון מודעות. מחברים בלשונית &quot;חיבור חשבון מודעות&quot;{setup.adsError ? " (" + setup.adsError + ")" : ""}</span>
                : <select className="inp" value={adAccountId} onChange={(e) => setAdAccountId(e.target.value)}>
                    <option value="">בחירה…</option>
                    {(setup.adAccounts as Row[]).map((a) => <option key={a.id} value={a.id} disabled={!a.selectable}>{a.name || a.id} · {a.currency}{!a.selectable ? " (לא זמין)" : ""}</option>)}
                  </select>}
            </label>
            {adAcc && adAcc.billing === "missing" ? <p className="tiny full" style={{ color: "var(--bad)", margin: 0 }}>לחשבון המודעות אין אמצעי תשלום. מוסיפים אותו במנהל המודעות של מטא, אחרת המודעה לא תרוץ.</p> : null}
          </div>

          {kind === "boost" ? (
            <>
              <span className="tiny" style={{ display: "block", marginTop: 12 }}>בוחרים פוסט:</span>
              {!setup ? null : !(setup.posts || []).length ? <Empty>{setup.postsError ? "הפוסטים לא נטענו: " + setup.postsError : "לא נמצאו פוסטים בעמוד"}</Empty> : (
                <div className="gal" style={{ marginTop: 6 }}>
                  {(setup.posts as Row[]).map((p) => (
                    <button key={p.id} className={"galit" + (postId === p.id ? " on" : "")} onClick={() => setPostId(p.id)} title={p.text}>
                      {p.picture ? <img src={p.picture} alt="" loading="lazy" /> : <span className="tiny" dir="auto" style={{ aspectRatio: "1", display: "grid", placeItems: "center", padding: 6 }}>{p.text || "פוסט"}</span>}
                      <span className="tiny">{p.at ? fmtDate(p.at) : ""}{p.type ? " · " + p.type : ""}</span>
                    </button>
                  ))}
                </div>
              )}
              {post ? <p className="tiny" dir="auto" style={{ marginBottom: 0 }}>{post.text}{post.url ? <> · <a href={post.url} target="_blank" rel="noopener noreferrer">לפוסט</a></> : null}</p> : null}
            </>
          ) : (
            <div className="form" style={{ marginTop: 12 }}>
              <label className="field full"><span>טקסט המודעה (מעל התמונה)</span><textarea className="inp" rows={4} dir="auto" value={ad.body} onChange={(e) => setAd({ ...ad, body: e.target.value })} /></label>
              <label className="field full"><span>כותרת (מתחת לתמונה)</span><input className="inp" dir="auto" maxLength={255} value={ad.headline} onChange={(e) => setAd({ ...ad, headline: e.target.value })} /></label>
              <label className="field full"><span>תיאור קצר (לא חובה)</span><input className="inp" dir="auto" value={ad.description} onChange={(e) => setAd({ ...ad, description: e.target.value })} /></label>
              <label className="field full"><span>קישור לתמונה</span><input className="inp ltr" value={ad.imageUrl} onChange={(e) => setAd({ ...ad, imageUrl: e.target.value })} placeholder="https://" /></label>
              <GraphicPicker value={ad.imageUrl} onPick={(u) => setAd({ ...ad, imageUrl: u })} />
              <label className="field"><span>לאן לוחצים</span><input className="inp ltr" value={ad.linkUrl} onChange={(e) => setAd({ ...ad, linkUrl: e.target.value })} placeholder="https://" /></label>
              <label className="field"><span>כפתור</span><select className="inp" value={ad.cta} onChange={(e) => setAd({ ...ad, cta: e.target.value })}>{AD_CTAS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            </div>
          )}
        </Panel>

        <Panel icon="flag" title="2. מטרה">
          {AD_GOALS.filter((g) => kind === "boost" || g[0] !== "video_views").map(([k, l, d]) => (
            <label key={k} className="set-card" style={{ cursor: "pointer", display: "flex", gap: 10, alignItems: "flex-start" }}>
              <input type="radio" name="goal" checked={goal === k} onChange={() => setGoal(k)} />
              <span><b>{l}</b><span className="tiny" style={{ display: "block" }}>{d}</span></span>
            </label>
          ))}
          {kind === "boost" && goal === "traffic" ? (
            <div className="form" style={{ marginTop: 8 }}>
              <label className="field"><span>קישור</span><input className="inp ltr" value={boostLink.linkUrl} onChange={(e) => setBoostLink({ ...boostLink, linkUrl: e.target.value })} placeholder="https://" /></label>
              <label className="field"><span>כפתור</span><select className="inp" value={boostLink.cta} onChange={(e) => setBoostLink({ ...boostLink, cta: e.target.value })}><option value="">בחירה…</option>{AD_CTAS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            </div>
          ) : null}
        </Panel>
      </div>

      <div className="col">
        <Panel icon="user" title="3. קהל">
          <AudienceSearch kind="city" label="ערים (ריק = כל ישראל)" org={org} accountId={setup?.adsVia || accountId} adAccountId={adAccountId} picks={cities} setPicks={setCities} radius />
          <AudienceSearch kind="interest" label="תחומי עניין (לא חובה)" org={org} accountId={setup?.adsVia || accountId} adAccountId={adAccountId} picks={interests} setPicks={setInterests} />
          <div className="form" style={{ marginTop: 10 }}>
            <label className="field"><span>גיל מ-</span><input className="inp" type="number" min={18} max={65} value={ageMin} onChange={(e) => setAgeMin(Number(e.target.value))} /></label>
            <label className="field"><span>עד</span><input className="inp" type="number" min={18} max={65} value={ageMax} onChange={(e) => setAgeMax(Number(e.target.value))} /></label>
            <label className="field"><span>מגדר</span><select className="inp" value={gender} onChange={(e) => setGender(e.target.value)}>{AD_GENDERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          </div>
          <p className="tiny" style={{ marginBottom: 0 }}>65 בשדה &quot;עד&quot; כולל גם את מי שמעל 65. המיקום, המיקומים ברשתות והשפה נשארים אוטומטיים של מטא.</p>
        </Panel>

        <Panel icon="money" title="4. תקציב וזמנים">
          <div className="form">
            <label className="field"><span>סוג תקציב</span><select className="inp" value={budgetType} onChange={(e) => setBudgetType(e.target.value as "daily" | "lifetime")}><option value="daily">יומי</option><option value="lifetime">כולל לכל התקופה</option></select></label>
            <label className="field"><span>סכום{cur ? " (" + cur + ")" : ""}</span><input className="inp" type="number" min={1} step="1" value={budget} onChange={(e) => setBudget(e.target.value)} /></label>
            <label className="field"><span>התחלה (ריק = מיד)</span><input className="inp" type="datetime-local" min={local(new Date())} value={start} onChange={(e) => setStart(e.target.value)} /></label>
            <label className="field"><span>סיום{budgetType === "lifetime" ? " (חובה)" : " (לא חובה)"}</span><input className="inp" type="datetime-local" min={start || local(new Date())} value={end} onChange={(e) => setEnd(e.target.value)} /></label>
            <label className="field full"><span>שם הקמפיין</span><input className="inp" dir="auto" value={name} onChange={(e) => setName(e.target.value)} placeholder={autoName} /></label>
          </div>
          {adAcc?.minDaily ? <p className="tiny" style={{ marginBottom: 0 }}>תקציב יומי מינימלי בחשבון הזה: {adAcc.minDaily} {cur}.</p> : null}
          {adAcc?.tz ? <p className="tiny" style={{ marginBottom: 0 }}>השעות לפי אזור הזמן של חשבון המודעות: {adAcc.tz}.</p> : null}
        </Panel>

        <Panel icon="send" title="5. שליחה">
          {problems.length ? <p className="tiny" style={{ marginTop: 0 }}>חסר: {problems.join(" · ")}</p> : <p className="tiny" style={{ marginTop: 0, color: "var(--ok)" }}>הכל מוכן.</p>}
          <label className="bar" style={{ cursor: "pointer" }}><input type="checkbox" checked={paused} onChange={(e) => setPaused(e.target.checked)} /><span>ליצור במצב מושהה, ולהפעיל אחר כך מרשימת הקמפיינים</span></label>
          <div className="bar" style={{ marginTop: 12, flexWrap: "wrap" }}>
            {kind === "create" ? <button className="btn" disabled={!!busy} onClick={() => send(true)}><Icon n="check" s={15} />בדיקה מול מטא בלי ליצור</button> : null}
            <button className="btn primary" disabled={!!busy} onClick={() => send(false)}><Icon n="send" s={15} />{busy || (paused ? "יצירה במצב מושהה" : "העלאה לאוויר")}</button>
          </div>
          {check ? (
            <div className="set-card" style={{ marginTop: 12 }}>
              <b style={{ color: check.ok ? "var(--ok)" : "var(--bad)" }}>{check.ok ? "הבדיקה עברה" : "מטא החזירה שגיאה"}</b>
              <span className="tiny" dir="auto">{check.ok ? (check.message || check.note || "") : String(check.error)}</span>
              {Array.isArray(check.results) ? <span className="tiny">{(check.results as Row[]).map((r) => r.node + ": " + r.status + (r.reason ? " (" + r.reason + ")" : "")).join(" · ")}</span> : null}
            </div>
          ) : null}
          <p className="tiny" style={{ marginBottom: 0 }}>אחרי השליחה מטא בודקת את המודעה, לרוב תוך זמן קצר. החיוב הוא בחשבון המודעות שלך במטא, וכל פעולה נשמרת בהיסטוריה.</p>
        </Panel>
      </div>
    </div>
  );
}

function AudienceSearch({ kind, label, org, accountId, adAccountId, picks, setPicks, radius }: {
  kind: "city" | "interest"; label: string; org: string; accountId: string; adAccountId: string; picks: Pick[]; setPicks: (p: Pick[]) => void; radius?: boolean;
}) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Row[]>([]);
  const [err, setErr] = useState("");
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (t.current) clearTimeout(t.current);
    if (q.trim().length < 2 || !accountId) { setRes([]); return; }
    t.current = setTimeout(async () => {
      const r = await fetch("/api/zernio/ads/targeting?" + new URLSearchParams({ org, accountId, adAccountId, kind, q: q.trim() })).catch(() => null);
      const j = r ? await r.json().catch(() => ({})) : {};
      setErr(r && r.ok ? "" : j.error || "החיפוש נכשל");
      setRes(j.results || []);
    }, 350);
  }, [q, org, accountId, adAccountId, kind]);
  return (
    <div style={{ marginBottom: 10 }}>
      <label className="field"><span>{label}</span><input className="inp" dir="auto" value={q} onChange={(e) => setQ(e.target.value)} placeholder={kind === "city" ? "לדוגמה: תל אביב" : "לדוגמה: שיווק דיגיטלי"} /></label>
      {err ? <span className="tiny" style={{ color: "var(--bad)" }}>{err}</span> : null}
      {res.length ? (
        <div className="pills" style={{ marginTop: 6 }}>
          {res.filter((r) => !picks.some((p) => p.id === r.id)).map((r) => (
            <button key={r.id} className="pillck" onClick={() => { setPicks([...picks, { id: r.id, name: r.name, ...(radius ? { radius: 17 } : {}) }]); setQ(""); setRes([]); }} title={r.path}>
              <Icon n="plus" s={12} /> {r.name}{r.size ? <span className="tiny"> · {Number(r.size).toLocaleString("he-IL")}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
      {picks.length ? (
        <div style={{ marginTop: 6 }}>
          {picks.map((p) => (
            <div key={p.id} className="lrow">
              <span className="grow"><b>{p.name}</b></span>
              {radius ? <label className="tiny bar">רדיוס ק&quot;מ <input className="inp sm" type="number" min={17} max={80} style={{ width: 70 }} value={p.radius || 17} onChange={(e) => setPicks(picks.map((x) => (x.id === p.id ? { ...x, radius: Number(e.target.value) } : x)))} /></label> : null}
              <button className="btn icon sm ghost" title="הסרה" onClick={() => setPicks(picks.filter((x) => x.id !== p.id))}><Icon n="x" s={14} /></button>
            </div>
          ))}
          {radius ? <span className="tiny">מטא דורשת רדיוס של 17 ק&quot;מ לפחות סביב עיר.</span> : null}
        </div>
      ) : null}
    </div>
  );
}

/* status switch and budget edit for one campaign row */
export function CampaignActions({ c, onDone }: { c: Row; onDone: () => void }) {
  const { org, toast } = useApp();
  const [busy, setBusy] = useState(false);
  const call = async (body: Row, okMsg: string) => {
    setBusy(true);
    const r = await fetch("/api/zernio/ads/campaign", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ org, campaignId: c.id, ...body }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r || !r.ok) return toast("לא בוצע: " + (j.error || (r ? r.status : "")), true);
    toast(okMsg); onDone();
  };
  const toggle = () => {
    const on = c.status === "active";
    if (!confirm(on ? "להשהות את \"" + c.name + "\"?" : "להפעיל את \"" + c.name + "\"? הוא יתחיל להוציא כסף לפי התקציב שלו.")) return;
    call({ action: "status", status: on ? "paused" : "active" }, on ? "הושהה" : "הופעל");
  };
  const budget = () => {
    if (c.budgetLevel === "adset") return toast("התקציב של הקמפיין הזה מוגדר ברמת קבוצת המודעות. משנים אותו במנהל המודעות", true);
    const cur = c.budget?.amount ? String(c.budget.amount) : "";
    const v = prompt("תקציב " + (c.budget?.type === "lifetime" ? "כולל" : "יומי") + " חדש" + (c.currency ? " (" + c.currency + ")" : ""), cur);
    if (v == null) return;
    const n = Number(v);
    if (!(n > 0)) return toast("סכום לא תקין", true);
    if (!confirm("לשנות את התקציב ל-" + n + " " + (c.currency || "") + "?")) return;
    call({ action: "budget", amount: n, type: c.budget?.type === "lifetime" ? "lifetime" : "daily" }, "התקציב עודכן");
  };
  const canToggle = c.status === "active" || c.status === "paused";
  return (
    <span className="bar" style={{ flexWrap: "nowrap" }}>
      {canToggle ? <button className="btn sm" disabled={busy} onClick={toggle}>{c.status === "active" ? "השהיה" : "הפעלה"}</button> : <St>{"-"}</St>}
      {c.budget ? <button className="btn sm ghost" disabled={busy} onClick={budget}>תקציב</button> : null}
    </span>
  );
}
