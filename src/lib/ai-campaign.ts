/* "קמפיין AI": the AI-managed paid campaign product. One monthly price, an optional
   50% first-month promo, and one-off add-ons. Pure function: config + input -> what the
   document shows, plus the frozen totals that signing turns into services and payments. */
import type { Template } from "./quote-engine";

export type AiAddon = { id: string; label: string; d: string; price: number };
export type AiPricing = { price: number; promoPct: number; payUrl: string; addons: AiAddon[] };
export type AiPlatform = "either" | "meta" | "tiktok";
export type AiInput = {
  price: number;        // monthly, before VAT
  promo: boolean;       // first month at promoPct off
  platform: AiPlatform;
  addons: string[];     // selected add-on ids
  addonPrices?: Record<string, number>;  // an add-on's price in this quote, when it differs from the catalog
  payUrl: string;       // payment page sent to the client
};

export const PAY_URL_DEFAULT = "https://app.icount.co.il/m/4b2b7/c692ea98p19u6acb537?utm_source=iCount&utm_medium=paypage&utm_campaign=25";

export const DEFAULT_AI: AiPricing = {
  price: 600,
  promoPct: 50,
  payUrl: PAY_URL_DEFAULT,
  addons: [
    { id: "lp", label: "דף נחיתה", d: "דף ממיר שמחובר לקמפיין, עם טופס לידים וכפתור וואטסאפ", price: 1200 },
    { id: "site5", label: "אתר תדמית, עד 5 דפים", d: "אתר עסקי מעוצב, מותאם לנייד, עם טפסים לאיסוף לידים", price: 4500 },
    { id: "anim3", label: "חבילת 3 סרטונים", d: "סרטונים שיווקיים מוכנים לפרסום בקמפיין ובעמודים", price: 1100 },
    { id: "shoot", label: "יום צילום", d: "צילום בבית העסק, עד 5 שעות, עם תכנים כתובים מראש", price: 2200 },
    { id: "gfx8", label: "חבילת גרפיקות, 8 גרפיקות", d: "גרפיקות מעוצבות לפי השפה של העסק", price: 300 },
  ],
};

export function withAi(a: unknown): AiPricing {
  const o = (a && typeof a === "object" ? a : {}) as Partial<AiPricing>;
  return {
    price: typeof o.price === "number" && o.price > 0 ? o.price : DEFAULT_AI.price,
    promoPct: typeof o.promoPct === "number" && o.promoPct > 0 && o.promoPct < 100 ? o.promoPct : DEFAULT_AI.promoPct,
    payUrl: typeof o.payUrl === "string" && /^https:\/\//.test(o.payUrl) ? o.payUrl : DEFAULT_AI.payUrl,
    addons: Array.isArray(o.addons) && o.addons.length ? o.addons : DEFAULT_AI.addons,
  };
}

export function emptyAi(A: AiPricing): AiInput {
  return { price: A.price, promo: true, platform: "either", addons: [], payUrl: A.payUrl };
}
export function normalizeAi(a: unknown, A: AiPricing): AiInput {
  const base = emptyAi(A);
  const o = (a && typeof a === "object" ? a : {}) as Partial<AiInput>;
  return {
    price: typeof o.price === "number" && o.price > 0 ? o.price : base.price,
    promo: typeof o.promo === "boolean" ? o.promo : base.promo,
    platform: o.platform === "meta" || o.platform === "tiktok" ? o.platform : "either",
    addons: Array.isArray(o.addons) ? o.addons : [],
    addonPrices: o.addonPrices && typeof o.addonPrices === "object" ? o.addonPrices : {},
    payUrl: typeof o.payUrl === "string" && /^https:\/\//.test(o.payUrl) ? o.payUrl : base.payUrl,
  };
}

const nis = (n: number) => Math.round(n || 0).toLocaleString("he-IL") + " ₪";
const PLATFORM: Record<AiPlatform, string> = {
  either: "מטא (פייסבוק ואינסטגרם) או טיקטוק",
  meta: "מטא (פייסבוק ואינסטגרם)",
  tiktok: "טיקטוק",
};

