import { NextResponse, type NextRequest } from "next/server";
import { sbAnon } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const token = typeof b?.token === "string" ? b.token.replace(/[^a-f0-9]/gi, "").slice(0, 64) : "";
  const reason = typeof b?.reason === "string" ? b.reason.slice(0, 500) : "";
  if (!token) return NextResponse.json({ ok: false }, { status: 400 });
  const { data, error } = await sbAnon().rpc("crm_reject_quote", { p_token: token, p_reason: reason });
  if (error) return NextResponse.json({ ok: false }, { status: 400 });
  return NextResponse.json(data);
}
