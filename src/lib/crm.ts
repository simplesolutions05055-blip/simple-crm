/* shared constants and small helpers for the CRM screens */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

export const STAGES = ["חדש", "נוצר קשר", "כשיר", "פגישה נקבעה", "הצעה נשלחה", "לקוח"] as const;
export const OFF_STAGES = ["לא עכשיו", "נפסל"] as const;
export const INDUSTRIES = ["רכב", "יופי וקוסמטיקה", "כושר וטיפול", "ייעוץ עסקי"];
export const SOURCES = ["אתר ישיר", "אינסטגרם", "פייסבוק", "טיקטוק", "גוגל", "המלצה", "ממומן", "אחר"];
export const BUDGETS = ["עד 1500", "1500 עד 3000", "3000 ומעלה", "לא אמר"];
export const DISQ = ["לא בקהל היעד", "אין תקציב", "לא מקבל ההחלטות", "רק סקרנות", "מתחרה או ספק", "לא ענה", "ספאם"];
export const TOUCH = ["שיחה", "וואטסאפ", "מייל", "פגישה", "הערה"];
export const FIT: [string, string][] = [
  ["market", "בתוך שוק היעד"], ["active", "עסק פעיל עם לקוחות"], ["budget", "תקציב שמחזיק חבילה"],
  ["decider", "מקבל ההחלטות"], ["pain", "כאב אמיתי"],
];
export const LINKS: [string, string, string][] = [
  ["site", "אתר", "globe"], ["landing", "דף נחיתה", "layout"], ["facebook", "פייסבוק", "link"],
  ["instagram", "אינסטגרם", "link"], ["tiktok", "טיקטוק", "link"], ["google", "גוגל עסקים", "pin"],
];
export const FTYPES: [string, string][] = [["text", "טקסט"], ["url", "קישור"], ["number", "מספר"], ["date", "תאריך"]];
export const CLIENT_STATUS = ["בקליטה", "פעיל", "בסיכון", "הסתיים", "עזב"];
export const QUOTE_STATUS_CLS: Record<string, string> = {
  "טיוטה": "", "נשלחה": "info", "נצפתה": "gold", "נחתמה": "ok", "נדחתה": "bad", "פגה": "warn",
};
export const CLIENT_STATUS_CLS: Record<string, string> = { "בקליטה": "info", "פעיל": "ok", "בסיכון": "warn", "הסתיים": "", "עזב": "bad" };

