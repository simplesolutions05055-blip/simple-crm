import { NextResponse, type NextRequest } from "next/server";
import { sbServer } from "@/lib/supabase/server";
import { profileFor, zapi, zfail } from "@/lib/zernio";
import { AD_MAX_DAILY, AD_MAX_LIFETIME } from "@/lib/ads";

type J = Record<string, unknown>;

/* change an existing campaign of this business:
   { org, campaignId, action: "status", status: "active" | "paused" } or
   { org, campaignId, action: "budget", amount, type: "daily" | "lifetime" } */
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as J;
  const org = String(b.org || ""), campaignId = String(b.campaignId || "");
  if (!org || !campaignId) return NextResponse.json({ error: "missing" }, { status: 400 });
  try {
    const profileId = await profileFor(org, false);
    if (!profileId) return NextResponse.json({ error: "no_access" }, { status: 403 });
    /* the campaign must belong to this business's profile; the platform comes from Zernio, not the browser */
    const found = await zapi("/ads/campaigns?" + new URLSearchParams({ profileId, campaignId, limit: "1" }));
    const c = ((Array.isArray(found.campaigns) ? found.campaigns : []) as J[]).find((x) => String(x.platformCampaignId) === campaignId);
    if (!c) return NextResponse.json({ error: "הקמפיין לא שייך לעסק הזה" }, { status: 403 });
    const platform = String(c.platform || "");
    let body: J, path: string, method = "PUT";
    if (b.action === "status") {
      const status = b.status === "active" ? "active" : "paused";
      body = { status, platform }; path = "/ads/campaigns/" + encodeURIComponent(campaignId) + "/status";
    } else if (b.action === "budget") {
      const type = b.type === "lifetime" ? "lifetime" : "daily";
      const amount = Number(b.amount);
      if (!isFinite(amount) || amount <= 0 || amount > (type === "daily" ? AD_MAX_DAILY : AD_MAX_LIFETIME)) return NextResponse.json({ error: "תקציב לא תקין" }, { status: 400 });
      body = { platform, budget: { amount, type } }; path = "/ads/campaigns/" + encodeURIComponent(campaignId);
    } else return NextResponse.json({ error: "bad action" }, { status: 400 });
    const supa = await sbServer();
    try {
      const j = await zapi(path, { method, body: JSON.stringify(body) });
      await supa.from("crm_ad_launches").insert({ org_id: org, action: String(b.action), name: String(c.campaignName || campaignId), request: { campaignId, ...body }, result: j, ok: true });
      return NextResponse.json({ ok: true });
    } catch (e) {
      const f = zfail(e);
      await supa.from("crm_ad_launches").insert({ org_id: org, action: String(b.action), name: String(c.campaignName || campaignId), request: { campaignId, ...body }, result: f.body, ok: false });
      return NextResponse.json(f.body, { status: f.status === 502 ? 400 : f.status });
    }
  } catch (e) {
    const f = zfail(e);
    return NextResponse.json(f.body, { status: f.status });
  }
}
