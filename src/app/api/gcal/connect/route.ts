import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { GCAL_SCOPES, gcalConfigured, redirectUri } from "@/lib/gcal";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  if (!gcalConfigured()) return NextResponse.redirect(origin + "/settings/connections?tab=" + encodeURIComponent("יומן גוגל") + "&gcal=missing");
  const state = randomBytes(16).toString("hex");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: redirectUri(origin), response_type: "code",
    scope: GCAL_SCOPES, access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
  }).toString();
  const res = NextResponse.redirect(url.toString());
  res.cookies.set("gcal_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/api/gcal" });
  return res;
}
