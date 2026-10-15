import { NextResponse, type NextRequest } from "next/server";
import { accountsFor, profileFor, zapi, zfail } from "@/lib/zernio";

type J = Record<string, unknown>;

/* what the builder needs for one account: its ad accounts, its recent posts and (TikTok) the identities
   an ad may run as. ?org&accountId (facebook, instagram, tiktok or tiktokads account of this business) */
export async function GET(req: NextRequest) {
  const org = req.nextUrl.searchParams.get("org") || "";
  const accountId = req.nextUrl.searchParams.get("accountId") || "";
  if (!org || !accountId) return NextResponse.json({ error: "missing" }, { status: 400 });
  try {
    const profileId = await profileFor(org, false);
    const all = profileId ? await accountsFor(profileId) : [];
    const acc = all.find((a) => a.id === accountId);
    if (!acc) return NextResponse.json({ error: "החשבון לא שייך לעסק הזה" }, { status: 403 });

    /* the ads connection may sit on the posting account itself or on a separate ads account */
    const tiktok = acc.platform === "tiktok" || acc.platform === "tiktokads";
    const adsPlat = tiktok ? "tiktokads" : "metaads";
    const candidates = [...new Set([acc.id, ...all.filter((a) => a.platform === adsPlat).map((a) => a.id)])];
    let adAccounts: J[] = [], adsVia = "", adsError = "";
    for (const c of candidates) {
      try {
        const j = await zapi("/ads/accounts?accountId=" + encodeURIComponent(c));
        const list = (Array.isArray(j.accounts) ? j.accounts : []) as J[];
        if (list.length) { adAccounts = list; adsVia = c; break; }
      } catch (e) { adsError = (e as Error).message; }
    }

    let posts: J[] = [], postsError = "";
    if (acc.platform === "tiktokads") postsError = "כדי לקדם סרטון קיים צריך לחבר גם את חשבון הטיקטוק עצמו (בהגדרות > רשתות חברתיות)";
    else try {
      const j = await zapi("/accounts/" + encodeURIComponent(acc.id) + "/posts");
      posts = (Array.isArray(j.posts) ? j.posts : []) as J[];
    } catch (e) { postsError = (e as Error).message; }

    /* TikTok: who the ad is shown as. Looked up per ad account by the screen through ?adAccountId */
    let identities: J[] = [];
    const adAccountId = req.nextUrl.searchParams.get("adAccountId") || "";
    if (tiktok && adsVia && adAccountId) {
      try {
        const j = await zapi("/ads/tiktok-identities?" + new URLSearchParams({ accountId: adsVia, adAccountId }));
        identities = (Array.isArray(j.identities) ? j.identities : []) as J[];
      } catch { /* the ad then runs as the connected account's own identity */ }
    }

    return NextResponse.json({
      adsVia, adsError: adAccounts.length ? "" : adsError, platform: tiktok ? "tiktok" : "meta",
      identities: identities.map((i) => ({ id: String(i.identityId || ""), type: String(i.identityType || ""), name: String(i.displayName || i.username || ""), username: String(i.username || ""), image: String(i.profileImage || "") })),
      adAccounts: adAccounts.map((a) => ({
        id: String(a.id || ""), name: String(a.name || ""), currency: String(a.currency || ""),
        billing: String(a.billingStatus || "unknown"), selectable: a.selectable !== false,
        unusable: String(a.unusableReason || ""), minDaily: typeof a.minimumDailyBudget === "number" ? a.minimumDailyBudget : null,
        tz: String(a.timezoneName || a.timezone || ""),
      })),
      postsError,
      posts: posts.slice(0, 24).map((p) => ({
        id: String(p.id || ""), text: String(p.message || "").slice(0, 200), at: String(p.createdTime || ""),
        url: String(p.permalink || ""), picture: String(p.picture || ""), type: String(p.mediaType || ""),
      })),
    });
  } catch (e) {
    const f = zfail(e);
    return NextResponse.json(f.body, { status: f.status });
  }
}
