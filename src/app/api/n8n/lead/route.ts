/* n8n (or any form) -> new lead.
   Header x-api-key: sscrm_...   (or ?key=sscrm_... for tools that cannot set headers)
   Accepts the CRM's own fields and the website's form payload as-is:
   {name, phone, email, page, url, ref, at, source, campaign, news, news_at, news_ver, news_text} */
import { NextResponse, type NextRequest } from "next/server";
import { sbAnon } from "@/lib/supabase/server";

const str = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : typeof v === "number" ? String(v) : "");
const truthy = (v: unknown) => v === true || v === "true" || v === "on" || v === "1" || v === 1 || v === "yes";

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-api-key") || req.nextUrl.searchParams.get("key") || "";
  if (!key.startsWith("sscrm_")) return NextResponse.json({ ok: false, error: "missing api key" }, { status: 401 });

  const ct = req.headers.get("content-type") || "";
  let raw: Record<string, unknown> = {};
  if (ct.includes("application/json")) raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  else raw = Object.fromEntries((await req.formData().catch(() => new FormData())).entries());
  // n8n often wraps the original request as {body: {...}}
  const b = (raw.body && typeof raw.body === "object" ? raw.body : raw) as Record<string, unknown>;

  const source = str(b.source, 80);
  const lead = {
    name: str(b.name ?? b.full_name ?? b.n, 120),
    phone: str(b.phone ?? b.tel ?? b.t, 40),
    email: str(b.email ?? b.e, 160),
    biz: str(b.biz ?? b.business ?? b.company, 160),
    industry: str(b.industry, 80),
    source: source && !/^(direct|organic|none)$/i.test(source) ? source : "אתר ישיר",
    campaign: str(b.campaign ?? b.utm_campaign, 160),
    landing_page: str(b.landing_page ?? b.url ?? b.page, 300),
    message: [str(b.message ?? b.msg, 1500), str(b.ref) ? "הגיע מ: " + str(b.ref, 300) : ""].filter(Boolean).join("\n"),
    consent: truthy(b.consent ?? b.news),
    consent_text: str(b.consent_text ?? b.news_text, 500) || null,
    spam_score: str(b.spam_score ?? b.spam, 10) || null,
  };

  const { data, error } = await sbAnon().rpc("crm_ingest_lead", { p_key: key, p_lead: lead });
  if (error) {
    const status = error.message.includes("invalid api key") ? 401 : 400;
    return NextResponse.json({ ok: false, error: error.message }, { status });
  }
  return NextResponse.json(data);
}
