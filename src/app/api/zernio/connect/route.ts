import { NextResponse, type NextRequest } from "next/server";
import { ZERNIO_PLATFORMS, profileFor, zapi, zernioConfigured } from "@/lib/zernio";

/* sends the browser to the network's login through Zernio; Zernio returns to the connections tab
   with ?connected=<platform> or ?error=... appended */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const back = origin + "/settings/connections?tab=" + encodeURIComponent("רשתות חברתיות");
  const p = req.nextUrl.searchParams;
  const org = p.get("org") || "";
  const platform = p.get("platform") || "";
  if (!zernioConfigured()) return NextResponse.redirect(back + "&zernio=missing");
  if (!org || !(ZERNIO_PLATFORMS as readonly string[]).includes(platform)) return NextResponse.redirect(back + "&zernio=bad");
  try {
    const profileId = await profileFor(org, true);
    const q = new URLSearchParams({ profileId: profileId!, redirect_url: back });
    const j = await zapi("/connect/" + platform + "?" + q.toString());
    if (!j.authUrl) throw new Error("no_auth_url");
    return NextResponse.redirect(String(j.authUrl));
  } catch (e) {
    return NextResponse.redirect(back + "&zernio=fail&reason=" + encodeURIComponent((e as Error).message.slice(0, 200)));
  }
}
