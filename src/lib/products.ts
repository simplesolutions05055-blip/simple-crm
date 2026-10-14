/* "מוצרים": a modular quote of one or more products (chatbot, WhatsApp mailing, site, landing page,
   social). Every price line has an original price (from the catalog, editable) and an optional
   price after discount. Pure function: catalog + input -> the same model shape as the AI campaign,
   so AiQuoteDoc renders both. */
import type { Pair, Template } from "./quote-engine";
import type { AiModel, AiRow } from "./ai-campaign";
import { PAY_URL_DEFAULT } from "./ai-campaign";

export type ProdId = "bot" | "mail" | "site" | "lp" | "soc" | "socfull";
export type ProdDef = {
  id: ProdId;
  label: string;      // full name, shown in the document
  short: string;      // chip in the editor and in the title
  sub: string;        // one line under the title when it is the only product
  kind: "monthly" | "oneoff";
  price: number;      // monthly or one-off, before VAT
  setup: number;      // default setup price when the setup line is turned on (monthly products)
  fee: number;        // hosting and maintenance per month (site, landing page)
  inc: Pair[];
  timelines: Pair[];
  terms: string[];
  addons?: string[];  // which add-ons this product offers; a quote shows those of all its products
};
export type PackAddon = { id: string; label: string; d: string; price: number; was?: number };
export type MsgPack = { id: string; n: number; price: number };
export type PackPricing = {
  products: ProdDef[];
  addons: PackAddon[];
  extraPage: number;   // site: each page beyond 5
  bundleMail: number;  // mailing monthly price when the chatbot is in the same quote
  freeMsgs: number;    // messages per month at no cost, permanently
  packs: MsgPack[];
  general: string[];   // terms in every quote
};

