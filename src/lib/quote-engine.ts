/* The quote engine. A straight port of quote-template (11).html's render(), turned into a pure
   function: pricing + editor input -> everything the document shows, plus the frozen totals that
   signing turns into services and payments. Rendering lives in components/QuoteDoc.tsx. */
import PRICING_DEFAULT from "./pricing-default.json";
import TEMPLATE_DEFAULT from "./template-default.json";

export type Pair = { t: string; s: string };
export type Track = { id: string; name: string; price: number; setup: number; desc: string };
export type Feature = { t: string; d: string; x: string; on: Record<string, boolean> };
export type Item = { id: string; label: string; d: string; x: string; price: number; setup: number };
export type Addon = { id: string; label: string; what: string; price: number; specs: Pair[] };
export type Web = { id: string; label: string; kind: "site" | "lp"; price: number; monthly: { label: string; price: number }[]; specs: Pair[]; x: string };
export type Gift = { title: string; sub: string; was: number; pill: string; ico: string };
export type Pricing = {
  tracks: Track[];
  features: Feature[];
  items: Item[];
  bundle: { ids: string[]; label: string; d: string; x: string; price: number; setup: number };
  freeMailSetup: number;
  addons: Addon[];
  web: Web[];
  domain: number;
  hour: number;
  gifts: { simple: Gift; other: Gift };
  msg: { free: number; phone: number; packs: { id: string; n: number; price: number }[] };
  webTimelines: { site: Pair[]; lp: Pair[]; both: Pair[] };
  timelines: { id: string; t: string; s: string }[];
};
export type Template = typeof TEMPLATE_DEFAULT;

export type ExtraLine = { name: string; desc: string; price: number; billing: "monthly" | "oneoff" };
export type QuoteInput = {
  client: string;
  biz: string;
  date: string; // yyyy-mm-dd
  validDays: number;
  budget: string;
  track: string; // simple | more | max | custom
  brief: string;
  items: string[];
  phones: number;
  pack: string;
  web: string;
  domain: "has" | "need";
  commit: boolean;
  addons: string[];
  discType: "" | "pct" | "amt";
  discVal: number;
  discReason: string;
  waiveSetup: boolean;
  overrides: Record<string, number>;
  hidden: string[];
  extra: ExtraLine[];
};

export const DEFAULT_PRICING = PRICING_DEFAULT as unknown as Pricing;
export const DEFAULT_TEMPLATE = TEMPLATE_DEFAULT as Template;

export function withPricing(p: unknown): Pricing {
  const o = (p && typeof p === "object" ? p : {}) as Partial<Pricing>;
  if (!o.tracks || !Array.isArray(o.tracks) || !o.tracks.length) return DEFAULT_PRICING;
  return { ...DEFAULT_PRICING, ...o } as Pricing;
}
export function withTemplate(t: unknown): Template {
  const o = (t && typeof t === "object" ? t : {}) as Partial<Template>;
  return { ...DEFAULT_TEMPLATE, ...o } as Template;
}

export function emptyInput(partial?: Partial<QuoteInput>): QuoteInput {
  return {
    client: "", biz: "", date: isoToday(), validDays: 14, budget: "", track: "max", brief: "",
    items: [], phones: 1, pack: "", web: "", domain: "has", commit: true, addons: [],
    discType: "", discVal: 0, discReason: "", waiveSetup: false, overrides: {}, hidden: [], extra: [],
    ...(partial || {}),
  };
}
export function normalizeInput(i: unknown): QuoteInput {
  const base = emptyInput();
  const o = (i && typeof i === "object" ? i : {}) as Partial<QuoteInput>;
  return { ...base, ...o, overrides: o.overrides || {}, hidden: o.hidden || [], extra: o.extra || [], items: o.items || [], addons: o.addons || [] };
}

export function isoToday() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
export function dmy(iso: string) {
  const [y, m, d] = (iso || "").split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}
