/* n8n (or any form) -> new lead. Header: x-api-key: sscrm_...  Body: {name, phone, email, biz, industry, source, campaign, landing_page, message, consent} */
import { NextResponse, type NextRequest } from "next/server";
import { sbAnon } from "@/lib/supabase/server";

const FIELDS = ["name", "phone", "email", "biz", "industry", "source", "campaign", "landing_page", "message", "consent", "consent_text"];

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-api-key") || "";
  if (!key.startsWith("sscrm_")) return NextResponse.json({ ok: false, error: "missing api key" }, { status: 401 });
  const ct = req.headers.get("content-type") || "";
  let body: Record<string, unknown> = {};
  if (ct.includes("application/json")) body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  else body = Object.fromEntries((await req.formData().catch(() => new FormData())).entries());
  const lead: Record<string, unknown> = {};
  for (const f of FIELDS) if (body[f] !== undefined && body[f] !== null) lead[f] = typeof body[f] === "string" ? (body[f] as string).slice(0, 2000) : body[f];
  const { data, error } = await sbAnon().rpc("crm_ingest_lead", { p_key: key, p_lead: lead });
  if (error) {
    const status = error.message.includes("invalid api key") ? 401 : 400;
    return NextResponse.json({ ok: false, error: error.message }, { status });
  }
  return NextResponse.json(data);
}
