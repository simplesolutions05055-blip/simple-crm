/* Simple Ads, server side: reading a campaign's tree from Zernio, adding an ad to an ad set, and the
   server-key RPC for the nightly job, the webhook and the approval page (they run without a user session). */
import { sbAnon } from "@/lib/supabase/server";
import { zapi } from "@/lib/zernio";
import { ENGINE, goalOf, type Goal } from "@/lib/ads-engine";

type J = Record<string, unknown>;
export const day = (d: Date) => d.toISOString().slice(0, 10);
const str = (v: unknown, max = 500) => String(v ?? "").trim().slice(0, max);

/* the one entry point for work with no session; the database checks the server key */
export async function job<T = unknown>(op: string, org: string | null, data: J = {}): Promise<T> {
  const key = process.env.GCAL_SERVER_KEY;
  if (!key) throw new Error("missing server key");
  const { data: r, error } = await sbAnon().rpc("crm_ads_job", { p_key: key, p_op: op, p_org: org, p_data: data });
  if (error) throw new Error(error.message);
  return r as T;
}

export function checkCronKey(h: string | null) {
  const k = process.env.GCAL_SERVER_KEY || "";
  if (!k || !h || h.length !== k.length) return false;
  let diff = 0;
  for (let i = 0; i < k.length; i++) diff |= k.charCodeAt(i) ^ h.charCodeAt(i);
  return diff === 0;
}

/* one campaign of this profile with its ad sets and ads. daily=true adds a per-day series on every ad */
export async function campaignTree(profileId: string, campaignId: string, from: string, to: string, daily = false): Promise<J | null> {
  const q = new URLSearchParams({ profileId, campaignId, fromDate: from, toDate: to, limit: "1", ...(daily ? { timeIncrement: "1", dailyLevel: "ad" } : {}) });
  const j = await zapi("/ads/tree?" + q);
  const list = (Array.isArray(j.campaigns) ? j.campaigns : Array.isArray(j.data) ? j.data : []) as J[];
  return list.find((c) => String(c.platformCampaignId) === campaignId) || null;
}

/* Meta's raw ad set: learning phase, delivery state and targeting */
export async function adSetLive(accountId: string, adSetId: string): Promise<J | null> {
  try {
    const q = new URLSearchParams({ accountId, fields: "learning_stage_info,effective_status,targeting,daily_budget,promoted_object" });
    const j = await zapi("/ads/ad-sets/" + encodeURIComponent(adSetId) + "?" + q);
    return (j.adSet || null) as J | null;
  } catch { return null; }
}

/* the Zernio account that runs ads for this campaign's ad account (posting or ads variant) */
export function campaignAccount(c: J): string {
  return str(c.accountId, 80);
}

export function campaignGoal(c: J, saved = ""): Goal {
  const og = c.optimizationGoal;
  return goalOf(saved, str(c.platformObjective, 80), Array.isArray(og) ? og.join(" ") : str(og, 80));
}

export function activeAds(c: J): string[] {
  const out: string[] = [];
  for (const s of (c.adSets || []) as J[]) for (const a of (s.ads || []) as J[]) if (String(a.status) === "active" && a.platformAdId) out.push(String(a.platformAdId));
  return out;
}
export function adsOfAdSet(c: J, adSetId: string): J[] {
  return (((c.adSets || []) as J[]).find((s) => String(s.platformAdSetId) === adSetId)?.ads || []) as J[];
}

export type NewAd = {
  platform?: string;
  accountId: string; adAccountId: string; adSetId: string; goal: Goal; leadFormId?: string;
  name: string; headline: string; body: string; description?: string; cta?: string; linkUrl?: string; phone?: string;
  imageFeed: string; imageStory?: string; paused?: boolean; idem?: string;
};

/* attaches one more ad to an existing ad set (budget, audience and goal stay the ad set's).
   A vertical image goes to stories and reels; without one the ad set's placements show the feed image. */
export async function addAdToAdSet(a: NewAd): Promise<J> {
  if (a.platform === "tiktok") {
    /* TikTok ads are video only: the video URL travels in imageUrl, and there is no headline */
    return zapi("/ads/create", {
      method: "POST", idem: a.idem,
      body: JSON.stringify({ accountId: a.accountId, adAccountId: a.adAccountId, adSetId: a.adSetId, name: a.name.slice(0, 120), body: a.body.slice(0, 100), imageUrl: a.imageFeed, ...(a.linkUrl ? { linkUrl: a.linkUrl } : {}), callToAction: a.cta || "LEARN_MORE", ...(a.paused ? { adStatus: "PAUSED" } : {}) }),
    });
  }
  const base: J = {
    accountId: a.accountId, adAccountId: a.adAccountId, adSetId: a.adSetId, name: a.name.slice(0, 120),
    headline: a.headline.slice(0, 40), body: a.body.slice(0, 2000), ...(a.description ? { description: a.description.slice(0, 30) } : {}),
    ...(a.paused ? { adStatus: "PAUSED" } : {}),
  };
  if (a.goal === "whatsapp") return zapi("/ads/ctwa", { method: "POST", idem: a.idem, body: JSON.stringify({ ...base, imageUrl: a.imageFeed }) });
  if (a.goal === "calls") {
    if (!a.phone || !a.linkUrl) throw new Error("לקמפיין שיחות צריך מספר טלפון וקישור לאתר");
    return zapi("/ads/call", { method: "POST", idem: a.idem, body: JSON.stringify({ ...base, imageUrl: a.imageFeed, phoneNumber: a.phone, linkUrl: a.linkUrl }) });
  }
  const media: J = a.imageStory
    ? { placementAssets: { defaultImageUrl: a.imageFeed, rules: [{ imageUrl: a.imageStory, placements: { facebookPositions: ["story", "facebook_reels"], instagramPositions: ["story", "reels"] } }] } }
    : { imageUrl: a.imageFeed };
  return zapi("/ads/create", {
    method: "POST", idem: a.idem,
    body: JSON.stringify({
      ...base, ...media, aiDisclosure: "OPT_IN", multiAdvertiser: "OPT_OUT",
      ...(a.goal === "leads" ? { leadGenFormId: a.leadFormId, callToAction: a.cta || "SIGN_UP" } : { callToAction: a.cta || "LEARN_MORE" }),
      ...(a.linkUrl ? { linkUrl: a.linkUrl } : {}),
    }),
  });
}

export const adIdOf = (j: J) => str(((j.ad || {}) as J).platformAdId || j.platformAdId, 80);

/* uploads an image (base64) to the ad account's library; returns Meta's URL */
export async function uploadAdImage(accountId: string, adAccountId: string, base64: string, filename: string): Promise<string> {
  const j = await zapi("/ads/images", { method: "POST", body: JSON.stringify({ accountId, adAccountId, imageBase64: base64, filename }) });
  const u = str(((j.image || {}) as J).url, 2000);
  if (!u) throw new Error("העלאת התמונה לחשבון המודעות נכשלה");
  return u;
}

export const MAX_ACTIVE = ENGINE.maxActiveAds;