export function addDaysIso(iso: string, n: number) {
  const d = new Date((iso || isoToday()) + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
export function nis(n: number) {
  return Math.round(n || 0).toLocaleString("he-IL") + " ₪";
}
const num = (n: number) => Math.round(n).toLocaleString("he-IL");

export type Card = { key: string; t: string; s: string; x?: string };
export type SumRow = { cls: "" | "head" | "grand"; a: string; b: string; was?: string };
export type Model = {
  custom: boolean;
  title: string;
  sub: string;
  brief: string;
  to: string;
  pname: string;
  pdesc: string;
  amounts: { num: string; sub: string; second: boolean }[];
  tableHead: string;
  matrix: null | { head: { name: string; sel: boolean }[]; rows: { t: string; cells: { yes?: boolean; text?: string; sel: boolean }[]; total?: boolean }[] };
  customRows: null | { t: string; d: string }[];
  tableNote: { text: string; bold: string };
  incHead: string;
  inc: Card[];
  incNote: string;
  addons: null | { rows: { t: string; d: string }[]; note: string };
  web: null | { head: string; cards: Card[]; note: string };
  msg: null | { gift: { t: string; s: string; was: string }; cards: Card[]; packs: { t: string; price: string; on: boolean }[]; note: string; packNote: string };
  gift: null | Gift;
  summary: SumRow[];
  timelines: { t: string; s: string }[];
  webTimelines: { t: string; s: string }[];
  terms: string[];
  totals: {
    title: string;
    monthly: number;
    oneoff: number;
    monthlyLines: { name: string; price: number }[];
    oneoffLines: { name: string; price: number }[];
    commit: boolean;
  };
};

export function computeQuote(P: Pricing, I: QuoteInput, vat: number, T: Template): Model {
  const ov = (k: string, v: number) => (I.overrides && typeof I.overrides[k] === "number" && !isNaN(I.overrides[k]) ? I.overrides[k] : v);
  const hidden = new Set(I.hidden || []);
  const key = I.track;
  const custom = key === "custom";
  const tr0 = P.tracks.find((t) => t.id === key) || P.tracks[P.tracks.length - 1];
  const TR = custom ? null : { ...tr0, price: ov("track:" + tr0.id, tr0.price), setup: ov("setup:" + tr0.id, tr0.setup) };
  const commit = !!I.commit;
  const vatRate = (vat || 0) / 100;
  const picked = P.addons.filter((a) => (I.addons || []).includes(a.id)).map((a) => ({ ...a, price: ov("addon:" + a.id, a.price) }));
  const W0 = P.web.find((w) => w.id === I.web) || null;
  const W = W0 ? { ...W0, price: ov("web:" + W0.id, W0.price), monthly: W0.monthly.map((m, i) => ({ ...m, price: ov("webm:" + W0.id + ":" + i, m.price) })) } : null;
  const webMonthly = W ? W.monthly.reduce((a, m) => a + m.price, 0) : 0;
  const needDomain = !!W && I.domain === "need";
  const domainPrice = ov("domain", P.domain);

  // custom items; soc and socfull never live together
  let ids = [...(I.items || [])];
  if (ids.includes("soc") && ids.includes("socfull")) ids = ids.filter((x) => x !== "soc");
  const items = P.items.map((it) => ({ ...it, price: ov("item:" + it.id, it.price), setup: ov("itemsetup:" + it.id, it.setup) }));
  const bundle = { ...P.bundle, id: "bundle", price: ov("bundle", P.bundle.price), setup: ov("bundlesetup", P.bundle.setup) };
  let list: (Item | (typeof bundle))[] = [];
  const both = P.bundle.ids.every((b) => ids.includes(b));
  if (both) {
    items.forEach((it) => { if (!P.bundle.ids.includes(it.id) && ids.includes(it.id)) list.push(it); });
    list.push(bundle);
  } else {
    items.forEach((it) => { if (ids.includes(it.id)) list.push(it); });
  }
  if (!custom) list = [];
  const extraM = (I.extra || []).filter((e) => e.billing === "monthly" && e.name);
  const extraO = (I.extra || []).filter((e) => e.billing === "oneoff" && e.name);

  const hasMail = custom ? ids.includes("mail") : key === "more" || key === "max";
  const phones = hasMail ? Math.max(1, Math.floor(I.phones || 1)) : 0;
  const pack0 = hasMail ? P.msg.packs.find((p) => p.id === I.pack) || null : null;
  const pack = pack0 ? { ...pack0, price: ov("pack:" + pack0.id, pack0.price) } : null;
  const phonePrice = ov("phone", P.msg.phone);
  const phoneMonthly = phones * phonePrice;
  const hasAuto = custom ? ids.includes("auto") : key === "more" || key === "max";
  const hasAds = custom ? ids.includes("ads1") || ids.includes("ads2") : true;
  const hasSoc = custom ? ids.includes("soc") || ids.includes("socfull") : key === "simple" || key === "max";
  const freeMailSetup = hasAuto && hasMail ? P.freeMailSetup : 0;

  const extraMonthly = extraM.reduce((s, e) => s + (+e.price || 0), 0);
  const monthlyBase = (custom ? list.reduce((s, i) => s + i.price, 0) : TR!.price) + phoneMonthly + extraMonthly;
  const setupFull = custom ? list.reduce((s, i) => s + i.setup, 0) : TR!.setup;
  const trackName = custom ? "הצעה אישית" : TR!.name;
  const trackDesc = custom
    ? list.length ? list.map((i) => i.label.split(",")[0]).join(" · ") : extraM.length ? extraM.map((e) => e.name).join(" · ") : "טרם נבחרו שירותים"
    : TR!.desc;

  const validIso = addDaysIso(I.date, I.validDays || 14);
  const title = trackName + (I.biz.trim() ? " · " + I.biz.trim() : "");
  const sub = "הצעה אישית" + " · " + dmy(I.date) + " · בתוקף עד " + dmy(validIso);

  // discount
  const monthlyGross = monthlyBase + webMonthly;
  const discVal = Math.max(0, +I.discVal || 0);
  let discount = 0;
  if (I.discType === "pct") discount = (monthlyGross * Math.min(100, discVal)) / 100;
  if (I.discType === "amt") discount = Math.min(monthlyGross, discVal);
  discount = Math.round(discount);
  const monthly = monthlyGross - discount;
  const waive = !!I.waiveSetup;

  const budget = (I.budget || "").trim();
  const xtext = (t: string) => (t || "").replace("__BUDGET__", budget ? ". התקציב המומלץ: " + nis(+budget) + " לחודש" : "");

  // table
  let matrix: Model["matrix"] = null;
  let customRows: Model["customRows"] = null;
  let tableNote = { text: "", bold: "" };
  if (custom) {
    customRows = list.map((i) => ({ t: i.label, d: i.d }));
    extraM.forEach((e) => customRows!.push({ t: e.name, d: e.desc }));
    if (phoneMonthly) customRows.push({ t: phones > 1 ? phones + " מספרי דיוור" : "מספר דיוור", d: "מספר ייעודי לדיוור, כולל החלפה ואימות אם מספר נחסם" });
    if (W) W.monthly.forEach((m) => customRows!.push({ t: m.label, d: m.label === "אחסון" ? "אחסון האתר על שרתים מהירים" : "גיבוי, עדכוני מערכת ותוספים, ובדיקת תקינות" }));
    tableNote = { text: T.customNote, bold: "" };
  } else {
    const cols = P.tracks.map((t) => (t.id === key ? TR! : t));
    matrix = {
      head: cols.map((t) => ({ name: t.name + (t.id === key ? " ★" : ""), sel: t.id === key })),
      rows: [
        ...P.features.map((f) => ({ t: f.t, cells: cols.map((t) => ({ yes: !!f.on[t.id], sel: t.id === key })) })),
        {
          t: "עלות הקמה חד פעמית",
          cells: cols.map((t) => ({
            text: t.setup === 0 ? "אין" : t.id === key ? (waive ? "ללא עלות" : commit ? nis(t.setup / 2) : nis(t.setup)) : nis(t.setup),
            sel: t.id === key,
          })),
        },
        { t: 'מחיר לחודש, לפני מע"מ', cells: cols.map((t) => ({ text: nis(t.price), sel: t.id === key })), total: true },
      ],
    };
    tableNote = { text: T.tracksNote, bold: T.tracksBinding };
  }

  // included
  const inc: Card[] = [];
  const addCard = (c: Card) => { if (!hidden.has(c.key)) inc.push(c); };
  if (custom) {
    list.forEach((i) => addCard({ key: "i:" + i.id, t: i.label, s: i.d, x: xtext(i.x) }));
    extraM.forEach((e, n) => addCard({ key: "e:" + n, t: e.name, s: e.desc }));
    if (list.length || extraM.length) {
      addCard({ key: "c:report", t: "דוח חודשי ופגישת סיכום", s: "מה נעשה, מה קרה, ומה עושים בחודש הבא" });
      addCard({ key: "c:contact", t: "איש קשר אחד לכל מה שקשור לדיגיטל", s: "כתובת אחת לכל שאלה. אין צורך לרדוף אחרי כמה גורמים" });
    }
  } else {
    P.features.forEach((f, n) => { if (f.on[key]) addCard({ key: "f:" + n, t: f.t, s: f.d, x: xtext(f.x) }); });
  }
  if (phoneMonthly) addCard({ key: "c:phones", t: phones > 1 ? phones + " מספרי דיוור ייעודיים" : "מספר דיוור ייעודי", s: "מספר נפרד לדיוור. אם מספר נחסם, אנחנו מאמתים מספר חדש וממשיכים, בלי שתצטרך לטפל בזה" });
  if (freeMailSetup) addCard({ key: "c:freemail", t: "הקמה לדיוור וואטסאפ, ללא עלות", s: "כששני מוצרי הוואטסאפ נלקחים יחד, ההקמה של מערך הדיוור כלולה במחיר ההקמה של המענה האוטומטי" });
  if (W) addCard({ key: "c:webm", t: W.monthly.map((m) => m.label).join(" ו") + " חודשית", s: W.monthly.map((m) => m.label).join(" · ") + ". הפירוט בסעיף הסיכום", x: "שינויים מבניים באתר אחרי המסירה. תיקוני תוכן קטנים כלולים" });
  extraO.forEach((e, n) => { if (e.desc) addCard({ key: "eo:" + n, t: e.name, s: e.desc }); });
  picked.forEach((a) => a.specs.forEach((x, n) => addCard({ key: "a:" + a.id + ":" + n, t: a.label + ": " + x.t, s: x.s })));

  // one-off add-ons
  let addonSum = (pack ? pack.price : 0) + (W ? W.price : 0);
  let addons: Model["addons"] = null;
  if (picked.length || W || extraO.length) {
    const rows: { t: string; d: string }[] = [];
    if (W) rows.push({ t: W.label, d: "פירוט מלא בסעיף שמעל" });
    picked.forEach((a) => { addonSum += a.price; rows.push({ t: a.label, d: a.what + '. הפירוט המלא בסעיף "מה כלול"' }); });
    extraO.forEach((e) => { addonSum += +e.price || 0; rows.push({ t: e.name, d: e.desc || "" }); });
    if (needDomain) rows.push({ t: "דומיין, לשנה", d: "רכישה ורישום על שמך, מתחדש אוטומטית כל שנה" });
    addons = {
      rows,
      note: W
        ? 'מוצרים חד פעמיים. אחסון ותחזוקה מתווספים לחיוב החודשי החל מחודש לאחר העלייה לאוויר. כל הסכומים מרוכזים בסעיף "סיכום לתשלום".'
        : 'מוצרים חד פעמיים, מחוץ לחיוב החודשי. הסכומים מרוכזים בסעיף "סיכום לתשלום".',
    };
  }

  // web spec block
  let web: Model["web"] = null;
  if (W) {
    web = {
      head: "מה כלול ב" + W.label,
      cards: W.specs.map((x, n) => ({ key: "w:" + n, t: x.t, s: x.s, x: n === 0 ? W.x : "" })).filter((c) => !hidden.has(c.key)),
      note: "הבנייה היא תשלום חד פעמי. " + W.monthly.map((m) => m.label).join(" ו") + " מתווספים לחיוב החודשי, החל מחודש לאחר העלייה לאוויר." +
        (needDomain ? " הדומיין נרכש בנפרד ומתחדש אוטומטית כל שנה." : "") + ' כל הסכומים מרוכזים בסעיף "סיכום לתשלום".',
    };
  }

  // messaging block
  let msg: Model["msg"] = null;
  if (hasMail) {
    const cards: Card[] = [
      { key: "m:0", t: "וואטסאפ עסקי מאומת", s: "הדיוור יוצא מחשבון וואטסאפ רשמי ומאומת, ולכן ההסתברות לחסימה נמוכה מאוד" },
      { key: "m:1", t: "בניית ההודעות ואישור מטא", s: "ההודעות נבנות על ידינו ומוגשות למטא לאישור. האישור אורך עד 24 שעות, ומשם התבנית מוכנה לשליחה" },
      { key: "m:2", t: "התחלה מדורגת", s: "מתחילים ברשימות של 50 נמענים לבדיקה, ומרחיבים עד 250 ליום, בתיאום איתך" },
      { key: "m:3", t: phones > 1 ? phones + " מספרי דיוור" : "מספר דיוור ייעודי", s: "מספר נפרד לדיוור. אם מספר נחסם, אנחנו מאמתים מספר חדש וממשיכים. הטיפול כלול, בלי עלות נוספת ובלי שתתעסק עם זה" },
      { key: "m:4", t: "איך נספרת הודעה", s: "אחרי הודעה שיוצאת אפשר להתכתב 24 שעות בלי חיוב נוסף. המשך שיחה אחרי 24 שעות נספר כהודעה חדשה" },
      { key: "m:5", t: "הסכמה והסרה", s: "הדיוור נשלח לרשימות שאישרו לקבל, ובכל הודעה יש דרך להסיר את עצמך" },
    ].filter((c) => !hidden.has(c.key));
    msg = {
      gift: { t: num(P.msg.free) + " הודעות במתנה", s: "בחודש הראשון לשירות. מכאן ואילך הודעות נרכשות בחבילות, לפי הצורך", was: nis(P.msg.packs[0]?.price || 0) },
      cards,
      packs: [
        { t: num(P.msg.free) + " הודעות במתנה, בחודש הראשון", price: "0 ₪", on: false },
        ...P.msg.packs.map((p) => ({ t: num(p.n) + " הודעות" + (pack && pack.id === p.id ? " ★" : ""), price: nis(pack && pack.id === p.id ? pack.price : p.price), on: !!(pack && pack.id === p.id) })),
      ],
      note: pack
        ? `בהצעה הזו נכללת חבילה של ${num(pack.n)} הודעות בכניסה, בנוסף ל-${num(P.msg.free)} שבמתנה בחודש הראשון. חבילות נוספות נרכשות לפי הצורך, ללא התחייבות.`
        : `חבילות ההודעות נרכשות לפי הצורך, ללא התחייבות. אפשר להתחיל מ-${num(P.msg.free)} ההודעות שבמתנה בחודש הראשון ולהחליט בהמשך.`,
      packNote: "מספר דיוור אחד לכל 20,000 אנשי קשר. " + (phones === 1 ? "מספר אחד מתאים" : phones + " מספרים מתאימים") +
        " לרשימה של עד " + num(phones * 20000) + " אנשי קשר, ועולה " + nis(phoneMonthly) + " לחודש.",
    };
  }

  // joining gift
  let gift: Model["gift"] = null;
  if (commit && (custom ? list.length > 0 : true)) {
    if (setupFull > 0 && !waive) {
      gift = { title: "חצי מחיר בעלות ההקמה", sub: nis(setupFull / 2) + " במקום " + nis(setupFull) + ", עלות ההקמה של השירותים בהצעה", was: setupFull / 2, pill: "חיסכון", ico: "🎁" };
    } else gift = P.gifts.simple;
  }

  // summary
  const setup = waive ? 0 : commit ? setupFull / 2 : setupFull;
  const oneoff = setup + addonSum + (needDomain ? domainPrice : 0);
  const S: SumRow[] = [];
  const monthlyLines: { name: string; price: number }[] = [];
  const oneoffLines: { name: string; price: number }[] = [];
  S.push({ cls: "head", a: custom ? "ההצעה" : "המסלול שנבחר", b: trackName + (commit ? ", בהתחייבות לשלושה חודשים" : ", ללא התחייבות") });
  if (monthlyGross > 0) {
    S.push({ cls: "head", a: "לחודש", b: "" });
    const m = (name: string, price: number, label?: string) => { S.push({ cls: "", a: label || name, b: nis(price) }); monthlyLines.push({ name, price }); };
    if (custom) list.forEach((i) => m(i.label, i.price));
    else m(TR!.name, TR!.price, TR!.name + ', לפני מע"מ');
    extraM.forEach((e) => m(e.name, +e.price || 0));
    if (phoneMonthly) m(phones > 1 ? phones + " מספרי דיוור" : "מספר דיוור", phoneMonthly);
    if (W) W.monthly.forEach((x) => m(x.label, x.price));
    if (discount > 0) {
      const lbl = "הנחה" + (I.discType === "pct" ? " " + Math.min(100, discVal) + "%" : "") + (I.discReason.trim() ? ", " + I.discReason.trim() : "");
      S.push({ cls: "", a: lbl, b: "- " + nis(discount) });
      monthlyLines.push({ name: lbl, price: -discount });
      S.push({ cls: "", a: 'סה"כ לחודש, לפני מע"מ', b: nis(monthly) });
    }
    S.push({ cls: "", a: 'מע"מ ' + vat + "%", b: nis(monthly * vatRate) });
    S.push({ cls: "grand", a: 'סה"כ לחודש', b: nis(monthly * (1 + vatRate)) + ' כולל מע"מ' });
  }
  if (oneoff > 0 || setupFull > 0 || freeMailSetup) {
    S.push({ cls: "head", a: "חד פעמי בכניסה", b: "" });
    if (setupFull > 0) {
      const setupLabel = freeMailSetup ? "הקמת מערך המענה האוטומטי" : "עלות הקמה";
      if (waive) S.push({ cls: "", a: setupLabel + ", ויתור מלא", was: nis(setupFull), b: "ללא עלות" });
      else if (commit) S.push({ cls: "", a: setupLabel + ", בחצי מחיר", was: nis(setupFull), b: nis(setup) });
      else S.push({ cls: "", a: setupLabel, b: nis(setup) });
      if (setup > 0) oneoffLines.push({ name: setupLabel, price: setup });
    }
    if (freeMailSetup) S.push({ cls: "", a: "הקמה לדיוור וואטסאפ", was: nis(freeMailSetup), b: "ללא עלות" });
    const o = (name: string, price: number) => { S.push({ cls: "", a: name, b: nis(price) }); oneoffLines.push({ name, price }); };
    if (W) o(W.label, W.price);
    if (pack) o(num(pack.n) + " הודעות דיוור", pack.price);
    picked.forEach((a) => o(a.label, a.price));
    extraO.forEach((e) => o(e.name, +e.price || 0));
    if (needDomain) o("דומיין, לשנה", domainPrice);
    S.push({ cls: "", a: 'מע"מ ' + vat + "%", b: nis(oneoff * vatRate) });
    S.push({ cls: "grand", a: 'סה"כ חד פעמי', b: nis(oneoff * (1 + vatRate)) + ' כולל מע"מ' });
  }

  const amounts: Model["amounts"] = [];
  if (monthly > 0) amounts.push({ num: nis(monthly * (1 + vatRate)), sub: 'לחודש, כולל מע"מ', second: false });
  if (oneoff > 0) amounts.push({ num: nis(oneoff * (1 + vatRate)), sub: 'חד פעמי בכניסה, כולל מע"מ', second: monthly > 0 });

  // timelines
  const shoot = picked.some((a) => a.id === "shoot");
  const vid = picked.some((a) => a.id === "vid");
  const showVid = hasSoc || vid || shoot;
  const timelines: { t: string; s: string }[] = [];
  P.timelines.forEach((r) => {
    if (r.id === "ads" && !hasAds) return;
    if (r.id.startsWith("auto") && !hasAuto) return;
    timelines.push({ t: r.t, s: r.s });
  });
  if (showVid) timelines.push({ t: "הספקת עריכות סרטונים", s: shoot ? "עד 10 ימים מיום הצילום. זמן ממוצע להספקה 3 ימים" : vid ? "3 עד 5 ימים מקבלת החומרים" : "עד 6 ימים" });
  let webTimelines: Pair[] = [];
  if (W && W.kind === "site") webTimelines = webTimelines.concat(P.webTimelines.site);
  if (W && W.kind === "lp") webTimelines = webTimelines.concat(P.webTimelines.lp);
  if (W) webTimelines = webTimelines.concat(P.webTimelines.both);

  // terms
  const t: string[] = ["תשלום בכרטיס אשראי בלבד, בהוראה קבועה חודשית"];
  if (monthlyGross > 0) t.push("חיוב ב-1 לכל חודש. התחלה באמצע החודש מחויבת יחסית");
  if (hasAds) t.push("תקציב הפרסום אינו כלול, ומשולם ישירות לפלטפורמה");
  if (hasAds || hasSoc) t.push("נדרשת גישה מלאה לחשבונות הפלטפורמות");
  t.push("אין התחייבות לתוצאות. תלוי בנתוני העסק והשוק");
  if (setupFull > 0 || picked.length || W || extraO.length) t.push("עלות ההקמה והתוספות נגבות במעמד אישור ההצעה");
  if (W) {
    t.push("בהצעה כלולים שני סשנים לתיקונים. סשן נוסף בתשלום, " + nis(P.hour) + " לשעה");
    t.push("אישור להוספת קישור קרדיט בתחתית האתר, כמקובל");
    if (W.id === "wp-site") t.push("תוכן האתר נמסר על ידך לפני תחילת העבודה");
    if (needDomain) t.push("הדומיין נרכש בנפרד, " + nis(domainPrice) + " לשנה, ומתחדש אוטומטית מדי שנה");
    if (W.id === "wp-site") t.push("תוסף הנגישות הוא תוסף חינמי ואינו תחליף להנגשה תקנית");
  }
  if (custom) t.push("ההצעה הורכבה לפי הצורך שעלה בשיחה. כל שירות עומד בפני עצמו");
  if (hasMail) {
    t.push("הדיוור נשלח לרשימות שאישרו לקבל, ובכל הודעה יש דרך להסיר");
    t.push("הודעות מעבר למה שנרכש נרכשות בחבילות, ללא התחייבות");
    t.push("מספר דיוור אחד לכל 20,000 אנשי קשר");
    t.push("ההודעות מוגשות למטא לאישור. האישור אורך עד 24 שעות");
  }
  if (monthlyGross > 0) {
    t.push(commit ? "התחייבות לשלושה חודשים. עצירה בהודעה של 30 יום מראש" : "ללא התחייבות למספר חודשים. עצירה בהודעה של 10 ימים מראש");
    if (commit) {
      t.push("מתנת ההצטרפות ניתנת בהתחייבות בלבד");
      t.push("עצירה לפני תום ההתחייבות מחייבת בהפרש היחסי למחיר המלא");
    }
  }
  (T.extraTerms || []).forEach((x: string) => x && x.trim() && t.push(x.trim()));

  return {
    custom, title, sub,
    brief: I.brief.trim() || "מה הבנו מהשיחה",
    to: "לכבוד " + (I.client.trim() || "[שם הלקוח]"),
    pname: trackName,
    pdesc: trackDesc + (W ? ", כולל " + W.label : ""),
    amounts: amounts.length ? amounts : [{ num: "", sub: "טרם נבחרו שירותים", second: false }],
    tableHead: custom ? "החבילה שלך" : "המסלולים",
    matrix, customRows, tableNote,
    incHead: custom ? "מה כלול בהצעה" : "מה כלול במסלול " + TR!.name,
    inc, incNote: T.vatNote,
    addons, web, msg, gift,
    summary: S, timelines, webTimelines, terms: t,
    totals: { title, monthly, oneoff, monthlyLines, oneoffLines, commit },
  };
}

/* every card key the editor can switch off, grouped for the UI */
export function toggleableCards(P: Pricing, I: QuoteInput, vat: number, T: Template) {
  const full = computeQuote(P, { ...I, hidden: [] }, vat, T);
  return [
    { group: "מה כלול", cards: full.inc },
    ...(full.web ? [{ group: full.web.head, cards: full.web.cards }] : []),
    ...(full.msg ? [{ group: "דיוור וואטסאפ", cards: full.msg.cards }] : []),
  ];
}
