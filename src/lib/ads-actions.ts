/* Simple Ads actions shared by the nightly job, the creative route, the webhook, the approval page and the
   campaign page. Writes go through the server-key RPC (job), so they work with or without a user session. */
import { zapi, zfail } from "@/lib/zernio";
import { ENGINE, adStats, dayRows, decide, freqOf, learningOf, type Decision } from "@/lib/ads-engine";
import { activeAds, adIdOf, addAdToAdSet, adSetLive, adsOfAdSet, campaignGoal, campaignTree, day, job, uploadAdImage } from "@/lib/ads-server";
import { runPipeline } from "@/lib/ads-creative";
import { sendAlert, sendApproval, type EngineSettings } from "@/lib/ads-mail";
import { leadFromForm, hasContact } from "@/lib/ads-leads";

type J = Record<string, unknown>;
const str = (v: unknown, max = 500) => String(v ?? "").trim().slice(0, max);
export type OrgInfo = { org_id: string; profile_id: string; engine: EngineSettings; campaigns: J[] };

export async function allOrgs(): Promise<OrgInfo[]> {
  return ((await job<OrgInfo[]>("orgs", null)) || []);
}
export async function orgInfo(org: string): Promise<OrgInfo | null> {
  return (await allOrgs()).find((o) => o.org_id === org) || null;
}

const log = (org: string, row: J) => job("log", org, row).catch(() => undefined);

/* the best ad in the set never stops: replacing it is refused */
function bestAdId(c: J, adSetId: string): string {
  const ads = adsOfAdSet(c, adSetId).filter((a) => a.status === "active");
  const goal = campaignGoal(c);
  const res = (a: J) => { const m = (a.metrics || {}) as J; return Number(m.conversions) || Number((m.actions as J)?.lead) || (goal === "traffic" ? Number(m.clicks) || 0 : 0); };
  return str([...ads].sort((a, b) => res(b) - res(a))[0]?.platformAdId, 80);
}

/* puts an approved draft up as a new ad; only then pauses the ad it replaces */
export async function publishDraft(org: string, d: J, c: J, row: J, actor = "מערכת"): Promise<{ ok: boolean; adId?: string; error?: string }> {
  const campaignId = str(c.platformCampaignId, 80), adSetId = str(d.adset_id, 80);
  const copy = (d.copy || {}) as J;
  const replaces = str(d.replaces_ad_id, 80);
  const active = adsOfAdSet(c, adSetId).filter((a) => a.status === "active" && str(a.platformAdId, 80) !== replaces).length;
  if (active >= ENGINE.maxActiveAds) {
    await job("draft_patch", org, { id: d.id, status: "failed", error: "כבר יש " + ENGINE.maxActiveAds + " מודעות פעילות" });
    return { ok: false, error: "כבר יש " + ENGINE.maxActiveAds + " מודעות פעילות בקבוצה" };
  }
  /* link and phone come from the ad that runs today in the same ad set */
  const sample = adsOfAdSet(c, adSetId).find((a) => (a.creative as J)?.linkUrl) || adsOfAdSet(c, adSetId)[0] || {};
  const cr = ((sample as J).creative || {}) as J;
  const brief = (row.brief || {}) as J;
  const goal = campaignGoal(c, str(row.goal, 40));
  try {
    const j = await addAdToAdSet({
      platform: str(c.platform, 20), accountId: str(row.account_id, 80) || str(c.accountId, 80), adAccountId: str(row.ad_account_id, 80) || str(c.platformAdAccountId, 80),
      adSetId, goal, leadFormId: str(row.lead_form_id, 64), name: "Simple Ads | " + str(copy.meta_headline, 60),
      headline: str(copy.meta_headline, 40), body: str(copy.meta_body, 2000), description: str(copy.meta_description, 30),
      linkUrl: str(cr.linkUrl, 1000) || str(brief.site, 1000), phone: str(cr.whatsappPhoneNumber || brief.phone, 20),
      imageFeed: str(d.image_feed, 2000), imageStory: str(d.image_story, 2000), idem: "draft-" + str(d.id, 64),
    });
    const adId = adIdOf(j);
    await job("draft_patch", org, { id: d.id, status: "live", ad_id: adId });
    await log(org, { action: replaces ? "ad:replace" : "ad:add", name: str(copy.meta_headline, 120), actor, reason: str(d.reason, 400), campaign_id: campaignId, adset_id: adSetId, ad_id: adId, request: { draft: d.id }, result: j });
    if (replaces && replaces !== bestAdId(c, adSetId)) {
      try {
        const k = await zapi("/ads/" + encodeURIComponent(replaces) + "/status", { method: "PUT", body: JSON.stringify({ status: "paused" }) });
        await log(org, { action: "ad:paused", name: replaces, actor, reason: "הוחלפה במודעה החדשה שעלתה", campaign_id: campaignId, adset_id: adSetId, ad_id: replaces, result: k });
      } catch (e) {
        await log(org, { action: "ad:paused", name: replaces, actor, ok: false, reason: "ההשהיה נכשלה", campaign_id: campaignId, ad_id: replaces, result: zfail(e).body });
      }
    }
    await job("campaign_patch", org, { campaign: campaignId, last_action_at: new Date().toISOString() });
    return { ok: true, adId };
  } catch (e) {
    const msg = String(zfail(e).body.error || (e as Error).message);
    await job("draft_patch", org, { id: d.id, status: "failed", error: msg.slice(0, 500) });
    await log(org, { action: "ad:add", name: str(copy.meta_headline, 120), actor, ok: false, reason: "העלאת המודעה נכשלה: " + msg.slice(0, 300), campaign_id: campaignId, adset_id: adSetId, result: zfail(e).body });
    return { ok: false, error: msg };
  }
}