export function pad(n: number) { return (n < 10 ? "0" : "") + n; }
export function iso(d: Date) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
export function today() { return iso(new Date()); }
export function addDays(s: string, n: number) { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return iso(d); }
export function fmtDate(s?: string | null) {
  if (!s) return "";
  const d = new Date(s.length <= 10 ? s + "T12:00:00" : s);
  return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + String(d.getFullYear()).slice(2);
}
export function fmtDateTime(s?: string | null) {
  if (!s) return "";
  return new Date(s).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
export function ago(s?: string | null) {
  if (!s) return "אף פעם";
  const days = Math.floor((Date.now() - new Date(s).getTime()) / 86400000);
  if (days <= 0) return "היום";
  if (days === 1) return "אתמול";
  return "לפני " + days + " ימים";
}
export function money(n: number) { return Math.round(n || 0).toLocaleString("he-IL") + " ₪"; }
export function initials(s: string) { return (s || "?").trim().slice(0, 1); }

/* 050-1234567 -> 972501234567, for wa.me links */
export function waNumber(phone?: string | null) {
  let p = (phone || "").replace(/[^0-9]/g, "");
  if (p.startsWith("0")) p = "972" + p.slice(1);
  return p;
}
export function waLink(phone: string | null | undefined, text: string) {
  const n = waNumber(phone);
  return "https://wa.me/" + (n ? n : "") + "?text=" + encodeURIComponent(text);
}
export function fillTemplate(t: string, vars: Record<string, string>) {
  return Object.entries(vars).reduce((s, [k, v]) => s.split("{" + k + "}").join(v), t || "");
}
export function appUrl() {
  if (typeof window !== "undefined") return window.location.origin;
  return "https://app.simple-solution.co.il";
}
export function fitScore(fit: Row | null | undefined) { return FIT.filter(([k]) => fit && fit[k]).length; }

/* ---------- client access ---------- */
export const ACCESS_STATUS = ["לא התחיל", "נשלחה בקשה", "ממתין ללקוח", "יש גישה", "בעיה"];
export const ACCESS_STATUS_CLS: Record<string, string> = { "לא התחיל": "", "נשלחה בקשה": "info", "ממתין ללקוח": "warn", "יש גישה": "ok", "בעיה": "bad" };
export const ACCESS_PLATFORMS = ["מטא", "גוגל", "טיקטוק", "אתר", "דומיין", "אחר"];
export const ACCESS_DEFAULTS: [string, string][] = [
  ["מטא", "עמוד פייסבוק"], ["מטא", "חשבון אינסטגרם"], ["מטא", "חשבון מודעות"], ["מטא", "פיקסל"],
  ["גוגל", "חשבון Google Ads"], ["גוגל", "פרופיל עסק בגוגל"], ["גוגל", "Analytics ו-Tag Manager"],
];
export const ACCESS_MSG_DEFAULT = `היי {שם}, כדי שאוכל להתחיל לעבוד על הקמפיינים צריך לתת לי גישה לחשבונות.
לא צריך לשלוח סיסמאות. החשבונות נשארים שלך, ואפשר להסיר את הגישה בכל רגע.

{מטא}{גוגל}{טיקטוק}אם משהו לא מסתדר, אפשר לשלוח לי צילום מסך ואסתדר איתך.`;
const ACCESS_PARTS: Record<string, string> = {
  meta: `פייסבוק ואינסטגרם:
1. נכנסים ל-business.facebook.com, ואז הגדרות ושותפים
2. לוחצים "הוספה" ובוחרים לתת לשותף גישה לנכסים
3. מזהה העסק שלי: {id}
4. מסמנים את העמוד, האינסטגרם, חשבון המודעות והפיקסל, עם שליטה מלאה

`,
  google: `גוגל:
אשלח לך בקשת קישור מחשבון הניהול שלי ({id}). מאשרים אותה בחשבון Google Ads שלך, תחת אדמין, גישה ואבטחה, חשבונות ניהול.

`,
  tiktok: `טיקטוק:
במרכז העסקים נכנסים להגדרות, שותפים, הוספת שותף, ומזינים את המזהה {id}

`,
};
export function accessMessage(agency: Row | undefined, contact: string, rows: Row[]) {
  const a = agency || {};
  const has = (p: string) => !rows.length || rows.some((r) => r.platform === p);
  const part = (k: string, id: string, p: string) => (id && has(p) ? ACCESS_PARTS[k].replace("{id}", id) : "");
  return (a.access_msg || ACCESS_MSG_DEFAULT)
    .replace("{שם}", (contact || "").split(" ")[0] || "")
    .replace("{מטא}", part("meta", a.meta_bm || "", "מטא"))
    .replace("{גוגל}", part("google", a.google_mcc || "", "גוגל"))
    .replace("{טיקטוק}", part("tiktok", a.tiktok_bc || "", "טיקטוק"))
    .replace(/\n{3,}/g, "\n\n");
}

/* ---------- WhatsApp templates from settings.wa.templates text: "name | lang | params | label" per line ---------- */
export type WaTpl = { name: string; lang: string; params: number; label: string };
export function waTemplates(wa: Row | undefined): WaTpl[] {
  return String(wa?.templates || "").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const [name, lang, params, ...label] = l.split("|").map((x) => x.trim());
    return { name, lang: lang || "he", params: Number(params) || 0, label: label.join(" | ") || name };
  }).filter((t) => /^[a-z0-9_]+$/.test(t.name));
}