const SESSIONS = "סשן נוסף בתשלום, 280 ₪ לשעה";
export const DEFAULT_PACK: PackPricing = {
  products: [
    {
      id: "bot", label: "צ'אטבוט וואטסאפ, פייסבוק ואינסטגרם", short: "צ'אטבוט", kind: "monthly", price: 780, setup: 2000, fee: 0, addons: ["vid3", "shoot", "gfx8"],
      sub: "מענה אוטומטי בתגובות, בסטורי ובפרטי, שמוביל את הפונה לשיחה בוואטסאפ",
      inc: [
        { t: "מענה בתגובות, בסטורי, ברילס ובפרטי", s: "בפייסבוק ובאינסטגרם, עם הובלה של הפונה לוואטסאפ" },
        { t: "צ'אטבוט בוואטסאפ", s: "ממשיך את השיחה, עונה על שאלות ואוסף את פרטי הפונה" },
        { t: "מערכות AI ומענה דמוי אנושי", s: "הנוסחים נבנים לפי העסק שלך ומאושרים על ידך" },
        { t: "ליווי שוטף", s: "עדכון נוסחים ושיפור המענה לאורך הדרך" },
      ],
      timelines: [
        { t: "אפיון", s: "עד 3 ימים ממועד החתימה" },
        { t: "בנייה מלאה לפני בדיקות", s: "עד 14 יום מסיום האפיון" },
        { t: "ליווי שוטף", s: "עד ביצועים מקסימליים של המענה והצ'אטבוט" },
      ],
      terms: [
        "נדרשת גישה מלאה לחשבונות הפלטפורמות ולמספר הוואטסאפ",
        "נוסחי המענה של הבוט מאושרים על ידך לפני העלייה לאוויר",
        "אין התחייבות לתוצאות. תלוי בנתוני העסק והשוק",
      ],
    },
    {
      id: "mail", label: "דיוור וואטסאפ", short: "דיוור וואטסאפ", kind: "monthly", price: 650, setup: 900, fee: 0, addons: [],
      sub: "דיוור מפולח בוואטסאפ לרשימות שלך, עם 500 הודעות בחודש ללא עלות",
      inc: [
        { t: "500 הודעות בחודש ללא עלות", s: "באופן קבוע, בכל חודש" },
        { t: "פילוח הרשימה", s: "כל קהל מקבל את ההודעה שמתאימה לו" },
        { t: "הודעות מותאמות", s: "ניסוח ועיצוב ההודעות, והגשה לאישור מטא" },
        { t: "בדיקה על קהל קטן לפני הרחבה", s: "שולחים לכולם רק את מה שעבד" },
      ],
      timelines: [
        { t: "חיבור מספר הדיוור", s: "עד 3 ימי עסקים" },
        { t: "אישור ההודעות במטא", s: "עד 24 שעות לכל הודעה" },
      ],
      terms: [
        "500 הודעות בחודש ללא עלות, באופן קבוע",
        "הודעות שלא נוצלו בחודש לא עוברות לחודש הבא",
        "הודעות מעבר לכך נרכשות בחבילות חד-פעמיות, ללא התחייבות",
        "הדיוור נשלח לרשימות שאישרו לקבל, ובכל הודעה יש דרך להסיר",
        "ההודעות מוגשות למטא לאישור. האישור אורך עד 24 שעות",
      ],
    },
    {
      id: "site", label: "אתר תדמית, עד 5 דפים", short: "אתר תדמית", kind: "oneoff", price: 4500, setup: 0, fee: 59, addons: ["vid3", "shoot", "gfx8"],
      sub: "אתר עסקי מעוצב עד 5 דפים, מותאם לנייד, עם טפסים לאיסוף לידים",
      inc: [
        { t: "עיצוב ובנייה של עד 5 דפים", s: "לפי הדרישות שלך. כל דף נוסף 280 ₪" },
        { t: "כתיבת הטקסטים", s: "הטקסטים של כל דפי האתר כלולים" },
        { t: "טפסים לאיסוף לידים", s: "לאורך האתר ובכל דף" },
        { t: "כפתור וואטסאפ צף", s: "נגיש בכל מקום בדף, גם בנייד" },
        { t: "התאמה מלאה לנייד", s: "האתר נבנה קודם כל לטלפון" },
        { t: "שני סשנים לתיקונים", s: SESSIONS },
        { t: "אחסון ותחזוקה", s: "59 ₪ לחודש, מהחודש שבו האתר עולה לאוויר" },
      ],
      timelines: [
        { t: "סקיצה ראשונה", s: "עד 7 ימים" },
        { t: "עד שני סבבי תיקונים", s: "עד 3 ימי עסקים לסבב" },
        { t: "דפים פנימיים וחיבורים", s: "14 יום" },
        { t: "העלאה לשרתים", s: "2 עד 3 ימי עסקים" },
      ],
      terms: [
        'המחיר כולל עד 5 דפים. כל דף נוסף 280 ₪ לפני מע"מ',
        "כלולים שני סשנים לתיקונים. " + SESSIONS,
        'אחסון ותחזוקה 59 ₪ לחודש לפני מע"מ, מהחודש שבו האתר עולה לאוויר',
        "הפסקת האחסון והתחזוקה מורידה את האתר מהאוויר",
        "הדומיין נרכש בנפרד, 149 ₪ לשנה, ומתחדש אוטומטית מדי שנה",
        "לוחות הזמנים מתחילים מהיום שבו כל החומרים התקבלו",
        "אישור להוספת קישור קרדיט בתחתית האתר, כמקובל",
      ],
    },
    {
      id: "lp", label: "דף נחיתה", short: "דף נחיתה", kind: "oneoff", price: 1200, setup: 0, fee: 29, addons: ["vid3", "shoot", "gfx8"],
      sub: "עמוד נחיתה ממיר, עם טופס לידים וכפתור וואטסאפ",
      inc: [
        { t: "עמוד נחיתה אחד", s: "מבנה מותאם להמרה גבוהה" },
        { t: "כתיבת קופי", s: "הטקסטים של הדף כלולים" },
        { t: "טופס לידים", s: "הפניות מגיעות אליך ישירות" },
        { t: "כפתור וואטסאפ צף", s: "נגיש בכל מקום בדף, גם בנייד" },
        { t: "שני סשנים לתיקונים", s: SESSIONS },
        { t: "אחסון ותחזוקה", s: "29 ₪ לחודש, מהחודש שבו הדף עולה לאוויר" },
      ],
      timelines: [
        { t: "סקיצה ראשונה", s: "עד 7 ימים" },
        { t: "סבב תיקונים", s: "2 עד 3 ימים" },
        { t: "העלאה לשרתים", s: "2 עד 3 ימי עסקים" },
      ],
      terms: [
        "עמוד נחיתה אחד",
        "כלולים שני סשנים לתיקונים. " + SESSIONS,
        'אחסון ותחזוקה 29 ₪ לחודש לפני מע"מ, מהחודש שבו הדף עולה לאוויר',
        "הפסקת האחסון והתחזוקה מורידה את הדף מהאוויר",
        "הדומיין נרכש בנפרד, 149 ₪ לשנה, ומתחדש אוטומטית מדי שנה",
        "לוחות הזמנים מתחילים מהיום שבו כל החומרים התקבלו",
      ],
    },
    {
      id: "soc", label: "ניהול סושיאל, בסיסי", short: "סושיאל בסיסי", kind: "monthly", price: 900, setup: 0, fee: 0, addons: ["vid3", "shoot", "camp50"],
      sub: "ניהול עמודי הסושיאל: גרפיקות, העלאות ותכנון",
      inc: [
        { t: "10 גרפיקות בחודש", s: "מעוצבות לפי השפה של העסק" },
        { t: "עד 20 העלאות של חומרים שתשלחו", s: "גרפיקות או סרטונים שלך, מעבר למה שאנחנו מפיקים" },
        { t: "סרטון AI אחד במתנה", s: "בחודש הראשון" },
        { t: "תכנון ותזמון", s: "לוח תוכן חודשי ופרסום בזמנים הנכונים" },
      ],
      timelines: [
        { t: "אפיון וקליטת חומרים", s: "עד 3 ימים" },
        { t: "לוח תוכן ראשון", s: "עד 7 ימים מסיום האפיון" },
      ],
      terms: [
        "נדרשת גישה מלאה לחשבונות הפלטפורמות",
        "סרטון ה-AI במתנה ניתן בחודש הראשון בלבד",
        '"העלאות של חומרים שתשלחו" הן גרפיקות או סרטונים שלך, מעבר למה שאנחנו מפיקים בחבילה',
        "גרפיקות והעלאות שלא נוצלו בחודש לא עוברות לחודש הבא",
        "אין התחייבות לתוצאות. תלוי בנתוני העסק והשוק",
      ],
    },
    {
      id: "socfull", label: "ניהול סושיאל מלא", short: "סושיאל מלא", kind: "monthly", price: 3900, setup: 0, fee: 0, addons: ["vid3", "gfx8", "camp50"],
      sub: "ניהול סושיאל מקצה לקצה, כולל יום צילום בכל חודש",
      inc: [
        { t: "יום צילום בכל חודש", s: "בבית העסק, עד 5 שעות, עם תכנים כתובים מראש" },
        { t: "8 סרטונים ועוד 2 סרטוני AI", s: "עריכה מלאה, מוכנים לפרסום" },
        { t: "8 גרפיקות בחודש", s: "מעוצבות לפי השפה של העסק" },
        { t: "עד 30 העלאות של חומרים שתשלחו", s: "גרפיקות או סרטונים שלך, מעבר למה שאנחנו מפיקים" },
        { t: "תכנון ותזמון", s: "לוח תוכן חודשי ופרסום בזמנים הנכונים" },
      ],
      timelines: [
        { t: "אפיון ותכנון יום הצילום", s: "עד 7 ימים" },
        { t: "הספקת הסרטונים", s: "עד 10 ימים מיום הצילום" },
      ],
      terms: [
        "נדרשת גישה מלאה לחשבונות הפלטפורמות",
        "יום צילום אחד בחודש, בבית העסק, עד 5 שעות",
        "הספקת הסרטונים עד 10 ימים מיום הצילום",
        '"העלאות של חומרים שתשלחו" הן גרפיקות או סרטונים שלך, מעבר למה שאנחנו מפיקים בחבילה',
        "תכנים והעלאות שלא נוצלו בחודש לא עוברים לחודש הבא",
        "אין התחייבות לתוצאות. תלוי בנתוני העסק והשוק",
      ],
    },
  ],
  addons: [
    { id: "vid3", label: "חבילת 3 סרטונים", d: "סרטונים שיווקיים מוכנים לפרסום", price: 550 },
    { id: "shoot", label: "יום צילום", d: "צילום בבית העסק, עד 5 שעות, עם תכנים כתובים מראש", price: 2200 },
    { id: "gfx8", label: "חבילת גרפיקות, 8 גרפיקות", d: "גרפיקות מעוצבות לפי השפה של העסק", price: 300 },
    { id: "camp50", label: "הטבה מיוחדת: ניהול קמפיין ב-50% הנחה", d: "במקום 600 ₪, רק 300 ₪ לחודש הראשון", price: 300, was: 600 },
  ],
  extraPage: 280,
  bundleMail: 450,
  freeMsgs: 500,
  packs: [
    { id: "p1", n: 1000, price: 650 },
    { id: "p5", n: 5000, price: 2850 },
    { id: "p10", n: 10000, price: 4500 },
  ],
  general: [
    "ההצעה בתוקף עד התאריך שבראש ההצעה",
    "תשלום בכרטיס אשראי בלבד. תשלום חודשי בהוראה קבועה",
    "עלות ההקמה והתוספות נגבות במעמד אישור ההצעה",
    "חיוב חודשי ב-1 לכל חודש. התחלה באמצע החודש מחויבת יחסית",
    "ללא התחייבות למספר חודשים. עצירה בהודעה של 10 ימים מראש",
  ],
};
export const PROD_IDS = DEFAULT_PACK.products.map((p) => p.id);

