"use client";
/* campaign builder for Meta (Facebook and Instagram) and TikTok through Zernio: boost an existing post or
   create a new ad (Meta: image from the gallery; TikTok: a video). Nothing is sent without an explicit confirm. */
import { useEffect, useMemo, useRef, useState } from "react";
import { sb } from "@/lib/supabase/browser";
import Link from "next/link";
import { Panel, Empty, St } from "@/components/Shell";
import Icon from "@/components/Icon";
import { useApp } from "@/components/AppCtx";
import { fmtDate, type Row } from "@/lib/crm";
import { GraphicPicker } from "@/components/Graphics";
import { CONNECT_HREF, zName } from "@/components/SocialLive";
import { AD_CTAS, AD_GENDERS, AD_GOALS, LEAD_QUESTIONS, waLink } from "@/lib/ads";

export type Pick = { id: string; name: string; radius?: number; type?: string };
type Net = "meta" | "tiktok";
const NET_PLATS: Record<Net, string[]> = { meta: ["facebook", "instagram"], tiktok: ["tiktok", "tiktokads"] };
const pad = (n: number) => String(n).padStart(2, "0");
const local = (d: Date) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());

export function AdBuilder({ onDone }: { onDone: () => void }) {
  const { org, toast } = useApp();
  const [net, setNet] = useState<Net>("meta");
  const [kind, setKind] = useState<"boost" | "create">("boost");
  const [identities, setIdentities] = useState<Row[]>([]);
  const [identity, setIdentity] = useState("");
  const [uploading, setUploading] = useState(false);
  const [accs, setAccs] = useState<Row[] | null>(null);
  const [accountId, setAccountId] = useState("");
  const [setup, setSetup] = useState<Row | null>(null);
  const [adAccountId, setAdAccountId] = useState("");
  const [postId, setPostId] = useState("");
  const [goal, setGoal] = useState("engagement");
  const [ad, setAd] = useState({ headline: "", body: "", description: "", imageUrl: "", videoUrl: "", linkUrl: "", cta: "LEARN_MORE" });
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
  const [leadFormId, setLeadFormId] = useState("");
  const [wa, setWa] = useState({ phone: "", text: "", greeting: "" });

  useEffect(() => {
    fetch("/api/zernio/accounts?org=" + encodeURIComponent(org)).then((r) => r.json()).then((j) => {
      setAccs(((j.accounts || []) as Row[]).filter((a) => [...NET_PLATS.meta, ...NET_PLATS.tiktok].includes(a.platform)));
    }).catch(() => setAccs([]));
  }, [org]);
  const shown = (accs || []).filter((a) => NET_PLATS[net].includes(a.platform));
  /* switching network picks its first account (the posting one before the ads-only one) */
  useEffect(() => {
    const first = shown.find((a) => a.platform === "facebook" || a.platform === "tiktok") || shown[0];
    setAccountId(first ? first.id : "");
    setCities([]); setInterests([]); setPostId(""); setCheck(null); setLeadFormId("");
    if (!AD_GOALS.find((g) => g[0] === goal)?.[3].includes(net)) setGoal("engagement");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [net, accs]);
  useEffect(() => {
    setIdentities([]); setIdentity("");
    if (net !== "tiktok" || !accountId || !adAccountId) return;
    fetch("/api/zernio/ads/setup?" + new URLSearchParams({ org, accountId, adAccountId })).then((r) => r.json())
      .then((j) => setIdentities(j.identities || [])).catch(() => {});
  }, [net, org, accountId, adAccountId]);
  useEffect(() => {
    if (!accountId) { setSetup(null); return; }
    setSetup(null); setPostId(""); setAdAccountId("");
    fetch("/api/zernio/ads/setup?org=" + encodeURIComponent(org) + "&accountId=" + encodeURIComponent(accountId)).then((r) => r.json()).then((j) => {
      setSetup(j);
      const usable = ((j.adAccounts || []) as Row[]).filter((a) => a.selectable);
      if (usable.length === 1) setAdAccountId(usable[0].id);
    }).catch(() => setSetup({ error: "load" }));
  }, [org, accountId]);

  const acc = shown.find((a) => a.id === accountId);
  const tk = net === "tiktok";
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
  if (kind === "create" && (!ad.body.trim() || (!tk && !ad.headline.trim()))) problems.push(tk ? "טקסט למודעה" : "כותרת וטקסט למודעה");
  if (kind === "create" && !tk && !ad.imageUrl) problems.push("תמונה למודעה");
  if (kind === "create" && tk && !ad.videoUrl) problems.push("סרטון למודעה");
  const noLink = goal === "whatsapp" || goal === "lead_generation";
  if (kind === "create" && !noLink && !/^https?:\/\//.test(ad.linkUrl)) problems.push("קישור למודעה");
  if (goal === "lead_generation" && !leadFormId) problems.push("טופס לידים");
  if (goal === "whatsapp" && wa.phone.trim() && !/^\+\d{9,15}$/.test(wa.phone.replace(/[^\d+]/g, ""))) problems.push("מספר וואטסאפ בפורמט +972...");
  if (!(amount > 0)) problems.push("תקציב");
  if (adAcc?.minDaily && budgetType === "daily" && amount > 0 && amount < adAcc.minDaily) problems.push("תקציב יומי מינימלי בחשבון: " + adAcc.minDaily + " " + cur);
  if (budgetType === "lifetime" && !end) problems.push("תאריך סיום לתקציב כולל");

  const payload = (validate: boolean) => ({
    org, kind, validate, accountId, adsVia: setup?.adsVia || "", adAccountId, name: name.trim() || autoName, goal,
    budgetAmount: amount, budgetType, start, end, paused,
    audience: { cities, interests, ageMin, ageMax, gender },
    ...(kind === "boost" ? { postId, linkUrl: boostLink.linkUrl.trim(), cta: boostLink.cta } : { ad: { ...ad, headline: ad.headline.trim(), body: ad.body.trim(), linkUrl: ad.linkUrl.trim() } }),
    ...(tk && identity ? { identityId: identity, identityType: identities.find((i) => i.id === identity)?.type || "" } : {}),
    ...(goal === "lead_generation" ? { leadFormId } : {}),
    ...(goal === "whatsapp" ? { waPhone: wa.phone.trim(), waText: wa.text.trim(), waGreeting: wa.greeting.trim() } : {}),
  });
  async function uploadVideo(f: File | undefined) {
    if (!f) return;
    if (!/^video\/(mp4|quicktime)$/.test(f.type)) return toast("רק קובץ MP4 או MOV", true);
    if (f.size > 50 * 1024 * 1024) return toast("עד 50MB. קובץ גדול יותר מעלים לאחסון אחר ומדביקים קישור", true);
    setUploading(true);
    const path = org + "/video-" + crypto.randomUUID() + (f.type === "video/quicktime" ? ".mov" : ".mp4");
    const { error } = await sb().storage.from("crm-graphics").upload(path, f, { contentType: f.type, upsert: false });
    setUploading(false);
    if (error) return toast("ההעלאה נכשלה: " + error.message, true);
    setAd((x) => ({ ...x, videoUrl: sb().storage.from("crm-graphics").getPublicUrl(path).data.publicUrl }));
    toast("הסרטון הועלה");
  }
  async function send(validate: boolean) {
    if (problems.length) return toast("חסר: " + problems.join(", "), true);
    if (!validate) {
      const sum = (budgetType === "daily" ? amount + " " + cur + " ליום" : amount + " " + cur + " לכל התקופה") + (end ? " עד " + fmtDate(end) : " בלי תאריך סיום");
      if (!confirm((paused ? "ליצור את הקמפיין במצב מושהה?" : "להעלות את הקמפיין לאוויר עכשיו?") + "\n\nתקציב: " + sum + "\nחשבון מודעות: " + (adAcc?.name || adAccountId) + "\n\nהחיוב הוא בחשבון המודעות שלך ב" + (tk ? "טיקטוק" : "מטא") + ".")) return;
    }
    setBusy(validate ? "בודק…" : "שולח…"); setCheck(null);
    const r = await fetch("/api/zernio/ads/launch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload(validate)) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy("");
    if (!r || !r.ok) { setCheck({ ok: false, error: j.error || (r ? r.status : "אין חיבור") }); return toast("לא עבר: " + (j.error || (r ? r.status : "")), true); }
    if (validate) { setCheck({ ok: true, ...j }); return toast(j.note || "הבדיקה עברה"); }
    toast(paused ? "הקמפיין נוצר במצב מושהה" : "הקמפיין נשלח ל" + (tk ? "טיקטוק" : "מטא") + " ועובר בדיקה שלהם");
    onDone();
  }

  if (!accs) return <div className="loading" style={{ minHeight: 200 }}>טוען…</div>;
  return (
    <>
    <div className="bar" style={{ flexWrap: "wrap" }}>
      <span className="tiny">רשת:</span>
      <button className={"btn sm" + (net === "meta" ? " on" : "")} onClick={() => setNet("meta")}>מטא (פייסבוק ואינסטגרם)</button>
      <button className={"btn sm" + (net === "tiktok" ? " on" : "")} onClick={() => setNet("tiktok")}>טיקטוק</button>
    </div>
    {!shown.length ? (
      <Panel icon="link" title="קמפיין חדש">
        <Empty>{tk
          ? <>לא מחובר חשבון טיקטוק. מחברים את <Link href={CONNECT_HREF}>חשבון הטיקטוק</Link> (לקידום סרטונים קיימים) ואת חשבון המודעות בלשונית &quot;חיבור חשבון מודעות&quot;.</>
          : <>צריך קודם לחבר עמוד פייסבוק או אינסטגרם. <Link href={CONNECT_HREF}>לחיבור</Link></>}</Empty>
      </Panel>
    ) : (
    <div className="grid g2b">
      <div className="col">
        <Panel icon="target" title="1. מה מקדמים">
          <div className="bar" style={{ flexWrap: "wrap" }}>
            <button className={"btn" + (kind === "boost" ? " on" : "")} onClick={() => setKind("boost")}><Icon n="repeat" s={15} />{tk ? "קידום סרטון קיים (Spark)" : "קידום פוסט קיים"}</button>
            <button className={"btn" + (kind === "create" ? " on" : "")} onClick={() => { setKind("create"); if (goal === "video_views") setGoal("traffic"); }}><Icon n="plus" s={15} />מודעה חדשה</button>
          </div>
          <div className="form" style={{ marginTop: 12 }}>
            <label className="field"><span>עמוד</span>
              <select className="inp" value={accountId} onChange={(e) => setAccountId(e.target.value)}>{shown.map((a) => <option key={a.id} value={a.id}>{zName(a.platform)} · {a.name || a.username}</option>)}</select></label>
            <label className="field"><span>חשבון מודעות</span>
              {!setup ? <span className="tiny">טוען…</span> : !(setup.adAccounts || []).length
                ? <span className="tiny" style={{ color: "var(--bad)" }}>לא נמצא חשבון מודעות. מחברים בלשונית &quot;חיבור חשבון מודעות&quot;{setup.adsError ? " (" + setup.adsError + ")" : ""}</span>
                : <select className="inp" value={adAccountId} onChange={(e) => setAdAccountId(e.target.value)}>
                    <option value="">בחירה…</option>
                    {(setup.adAccounts as Row[]).map((a) => <option key={a.id} value={a.id} disabled={!a.selectable}>{a.name || a.id} · {a.currency}{!a.selectable ? " (לא זמין)" : ""}</option>)}
                  </select>}
            </label>
            {adAcc && adAcc.billing === "missing" ? <p className="tiny full" style={{ color: "var(--bad)", margin: 0 }}>לחשבון המודעות אין אמצעי תשלום. מוסיפים אותו במנהל המודעות של {tk ? "טיקטוק" : "מטא"}, אחרת המודעה לא תרוץ.</p> : null}
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
          ) : tk ? (
            <div className="form" style={{ marginTop: 12 }}>
              <label className="field full"><span>טקסט המודעה (מופיע על הסרטון)</span><textarea className="inp" rows={3} dir="auto" maxLength={100} value={ad.body} onChange={(e) => setAd({ ...ad, body: e.target.value })} /></label>
              <label className="field full"><span>קישור לסרטון (MP4, אנכי 9:16 מומלץ)</span><input className="inp ltr" value={ad.videoUrl} onChange={(e) => setAd({ ...ad, videoUrl: e.target.value })} placeholder="https://" /></label>
              <label className="field full"><span>או העלאת סרטון מהמחשב (עד 50MB)</span><input type="file" accept="video/mp4,video/quicktime" disabled={uploading} onChange={(e) => uploadVideo(e.target.files?.[0])} /></label>
              {uploading ? <span className="tiny full">מעלה…</span> : null}
              {ad.videoUrl ? <video className="full" src={ad.videoUrl} controls muted style={{ maxHeight: 260, borderRadius: 10 }} /> : null}
              <label className="field"><span>לאן לוחצים</span><input className="inp ltr" value={ad.linkUrl} onChange={(e) => setAd({ ...ad, linkUrl: e.target.value })} placeholder="https://" /></label>
              <label className="field"><span>כפתור</span><select className="inp" value={ad.cta} onChange={(e) => setAd({ ...ad, cta: e.target.value })}>{AD_CTAS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
              <WaLinkHelper onLink={(u) => setAd({ ...ad, linkUrl: u, cta: "CONTACT_US" })} />
              {identities.length ? (
                <label className="field full"><span>המודעה תוצג בשם</span>
                  <select className="inp" value={identity} onChange={(e) => setIdentity(e.target.value)}>
                    <option value="">החשבון המחובר (ברירת מחדל)</option>
                    {identities.map((i) => <option key={i.id} value={i.id}>{i.name || i.username || i.id}{i.username ? " @" + i.username : ""}</option>)}
                  </select></label>
              ) : null}
            </div>
          ) : (
            <div className="form" style={{ marginTop: 12 }}>
              <label className="field full"><span>טקסט המודעה (מעל התמונה)</span><textarea className="inp" rows={4} dir="auto" value={ad.body} onChange={(e) => setAd({ ...ad, body: e.target.value })} /></label>
              <label className="field full"><span>כותרת (מתחת לתמונה)</span><input className="inp" dir="auto" maxLength={255} value={ad.headline} onChange={(e) => setAd({ ...ad, headline: e.target.value })} /></label>
              <label className="field full"><span>תיאור קצר (לא חובה)</span><input className="inp" dir="auto" value={ad.description} onChange={(e) => setAd({ ...ad, description: e.target.value })} /></label>
              <label className="field full"><span>קישור לתמונה</span><input className="inp ltr" value={ad.imageUrl} onChange={(e) => setAd({ ...ad, imageUrl: e.target.value })} placeholder="https://" /></label>
              <GraphicPicker value={ad.imageUrl} onPick={(u) => setAd({ ...ad, imageUrl: u })} />
              {goal === "whatsapp" ? <p className="tiny full" style={{ margin: 0 }}>במודעת וואטסאפ הכפתור הוא &quot;שליחת הודעה בוואטסאפ&quot;, ולכן אין צורך בקישור.</p> : <>
                <label className="field"><span>{goal === "lead_generation" ? "קישור לאתר (לא חובה)" : "לאן לוחצים"}</span><input className="inp ltr" value={ad.linkUrl} onChange={(e) => setAd({ ...ad, linkUrl: e.target.value })} placeholder="https://" /></label>
                <label className="field"><span>כפתור</span><select className="inp" value={ad.cta} onChange={(e) => setAd({ ...ad, cta: e.target.value })}>{AD_CTAS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
              </>}
            </div>
          )}
        </Panel>

        <Panel icon="flag" title="2. מטרה">
          {AD_GOALS.filter((g) => g[3].includes(net) && (kind === "boost" || g[0] !== "video_views")).map(([k, l, d]) => (
            <label key={k} className="set-card" style={{ cursor: "pointer", display: "flex", gap: 10, alignItems: "flex-start" }}>
              <input type="radio" name="goal" checked={goal === k} onChange={() => setGoal(k)} />
              <span><b>{l}</b><span className="tiny" style={{ display: "block" }}>{d}</span></span>
            </label>
          ))}
          {kind === "boost" && goal === "traffic" ? (
            <div className="form" style={{ marginTop: 8 }}>
              <label className="field"><span>קישור</span><input className="inp ltr" value={boostLink.linkUrl} onChange={(e) => setBoostLink({ ...boostLink, linkUrl: e.target.value })} placeholder="https://" /></label>
              <label className="field"><span>כפתור</span><select className="inp" value={boostLink.cta} onChange={(e) => setBoostLink({ ...boostLink, cta: e.target.value })}><option value="">בחירה…</option>{AD_CTAS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
              {tk ? <WaLinkHelper onLink={(u) => setBoostLink({ linkUrl: u, cta: "CONTACT_US" })} /> : null}
            </div>
          ) : null}
          {goal === "lead_generation" && accountId ? <LeadFormPicker org={org} accountId={accountId} value={leadFormId} onChange={setLeadFormId} /> : null}
          {goal === "whatsapp" ? (
            <div className="form" style={{ marginTop: 8 }}>
              <label className="field"><span>מספר הוואטסאפ (לא חובה)</span><input className="inp ltr" value={wa.phone} onChange={(e) => setWa({ ...wa, phone: e.target.value })} placeholder="+972501234567" /></label>
              <label className="field"><span>הודעת פתיחה מהעסק (לא חובה)</span><input className="inp" dir="auto" value={wa.greeting} onChange={(e) => setWa({ ...wa, greeting: e.target.value })} placeholder="היי, איך אפשר לעזור?" /></label>
              <label className="field full"><span>ההודעה שתופיע מוכנה לשליחה אצל הלקוח (לא חובה)</span><input className="inp" dir="auto" value={wa.text} onChange={(e) => setWa({ ...wa, text: e.target.value })} placeholder="היי, ראיתי את המודעה ואשמח לפרטים" /></label>
              <p className="tiny full" style={{ margin: 0 }}>המספר חייב להיות מחובר לעמוד הפייסבוק (בהגדרות העמוד, תחת WhatsApp). אם משאירים ריק, מטא בוחרת את המספר שמחובר לעמוד.</p>
            </div>
          ) : null}
        </Panel>
      </div>

      <div className="col">
        <Panel icon="user" title="3. קהל">
          <AudienceSearch kind="city" label={tk ? "אזורים וערים (ריק = כל ישראל)" : "ערים (ריק = כל ישראל)"} org={org} accountId={setup?.adsVia || accountId} adAccountId={adAccountId} picks={cities} setPicks={setCities} radius={!tk} />
          <AudienceSearch kind="interest" label="תחומי עניין (לא חובה)" org={org} accountId={setup?.adsVia || accountId} adAccountId={adAccountId} picks={interests} setPicks={setInterests} />
          <div className="form" style={{ marginTop: 10 }}>
            <label className="field"><span>גיל מ-</span><input className="inp" type="number" min={18} max={65} value={ageMin} onChange={(e) => setAgeMin(Number(e.target.value))} /></label>
            <label className="field"><span>עד</span><input className="inp" type="number" min={18} max={65} value={ageMax} onChange={(e) => setAgeMax(Number(e.target.value))} /></label>
            <label className="field"><span>מגדר</span><select className="inp" value={gender} onChange={(e) => setGender(e.target.value)}>{AD_GENDERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          </div>
          <p className="tiny" style={{ marginBottom: 0 }}>65 בשדה &quot;עד&quot; כולל גם את מי שמעל 65. המיקומים ברשת והשפה נשארים אוטומטיים של {tk ? "טיקטוק" : "מטא"}.</p>
        </Panel>

        <Panel icon="money" title="4. תקציב וזמנים">
          <div className="form">
            <label className="field"><span>סוג תקציב</span><select className="inp" value={budgetType} onChange={(e) => setBudgetType(e.target.value as "daily" | "lifetime")}><option value="daily">יומי</option><option value="lifetime">כולל לכל התקופה</option></select></label>
            <label className="field"><span>סכום{cur ? " (" + cur + ")" : ""}</span><input className="inp" type="number" min={1} step="1" value={budget} onChange={(e) => setBudget(e.target.value)} /></label>
            <label className="field"><span>התחלה (ריק = מיד)</span><input className="inp" type="datetime-local" min={local(new Date())} value={start} onChange={(e) => setStart(e.target.value)} /></label>
            <label className="field"><span>סיום{budgetType === "lifetime" ? " (חובה)" : " (לא חובה)"}</span><input className="inp" type="datetime-local" min={start || local(new Date())} value={end} onChange={(e) => setEnd(e.target.value)} /></label>
            <label className="field full"><span>שם הקמפיין</span><input className="inp" dir="auto" value={name} onChange={(e) => setName(e.target.value)} placeholder={autoName} /></label>
          </div>
          {adAcc?.minDaily ? <p className="tiny" style={{ marginBottom: 0 }}>תקציב יומי מינימלי בחשבון הזה: {adAcc.minDaily} {cur}.</p>
            : tk ? <p className="tiny" style={{ marginBottom: 0 }}>בטיקטוק יש תקציב מינימלי לקבוצת מודעות (לפי התיעוד של Zernio, 20 דולר או הסכום המקביל במטבע החשבון). סכום נמוך יותר יחזור עם שגיאה.</p> : null}
          {adAcc?.tz ? <p className="tiny" style={{ marginBottom: 0 }}>השעות לפי אזור הזמן של חשבון המודעות: {adAcc.tz}.</p> : null}
        </Panel>

        <Panel icon="send" title="5. שליחה">
          {problems.length ? <p className="tiny" style={{ marginTop: 0 }}>חסר: {problems.join(" · ")}</p> : <p className="tiny" style={{ marginTop: 0, color: "var(--ok)" }}>הכל מוכן.</p>}
          <label className="bar" style={{ cursor: "pointer" }}><input type="checkbox" checked={paused} onChange={(e) => setPaused(e.target.checked)} /><span>ליצור במצב מושהה, ולהפעיל אחר כך מרשימת הקמפיינים</span></label>
          <div className="bar" style={{ marginTop: 12, flexWrap: "wrap" }}>
            {kind === "create" && !tk ? <button className="btn" disabled={!!busy} onClick={() => send(true)}><Icon n="check" s={15} />בדיקה מול מטא בלי ליצור</button> : null}
            <button className="btn primary" disabled={!!busy} onClick={() => send(false)}><Icon n="send" s={15} />{busy || (paused ? "יצירה במצב מושהה" : "העלאה לאוויר")}</button>
          </div>
          {check ? (
            <div className="set-card" style={{ marginTop: 12 }}>
              <b style={{ color: check.ok ? "var(--ok)" : "var(--bad)" }}>{check.ok ? "הבדיקה עברה" : (tk ? "טיקטוק החזירה שגיאה" : "מטא החזירה שגיאה")}</b>
              <span className="tiny" dir="auto">{check.ok ? (check.message || check.note || "") : String(check.error)}</span>
              {Array.isArray(check.results) ? <span className="tiny">{(check.results as Row[]).map((r) => r.node + ": " + r.status + (r.reason ? " (" + r.reason + ")" : "")).join(" · ")}</span> : null}
            </div>
          ) : null}
          <p className="tiny" style={{ marginBottom: 0 }}>אחרי השליחה {tk ? "טיקטוק בודקת" : "מטא בודקת"} את המודעה. החיוב הוא בחשבון המודעות שלך שם, וכל פעולה נשמרת בהיסטוריה.</p>
        </Panel>
      </div>
    </div>
    )}
    </>
  );
}

/* pick one of the page's Meta lead forms, or create a new one in place */
export function LeadFormPicker({ org, accountId, value, onChange }: { org: string; accountId: string; value: string; onChange: (id: string) => void }) {
  const { toast } = useApp();
  const [forms, setForms] = useState<Row[] | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ name: "", privacyPolicyUrl: "", websiteUrl: "", thankYouBody: "", questions: ["FULL_NAME", "PHONE", "EMAIL"] });
  const load = async (pickId = "") => {
    setErr("");
    const r = await fetch("/api/zernio/ads/leadforms?" + new URLSearchParams({ org, accountId })).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok) { setForms([]); setErr(j.error || "הטפסים לא נטענו"); return; }
    const list = (j.forms || []) as Row[];
    setForms(list);
    if (pickId) onChange(pickId);
    else if (!list.some((x) => x.id === value)) onChange(list.length === 1 ? list[0].id : "");
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setForms(null); load(); }, [org, accountId]);
  async function create() {
    if (!f.name.trim()) return toast("כותבים שם לטופס", true);
    if (!/^https:\/\//.test(f.privacyPolicyUrl.trim())) return toast("מטא דורשת קישור למדיניות פרטיות שמתחיל ב-https", true);
    setBusy(true);
    const r = await fetch("/api/zernio/ads/leadforms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ org, accountId, ...f, name: f.name.trim(), privacyPolicyUrl: f.privacyPolicyUrl.trim(), websiteUrl: f.websiteUrl.trim() }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r || !r.ok) return toast("הטופס לא נוצר: " + (j.error || (r ? r.status : "")), true);
    toast("הטופס נוצר"); setOpen(false);
    load(j.form?.id || "");
  }
  const toggleQ = (q: string) => setF({ ...f, questions: f.questions.includes(q) ? f.questions.filter((x) => x !== q) : [...f.questions, q] });
  return (
    <div className="set-card" style={{ marginTop: 8 }}>
      <b>טופס הלידים</b>
      {!forms ? <span className="tiny">טוען טפסים…</span> : (
        <div className="bar" style={{ flexWrap: "wrap", marginTop: 6 }}>
          {forms.length ? (
            <select className="inp" style={{ flex: 1, minWidth: 200 }} value={value} onChange={(e) => onChange(e.target.value)}>
              <option value="">בחירת טופס…</option>
              {forms.map((x) => <option key={x.id} value={x.id}>{x.name || x.id}{x.status && x.status !== "ACTIVE" ? " (" + x.status + ")" : ""}</option>)}
            </select>
          ) : <span className="tiny">{err || "עוד אין טפסים בעמוד הזה."}</span>}
          <button className="btn sm" onClick={() => setOpen(!open)}><Icon n="plus" s={14} />טופס חדש</button>
        </div>
      )}
      {open ? (
        <div className="form" style={{ marginTop: 10 }}>
          <label className="field"><span>שם הטופס (רק לך)</span><input className="inp" dir="auto" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="לדוגמה: ניהול קמפיין 50%" /></label>
          <label className="field"><span>קישור למדיניות הפרטיות (חובה)</span><input className="inp ltr" value={f.privacyPolicyUrl} onChange={(e) => setF({ ...f, privacyPolicyUrl: e.target.value })} placeholder="https://" /></label>
          <div className="field full"><span>מה שואלים (מטא ממלאת מהפרופיל, הלקוח רק מאשר)</span>
            <div className="bar" style={{ flexWrap: "wrap" }}>
              {LEAD_QUESTIONS.map(([k, l]) => <label key={k} className="bar tiny" style={{ cursor: "pointer" }}><input type="checkbox" checked={f.questions.includes(k)} onChange={() => toggleQ(k)} />{l}</label>)}
            </div>
          </div>
          <label className="field"><span>הודעת תודה (לא חובה)</span><input className="inp" dir="auto" value={f.thankYouBody} onChange={(e) => setF({ ...f, thankYouBody: e.target.value })} placeholder="נחזור אליך בהקדם." /></label>
          <label className="field"><span>כפתור לאתר בסוף (לא חובה)</span><input className="inp ltr" value={f.websiteUrl} onChange={(e) => setF({ ...f, websiteUrl: e.target.value })} placeholder="https://" /></label>
          <div className="full bar">
            <button className="btn primary" disabled={busy} onClick={create}>{busy ? "יוצר…" : "יצירת הטופס"}</button>
            <button className="btn ghost" onClick={() => setOpen(false)}>ביטול</button>
          </div>
        </div>
      ) : null}
      <span className="tiny" style={{ display: "block", marginTop: 6 }}>הלידים מהטופס נכנסים ללשונית &quot;לידים&quot; ב-CRM עם המקור &quot;קמפיין F&quot;.</span>
    </div>
  );
}

/* builds a wa.me link (TikTok has no WhatsApp ad type, so the link goes in the regular destination) */
function WaLinkHelper({ onLink }: { onLink: (url: string) => void }) {
  const { toast } = useApp();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [text, setText] = useState("");
  if (!open) return <button type="button" className="btn sm ghost full" style={{ justifySelf: "start" }} onClick={() => setOpen(true)}><Icon n="send" s={14} />קישור לוואטסאפ במקום אתר</button>;
  const apply = () => {
    const u = waLink(phone, text);
    if (!u) return toast("מספר טלפון לא תקין", true);
    onLink(u); setOpen(false); toast("הקישור לוואטסאפ הוכנס");
  };
  return (
    <div className="set-card full">
      <div className="form">
        <label className="field"><span>מספר וואטסאפ</span><input className="inp ltr" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="050-1234567" /></label>
        <label className="field"><span>הודעה מוכנה (לא חובה)</span><input className="inp" dir="auto" value={text} onChange={(e) => setText(e.target.value)} placeholder="היי, ראיתי את המודעה" /></label>
      </div>
      <div className="bar" style={{ marginTop: 8 }}>
        <button type="button" className="btn sm primary" onClick={apply}>הכנסת הקישור</button>
        <button type="button" className="btn sm ghost" onClick={() => setOpen(false)}>ביטול</button>
      </div>
      <span className="tiny" style={{ display: "block", marginTop: 6 }}>טיקטוק עלולה לדחות מודעה שמובילה ישר לוואטסאפ. אם היא נדחית, מפנים לדף באתר עם כפתור וואטסאפ.</span>
    </div>
  );
}

export function AudienceSearch({ kind, label, org, accountId, adAccountId, picks, setPicks, radius, defRadius = 17 }: {
  kind: "city" | "interest"; label: string; org: string; accountId: string; adAccountId: string; picks: Pick[]; setPicks: (p: Pick[]) => void; radius?: boolean; defRadius?: number;
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
            <button key={r.id} className="pillck" onClick={() => { setPicks([...picks, { id: r.id, name: r.name, type: r.type, ...(radius ? { radius: defRadius } : {}) }]); setQ(""); setRes([]); }} title={r.path}>
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
