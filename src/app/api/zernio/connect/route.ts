import { NextResponse, type NextRequest } from "next/server";
import { ZERNIO_PLATFORMS, accountsFor, profileFor, zapi, zernioConfigured } from "@/lib/zernio";

const ADS = ["facebook", "instagram", "tiktok", "googleads", "linkedin"];

/* sends the browser to the network's login through Zernio; Zernio returns to the screen it came from
   with ?connected=<platform> or ?error=... appended.
   mode=ads connects the ad account (from the ads screen). Instagram always goes through Facebook Login,
   so the person picks the Page (and the Instagram account linked to it) instead of getting whatever
   Instagram account the browser happens to be logged in to. */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const p = req.nextUrl.searchParams;
  const ads = p.get("mode") === "ads";
  const back = ads ? origin + "/ads" + "?tab=" + encodeURIComponent("חיבור חשבון מודעות") : origin + "/settings/connections?tab=" + encodeURIComponent("רשתות חברתיות");
  const org = p.get("org") || "";
  const platform = p.get("platform") || "";
  if (!(await zernioConfigured())) return NextResponse.redirect(back + "&zernio=missing");
  if (!org || !(ads ? ADS : (ZERNIO_PLATFORMS as readonly string[])).includes(platform)) return NextResponse.redirect(back + "&zernio=bad");
  try {
    const profileId = (await profileFor(org, true))!;
    const q = new URLSearchParams({ profileId, redirect_url: back });
    let path = "/connect/" + platform;
    if (ads) {
      path += "/ads";
      /* same-token networks: ads ride on the posting account that is already connected */
      const parent = (await accountsFor(profileId)).find((a) => a.platform === platform);
      if (parent && platform !== "googleads") q.set("accountId", parent.id);
      if (p.get("force") === "1") q.set("force", "true");
    } else if (platform === "instagram") {
      q.set("loginMethod", "facebook_login");
    }
    const j = await zapi(path + "?" + q.toString());
    if (j.alreadyConnected) return NextResponse.redirect(back + "&connected=" + encodeURIComponent(String(j.platform || platform)) + "&already=1");
    if (!j.authUrl) throw new Error("no_auth_url");
    return NextResponse.redirect(String(j.authUrl));
  } catch (e) {
    return NextResponse.redirect(back + "&zernio=fail&reason=" + encodeURIComponent((e as Error).message.slice(0, 200)));
  }
}
