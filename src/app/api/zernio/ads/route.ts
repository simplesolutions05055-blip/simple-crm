import { NextResponse, type NextRequest } from "next/server";
import { ADS_PLATFORMS, accountsFor, profileFor, zapi, zernioConfigured, zfail } from "@/lib/zernio";

const day = (d: Date) => d.toISOString().slice(0, 10);
type J = Record<string, unknown>;

/* read only for now: the ad connections of this business and its campaigns with spend and results.
   ?org&days=7|30|90 */
export async function GET(req: NextRequest) {
  if (!(await zernioConfigured())) return NextResponse.json({ configured: false });
  const org = req.nextUrl.searchParams.get("org") || "";
  const days = Math.min(730, Math.max(7, Number(req.nextUrl.searchParams.get("days")) || 30));
  if (!org) return NextResponse.json({ error: "missing org" }, { status: 400 });
  try {
    const profileId = await profileFor(org, false);
    if (!profileId) return NextResponse.json({ configured: true, adAccounts: [], campaigns: [] });
    const all = await accountsFor(profileId);
    const adAccounts = all.filter((a) => ADS_PLATFORMS.includes(a.platform));
    let campaigns: J[] = [], error = "", addon = false;
    /* on Meta the ads permission can sit on the facebook / instagram account itself, without a separate ads account */
    if (adAccounts.length || all.some((a) => ["facebook", "instagram", "tiktok"].includes(a.platform))) {
      try {
        const to = new Date();
        const q = new URLSearchParams({ profileId, fromDate: day(new Date(to.getTime() - (days - 1) * 86400000)), toDate: day(to), limit: "100" });
        const j = await zapi("/ads/campaigns?" + q);
        campaigns = (Array.isArray(j.campaigns) ? j.campaigns : []) as J[];
      } catch (e) {
        const f = zfail(e);
        if (f.status === 403) throw e;
        error = String(f.body.error || ""); addon = !!(f.body as J).addon;
      }
    }
    return NextResponse.json({
      configured: true, days, adAccounts, error, addon, hasAds: adAccounts.length > 0 || campaigns.length > 0,
      campaigns: campaigns.map((c) => {
        const b = (c.budget || c.campaignBudget || null) as J | null;
        return {
          id: String(c.platformCampaignId || ""), name: String(c.campaignName || ""), platform: String(c.platform || ""),
          status: String(c.status || ""), adAccount: String(c.platformAdAccountName || c.platformAdAccountId || ""),
          currency: String(c.currency || ""), budget: b ? { amount: Number(b.amount) || 0, type: String(b.type || "") } : null,
          objective: String(c.platformObjective || ""), m: c.metrics || {}, ads: Number(c.adCount) || 0,
          budgetLevel: String(c.budgetLevel || ""),
        };
      }),
    });
  } catch (e) {
    const f = zfail(e);
    return NextResponse.json(f.body, { status: f.status });
  }
}
