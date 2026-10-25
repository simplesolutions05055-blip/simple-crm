/* a Meta lead-form answer set (from Zernio: the webhook, the daily backup sync or the manual sync button)
   turned into the CRM lead shape that crm_ingest_lead_org takes */
type J = Record<string, unknown>;
const str = (v: unknown, max = 500) => String(v ?? "").trim().slice(0, max);

function pick(fields: Record<string, string>, re: RegExp, not?: RegExp) {
  const k = Object.keys(fields).find((x) => re.test(x) && !(not && not.test(x)));
  return k ? str(fields[k], 300) : "";
}

export function leadFromForm(fields: Record<string, string>, opts: { platform?: string; formName?: string; campaign?: string; adName?: string }) {
  const first = pick(fields, /^first_?name$/i), last = pick(fields, /^last_?name$/i);
  const name = pick(fields, /full_?name|^name$|שם/i, /company|business|עסק/i) || [first, last].filter(Boolean).join(" ");
  const known = /name|phone|email|city|company|business|שם|טלפון|אימייל|עיר|עסק/i;
  const extra = Object.entries(fields).filter(([k]) => !known.test(k)).map(([k, v]) => k + ": " + str(v, 300));
  const city = pick(fields, /city|עיר/i);
  return {
    name, phone: pick(fields, /phone|טלפון/i), email: pick(fields, /e-?mail|אימייל/i),
    biz: pick(fields, /company|business|עסק/i),
    source: opts.platform === "instagram" ? "קמפיין I" : "קמפיין F",
    campaign: str(opts.campaign, 160) || str(opts.formName, 160) || "טופס לידים",
    message: [
      "ליד מטופס במודעה" + (opts.formName ? " (" + str(opts.formName, 160) + ")" : ""),
      opts.adName ? "מודעה: " + str(opts.adName, 160) : "",
      city ? "עיר: " + city : "", ...extra,
    ].filter(Boolean).join("\n"),
  };
}

export function hasContact(l: J) {
  return !!(str(l.name) || str(l.phone));
}