/* one draft through the creative pipeline, then to approval (email) or straight up */
export async function runCreative(org: string, draftId: string): Promise<{ ok: boolean; error?: string }> {
  const info = await orgInfo(org);
  if (!info) return { ok: false, error: "no org" };
  const d = ((await job<J[]>("drafts", org, { status: ["generating"] })) || []).find((x) => x.id === draftId);
  if (!d) return { ok: false, error: "הטיוטה לא ממתינה ליצירה" };
  const row = info.campaigns.find((c) => c.campaign_id === d.campaign_id) || {};
  const save = async (patch: J) => { await job("draft_patch", org, { id: draftId, ...patch }); };
  try {
    const now = new Date();
    const c = await campaignTree(info.profile_id, str(d.campaign_id, 80), day(new Date(now.getTime() - 6 * 86400000)), day(now));
    if (!c) throw new Error("הקמפיין לא נמצא");
    const goal = campaignGoal(c, str(row.goal, 40));
    const ads = adsOfAdSet(c, str(d.adset_id, 80));
    const existing = ads.map((a) => ({ headline: str((a.creative as J)?.headline || a.name, 120), body: str((a.creative as J)?.body, 400) }));
    const best = ads.find((a) => str(a.platformAdId, 80) === bestAdId(c, str(d.adset_id, 80)));
    const out = await runPipeline({ org, draft: d, engine: info.engine, campaign: row, goal, existing, winner: best ? { headline: str(best.name, 120), body: str((best.creative as J)?.body, 400) } : null }, save);
    const accountId = str(row.account_id, 80) || str(c.accountId, 80), adAccountId = str(row.ad_account_id, 80) || str(c.platformAdAccountId, 80);
    const [feedUrl, storyUrl] = await Promise.all([
      uploadAdImage(accountId, adAccountId, out.feed, "simple-ads-feed.jpg"),
      uploadAdImage(accountId, adAccountId, out.story, "simple-ads-story.jpg"),
    ]);
    const approve = row.approve_before_swap !== false;
    const done = await job<J>("draft_patch", org, { id: draftId, stage: "finish", status: approve ? "pending" : "approved", copy: out.copy, image_feed: feedUrl, image_story: storyUrl });
    await log(org, { action: "draft:ready", name: str((out.copy as J).meta_headline, 120), reason: approve ? "מודעה חדשה מוכנה וממתינה לאישור" : "מודעה חדשה עברה את כל הבדיקות ועולה בלי אישור (אישור לפני החלפה כבוי)", campaign_id: d.campaign_id, adset_id: d.adset_id });
    if (approve) {
      const err = await sendApproval(org, info.engine, done, str(row.name || c.campaignName, 200)).catch((e) => (e as Error).message);
      if (!err) await job("draft_patch", org, { id: draftId, emailed: true });
      else await log(org, { action: "mail", ok: false, name: "מייל אישור", reason: err === "no_smtp" ? "לא נשלח מייל: חסרים פרטי Gmail בהגדרות המנוע. אפשר לאשר מתוך מסך הקמפיין" : "המייל לא נשלח: " + err, campaign_id: d.campaign_id });
    } else {
      await publishDraft(org, done, c, row, "מערכת");
    }
    return { ok: true };
  } catch (e) {
    const msg = (e as Error).message.slice(0, 500);
    await save({ status: "failed", error: msg });
    await log(org, { action: "draft:failed", ok: false, name: "מודעה חדשה", reason: "יצירת המודעה נכשלה: " + msg, campaign_id: d.campaign_id, adset_id: d.adset_id });
    return { ok: false, error: msg };
  }
}