export type AiRow = { cls: "" | "head" | "grand"; a: string; b: string; was?: string };
export type AiModel = {
  title: string;
  sub: string;
  promo: boolean;
  promoPct: number;
  price: { title: string; desc: string; was: string; num: string; sub: string };
  inc: { t: string; s: string; no?: boolean }[];
  summary: AiRow[];
  summaryNote: string;
  addons: { t: string; d: string; net: string; gross: string; on: boolean }[];
  addonsNote: string;
  timelines: { t: string; s: string }[];
  timelinesNote: string;
  terms: string[];
  // used by the products quote (lib/products.ts); the AI campaign leaves them empty
  notice?: { text: string; chip: string } | null;
  priceLines?: { a: string; was?: string; b: string; k?: string }[];  // k = "חודשי" / "חד פעמי"
  figs?: { label: string; was?: string; num: string }[];             // the price card totals: monthly on top, one-off below
  incGroups?: { title: string; items: { t: string; s: string; no?: boolean }[] }[];
  termGroups?: { title: string; items: string[] }[];
  payNow?: string;
  totals: {
    product: "ai";
    title: string;
    monthly: number;
    oneoff: number;
    firstMonth: number;
    monthlyLines: { name: string; price: number }[];
    oneoffLines: { name: string; price: number }[];
    commit: false;
  };
};

