/* daily summary for n8n. GET with header x-api-key */
import { NextResponse, type NextRequest } from "next/server";
import { sbAnon } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const key = req.headers.get("x-api-key") || "";
  if (!key.startsWith("sscrm_")) return NextResponse.json({ ok: false, error: "missing api key" }, { status: 401 });
  const { data, error } = await sbAnon().rpc("crm_digest", { p_key: key });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: error.message.includes("invalid") ? 401 : 400 });
  return NextResponse.json(data);
}