const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) && v >= 0 ? v : d);
const arr = <T,>(v: unknown, d: T[]) => (Array.isArray(v) ? (v as T[]) : d);

export function withPack(p: unknown): PackPricing {
  const o = (p && typeof p === "object" ? p : {}) as Partial<PackPricing>;
  const saved = arr<Partial<ProdDef>>(o.products, []);
  return {
    products: DEFAULT_PACK.products.map((d) => {
      const s = saved.find((x) => x && x.id === d.id) || {};
      return {
        ...d,
        label: typeof s.label === "string" && s.label.trim() ? s.label : d.label,
        short: typeof s.short === "string" && s.short.trim() ? s.short : d.short,
        sub: typeof s.sub === "string" ? s.sub : d.sub,
        price: num(s.price, d.price), setup: num(s.setup, d.setup), fee: num(s.fee, d.fee),
        inc: arr(s.inc, d.inc), timelines: arr(s.timelines, d.timelines), terms: arr(s.terms, d.terms),
        addons: arr(s.addons, d.addons || []),
      };
    }),
    addons: (() => { const a = arr<PackAddon>(o.addons, DEFAULT_PACK.addons); return [...a, ...DEFAULT_PACK.addons.filter((d) => !a.some((x) => x.id === d.id))]; })(),
    extraPage: num(o.extraPage, DEFAULT_PACK.extraPage),
    bundleMail: num(o.bundleMail, DEFAULT_PACK.bundleMail),
    freeMsgs: num(o.freeMsgs, DEFAULT_PACK.freeMsgs),
    packs: arr(o.packs, DEFAULT_PACK.packs),
    general: arr(o.general, DEFAULT_PACK.general),
  };
}

