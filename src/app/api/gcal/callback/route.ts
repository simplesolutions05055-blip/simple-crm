import { NextResponse, type NextRequest } from "next/server";
import { sbServer } from "@/lib/supabase/server";
import { redirectUri } from "@/lib/gcal";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const back = (s: string) => {
    const res = NextResponse.redirect(origin + "/settings/connections?tab=" + encodeURIComponent("יומן גוגל") + "&gcal=" + s);
    res.cookies.delete({ name: "gcal_state", path: "/api/gcal" });
    return res;
  };
  const p = req.nextUrl.searchParams;
  if (p.get("error")) return back("denied");
  const code = p.get("code");
  if (!code || !p.get("state") || p.get("state") !== req.cookies.get("gcal_state")?.value) return back("state");

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(origin), grant_type: "authorization_code",
    }),
  });
  const j = await r.json();
  if (!r.ok || !j.refresh_token) return back("token");
  let email = "";
  try { email = JSON.parse(Buffer.from(String(j.id_token).split(".")[1], "base64url").toString()).email || ""; } catch { /* */ }

  const supa = await sbServer();
  const { error } = await supa.rpc("crm_gcal_save", { p_key: process.env.GCAL_SERVER_KEY, p_refresh: j.refresh_token, p_email: email });
  if (error) return back("save");
  return back("ok");
}
