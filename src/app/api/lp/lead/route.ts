/* the CRM's own landing pages (/lp/...) -> a new lead. Public, so: a honeypot field, a minimum fill time,
   an Israeli phone check, and only the landing pages listed here can write, each into its own business. */
import { NextResponse, type NextRequest } from "next/server";
import { job } from "@/lib/ads-server";
import { leadFromForm } from "@/lib/ads-leads";

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
  /* the TikTok instant form sends its answers as [{ field, value }] (Make relays them as is): name and phone are read
     from them, the other answers go to the lead's message */
  const answers = Array.isArray(b.answers) ? (b.answers as Record<string, unknown>[]) : [];
  const fromForm = answers.length
    ? leadFromForm(Object.fromEntries(answers.filter((a) => a && str(a.field)).map((a) => [str(a.field, 80), str(a.value, 300)])), {})
    : null;
  const name = str(b.name, 120) || str(fromForm?.name, 120);
  const phone = (str(b.phone, 30) || str(fromForm?.phone, 30)).replace(/[^\d+]/g, "").replace(/^\+972/, "0").replace(/^972/, "0");
  if (name.length < 2) return NextResponse.json({ ok: false, error: "חסר שם" }, { status: 400 });
  if (!/^0(5\d|[2-4]|[89]|7\d)\d{7}$/.test(phone)) return NextResponse.json({ ok: false, error: "מספר טלפון לא תקין" }, { status: 400 });
  if (b.terms !== true) return NextResponse.json({ ok: false, error: "צריך לאשר את התנאים ומדיניות הפרטיות" }, { status: 400 });
  /* a lead from the TikTok instant form, relayed by Make: labelled as such, and taken in once per TikTok lead id */
  const form = str(b.form, 20) === "tiktok";
  const formLead = form ? str(b.lead_id, 80).replace(/[^\w-]/g, "") : "";
  const utm = form ? "tiktok" : str(b.utm_source, 60);
  const source = (SOURCE.find(([re]) => re.test(utm)) || [null, "אתר ישיר"])[1];
  const lead = {
    name, phone, source,
    campaign: str(b.utm_campaign, 160) || page.campaign,
    landing_page: form ? "" : str(b.url, 300),
    message: form
      ? ["השאיר פרטים בטופס הלידים של טיקטוק" + (str(b.form_name) ? " (" + str(b.form_name, 120) + ")" : ""), str(b.ad_name) ? "מודעה: " + str(b.ad_name, 160) : "",
          ...(fromForm ? fromForm.message.split("\n").slice(1) : []), b.test === true ? "ליד בדיקה - אפשר למחוק" : ""].filter(Boolean).join("\n")
      : ["השאיר פרטים בדף הנחיתה: " + page.campaign, utm ? "מקור: " + utm + (str(b.utm_content) ? " / " + str(b.utm_content, 120) : "") : ""].filter(Boolean).join("\n"),
    consent: b.marketing === true,
    consent_text: b.marketing === true ? "מאשר/ת לקבל עדכונים ומבצעים במייל ובוואטסאפ" : null,
  };
  try {
    const r = await job<Record<string, unknown>>("ingest_lead", page.org, { ext: formLead ? "tt-" + formLead : "lp-" + crypto.randomUUID(), lead });
    return NextResponse.json({ ok: true, duplicate: !!r?.duplicate });
  } catch (e) {
    console.error("lp lead", (e as Error).message);
    return NextResponse.json({ ok: false, error: "השליחה נכשלה. אפשר לכתוב לנו בוואטסאפ" }, { status: 500 });
  }
}
