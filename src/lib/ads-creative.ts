/* the creative engine (chapter 10): brief -> strategy (10 angles) -> strategy QA -> direct (copy) -> copy QA ->
   art (feed 4:5 and story 9:16) -> finish (to approval, or straight up when approval is off).
   Runs on the business's own OpenAI key (Vault). Every stage is saved on the draft row. */
import { job } from "@/lib/ads-server";
import type { EngineSettings } from "@/lib/ads-mail";
import { GOAL_LABEL, type Goal } from "@/lib/ads-engine";

type J = Record<string, unknown>;
const str = (v: unknown, max = 2000) => String(v ?? "").trim().slice(0, max);

export const COPY_LIMITS = { graphic_headline: 6, support_line: 8, button: 3, meta_body: 125, meta_headline: 40, meta_description: 30 } as const;
const BANNED = [/מובטח/, /100%/, /הכי טוב בארץ/, /ללא סיכון/, /תוצאות מובטחות/, /בחינם לגמרי/, /מספר 1/];

/* the newest chat model this key can use */
let modelCache = "";
async function chatModel(key: string) {
  if (modelCache) return modelCache;
  const pref = [/^gpt-5\.5$/, /^gpt-5\.2$/, /^gpt-5\.1$/, /^gpt-5$/, /^gpt-4\.1$/, /^gpt-4o$/];
  try {
    const r = await fetch("https://api.openai.com/v1/models", { headers: { authorization: "Bearer " + key }, cache: "no-store" });
    const ids = ((await r.json()).data || []).map((m: J) => String(m.id));
    for (const re of pref) { const hit = ids.find((i: string) => re.test(i)); if (hit) return (modelCache = hit); }
  } catch { /* fall through */ }
  return (modelCache = "gpt-4o");
}