const KIND_LABEL: Record<string, string> = { replace: "החלפת מודעה חלשה", fatigue: "מודעה בזווית חדשה (שחיקה)", winner: "מודעה נוספת בכיוון המנצח" };

/* chapter 9 for one campaign: save the night's numbers, check the blockers, take at most one action */
export async function runCampaign(info: OrgInfo, row: J, origin: string): Promise<{ decision: Decision | null; draftId?: string }> {
  const org = info.org_id, campaignId = str(row.campaign_id, 80);
  const now = new Date(), today = day(now);
  const c = await campaignTree(info.profile_id, campaignId, day(new Date(now.getTime() - 14 * 86400000)), today, true);
  if (!c) { await job("campaign_patch", org, { campaign: campaignId, last_run: { kind: "skip", reason: "הקמפיין לא נמצא ב-Zernio", at: now.toISOString() } }); return { decision: null }; }
  const goal = campaignGoal(c, str(row.goal, 40));
  const rows = dayRows(c, goal);
  if (rows.length) await job("save_metrics", org, { rows });

  const c3 = await campaignTree(info.profile_id, campaignId, day(new Date(now.getTime() - 3 * 86400000)), day(new Date(now.getTime() - 86400000)));
  const stats = adStats(rows, today, c3 ? freqOf(c3) : {});
  const accountId = str(row.account_id, 80) || str(c.accountId, 80);
  const sets = ((c.adSets || []) as J[]).filter((s) => s.status === "active");
  const isMeta = ["facebook", "instagram"].includes(str(c.platform, 20));
  const learn = isMeta ? await Promise.all(sets.map((s) => adSetLive(accountId, str(s.platformAdSetId, 80)).then(learningOf))) : [];
  const learning = learn.includes("learning");
  const last = await job<string | null>("last_action", org, { campaign: campaignId });
  const pending = ((await job<J[]>("drafts", org, { campaign: campaignId, status: ["generating", "pending", "approved"] })) || []).length > 0;
  const daysRunning = new Set(rows.filter((r) => r.spend > 0 || r.impressions > 0).map((r) => r.day)).size;
  const decision = decide({ ads: stats, activeAdIds: activeAds(c), daysRunning, learning, lastActionAt: last, pendingDraft: pending, goal, now });

  const hints = "hints" in decision && decision.hints.length ? " | " + decision.hints.join(" | ") : "";
  let draftId: string | undefined;
  if (decision.kind === "skip" || decision.kind === "stable") {
    await log(org, { action: "engine:" + decision.kind, name: str(c.campaignName, 200), reason: decision.reason + hints, campaign_id: campaignId });
  } else {
    const meta = ["facebook", "instagram"].includes(str(c.platform, 20));
    const auto = meta && row.manage_mode === "auto" && row.auto_creatives === true;
    if (!auto) {
      await log(org, { action: "engine:recommend", name: str(c.campaignName, 200), reason: "המלצה: " + decision.reason + (!meta ? " (יצירת מודעות אוטומטית רק במטא)" : row.manage_mode === "auto" ? " (יצירת מודעות כבויה, לכן רק המלצה)" : " (מצב המלצות בלבד)") + hints, campaign_id: campaignId, ad_id: decision.ad.id, adset_id: decision.ad.adsetId });
    } else {
      const d = await job<J>("draft_new", org, { campaign_id: campaignId, adset_id: decision.ad.adsetId, replaces_ad_id: decision.kind === "replace" ? decision.ad.id : "", kind: decision.kind, reason: decision.reason, by: "מערכת" });
      draftId = str(d?.id, 64);
      await log(org, { action: "draft:new", name: str(c.campaignName, 200), reason: KIND_LABEL[decision.kind] + ": " + decision.reason + hints, campaign_id: campaignId, adset_id: decision.ad.adsetId, ad_id: decision.ad.id });
      if (draftId) await fireCreative(origin, org, draftId);
    }
  }
  await job("campaign_patch", org, { campaign: campaignId, learning: learning ? "learning" : learn.find((l) => l) || "", last_run: { kind: decision.kind, reason: decision.reason, hints: "hints" in decision ? decision.hints : [], at: now.toISOString() } });
  return { decision, draftId };
}

