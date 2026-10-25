import { NextResponse, after, type NextRequest } from "next/server";
import { sbServer } from "@/lib/supabase/server";
import { profileFor, zapi, zfail } from "@/lib/zernio";
import { ENGINE, LEARNING_LABEL, adStats, dayRows, learningOf, resultsOf } from "@/lib/ads-engine";
import { adIdOf, addAdToAdSet, adSetLive, adsOfAdSet, campaignGoal, campaignTree, day, uploadAdImage } from "@/lib/ads-server";
import { fireCreative, publishDraft } from "@/lib/ads-actions";
import { AD_CTAS, AD_MAX_DAILY } from "@/lib/ads";

export const maxDuration = 60;
type J = Record<string, unknown>;
const str = (v: unknown, max = 500) => String(v ?? "").trim().slice(0, max);
const bad = (m: string, status = 400) => NextResponse.json({ error: m }, { status });

/* the campaign of this business, checked against its Zernio profile (the ids come from the browser) */
async function ownCampaign(org: string, campaignId: string, days = 7, daily = false) {
  const profileId = await profileFor(org, false);
  if (!profileId) return null;
  const to = new Date();
  const c = await campaignTree(profileId, campaignId, day(new Date(to.getTime() - (days - 1) * 86400000)), day(to), daily);
  return c ? { c, profileId } : null;
}

/* keeps a row per managed campaign; the first open of an older campaign adds it with the safe defaults */
async function settingsRow(org: string, c: J) {
  const supa = await sbServer();
  const id = str(c.platformCampaignId, 80);
  let { data } = await supa.from("crm_ad_campaigns").select("*").eq("org_id", org).eq("campaign_id", id).maybeSingle();
  if (!data) {
    const { data: l } = await supa.from("crm_ad_launches").select("request").eq("org_id", org).eq("campaign_id", id).eq("ok", true).order("created_at").limit(1).maybeSingle();
    const req = ((l?.request || {}) as J);
    const ins = {
      org_id: org, campaign_id: id, name: str(c.campaignName, 160), platform: str(c.platform, 20) || "facebook",
      goal: str(req.goal, 40) || campaignGoal(c), account_id: str(c.accountId, 80), ad_account_id: str(c.platformAdAccountId, 80),
      lead_form_id: str(req.leadGenFormId, 64),
    };
    const r = await supa.from("crm_ad_campaigns").upsert(ins, { onConflict: "org_id,campaign_id" }).select("*").single();
    data = r.data;
  }
  return { supa, row: (data || {}) as J };
}