/* the add-ons a quote offers: those of its products (all of them when no product says) */
export function offeredAddons(P: PackPricing, ids: string[]) {
  const defs = P.products.filter((p) => ids.includes(p.id));
  if (!defs.length) return P.addons;
  const allow = new Set(defs.flatMap((d) => d.addons ?? P.addons.map((a) => a.id)));
  return P.addons.filter((a) => allow.has(a.id));
}

/* one product in a quote. null = take it from the catalog. */
export type PackLine = {
  id: ProdId;
  price: number | null; sale: number | null;
  setupOn: boolean; setup: number | null; setupSale: number | null;
  fee: number | null; feeSale: number | null;
};
export type PackInput = {
  lines: PackLine[];
  addons: string[];
  pages: number;       // extra site pages
  msgPack: string;     // one-off message pack id
  promo: boolean;
  promoText: string;
  payUrl: string;
};
export const PROMO_TEXT_DEFAULT = "מבצע לזמן מוגבל";

export const newLine = (id: ProdId): PackLine => ({ id, price: null, sale: null, setupOn: false, setup: null, setupSale: null, fee: null, feeSale: null });
export function emptyPack(payUrl?: string, ids: ProdId[] = []): PackInput {
  return { lines: ids.map(newLine), addons: [], pages: 0, msgPack: "", promo: false, promoText: PROMO_TEXT_DEFAULT, payUrl: payUrl || PAY_URL_DEFAULT };
}
const nn = (v: unknown) => (typeof v === "number" && isFinite(v) && v >= 0 ? Math.round(v) : null);
export function normalizePack(a: unknown, payUrl?: string): PackInput {
  const base = emptyPack(payUrl);
  const o = (a && typeof a === "object" ? a : {}) as Partial<PackInput>;
  const seen = new Set<string>();
  const lines = arr<Partial<PackLine>>(o.lines, []).filter((l) => l && PROD_IDS.includes(l.id as ProdId) && !seen.has(l.id!) && !!seen.add(l.id!))
    .map((l) => ({ id: l.id as ProdId, price: nn(l.price), sale: nn(l.sale), setupOn: !!l.setupOn, setup: nn(l.setup), setupSale: nn(l.setupSale), fee: nn(l.fee), feeSale: nn(l.feeSale) }));
  return {
    lines,
    addons: arr<string>(o.addons, []),
    pages: Math.max(0, Math.round(Number(o.pages) || 0)),
    msgPack: typeof o.msgPack === "string" ? o.msgPack : "",
    promo: !!o.promo,
    promoText: typeof o.promoText === "string" && o.promoText.trim() ? o.promoText : base.promoText,
    payUrl: typeof o.payUrl === "string" && /^https:\/\//.test(o.payUrl) ? o.payUrl : base.payUrl,
  };
}