/* the creative pipeline takes minutes, so each draft runs in its own function call (it answers at once and works after) */
export async function fireCreative(origin: string, org: string, id: string) {
  await fetch(origin + "/api/ads/creative", { method: "POST", headers: { "content-type": "application/json", "x-cron-key": process.env.GCAL_SERVER_KEY || "" }, body: JSON.stringify({ org, id }) }).catch(() => undefined);
}

/* registers the CRM's webhook at Zernio once (lead.received, ad.status_changed, account events) */
export async function ensureWebhook(origin: string) {
  const secret = await job<string>("webhook_secret", null);
  const url = origin + "/api/ads/webhook";
  const events = ["lead.received", "ad.status_changed", "account.disconnected", "account.ads.sync_failed"];
  const j = await zapi("/webhooks/settings");
  const list = (Array.isArray(j.webhooks) ? j.webhooks : []) as J[];
  const mine = list.find((w) => w.name === "Simple CRM Ads" || w.url === url);
  const body = { name: "Simple CRM Ads", url, events, isActive: true, customHeaders: { "x-sa-secret": secret }, secret };
  if (!mine) await zapi("/webhooks/settings", { method: "POST", body: JSON.stringify(body) });
  else if (mine.url !== url || mine.isActive === false || ((mine.customHeaders || {}) as J)["x-sa-secret"] !== secret || events.some((e) => !((mine.events || []) as string[]).includes(e)))
    await zapi("/webhooks/settings", { method: "PUT", body: JSON.stringify({ webhookId: mine._id || mine.id, ...body }) });
}

/* daily backup for leads the webhook missed: last 3 days of every Meta account of the business */
export async function backupLeads(info: OrgInfo): Promise<number> {
  const org = info.org_id;
  const accounts = await zapi("/accounts?profileId=" + encodeURIComponent(info.profile_id));
  const metas = ((Array.isArray(accounts.accounts) ? accounts.accounts : []) as J[]).filter((a) => ["facebook", "instagram", "metaads"].includes(String(a.platform)));
  const since = String(Math.floor(Date.now() / 1000) - 3 * 86400);
  const names = new Map(info.campaigns.map((c) => [String(c.campaign_id), String(c.name)]));
  let added = 0;
  for (const a of metas) {
    const id = str(a._id || a.id, 80);
    const j = await zapi("/ads/leads?" + new URLSearchParams({ accountId: id, limit: "100", since })).catch(() => ({ leads: [] }) as J);
    for (const l of (j.leads || []) as J[]) {
      const ext = str(l.leadgenId || l.id, 120);
      const lead = leadFromForm((l.fields || {}) as Record<string, string>, { platform: String(a.platform), formName: str(l.formName, 160), campaign: names.get(str(l.campaignId, 80)) });
      if (!ext || !hasContact(lead)) continue;
      const r = await job<J>("ingest_lead", org, { ext, lead }).catch(() => null);
      if (r && !r.seen && !r.duplicate) added++;
    }
  }
  return added;
}

export { sendAlert };