/* GET ?org&campaignId -> the campaign with ad sets, ads, last-7-day numbers per ad, learning per ad set,
   settings, drafts and the journal */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const org = p.get("org") || "", campaignId = p.get("campaignId") || "";
  if (!org || !campaignId) return bad("missing");
  try {
    const own = await ownCampaign(org, campaignId, 14, true);
    if (!own) return bad("הקמפיין לא נמצא בחשבון של העסק הזה", 404);
    const { c } = own;
    const { supa, row } = await settingsRow(org, c);
    const goal = campaignGoal(c, str(row.goal, 40));
    const stats = adStats(dayRows(c, goal), day(new Date()));
    const accountId = str(c.accountId, 80);
    const sets = (c.adSets || []) as J[];
    const isMeta = ["facebook", "instagram"].includes(str(c.platform, 20));
    const live = await Promise.all(sets.map((s) => accountId && isMeta ? adSetLive(accountId, str(s.platformAdSetId, 80)) : Promise.resolve(null)));
    const [drafts, journal] = await Promise.all([
      supa.from("crm_ad_drafts").select("id,adset_id,replaces_ad_id,kind,reason,by,status,stage,copy,image_feed,image_story,note,error,ad_id,created_at,decided_at").eq("org_id", org).eq("campaign_id", campaignId).order("created_at", { ascending: false }).limit(20),
      supa.from("crm_ad_launches").select("id,action,name,ok,actor,reason,result,request,created_at,ad_id,adset_id").eq("org_id", org).eq("campaign_id", campaignId).order("created_at", { ascending: false }).limit(60),
    ]);
    const learn = sets.map((_, i) => learningOf(live[i]));
    if (learn.some((l) => l)) await supa.from("crm_ad_campaigns").update({ learning: learn.includes("learning") ? "learning" : learn.find((l) => l) || "" }).eq("org_id", org).eq("campaign_id", campaignId);
    return NextResponse.json({
      campaign: {
        id: campaignId, name: str(c.campaignName, 200), status: str(c.status, 30), platform: str(c.platform, 20), currency: str(c.currency, 8),
        objective: str(c.platformObjective, 60), budget: c.budget || c.campaignBudget || null, budgetLevel: str(c.budgetLevel, 20),
        accountId, adAccountId: str(c.platformAdAccountId, 80), m: c.metrics || {}, goal, results: resultsOf(c.metrics as J, goal),
      },
      adSets: sets.map((s, i) => {
        const tg = ((live[i] || {}) as J).targeting as J | undefined;
        return {
          id: str(s.platformAdSetId, 80), name: str(s.adSetName, 200), status: str(s.status, 30), budget: s.budget || s.adSetBudget || null,
          m: s.metrics || {}, results: resultsOf(s.metrics as J, goal), learning: learn[i], learningLabel: LEARNING_LABEL[learn[i]] || "",
          targeting: tg ? {
            ageMin: tg.age_min ?? null, ageMax: tg.age_max ?? null, genders: tg.genders ?? null,
            countries: ((tg.geo_locations || {}) as J).countries ?? null,
            cities: ((((tg.geo_locations || {}) as J).cities || []) as J[]).map((x) => ({ id: str(x.key, 40), name: str(x.name, 80), radius: Number(x.radius) || null })),
            interests: (((tg.flexible_spec as J[] | undefined)?.[0]?.interests || tg.interests || []) as J[]).map((x) => ({ id: str(x.id, 40), name: str(x.name, 80) })),
          } : null,
          ads: ((s.ads || []) as J[]).map((a) => {
            const st = stats.find((x) => x.id === str(a.platformAdId, 80));
            const cr = (a.creative || {}) as J;
            return {
              id: str(a.platformAdId, 80), name: str(a.name, 200), status: str(a.status, 30), review: str(a.reviewStatus, 30), rejection: str(a.rejectionReason, 300),
              image: str(cr.imageUrl || cr.thumbnailUrl, 1000), body: str(cr.body, 600), link: str(cr.linkUrl, 400),
              m: a.metrics || {}, results: resultsOf(a.metrics as J, goal),
              week: st ? { spend: st.spend, results: st.results, clicks: st.clicks, ctr: st.ctr, freq3: st.freq3, ctrPrev: st.ctrPrev } : null,
            };
          }),
        };
      }),
      settings: row, drafts: drafts.data || [], journal: journal.data || [],
      rules: { maxActiveAds: ENGINE.maxActiveAds, minDailyBudget: ENGINE.minDailyBudget },
    });
  } catch (e) {
    const f = zfail(e);
    return NextResponse.json(f.body, { status: f.status });
  }
}