async function chatJson(key: string, system: string, user: string): Promise<J> {
  const model = await chatModel(key);
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", cache: "no-store",
    headers: { authorization: "Bearer " + key, "content-type": "application/json" },
    body: JSON.stringify({ model, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("OpenAI: " + (j?.error?.message || r.status));
  try { return JSON.parse(j.choices?.[0]?.message?.content || "{}"); } catch { throw new Error("OpenAI החזיר תשובה לא תקינה"); }
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
/* numbers in the copy must appear in what the business wrote; the engine never invents a figure */
function inventedNumbers(text: string, source: string) {
  const nums = text.match(/\d[\d,.]*/g) || [];
  const src = source.replace(/,/g, "");
  return nums.filter((n) => !src.includes(n.replace(/,/g, "").replace(/\.$/, "")));
}

export function checkCopy(c: J, source: string): string[] {
  const issues: string[] = [];
  const need = ["graphic_headline", "support_line", "button", "meta_body", "meta_headline"];
  need.forEach((k) => { if (!str(c[k])) issues.push("חסר " + k); });
  if (words(str(c.graphic_headline)) > COPY_LIMITS.graphic_headline) issues.push("כותרת הגרפיקה ארוכה מ-6 מילים");
  if (words(str(c.support_line)) > COPY_LIMITS.support_line) issues.push("שורת התמיכה ארוכה מ-8 מילים");
  const bw = words(str(c.button));
  if (bw < 2 || bw > COPY_LIMITS.button) issues.push("הכפתור צריך 2-3 מילים");
  if (str(c.meta_body).length > COPY_LIMITS.meta_body) issues.push("הטקסט הראשי ארוך מ-125 תווים");
  if (str(c.meta_headline).length > COPY_LIMITS.meta_headline) issues.push("הכותרת ארוכה מ-40 תווים");
  if (str(c.meta_description).length > COPY_LIMITS.meta_description) issues.push("התיאור ארוך מ-30 תווים");
  const all = ["graphic_headline", "support_line", "button", "meta_body", "meta_headline", "meta_description"].map((k) => str(c[k])).join(" ");
  const inv = inventedNumbers(all, source);
  if (inv.length) issues.push("מספרים שלא הופיעו בפרטי העסק: " + inv.join(", "));
  BANNED.forEach((re) => { if (re.test(all)) issues.push("הבטחה אסורה: " + re.source); });
  if (/[\u2013\u2014]/.test(all)) issues.push("מקף ארוך");
  return issues;
}

const RULES = `כללי כתיבה קבועים:
- עברית תקינה וטבעית, פנייה ישירה, בלי סלנג מוגזם ובלי מקף ארוך (רק מקף רגיל).
- בלי הבטחות שקריות ובלי "מובטח", "100%", "הכי טוב".
- אסור להמציא מספרים, מחירים, אחוזים, עדויות או לקוחות. מספר מותר רק אם הופיע בפרטי העסק.
- בלי דחיפות או מחסור מומצאים (בלי "רק היום", "נשארו מקומות אחרונים") אם העסק לא כתב אותם.
- המודעה מדברת על הלקוח והבעיה שלו, לא על העסק.`;

export type CreativeCtx = {
  org: string; draft: J; engine: EngineSettings; campaign: J; goal: Goal;
  existing: { headline: string; body: string }[]; // ads already in the ad set
  winner?: { headline: string; body: string } | null;
};

function briefText(x: CreativeCtx) {
  const b = (x.campaign.brief || {}) as J, d = (x.draft.brief || {}) as J;
  return [
    "שם העסק: " + str(x.engine.business || ""),
    "אתר: " + str(b.site || x.engine.site || ""),
    "תקציר האתר: " + str(b.siteSummary || ""),
    "ההצעה: " + str(b.offer || ""),
    "קהל היעד: " + str(b.audience || ""),
    "זוויות שהעסק מעדיף: " + str(b.angles || ""),
    "הערות: " + str(b.notes || ""),
    "מטרת הקמפיין: " + GOAL_LABEL[x.goal],
    "למה צריך מודעה חדשה: " + str(x.draft.reason || ""),
    d.change_request ? "בקשת שינוי מהבעלים לגרסה הקודמת: " + str(d.change_request) : "",
    d.previous ? "הגרסה הקודמת: " + JSON.stringify(d.previous) : "",
  ].filter((l) => !/: $/.test(l)).join("\n");
}

async function image(key: string, prompt: string, size: string, logo?: string): Promise<string> {
  const model = "gpt-image-2.5-sunburst";
  if (logo) {
    /* the logo goes in as a reference image so it shows in the corner */
    try {
      const lr = await fetch(logo, { cache: "no-store" });
      if (lr.ok) {
        const fd = new FormData();
        fd.append("model", model); fd.append("prompt", prompt + "\nPlace the attached logo small in a corner, unchanged."); fd.append("size", size); fd.append("quality", "high");
        fd.append("image[]", new Blob([await lr.arrayBuffer()], { type: lr.headers.get("content-type") || "image/png" }), "logo.png");
        const r = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { authorization: "Bearer " + key }, body: fd, cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j?.data?.[0]?.b64_json) return j.data[0].b64_json;
      }
    } catch { /* falls back to a plain generation */ }
  }
  const r = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST", cache: "no-store",
    headers: { authorization: "Bearer " + key, "content-type": "application/json" },
    body: JSON.stringify({ model, prompt, size, quality: "high", n: 1, output_format: "jpeg", output_compression: 92 }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.data?.[0]?.b64_json) throw new Error("OpenAI תמונה: " + (j?.error?.message || r.status));
  return j.data[0].b64_json;
}

/* runs the whole pipeline for one draft; returns the finished copy and two base64 images */
export async function runPipeline(x: CreativeCtx, save: (patch: J) => Promise<void>) {
  const key = await job<string | null>("secret", x.org, { name: "openai_api_key" });
  if (!key) throw new Error("חסר מפתח OpenAI בהגדרות (הגדרות > חיבורים)");
  const brief = briefText(x);
  const kind = String(x.draft.kind || "new");
  const direction = kind === "winner" && x.winner ? "המודעה המנצחת שצריך ללכת בכיוון שלה: " + JSON.stringify(x.winner)
    : kind === "fatigue" ? "המודעות הקיימות נשחקו. צריך זווית שונה לגמרי מהן." : kind === "replace" ? "המודעה שמוחלפת לא הביאה תוצאות. צריך זווית אחרת ממנה." : "";
  await save({ stage: "brief", brief: { ...(x.draft.brief as J), text: brief } });

  /* 2. strategy: 10 angles */
  const st = await chatJson(key, "אתה אסטרטג קריאייטיב למודעות מטא בעברית לעסקים קטנים בישראל. מחזיר JSON בלבד.\n" + RULES,
    "פרטי העסק:\n" + brief + "\n\nמודעות קיימות בקבוצה:\n" + JSON.stringify(x.existing) + "\n" + direction +
    "\n\nהחזר JSON: {\"ideas\":[{\"angle\":\"\",\"audience\":\"\",\"awareness\":\"לא מודע|מודע לבעיה|מודע לפתרון|מודע למוצר|מוכן לקנות\",\"hook\":\"\"}]} עם 10 רעיונות שונים זה מזה.");
  const ideas = (Array.isArray(st.ideas) ? st.ideas : []).slice(0, 10) as J[];
  if (ideas.length < 3) throw new Error("שלב האסטרטגיה לא החזיר מספיק רעיונות");
  await save({ stage: "strategy", strategy: ideas });

  /* 3. strategy QA: one idea that follows the rules and does not repeat what already runs */
  const qa = await chatJson(key, "אתה בודק איכות קריאייטיב. מחזיר JSON בלבד.\n" + RULES,
    "פרטי העסק:\n" + brief + "\n\nמודעות קיימות:\n" + JSON.stringify(x.existing) + "\n" + direction + "\n\nרעיונות:\n" + JSON.stringify(ideas) +
    "\n\nפסול רעיון שמפר כלל, שמבטיח משהו שלא כתוב בפרטי העסק, או שחוזר על מודעה קיימת. החזר {\"pick\":<מספר הרעיון מ-0>,\"why\":\"\",\"rejected\":[{\"index\":0,\"reason\":\"\"}]}");
  const pickIdx = Math.min(ideas.length - 1, Math.max(0, Number(qa.pick) || 0));
  const idea = ideas[pickIdx];
  await save({ stage: "strategy_qa", strategy: ideas.map((i, n) => ({ ...i, picked: n === pickIdx, ...(n === pickIdx ? { why: str(qa.why, 400) } : {}) })) });

  /* 4. direct + 5. copy QA, with one rewrite when the checks fail */
  let copy: J = {}, issues: string[] = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    copy = await chatJson(key, "אתה קופירייטר מודעות מטא בעברית. מחזיר JSON בלבד.\n" + RULES,
      "פרטי העסק:\n" + brief + "\n\nהזווית שנבחרה: " + JSON.stringify(idea) + (issues.length ? "\n\nהגרסה הקודמת נפסלה בגלל: " + issues.join("; ") + "\nתקן." : "") +
      "\n\nהחזר JSON: {\"graphic_headline\":\"עד 6 מילים, על התמונה\",\"support_line\":\"עד 8 מילים, על התמונה\",\"button\":\"2-3 מילים\",\"meta_body\":\"טקסט ראשי עד 125 תווים\",\"meta_headline\":\"עד 40 תווים\",\"meta_description\":\"עד 30 תווים\",\"visual\":\"תיאור קצר באנגלית של התמונה, בלי טקסט\"}");
    issues = checkCopy(copy, brief);
    if (!issues.length) {
      const q2 = await chatJson(key, "אתה עורך לשון ובודק אמת למודעות. מחזיר JSON בלבד.\n" + RULES,
        "פרטי העסק:\n" + brief + "\n\nהמודעה:\n" + JSON.stringify(copy) + "\n\nבדוק עברית תקינה, אין הבטחה שקרית, אין מספר או עובדה שלא בפרטי העסק. החזר {\"ok\":true|false,\"issues\":[\"\"]}");
      if (q2.ok === true || !(Array.isArray(q2.issues) && q2.issues.length)) break;
      issues = (q2.issues as string[]).map((s) => str(s, 200)).filter(Boolean);
    }
  }
  if (issues.length) throw new Error("הטקסט לא עבר בדיקה: " + issues.join("; "));
  await save({ stage: "copy_qa", copy: { ...copy, angle: idea } });

  /* 6. art: brand colors, the Hebrew lines on the image, safe zones on the vertical one */
  const brand = [x.engine.colors ? "Brand colors: " + x.engine.colors + "." : "", x.engine.brand_in_ads && x.engine.business ? "Business name for small branding: " + x.engine.business + "." : ""].join(" ");
  const textLine = "Render exactly this Hebrew text, right-to-left, letter for letter, no other text: headline \"" + str(copy.graphic_headline, 80) + "\", smaller line \"" + str(copy.support_line, 100) + "\".";
  const base = "Professional social media ad photo/illustration for a small Israeli business. " + str(copy.visual, 600) + " " + brand + " " + textLine;
  const logo = x.engine.brand_in_ads && x.engine.logo_url ? String(x.engine.logo_url) : undefined;
  const [feed, story] = await Promise.all([
    image(key, base + " Portrait 4:5 feed layout, text large and readable.", "1088x1360", logo),
    image(key, base + " Vertical 9:16 story layout. Keep the top 14% and the bottom 35% of the image free of any text or logo; place the text in the middle band.", "1152x2048", logo),
  ]);
  await save({ stage: "art" });
  return { copy: { ...copy, angle: idea }, feed, story };
}
