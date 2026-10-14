import { NextResponse, type NextRequest } from "next/server";
import { sbServer } from "@/lib/supabase/server";
import { accountsFor, profileFor, zapi, zfail } from "@/lib/zernio";
import { AD_CTAS, AD_GOALS, AD_MAX_DAILY, AD_MAX_LIFETIME } from "@/lib/ads";

type J = Record<string, unknown>;
const DT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const str = (v: unknown, max = 500) => String(v ?? "").trim().slice(0, max);

/* creates a Meta campaign from the CRM. body:
   { org, kind: "boost" | "create", validate?: boolean, accountId, adsVia?, adAccountId, name, goal,
     budgetAmount, budgetType: "daily" | "lifetime", start?, end? ("YYYY-MM-DDTHH:mm", ad account time),
     paused?: boolean,
     audience: { cities?: [{ id, name, radius }], ageMin?, ageMax?, gender?, interests?: [{ id, name }] },
     postId? (boost), ad?: { headline, body, description?, imageUrl, linkUrl, cta } (create), cta?, linkUrl? (boost) }
   Every call, ok or not, is logged in crm_ad_launches. */
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as J;
  const org = str(b.org, 64);
  const kind = b.kind === "create" ? "create" : "boost";
  const validate = b.validate === true;
  const bad = (m: string) => NextResponse.json({ error: m }, { status: 400 });
  if (!org) return bad("missing org");

  const goal = str(b.goal, 40);
  if (!AD_GOALS.some((g) => g[0] === goal)) return bad("מטרה לא נתמכת");
  if (kind === "create" && goal === "video_views") return bad("צפיות בסרטון רק בקידום פוסט עם סרטון");
  const budgetType = b.budgetType === "lifetime" ? "lifetime" : "daily";
  const budgetAmount = Number(b.budgetAmount);
  if (!isFinite(budgetAmount) || budgetAmount <= 0) return bad("תקציב לא תקין");
  if (budgetAmount > (budgetType === "daily" ? AD_MAX_DAILY : AD_MAX_LIFETIME)) return bad("התקציב גבוה מהתקרה שהוגדרה ב-CRM. בדוק שאין אפס מיותר");
  const start = str(b.start, 16), end = str(b.end, 16);
  if ((start && !DT.test(start)) || (end && !DT.test(end))) return bad("תאריך לא תקין");
  if (budgetType === "lifetime" && !end) return bad("לתקציב כולל צריך תאריך סיום");
  if (end && start && end <= start) return bad("תאריך הסיום לפני ההתחלה");
  const name = str(b.name, 120);
  if (!name) return bad("חסר שם לקמפיין");
  const adAccountId = str(b.adAccountId, 64);
  if (!adAccountId) return bad("לא נבחר חשבון מודעות");

  /* audience: Israel by default, cities with Meta's minimum radius, age 18-65 */
  const au = (b.audience || {}) as J;
  const cities = (Array.isArray(au.cities) ? au.cities : []).slice(0, 25).map((c: J) => ({ key: str(c.id, 64), name: str(c.name, 80), radius: Math.min(80, Math.max(17, Number(c.radius) || 17)), distanceUnit: "kilometer" })).filter((c) => c.key);
  const interests = (Array.isArray(au.interests) ? au.interests : []).slice(0, 25).map((x: J) => ({ id: str(x.id, 64), name: str(x.name, 80) })).filter((x) => x.id);
  const ageMin = Math.min(65, Math.max(18, Number(au.ageMin) || 18));
  const ageMax = Math.min(65, Math.max(ageMin, Number(au.ageMax) || 65));
  const gender = au.gender === "male" || au.gender === "female" ? au.gender : "all";
  const targeting: J = { ...(cities.length ? { cities } : { countries: ["IL"] }), ageMin, ageMax, gender, ...(interests.length ? { interests } : {}) };

  const supa = await sbServer();
  const log = async (ok: boolean, request: J, result: J) => {
    await supa.from("crm_ad_launches").insert({ org_id: org, action: validate ? kind + ":validate" : kind, name, request, result, ok });
  };

  try {
    const profileId = await profileFor(org, false);
    const mine = profileId ? await accountsFor(profileId) : [];
    const acc = mine.find((a) => a.id === str(b.accountId, 64));
    if (!acc || !["facebook", "instagram"].includes(acc.platform)) return NextResponse.json({ error: "החשבון לא שייך לעסק הזה" }, { status: 403 });
    const via = str(b.adsVia, 64);
    const runAs = via && mine.some((a) => a.id === via) ? via : acc.id;

    const common: J = {
      accountId: runAs, adAccountId, name, campaignName: name, goal, budgetAmount, budgetType, targeting,
      ...(start ? { startDate: start + ":00" } : {}), ...(end ? { endDate: end + ":00" } : {}),
      ...(b.paused === true ? { status: "PAUSED" } : {}),
    };
    let body: J, path: string;
    if (kind === "boost") {
      const postId = str(b.postId, 120);
      if (!postId) return bad("לא נבחר פוסט לקידום");
      const linkUrl = str(b.linkUrl, 1000), cta = str(b.cta, 40);
      if (goal === "traffic" && (!linkUrl || !cta)) return bad("לתנועה לאתר צריך קישור וכפתור");
      if (linkUrl && !/^https?:\/\//.test(linkUrl)) return bad("קישור לא תקין");
      body = { ...common, platformPostId: postId, ...(linkUrl && cta && AD_CTAS.some((c) => c[0] === cta) ? { linkUrl, callToAction: cta } : {}) };
      path = "/ads/boost";
      if (validate) return NextResponse.json({ ok: true, validated: false, note: "בקידום פוסט אין בדיקה מוקדמת. הבדיקה נעשית ביצירה" });
    } else {
      const ad = (b.ad || {}) as J;
      const headline = str(ad.headline, 255), text = str(ad.body, 2000), imageUrl = str(ad.imageUrl, 1000), linkUrl = str(ad.linkUrl, 1000), cta = str(ad.cta, 40);
      if (!headline || !text) return bad("חסרים כותרת או טקסט למודעה");
      if (!/^https:\/\//.test(imageUrl)) return bad("חסרה תמונה למודעה");
      if (!/^https?:\/\//.test(linkUrl)) return bad("חסר קישור למודעה");
      if (!AD_CTAS.some((c) => c[0] === cta)) return bad("כפתור לא תקין");
      body = { ...common, headline, body: text, imageUrl, linkUrl, callToAction: cta, ...(str(ad.description, 255) ? { description: str(ad.description, 255) } : {}), ...(validate ? { validateOnly: true } : {}) };
      path = "/ads/create";
    }
    const j = await zapi(path, { method: "POST", body: JSON.stringify(body) });
    await log(true, body, j);
    const ad = (j.ad || {}) as J;
    return NextResponse.json({
      ok: true, validated: validate, message: str(j.message, 300),
      results: Array.isArray(j.results) ? j.results : undefined,
      campaignId: str(ad.platformCampaignId || j.platformCampaignId, 80), status: str(ad.status, 40),
    });
  } catch (e) {
    const f = zfail(e);
    await log(false, { kind, goal, budgetAmount, budgetType, adAccountId }, f.body as J).catch(() => {});
    return NextResponse.json(f.body, { status: f.status === 502 ? 400 : f.status });
  }
}
