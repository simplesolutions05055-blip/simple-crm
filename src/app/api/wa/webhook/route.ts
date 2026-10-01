/* Meta WhatsApp Cloud API webhook.
   GET  - subscription check (hub.verify_token must match the token in settings)
   POST - incoming messages and delivery statuses; the signature is checked inside the database with the app secret */
import { NextResponse, type NextRequest } from "next/server";
import { sbAnon } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  if (q.get("hub.mode") !== "subscribe") return new NextResponse("bad request", { status: 400 });
  const { data } = await sbAnon().rpc("crm_wa_verify", { p_token: q.get("hub.verify_token") || "" });
  if (data !== true) return new NextResponse("forbidden", { status: 403 });
  return new NextResponse(q.get("hub.challenge") || "", { status: 200, headers: { "Content-Type": "text/plain" } });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get("x-hub-signature-256") || "";
  const { error } = await sbAnon().rpc("crm_wa_inbound", { p_raw: raw, p_sig: sig });
  if (error) {
    if (error.message.includes("bad signature")) return NextResponse.json({ ok: false }, { status: 401 });
    console.error("wa webhook", error.message);
  }
  // always 200 for anything else, so Meta does not retry forever
  return NextResponse.json({ ok: true });
}