/* POST { org, campaignId, op, ... } - changes by the user. Every change is written to the journal. */
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as J;
  const org = str(b.org, 64), campaignId = str(b.campaignId, 80), op = str(b.op, 30);
  if (!org || !campaignId || !op) return bad("missing");
  let supa: Awaited<ReturnType<typeof sbServer>> | null = null;
  const log = async (ok: boolean, action: string, name: string, reason: string, request: J, result: J, ids: { adset?: string; ad?: string } = {}) => {
    await supa?.from("crm_ad_launches").insert({ org_id: org, action, name, request, result, ok, actor: "משתמש", reason, campaign_id: campaignId, adset_id: ids.adset || "", ad_id: ids.ad || "" });
  };
  try {
    const own = await ownCampaign(org, campaignId);
    if (!own) return bad("הקמפיין לא שייך לעסק הזה", 403);
    const { c } = own;
    const s0 = await settingsRow(org, c);
    supa = s0.supa;
    const row = s0.row;
    const platform = str(c.platform, 20) || "facebook";
    const accountId = str(row.account_id, 80) || str(c.accountId, 80), adAccountId = str(row.ad_account_id, 80) || str(c.platformAdAccountId, 80);
    const sets = (c.adSets || []) as J[];
    const setOf = (id: string) => sets.find((s) => str(s.platformAdSetId, 80) === id);
    const adOf = (id: string) => { for (const s of sets) for (const a of (s.ads || []) as J[]) if (str(a.platformAdId, 80) === id) return { a, s }; return null; };
    const fail = async (e: unknown, action: string, name: string, request: J, ids: { adset?: string; ad?: string } = {}) => {
      const f = zfail(e);
      await log(false, action, name, "", request, f.body as J, ids);
      return NextResponse.json(f.body, { status: f.status === 502 ? 400 : f.status });
    };

    if (op === "ad_status") {
      const adId = str(b.adId, 80), status = b.status === "active" ? "active" : "paused";
      const hit = adOf(adId);
      if (!hit) return bad("המודעה לא בקמפיין הזה");
      if (status === "active" && adsOfAdSet(c, str(hit.s.platformAdSetId, 80)).filter((a) => a.status === "active").length >= ENGINE.maxActiveAds) return bad("כבר יש " + ENGINE.maxActiveAds + " מודעות פעילות בקבוצה. משהים אחת קודם");
      const body = { status };
      try {
        const j = await zapi("/ads/" + encodeURIComponent(adId) + "/status", { method: "PUT", body: JSON.stringify(body) });
        await log(true, "ad:" + status, str(hit.a.name, 200), status === "active" ? "הופעלה ידנית" : "הושהתה ידנית", body, j, { adset: str(hit.s.platformAdSetId, 80), ad: adId });
        return NextResponse.json({ ok: true });
      } catch (e) { return fail(e, "ad:" + status, str(hit.a.name, 200), body, { ad: adId }); }
    }

    if (op === "adset_status") {
      const id = str(b.adSetId, 80), s = setOf(id), status = b.status === "active" ? "active" : "paused";
      if (!s) return bad("קבוצת המודעות לא בקמפיין הזה");
      const body = { status, platform };
      try {
        const j = await zapi("/ads/ad-sets/" + encodeURIComponent(id) + "/status", { method: "PUT", body: JSON.stringify(body) });
        await log(true, "adset:" + status, str(s.adSetName, 200), status === "active" ? "קבוצת המודעות הופעלה" : "קבוצת המודעות הושהתה", body, j, { adset: id });
        return NextResponse.json({ ok: true });
      } catch (e) { return fail(e, "adset:" + status, str(s.adSetName, 200), body, { adset: id }); }
    }

    if (op === "budget") {
      /* only the user changes a budget, and never under 40 a day */
      const amount = Math.round(Number(b.amount) * 100) / 100;
      if (!isFinite(amount) || amount < ENGINE.minDailyBudget) return bad("תקציב יומי מינימלי: " + ENGINE.minDailyBudget);
      if (amount > AD_MAX_DAILY) return bad("התקציב גבוה מהתקרה שהוגדרה ב-CRM. בדוק שאין אפס מיותר");
      const id = str(b.adSetId, 80), s = id ? setOf(id) : null;
      const onSet = !!s && (str(c.budgetLevel, 20) !== "campaign");
      const body = { platform, budget: { amount, type: "daily" } };
      const path = onSet ? "/ads/ad-sets/" + encodeURIComponent(id) : "/ads/campaigns/" + encodeURIComponent(campaignId);
      try {
        const j = await zapi(path, { method: "PUT", body: JSON.stringify(body) });
        await log(true, "budget", onSet ? str(s!.adSetName, 200) : str(c.campaignName, 200), "תקציב יומי חדש: " + amount, body, j, { adset: onSet ? id : "" });
        return NextResponse.json({ ok: true });
      } catch (e) { return fail(e, "budget", str(c.campaignName, 200), body, { adset: id }); }
    }

    if (op === "targeting") {
      /* changing the audience restarts Meta's learning: refused while learning unless the user insists */
      const id = str(b.adSetId, 80), s = setOf(id);
      if (!s) return bad("קבוצת המודעות לא בקמפיין הזה");
      const live = accountId && platform !== "tiktok" ? await adSetLive(accountId, id) : null;
      if (learningOf(live) === "learning" && b.force !== true) return NextResponse.json({ error: "learning", message: "קבוצת המודעות בשלב הלמידה. שינוי קהל עכשיו יתחיל את הלמידה מחדש" }, { status: 409 });
      const firstAd = ((s.ads || []) as J[]).find((a) => a.platformAdId);
      if (!firstAd) return bad("אין מודעה בקבוצה לעדכון הקהל");
      const t = (b.targeting || {}) as J;
      const ageMin = Math.min(65, Math.max(18, Number(t.ageMin) || 18)), ageMax = Math.min(65, Math.max(ageMin, Number(t.ageMax) || 65));
      const cities = (Array.isArray(t.cities) ? t.cities : []).slice(0, 25).map((x: J) => ({ key: str(x.id, 64), name: str(x.name, 80), radius: Math.min(80, Math.max(17, Number(x.radius) || 25)), distanceUnit: "kilometer" })).filter((x) => x.key);
      const interests = (Array.isArray(t.interests) ? t.interests : []).slice(0, 25).map((x: J) => ({ id: str(x.id, 64), name: str(x.name, 80) })).filter((x) => x.id);
      const targeting: J = { ageMin, ageMax, ...(cities.length ? { cities } : { countries: ["IL"] }), interests };
      const body = { targeting };
      try {
        const j = await zapi("/ads/" + encodeURIComponent(str(firstAd.platformAdId, 80)), { method: "PUT", body: JSON.stringify(body) });
        await log(true, "targeting", str(s.adSetName, 200), "עריכת קהל: גילאים " + ageMin + "-" + ageMax + (cities.length ? ", " + cities.map((x) => x.name + " " + x.radius + " ק\"מ").join(", ") : ", כל הארץ") + (interests.length ? ", " + interests.length + " תחומי עניין" : ""), body, j, { adset: id });
        return NextResponse.json({ ok: true });
      } catch (e) { return fail(e, "targeting", str(s.adSetName, 200), body, { adset: id }); }
    }

    if (op === "duplicate_adset") {
      /* the safe way to try a new audience: a paused copy, so the original keeps its learning */
      const id = str(b.adSetId, 80), s = setOf(id);
      if (!s) return bad("קבוצת המודעות לא בקמפיין הזה");
      const body = { platform, deepCopy: true, statusOption: "PAUSED", renameStrategy: "ONLY_TOP_LEVEL_RENAME", renameSuffix: " | קהל חדש" };
      try {
        const j = await zapi("/ads/ad-sets/" + encodeURIComponent(id) + "/duplicate", { method: "POST", body: JSON.stringify(body) });
        await log(true, "adset:duplicate", str(s.adSetName, 200), "שכפול קבוצת המודעות (מושהה) לבדיקת קהל חדש", body, j, { adset: id });
        return NextResponse.json({ ok: true });
      } catch (e) { return fail(e, "adset:duplicate", str(s.adSetName, 200), body, { adset: id }); }
    }

    if (op === "upload") {
      const data = str(b.imageBase64, 12_000_000);
      if (!data) return bad("חסרה תמונה");
      try { return NextResponse.json({ ok: true, url: await uploadAdImage(accountId, adAccountId, data, str(b.filename, 80) || "ad.jpg") }); }
      catch (e) { const f = zfail(e); return NextResponse.json(f.body, { status: f.status === 502 ? 400 : f.status }); }
    }

    if (op === "add_ad") {
      /* a new ad in an existing ad set; with replaceAdId the old one is paused only after the new one is up */
      const id = str(b.adSetId, 80), s = setOf(id);
      if (!s) return bad("קבוצת המודעות לא בקמפיין הזה");
      const replaceAdId = str(b.replaceAdId, 80);
      if (replaceAdId && !adsOfAdSet(c, id).some((a) => str(a.platformAdId, 80) === replaceAdId)) return bad("המודעה להחלפה לא בקבוצה הזו");
      const activeN = adsOfAdSet(c, id).filter((a) => a.status === "active" && str(a.platformAdId, 80) !== replaceAdId).length;
      if (activeN >= ENGINE.maxActiveAds) return bad("כבר יש " + ENGINE.maxActiveAds + " מודעות פעילות בקבוצה. מחליפים מודעה במקום להוסיף");
      const tiktok = platform === "tiktok";
      const headline = str(b.headline, 40), text = str(b.body, 2000), imageFeed = str(b.imageFeed, 2000), imageStory = tiktok ? "" : str(b.imageStory, 2000);
      const linkUrl = str(b.linkUrl, 1000), cta = str(b.cta, 40), goal = campaignGoal(c, str(row.goal, 40));
      if (!text || (!tiktok && !headline)) return bad(tiktok ? "חסר טקסט" : "חסרים כותרת או טקסט");
      if (!/^https:\/\//.test(imageFeed)) return bad(tiktok ? "חסר סרטון" : "חסרה תמונה לפיד");
      if (imageStory && !/^https:\/\//.test(imageStory)) return bad("תמונת הסטורי לא תקינה");
      if (linkUrl && !/^https?:\/\//.test(linkUrl)) return bad("קישור לא תקין");
      if (goal === "traffic" && !linkUrl) return bad("לקמפיין תנועה צריך קישור");
      if (cta && !AD_CTAS.some((x) => x[0] === cta)) return bad("כפתור לא תקין");
      const leadFormId = str(b.leadFormId, 64) || str(row.lead_form_id, 64);
      if (goal === "leads" && !leadFormId) return bad("בקמפיין לידים צריך לבחור את טופס הלידים (בהגדרות הקמפיין)");
      const name = str(b.name, 120) || headline || text.slice(0, 60);
      const reqBody: J = { adSetId: id, name, headline, body: text, imageFeed, imageStory, linkUrl, cta, replaceAdId };
      try {
        const j = await addAdToAdSet({ platform, accountId, adAccountId, adSetId: id, goal, leadFormId, name, headline, body: text, description: str(b.description, 30), cta, linkUrl, phone: str(b.phone, 20), imageFeed, imageStory, idem: str(b.idem, 80) || undefined });
        const newId = adIdOf(j);
        await log(true, replaceAdId ? "ad:replace" : "ad:add", name, replaceAdId ? "מודעה חדשה במקום מודעה קיימת" : "מודעה נוספת לקבוצה", reqBody, j, { adset: id, ad: newId });
        if (leadFormId && leadFormId !== str(row.lead_form_id, 64)) await supa.from("crm_ad_campaigns").update({ lead_form_id: leadFormId }).eq("org_id", org).eq("campaign_id", campaignId);
        if (replaceAdId) {
          try {
            const k = await zapi("/ads/" + encodeURIComponent(replaceAdId) + "/status", { method: "PUT", body: JSON.stringify({ status: "paused" }) });
            await log(true, "ad:paused", str(adOf(replaceAdId)?.a.name, 200), "הוחלפה במודעה החדשה", { status: "paused" }, k, { adset: id, ad: replaceAdId });
          } catch (e) { await log(false, "ad:paused", str(adOf(replaceAdId)?.a.name, 200), "ההשהיה אחרי ההחלפה נכשלה", { status: "paused" }, zfail(e).body as J, { adset: id, ad: replaceAdId }); }
        }
        return NextResponse.json({ ok: true, adId: newId, message: str(j.message, 300) });
      } catch (e) { return fail(e, replaceAdId ? "ad:replace" : "ad:add", name, reqBody, { adset: id }); }
    }

    if (op === "settings") {
      /* work modes and the brief the creative engine writes from */
      const patch: J = { updated_at: new Date().toISOString() };
      if (b.manage_mode === "manual" || b.manage_mode === "auto") patch.manage_mode = b.manage_mode;
      if (typeof b.auto_creatives === "boolean") patch.auto_creatives = b.auto_creatives;
      if (typeof b.approve_before_swap === "boolean") patch.approve_before_swap = b.approve_before_swap;
      if (b.brief && typeof b.brief === "object") {
        const br = b.brief as J;
        patch.brief = { offer: str(br.offer, 600), audience: str(br.audience, 400), site: str(br.site, 300), siteSummary: str(br.siteSummary, 1500), notes: str(br.notes, 800), angles: str(br.angles, 600) };
      }
      if (typeof b.lead_form_id === "string") patch.lead_form_id = str(b.lead_form_id, 64);
      if (typeof b.goal === "string" && ["leads", "whatsapp", "calls", "traffic", "other"].includes(b.goal)) patch.goal = b.goal;
      const { error } = await supa.from("crm_ad_campaigns").update(patch).eq("org_id", org).eq("campaign_id", campaignId);
      if (error) return bad(error.message);
      const parts = [patch.manage_mode ? "מצב: " + (patch.manage_mode === "auto" ? "אוטומטי" : "המלצות בלבד") : "", typeof patch.auto_creatives === "boolean" ? "יצירת מודעות: " + (patch.auto_creatives ? "פעיל" : "כבוי") : "", typeof patch.approve_before_swap === "boolean" ? "אישור לפני החלפה: " + (patch.approve_before_swap ? "פעיל" : "כבוי") : "", patch.brief ? "עודכן התדריך" : ""].filter(Boolean);
      if (parts.length) await log(true, "settings", str(c.campaignName, 200), parts.join(" · "), patch, {});
      return NextResponse.json({ ok: true });
    }

    if (op === "draft") {
      /* the user asks the creative engine for a new ad now (it runs in the background). Images, so Meta only */
      if (platform !== "facebook" && platform !== "instagram") return bad("יצירת מודעות אוטומטית זמינה רק במטא");
      const id = str(b.adSetId, 80) || str(sets[0]?.platformAdSetId, 80);
      if (!setOf(id)) return bad("קבוצת המודעות לא בקמפיין הזה");
      const { data: d, error } = await supa.from("crm_ad_drafts").insert({ org_id: org, campaign_id: campaignId, adset_id: id, replaces_ad_id: str(b.replaceAdId, 80), kind: b.replaceAdId ? "replace" : "new", reason: str(b.reason, 400) || "בקשה ידנית למודעה חדשה", by: "משתמש" }).select("id").single();
      if (error || !d) return bad(error?.message || "לא נוצר");
      await log(true, "draft:new", str(c.campaignName, 200), "בקשה ידנית למודעה חדשה מהמערכת", { draft: d.id }, {}, { adset: id });
      const origin = req.nextUrl.origin;
      after(() => fireCreative(origin, org, d.id));
      return NextResponse.json({ ok: true, id: d.id });
    }

    if (op === "draft_decide") {
      const id = str(b.draftId, 64), decision = str(b.decision, 20);
      if (!["approved", "rejected", "change"].includes(decision)) return bad("bad decision");
      const { data: d } = await supa.from("crm_ad_drafts").select("*").eq("org_id", org).eq("id", id).maybeSingle();
      if (!d || d.campaign_id !== campaignId) return bad("לא נמצא");
      if (d.status !== "pending") return bad("ההצעה כבר טופלה");
      await supa.from("crm_ad_drafts").update({ status: decision, note: str(b.note, 1000), decided_at: new Date().toISOString() }).eq("id", id);
      await log(true, "draft:" + decision, str((d.copy as J)?.meta_headline, 120) || "מודעה חדשה", decision === "approved" ? "אושרה ב-CRM" : decision === "change" ? "בקשת שינוי: " + str(b.note, 300) : "נדחתה ב-CRM", { draft: id }, {}, { adset: d.adset_id });
      if (decision === "approved") {
        const r = await publishDraft(org, { ...d, status: "approved" } as J, c, row, "משתמש");
        if (!r.ok) return bad(r.error || "ההעלאה נכשלה");
        return NextResponse.json({ ok: true, adId: r.adId });
      }
      if (decision === "change") {
        /* a change request makes a new version with the note in the brief */
        const { data: nd } = await supa.from("crm_ad_drafts").insert({ org_id: org, campaign_id: campaignId, adset_id: d.adset_id, replaces_ad_id: d.replaces_ad_id, kind: d.kind, reason: d.reason, by: "משתמש", brief: { ...(d.brief as J), change_request: str(b.note, 1000), previous: d.copy } }).select("id").single();
        if (nd) {
          const origin = req.nextUrl.origin;
          after(() => fireCreative(origin, org, nd.id));
        }
      }
      return NextResponse.json({ ok: true });
    }

    return bad("bad op");
  } catch (e) {
    const f = zfail(e);
    return NextResponse.json(f.body, { status: f.status });
  }
}

