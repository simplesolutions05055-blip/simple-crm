import { NextResponse, type NextRequest } from "next/server";
import { ADS_PLATFORMS, accountsFor, profileFor, zapi, zernioConfigured, zfail } from "@/lib/zernio";

const day = (d: Date) => d.toISOString().slice(0, 10);
type J = Record<string, unknown>;

/* live numbers of the business's own pages: accounts with follower counts (always), and when the Zernio
   plan includes analytics, the dashboard for the window plus the strongest posts. ?org&days=7|30|90 */
export async function GET(req: NextRequest) {
  if (!(await zernioConfigured())) return NextResponse.json({ configured: false });
  const org = req.nextUrl.searchParams.get("org") || "";
  const days = Math.min(365, Math.max(7, Number(req.nextUrl.searchParams.get("days")) || 30));
  if (!org) return NextResponse.json({ error: "missing org" }, { status: 400 });
  try {
    const profileId = await profileFor(org, false);
    if (!profileId) return NextResponse.json({ configured: true, accounts: [] });
    const accounts = (await accountsFor(profileId)).filter((a) => !ADS_PLATFORMS.includes(a.platform));
    const to = new Date();
    const from = new Date(to.getTime() - (days - 1) * 86400000);
    const q = new URLSearchParams({ profileId, fromDate: day(from), toDate: day(to) });
    let dashboard: J | null = null, posts: J[] = [], analyticsError = "", addon = false;
    try {
      const dq = new URLSearchParams(q); dq.set("compare", "previous_period"); dq.set("topPosts", "0"); dq.set("recentPosts", "0");
      const pq = new URLSearchParams(q); pq.set("sortBy", "engagement"); pq.set("order", "desc"); pq.set("limit", "8");
      const [d, p] = await Promise.all([zapi("/analytics/dashboard?" + dq), zapi("/analytics?" + pq)]);
      dashboard = d;
      posts = (Array.isArray(p.posts) ? p.posts : []) as J[];
    } catch (e) {
      const f = zfail(e);
      if (f.status === 403) throw e;
      analyticsError = String(f.body.error || "");
      addon = !!(f.body as J).addon;
    }
    return NextResponse.json({
      configured: true, days, accounts, addon, analyticsError,
      dashboard: dashboard && {
        totals: dashboard.totals || {}, previousTotals: dashboard.previousTotals || null,
        followers: dashboard.followers || {}, previousFollowers: dashboard.previousFollowers || null,
        daily: dashboard.daily || [], dataAsOf: dashboard.dataAsOf || null,
      },
      posts: posts.map((x) => ({
        id: String(x._id || ""), platform: String(x.platform || ""), content: String(x.content || "").slice(0, 240),
        url: String(x.platformPostUrl || ""), at: String(x.publishedAt || ""),
        thumb: String(x.thumbnailUrl || (Array.isArray(x.mediaItems) && (x.mediaItems[0] as J)?.thumbnail) || (Array.isArray(x.mediaItems) && (x.mediaItems[0] as J)?.type === "image" && (x.mediaItems[0] as J)?.url) || ""),
        m: x.analytics || {},
      })),
    });
  } catch (e) {
    const f = zfail(e);
    return NextResponse.json(f.body, { status: f.status });
  }
}
