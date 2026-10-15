import { NextResponse, type NextRequest } from "next/server";
import { ownAccount, zapi, zfail } from "@/lib/zernio";
import { LEAD_QUESTIONS } from "@/lib/ads";

type J = Record<string, unknown>;
const str = (v: unknown, max = 500) => String(v ?? "").trim().slice(0, max);
const META = ["facebook", "instagram", "metaads"];

/* Meta lead forms of a connected Facebook / Instagram / Meta ads account.
   GET ?org&accountId -> { forms: [{ id, name, status }] }
   POST { org, accountId, name, privacyPolicyUrl, questions: ["FULL_NAME", ...], thankYouTitle?, thankYouBody?, websiteUrl? } -> { form } */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const org = str(p.get("org"), 64), accountId = str(p.get("accountId"), 64);
  if (!org || !accountId) return NextResponse.json({ error: "missing params" }, { status: 400 });
  try {
    const acc = await ownAccount(org, accountId);
    if (!acc || !META.includes(acc.platform)) return NextResponse.json({ error: "החשבון לא שייך לעסק הזה" }, { status: 403 });
    const j = await zapi("/ads/lead-forms?" + new URLSearchParams({ accountId, limit: "50" }));
    const forms = ((j.forms || []) as J[]).map((f) => ({ id: str(f.id, 64), name: str(f.name, 200), status: str(f.status ?? f.state, 40) })).filter((f) => f.id);
    return NextResponse.json({ forms });
  } catch (e) {
    const f = zfail(e);
    return NextResponse.json(f.body, { status: f.status });
  }
}

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as J;
  const org = str(b.org, 64), accountId = str(b.accountId, 64);
  const bad = (m: string) => NextResponse.json({ error: m }, { status: 400 });
  const name = str(b.name, 120);
  const privacyPolicyUrl = str(b.privacyPolicyUrl, 1000);
  const websiteUrl = str(b.websiteUrl, 1000);
  const qs = (Array.isArray(b.questions) ? b.questions : []).map((q) => str(q, 40)).filter((q) => LEAD_QUESTIONS.some((x) => x[0] === q));
  if (!org || !accountId) return bad("missing params");
  if (!name) return bad("חסר שם לטופס");
  if (!/^https:\/\//.test(privacyPolicyUrl)) return bad("חסר קישור למדיניות הפרטיות (מתחיל ב-https)");
  if (websiteUrl && !/^https?:\/\//.test(websiteUrl)) return bad("קישור האתר לא תקין");
  if (!qs.includes("PHONE") && !qs.includes("EMAIL")) return bad("הטופס צריך לבקש לפחות טלפון או אימייל");
  try {
    const acc = await ownAccount(org, accountId);
    if (!acc || !META.includes(acc.platform)) return NextResponse.json({ error: "החשבון לא שייך לעסק הזה" }, { status: 403 });
    const body = {
      accountId, name, privacyPolicyUrl,
      platformSpecificData: {
        questions: qs.map((type) => ({ type })),
        privacyPolicyLinkText: "מדיניות פרטיות",
        locale: "he_IL",
        thankYouTitle: str(b.thankYouTitle, 60) || "תודה, קיבלנו את הפרטים",
        thankYouBody: str(b.thankYouBody, 300) || "נחזור אליך בהקדם.",
        ...(websiteUrl ? { thankYouButtonType: "VIEW_WEBSITE", thankYouButtonText: "לאתר שלנו", thankYouWebsiteUrl: websiteUrl } : {}),
      },
    };
    const j = await zapi("/ads/lead-forms", { method: "POST", body: JSON.stringify(body) });
    const f = (j.form || {}) as J;
    return NextResponse.json({ form: { id: str(f.id, 64), name: str(f.name, 200) || name } });
  } catch (e) {
    const f = zfail(e);
    return NextResponse.json(f.body, { status: f.status === 502 ? 400 : f.status });
  }
}
