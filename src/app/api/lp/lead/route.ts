/* the CRM's own landing pages (/lp/...) -> a new lead. Public, so: a honeypot field, a minimum fill time,
   an Israeli phone check, and only the landing pages listed here can write, each into its own business. */
import { NextResponse, type NextRequest } from "next/server";
import { job } from "@/lib/ads-server";

const PAGES: Record<string, { org: string; campaign: string }> = {
  "campaign-50": { org: "129ee9eb-a5ac-4762-a941-7c92f9b56ae4", campaign: "מבצע 50% קמפיין AI" },
};
/* utm_source -> the CRM's lead source names */
const SOURCE: [RegExp, string][] = [[/tiktok/i, "קמפיין T"], [/insta|ig/i, "קמפיין I"], [/face|fb|meta/i, "קמפיין F"], [/google|gads/i, "קמפיין G"], [/whats|wa/i, "דיוור וואטסאפ"]];
const str = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const page = PAGES[str(b.page, 40)];
  if (!page) return NextResponse.json({ ok: false, error: "bad page" }, { status: 400 });
  /* bots fill the hidden field or post in under 2 seconds; answer ok so they do not retry */
  if (str(b.website) || Number(b.ms) < 2000) return NextResponse.json({ ok: true });
  const name = str(b.name, 120);
  const phone = str(b.phone, 30).replace(/[^\d+]/g, "").replace(/^\+972/, "0").replace(/^972/, "0");
  if (name.length < 2) return NextResponse.json({ ok: false, error: "חסר שם" }, { status: 400 });
  if (!/^0(5\d|[2-4]|[89]|7\d)\d{7}$/.test(phone)) return NextResponse.json({ ok: false, error: "מספר טלפון לא תקין" }, { status: 400 });
  if (b.terms !== true) return NextResponse.json({ ok: false, error: "צריך לאשר את התנאים ומדיניות הפרטיות" }, { status: 400 });
  const utm = str(b.utm_source, 60);
  const source = (SOURCE.find(([re]) => re.test(utm)) || [null, "אתר ישיר"])[1];
  const lead = {
    name, phone, source,
    campaign: str(b.utm_campaign, 160) || page.campaign,
    landing_page: str(b.url, 300),
    message: ["השאיר פרטים בדף הנחיתה: " + page.campaign, utm ? "מקור: " + utm + (str(b.utm_content) ? " / " + str(b.utm_content, 120) : "") : ""].filter(Boolean).join("\n"),
    consent: b.marketing === true,
    consent_text: b.marketing === true ? "מאשר/ת לקבל עדכונים ומבצעים במייל ובוואטסאפ" : null,
  };
  try {
    const r = await job<Record<string, unknown>>("ingest_lead", page.org, { ext: "lp-" + crypto.randomUUID(), lead });
    return NextResponse.json({ ok: true, duplicate: !!r?.duplicate });
  } catch (e) {
    console.error("lp lead", (e as Error).message);
    return NextResponse.json({ ok: false, error: "השליחה נכשלה. אפשר לכתוב לנו בוואטסאפ" }, { status: 500 });
  }
}