/* the catalog price a line falls back to: the mailing is cheaper when the chatbot is in the quote */
export function basePrice(P: PackPricing, I: PackInput, id: ProdId) {
  const d = P.products.find((x) => x.id === id)!;
  if (id === "mail" && I.lines.some((l) => l.id === "bot")) return P.bundleMail;
  return d.price;
}
/* original (catalog or edited) and what is charged; "was" only when a price after discount is set */
export function priceOf(orig: number | null, sale: number | null, def: number) {
  const o = orig ?? def;
  return sale != null && sale !== o ? { o, eff: sale, was: o } : { o, eff: o, was: null as number | null };
}

const nis = (n: number) => Math.round(n || 0).toLocaleString("he-IL") + " ₪";
function joinHe(xs: string[]) {
  if (xs.length <= 1) return xs[0] || "";
  return xs.slice(0, -1).join(", ") + " ו" + xs[xs.length - 1];
}

export type PackModel = Omit<AiModel, "totals"> & {
  totals: {
    product: "pack"; title: string; monthly: number; oneoff: number;
    monthlyLines: { name: string; price: number }[]; oneoffLines: { name: string; price: number }[]; commit: false;
  };
};

export function computePack(P: PackPricing, I: PackInput, vat: number, T: Template): PackModel {
  const v = (vat || 0) / 100;
  const g = (n: number) => Math.round(n * (1 + v));
  const vatLbl = 'מע"מ ' + (vat || 0) + "%";
  const defs = I.lines.map((l) => ({ l, d: P.products.find((x) => x.id === l.id)! })).filter((x) => x.d);
  const bundled = I.lines.some((l) => l.id === "bot") && I.lines.some((l) => l.id === "mail");
  const hasSite = defs.some((x) => x.d.id === "site");
  const hasMail = defs.some((x) => x.d.id === "mail");

  type Ln = { a: string; o: number; eff: number; was: number | null; note?: string };
  const monthly: Ln[] = [];   // services billed every month from the start
  const hosting: Ln[] = [];   // monthly, from the month the site goes live
  const oneoff: Ln[] = [];    // paid at signing
  for (const { l, d } of defs) {
    const p = priceOf(l.price, l.sale, basePrice(P, I, d.id));
    const name = d.id === "mail" && bundled && l.price == null ? d.label + ", מחיר חבילה עם הצ'אטבוט" : d.label;
    (d.kind === "monthly" ? monthly : oneoff).push({ a: name, ...p });
    if (d.kind === "monthly" && l.setupOn) oneoff.push({ a: "הקמה, " + d.short, ...priceOf(l.setup, l.setupSale, d.setup) });
    if (d.kind === "oneoff" && d.fee) hosting.push({ a: "אחסון ותחזוקה, " + d.short, ...priceOf(l.fee, l.feeSale, d.fee) });
  }
  const pages = hasSite ? I.pages : 0;
  if (pages) oneoff.push({ a: "דפים נוספים באתר × " + pages, o: pages * P.extraPage, eff: pages * P.extraPage, was: null });
  const offered = offeredAddons(P, defs.map((x) => x.d.id));
  const picked = offered.filter((x) => I.addons.includes(x.id));
  picked.forEach((x) => oneoff.push({ a: x.label, o: x.was || x.price, eff: x.price, was: x.was && x.was !== x.price ? x.was : null }));
  const pack = hasMail ? P.packs.find((x) => x.id === I.msgPack) : undefined;
  if (pack) oneoff.push({ a: "חבילת " + pack.n.toLocaleString("he-IL") + " הודעות", o: pack.price, eff: pack.price, was: null });

  const sum = (xs: Ln[], k: "eff" | "o") => xs.reduce((s, x) => s + x[k], 0);
  const mNet = sum(monthly, "eff"), hNet = sum(hosting, "eff"), oNet = sum(oneoff, "eff");
  const shown = (x: Ln) => (x.eff === 0 && x.was ? "ללא עלות" : nis(x.eff));
  const wasOf = (x: Ln) => (x.was != null ? nis(x.was) : undefined);

  const shorts = defs.map((x) => x.d.short);
  const title = defs.length ? joinHe(shorts) : "הצעת מחיר";
  const sub = defs.length === 1 ? defs[0].d.sub : defs.length ? "הצעה משולבת של " + defs.length + " מוצרים, במסמך אחד" : "בחרו מוצר אחד או יותר";

  // price card: the monthly price when there is one, otherwise the one-off price
  let price: AiModel["price"];
  const priceLines: { a: string; was?: string; b: string }[] = [];
  const mWas = sum(monthly, "o") !== mNet ? nis(sum(monthly, "o")) : "";
  if (monthly.length) {
    price = { title: "מחיר חודשי", desc: "", was: mWas, num: nis(mNet), sub: 'לחודש, לפני מע"מ' };
    oneoff.filter((x) => x.a.startsWith("הקמה")).forEach((x) => priceLines.push({ a: x.a, was: wasOf(x), b: shown(x) }));
    oneoff.filter((x) => !x.a.startsWith("הקמה")).forEach((x) => priceLines.push({ a: x.a + ", חד פעמי", was: wasOf(x), b: shown(x) }));
  } else {
    const prods = oneoff.filter((x) => defs.some((d) => d.d.label === x.a));
    const oWas = sum(prods, "o") !== sum(prods, "eff") ? nis(sum(prods, "o")) : "";
    price = { title: "מחיר חד פעמי", desc: "", was: oWas, num: nis(sum(prods, "eff")), sub: 'חד פעמי, לפני מע"מ' };
    oneoff.filter((x) => !prods.includes(x)).forEach((x) => priceLines.push({ a: x.a, was: wasOf(x), b: shown(x) }));
  }
  hosting.forEach((x) => priceLines.push({ a: x.a + ", לחודש", was: wasOf(x), b: shown(x) }));

  const incGroups = defs.map(({ d }) => ({
    title: d.label,
    items: d.inc.map((p) => ({ t: p.t, s: p.s, no: /^לא כלול/.test(p.t) })),
  }));
  const inc = incGroups.flatMap((g) => g.items);

  // summary: monthly first, then what is paid at signing (last, so the pay box reads it)
  const S: AiRow[] = [];
  if (monthly.length) {
    S.push({ cls: "head", a: "חיוב חודשי", b: "" });
    monthly.forEach((x) => S.push({ cls: "", a: x.a + ', לפני מע"מ', b: shown(x), was: wasOf(x) }));
    S.push({ cls: "", a: vatLbl, b: nis(g(mNet) - mNet) });
    S.push({ cls: "grand", a: 'סה"כ לחודש', b: nis(g(mNet)) + ' כולל מע"מ' });
  }
  if (hosting.length) {
    S.push({ cls: "head", a: "אחסון ותחזוקה", b: "מהעלייה לאוויר" });
    hosting.forEach((x) => S.push({ cls: "", a: x.a + ', לחודש, לפני מע"מ', b: shown(x), was: wasOf(x) }));
    S.push({ cls: "", a: vatLbl, b: nis(g(hNet) - hNet) });
    S.push({ cls: "grand", a: 'סה"כ לחודש', b: nis(g(hNet)) + ' כולל מע"מ' });
  }
  if (oneoff.length) {
    S.push({ cls: "head", a: "תשלום בהצטרפות", b: "חד פעמי" });
    oneoff.forEach((x) => S.push({ cls: "", a: x.a + ', לפני מע"מ', b: shown(x), was: wasOf(x) }));
    S.push({ cls: "", a: vatLbl, b: nis(g(oNet) - oNet) });
    S.push({ cls: "grand", a: 'סה"כ לתשלום בהצטרפות', b: nis(g(oNet)) + ' כולל מע"מ' });
  }
  const payNow = oNet > 0 ? nis(g(oNet)) + ' כולל מע"מ' : mNet > 0 ? nis(g(mNet)) + ' כולל מע"מ, החודש הראשון' : "";
  const summaryNote = [
    monthly.length && oneoff.length ? "החיוב החודשי מתחיל ב-1 לחודש שאחרי ההצטרפות, ומחושב יחסית לחודש הראשון." : "",
    hasMail ? `בדיוור: ${P.freeMsgs.toLocaleString("he-IL")} הודעות בחודש ללא עלות, באופן קבוע.` : "",
  ].filter(Boolean).join(" ");

  const addons: AiModel["addons"] = offered.map((x) => ({ t: x.label, d: x.d, net: nis(x.price), gross: nis(g(x.price)), on: I.addons.includes(x.id) }));
  if (hasSite) addons.push({ t: "דף נוסף באתר" + (pages ? " × " + pages : ""), d: "מעבר ל-5 הדפים שבמחיר, לכל דף", net: nis(P.extraPage), gross: nis(g(P.extraPage)), on: pages > 0 });
  if (hasMail) P.packs.forEach((x) => addons.push({ t: "חבילת " + x.n.toLocaleString("he-IL") + " הודעות", d: "מעבר ל-" + P.freeMsgs.toLocaleString("he-IL") + " ההודעות החינמיות בחודש, חד פעמי", net: nis(x.price), gross: nis(g(x.price)), on: pack?.id === x.id }));

  const many = defs.length > 1;
  const timelines = defs.flatMap(({ d }) => d.timelines.map((r) => ({ t: (many ? d.short + ": " : "") + r.t, s: r.s })));

  const general = [`כל המחירים בהצעה לפני מע"מ. ${vatLbl}`, ...P.general, ...((T.extraTerms || []) as string[]).map((x) => x.trim()).filter(Boolean)];
  const termGroups = [{ title: "כללי", items: general }, ...defs.map(({ d }) => ({ title: d.label, items: d.terms }))];

  return {
    title, sub, promo: false, promoPct: 0, price, inc,
    summary: S, summaryNote, addons,
    addonsNote: "תשלום חד פעמי, מחוץ לחיוב החודשי. בחירת תוספת אינה חובה, וניתן להוסיף אותה גם בהמשך.",
    timelines,
    timelinesNote: "לוחות הזמנים נספרים מרגע שכל החומרים אצלי: טקסטים, תמונות, לוגו וגישות למערכות. עיכוב בקבלת חומר דוחה את הלוח באותו מספר ימים.",
    terms: termGroups.flatMap((t) => t.items),
    notice: I.promo ? { text: I.promoText || PROMO_TEXT_DEFAULT, chip: "לזמן מוגבל" } : null,
    priceLines, incGroups, termGroups, payNow,
    totals: {
      product: "pack", title: defs.length ? shorts.join(" + ") : "הצעת מחיר",
      monthly: mNet + hNet, oneoff: oNet,
      monthlyLines: [...monthly, ...hosting].filter((x) => x.eff > 0).map((x) => ({ name: x.a, price: x.eff })),
      oneoffLines: oneoff.filter((x) => x.eff > 0).map((x) => ({ name: x.a, price: x.eff })),
      commit: false,
    },
  };
}