export function computeAi(A: AiPricing, I: AiInput, vat: number, T: Template): AiModel {
  const v = (vat || 0) / 100;
  const g = (n: number) => Math.round(n * (1 + v));
  const price = Math.max(0, Math.round(I.price || 0));
  const pct = A.promoPct;
  const first = I.promo ? Math.round(price * (100 - pct) / 100) : price;
  // an add-on keeps the price it had in this quote when that was set (e.g. a quote sent before a price change)
  const own = I.addonPrices || {};
  const priced = A.addons.map((x) => (typeof own[x.id] === "number" ? { ...x, price: own[x.id] } : x));
  const picked = priced.filter((x) => I.addons.includes(x.id));
  const oneoff = picked.reduce((s, x) => s + x.price, 0);
  const vatLbl = 'מע"מ ' + (vat || 0) + "%";
  const brand = T.name || "Simple Solution";

  const title = I.promo ? `קמפיין ממומן · ${pct}% הנחה על החודש הראשון` : "קמפיין ממומן";
  const sub = `ניהול קמפיין ממומן בפלטפורמה אחת, דרך מערכת AI ש-${brand} מפתחת`;

  const priceCard = I.promo
    ? { title: "החודש הראשון", desc: `${nis(first)} במקום ${nis(price)}, לפני מע"מ · מהחודש השני ${nis(price)} לחודש`, was: nis(g(price)), num: nis(g(first)), sub: 'לחודש הראשון, כולל מע"מ' }
    : { title: "ניהול חודשי", desc: `${nis(price)} לחודש, לפני מע"מ`, was: "", num: nis(g(price)), sub: 'לחודש, כולל מע"מ' };

  const inc = [
    { t: "ניהול קמפיין ממומן, פלטפורמה אחת", s: PLATFORM[I.platform] + ": בניית הקמפיין, המודעות, מעקב ואופטימיזציה שוטפת" },
    { t: "ניהול דרך מערכת AI", s: `הקמפיין מנוהל דרך מערכת AI בפיתוח של ${brand}, ואני דואג שכל החלטה בו נשענת על המספרים של העסק שלך` },
    { t: "פגישת תוצאות כל שבועיים", s: "רואים בדיוק מה עובד, לאן הולך כל שקל, ומה משפרים" },
    { t: "איש קשר אחד לכל הקמפיין", s: "כתובת אחת לכל שאלה, בלי לרדוף אחרי כמה גורמים" },
    { t: "לא כלול: תקציב הפרסום", s: "משולם ישירות לפלטפורמה, מכרטיס האשראי שלך", no: true },
    { t: "לא כלול: פלטפורמה נוספת ותוספות", s: picked.length ? "פלטפורמה נוספת מתומחרת בנפרד. התוספות שנבחרו מופיעות בסיכום" : "אתר, דף נחיתה וסרטונים מתומחרים בנפרד, לפי הטבלה בהמשך", no: true },
  ];

  const S: AiRow[] = [];
  S.push({ cls: "head", a: I.promo ? "החודש הראשון" : "חיוב חודשי", b: I.promo ? pct + "% הנחה" : "" });
  S.push({ cls: "", a: 'ניהול קמפיין ממומן, לפני מע"מ', b: nis(first) });
  picked.forEach((x) => S.push({ cls: "", a: x.label + ', חד פעמי, לפני מע"מ', b: nis(x.price) }));
  const net = first + oneoff;
  S.push({ cls: "", a: vatLbl, b: nis(g(net) - net) });
  S.push({ cls: "grand", a: picked.length ? "סה\"כ לתשלום בהצטרפות" : I.promo ? "סה\"כ לחודש הראשון" : "סה\"כ לחודש", b: nis(g(net)) + ' כולל מע"מ' });
  const summaryNote = I.promo ? `מהחודש השני: ${nis(price)} לחודש לפני מע"מ, ${nis(g(price))} כולל מע"מ.` : "";

  const addons = priced.map((x) => ({ t: x.label, d: x.d, net: nis(x.price), gross: nis(g(x.price)), on: I.addons.includes(x.id) }));

  const terms = [
    `כל המחירים בהצעה הם לפני מע"מ. ${vatLbl}`,
    "תשלום בכרטיס אשראי בלבד, בהוראה קבועה חודשית",
    "חיוב ב-1 לכל חודש. התחלה באמצע החודש מחויבת יחסית",
    ...(I.promo ? [`ההנחה חלה על החודש הראשון בלבד. מהחודש השני ${nis(price)} לחודש לפני מע"מ`] : []),
    "תקציב הפרסום אינו כלול, ומשולם ישירות לפלטפורמה",
    "נדרשת גישה מלאה לחשבונות הפלטפורמה",
    "אין התחייבות לתוצאות. תלוי בנתוני העסק והשוק",
    "ללא התחייבות למספר חודשים. עצירה בהודעה של 10 ימים מראש",
    "תוספות נגבות במעמד אישור ההצעה",
    ...((T.extraTerms || []) as string[]).map((x) => x.trim()).filter(Boolean),
  ];

  // price card: every line the client pays, and the totals before VAT
  const priceLines = [
    { a: "קמפיין AI", k: "חודשי", was: I.promo ? nis(price) : undefined, b: nis(first) },
    ...picked.map((x) => ({ a: x.label, k: "חד פעמי", b: nis(x.price) })),
  ];
  const figs = [
    { label: "חודשי", was: I.promo ? nis(price) : undefined, num: nis(first) },
    ...(picked.length ? [{ label: "חד פעמי", num: nis(oneoff) }] : []),
  ];

  return {
    title, sub, promo: I.promo, promoPct: pct, price: priceCard, inc, priceLines, figs,
    summary: S, summaryNote, addons,
    addonsNote: "תשלום חד פעמי, מחוץ לחיוב החודשי. בחירת תוספת אינה חובה, וניתן להוסיף אותה גם בהמשך.",
    timelines: [
      { t: "אפיון וקליטת חומרים", s: "עד 3 ימים" },
      { t: "העלאת הקמפיין לאוויר", s: "עד 4 ימים מסיום פגישת האפיון" },
      { t: "פגישת תוצאות", s: "כל שבועיים" },
    ],
    timelinesNote: "לוחות הזמנים נספרים מרגע שכל החומרים אצלי: טקסטים, תמונות, לוגו וגישות למערכות. עיכוב בקבלת חומר דוחה את הלוח באותו מספר ימים.",
    terms,
    totals: {
      // due at signing = first month + add-ons; monthly billing starts the following month
      product: "ai", title: "קמפיין AI", monthly: price, oneoff: first + oneoff, firstMonth: first,
      monthlyLines: [{ name: "קמפיין AI, ניהול קמפיין ממומן", price }],
      oneoffLines: [{ name: I.promo ? "קמפיין AI, החודש הראשון (" + pct + "% הנחה)" : "קמפיין AI, החודש הראשון", price: first }, ...picked.map((x) => ({ name: x.label, price: x.price }))],
      commit: false,
    },
  };
}

/* everything a screen needs to render an AI quote from a stored row */
export function aiView(input: Record<string, unknown> | null | undefined, pricing: unknown, vat: number, T: Template) {
  const inp = (input || {}) as { client?: string; biz?: string; date?: string; validDays?: number; ai?: unknown };
  const A = withAi((pricing as { ai?: unknown } | null)?.ai);
  const I = normalizeAi(inp.ai, A);
  const m = computeAi(A, I, vat, T);
  const date = inp.date || new Date().toISOString().slice(0, 10);
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() + (Number(inp.validDays) || 14));
  const until = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  return { A, I, m, to: inp.client || "", biz: inp.biz || "", date, until };
}
export const isAi = (input: unknown) => !!input && typeof input === "object" && (input as { product?: string }).product === "ai";
