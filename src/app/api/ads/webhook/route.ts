/* Zernio webhook for Simple Ads. Every request must carry the x-sa-secret header set at registration.
   lead.received -> a lead in the CRM (once per Meta lead id); ad.status_changed -> journal, and an email when
   Meta rejects an ad; account.disconnected -> the engine stops for the business until it reconnects;
   account.ads.sync_failed -> journal only (the nightly run tries again). */
import { NextResponse, type NextRequest } from "next/server";
import { job } from "@/lib/ads-server";
import { orgInfo, sendAlert } from "@/lib/ads-actions";
import { leadFromForm, hasContact } from "@/lib/ads-leads";

type J = Record<string, unknown>;
const str = (v: unknown, max = 500) => String(v ?? "").trim().slice(0, max);

function same(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function POST(req: NextRequest) {
  const secret = await job<string>("webhook_secret", null).catch(() => "");
  if (!secret || !same(req.headers.get("x-sa-secret") || "", secret)) return NextResponse.json({ error: "forbidden" }, { status: 401 });
  const p = (await req.json().catch(() => ({}))) as J;
  const event = str(p.event, 60);
  const account = (p.account || {}) as J;
  const profile = str(account.profileId, 80);
  const org = profile ? await job<string | null>("org_for_profile", null, { profile }).catch(() => null) : null;
  if (!org) return NextResponse.json({ ok: true, ignored: "no org" });

  try {
    if (event === "lead.received") {
      const l = (p.lead || {}) as J;
      if (l.isOrganic === true) return NextResponse.json({ ok: true, ignored: "organic" });
      const ext = str(l.leadgenId || l.id, 120);
      const info = await orgInfo(org);
      const camp = info?.campaigns.find((c) => c.campaign_id === str(l.campaignId, 80));
      const lead = leadFromForm((l.fields || {}) as Record<string, string>, { platform: str(account.platform, 20), formName: str(l.formName, 160), campaign: str(camp?.name, 160) });
      if (!ext || !hasContact(lead)) return NextResponse.json({ ok: true, ignored: "empty" });
      const r = await job<J>("ingest_lead", org, { ext, lead });
      if (camp && r && !r.seen) await job("log", org, { action: "lead", name: lead.name || lead.phone, actor: "מטא", reason: "ליד חדש מהטופס" + (r.duplicate ? " (פנייה חוזרת של איש קשר קיים)" : ""), campaign_id: camp.campaign_id, adset_id: str(l.adsetId, 80), ad_id: str(l.adId, 80) });
      return NextResponse.json({ ok: true });
    }

    if (event === "ad.status_changed") {
      const o = (p.adObject || {}) as J, raw = str(((p.status || {}) as J).raw, 60), err = (p.error || {}) as J;
      const level = str(o.level, 20), id = str(o.platformId, 80);
      const rejected = /DISAPPROVED|REJECTED/i.test(raw);
      const info = await orgInfo(org);
      await job("log", org, { action: "status:" + raw.toLowerCase(), name: id, actor: "מטא", ok: !rejected, reason: "סטטוס " + (level === "AD" ? "מודעה" : level === "AD_SET" ? "קבוצת מודעות" : "קמפיין") + ": " + raw + (err.message || err.summary ? " - " + str(err.message || err.summary, 300) : ""), ad_id: level === "AD" ? id : "", adset_id: level === "AD_SET" ? id : "", campaign_id: level === "CAMPAIGN" ? id : "" });
      if (rejected && info) await sendAlert(org, info.engine, "מטא דחתה מודעה", "מודעה " + id + " נדחתה על ידי מטא." + (err.message || err.summary ? "\nהסיבה: " + str(err.message || err.summary, 400) : "") + "\nאפשר להחליף אותה ממסך הקמפיין.");
      return NextResponse.json({ ok: true });
    }

    if (event === "account.disconnected") {
      await job("campaign_patch", org, { campaign: "*", disconnected: true });
      await job("log", org, { action: "account:disconnected", ok: false, name: str(account.displayName || account.username, 120), actor: "Zernio", reason: "חשבון המודעות התנתק (" + str(account.reason, 200) + "). המערכת לא תבצע פעולות עד שתחבר מחדש" });
      const info = await orgInfo(org);
      if (info) await sendAlert(org, info.engine, "חשבון המודעות התנתק", "החיבור לחשבון " + str(account.displayName || account.username, 120) + " נותק. עד שתחבר מחדש המערכת לא מבצעת פעולות בקמפיינים.\nמתחברים מחדש במסך מודעות > חיבור חשבון מודעות.", "/ads?tab=" + encodeURIComponent("חיבור חשבון מודעות"));
      return NextResponse.json({ ok: true });
    }

    if (event === "account.ads.sync_failed") {
      await job("log", org, { action: "account:sync_failed", ok: false, name: str(account.displayName || account.username, 120), actor: "Zernio", reason: "סנכרון נתוני המודעות נכשל. ננסה שוב בבדיקה הבאה" });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: true, ignored: event });
  } catch (e) {
    console.error("ads webhook", event, (e as Error).message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