/* everything a screen needs to render a products quote from a stored row */
export function packView(input: Record<string, unknown> | null | undefined, pricing: unknown, vat: number, T: Template) {
  const inp = (input || {}) as { client?: string; biz?: string; date?: string; validDays?: number; prods?: unknown };
  const pr = (pricing || {}) as { pack?: unknown; ai?: { payUrl?: string } };
  const P = withPack(pr.pack);
  const I = normalizePack(inp.prods, pr.ai?.payUrl);
  const m = computePack(P, I, vat, T);
  const date = inp.date || new Date().toISOString().slice(0, 10);
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() + (Number(inp.validDays) || 14));
  const until = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  return { P, I, m, to: inp.client || "", biz: inp.biz || "", date, until };
}
export const isPack = (input: unknown) => !!input && typeof input === "object" && (input as { product?: string }).product === "pack";

/* every product the quotes sell, for picking a product on a client card or a payment:
   the AI campaign and its add-ons, the products catalog and its add-ons, plus the names in settings */
export type CatalogItem = { name: string; kind: "monthly" | "oneoff"; price: number; setup?: number };
export function productCatalog(pricing: { ai?: unknown; pack?: unknown } | null | undefined, names: string[] = []): CatalogItem[] {
  const ai = (pricing?.ai || {}) as { price?: number; addons?: { label: string; price: number }[] };
  const P = withPack(pricing?.pack);
  const out: CatalogItem[] = [
    { name: "קמפיין AI", kind: "monthly", price: typeof ai.price === "number" ? ai.price : 600 },
    ...P.products.map((p) => ({ name: p.label, kind: p.kind, price: p.price, setup: p.kind === "monthly" ? p.setup : undefined })),
    ...P.products.filter((p) => p.fee).map((p) => ({ name: "אחסון ותחזוקה, " + p.short, kind: "monthly" as const, price: p.fee })),
    ...P.addons.map((a) => ({ name: a.label, kind: "oneoff" as const, price: a.price })),
    ...(Array.isArray(ai.addons) ? ai.addons : []).map((a) => ({ name: a.label, kind: "oneoff" as const, price: a.price })),
    { name: "דף נוסף באתר", kind: "oneoff", price: P.extraPage },
    ...P.packs.map((x) => ({ name: "חבילת " + x.n.toLocaleString("he-IL") + " הודעות", kind: "oneoff" as const, price: x.price })),
    ...names.map((n) => ({ name: n, kind: "oneoff" as const, price: 0 })),
  ];
  const seen = new Set<string>();
  return out.filter((x) => x.name && !seen.has(x.name) && !!seen.add(x.name));
}
