/* campaign builder options, shared by the screen and the server (the server only accepts these) */
/* [key, label, description, networks]. lead_generation and whatsapp exist through Zernio on Meta only:
   lead forms are created for Meta and LinkedIn, and click-to-WhatsApp is a Meta ad type. */
export const AD_GOALS: [string, string, string, ("meta" | "tiktok")[]][] = [
  ["lead_generation", "לידים", "טופס קצר בתוך המודעה. הפרטים נכנסים ללשונית לידים ב-CRM", ["meta"]],
  ["whatsapp", "וואטסאפ", "לחיצה על המודעה פותחת שיחה איתך בוואטסאפ", ["meta"]],
  ["engagement", "מעורבות", "לייקים, תגובות ושיתופים על המודעה", ["meta", "tiktok"]],
  ["traffic", "תנועה לאתר", "קליקים לקישור. חובה קישור וכפתור", ["meta", "tiktok"]],
  ["awareness", "חשיפה", "כמה שיותר אנשים יראו את המודעה", ["meta", "tiktok"]],
  ["video_views", "צפיות בסרטון", "רק לפוסט עם סרטון", ["meta", "tiktok"]],
];
/* fields a new Meta lead form asks for (Meta fills them in from the person's profile) */
export const LEAD_QUESTIONS: [string, string][] = [["FULL_NAME", "שם מלא"], ["PHONE", "טלפון"], ["EMAIL", "אימייל"], ["CITY", "עיר"], ["COMPANY_NAME", "שם העסק"]];
/* wa.me link from an Israeli or international number, or "" when it is not a phone number */
export function waLink(phone: string, text = "") {
  let d = phone.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = "972" + d.slice(1);
  if (!/^\d{9,15}$/.test(d)) return "";
  return "https://wa.me/" + d + (text.trim() ? "?text=" + encodeURIComponent(text.trim()) : "");
}
export const AD_CTAS: [string, string][] = [
  ["LEARN_MORE", "למידע נוסף"], ["CONTACT_US", "צרו קשר"], ["SIGN_UP", "הרשמה"], ["GET_QUOTE", "קבלת הצעת מחיר"],
  ["BOOK_NOW", "להזמנה"], ["SHOP_NOW", "לקנייה"], ["GET_OFFER", "לקבלת ההצעה"], ["REQUEST_DEMO", "בקשת הדגמה"],
  ["SUBSCRIBE", "הרשמה לעדכונים"], ["APPLY_NOW", "הגשת מועמדות"],
];
export const AD_GENDERS: [string, string][] = [["all", "כולם"], ["female", "נשים"], ["male", "גברים"]];
/* sanity cap against a typo (an extra zero), in the ad account currency */
export const AD_MAX_DAILY = 5000;
export const AD_MAX_LIFETIME = 50000;
