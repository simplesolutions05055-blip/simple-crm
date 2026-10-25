/* runs one draft through the creative engine. Called by the nightly run and the campaign page with the server key. */
import { NextResponse, after, type NextRequest } from "next/server";
import { runCreative } from "@/lib/ads-actions";
import { checkCronKey } from "@/lib/ads-server";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!checkCronKey(req.headers.get("x-cron-key"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const org = String(b.org || ""), id = String(b.id || "");
  if (!org || !id) return NextResponse.json({ error: "missing" }, { status: 400 });
  after(() => runCreative(org, id).then(() => undefined));
  return NextResponse.json({ ok: true }, { status: 202 });
}
