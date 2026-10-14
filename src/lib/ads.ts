/* campaign builder options, shared by the screen and the server (the server only accepts these) */
export const AD_GOALS: [string, string, string][] = [
  ["engagement", "מעורבות", "לייקים, תגובות ושיתופים על המודעה"],
  ["traffic", "תנועה לאתר", "קליקים לקישור. חובה קישור וכפתור"],
  ["awareness", "חשיפה", "כמה שיותר אנשים יראו את המודעה"],
  ["video_views", "צפיות בסרטון", "רק לפוסט עם סרטון"],
];
export const AD_CTAS: [string, string][] = [
  ["LEARN_MORE", "למידע נוסף"], ["CONTACT_US", "צרו קשר"], ["SIGN_UP", "הרשמה"], ["GET_QUOTE", "קבלת הצעת מחיר"],
  ["BOOK_NOW", "להזמנה"], ["SHOP_NOW", "לקנייה"], ["GET_OFFER", "לקבלת ההצעה"], ["REQUEST_DEMO", "בקשת הדגמה"],
  ["SUBSCRIBE", "הרשמה לעדכונים"], ["APPLY_NOW", "הגשת מועמדות"],
];
export const AD_GENDERS: [string, string][] = [["all", "כולם"], ["female", "נשים"], ["male", "גברים"]];
/* sanity cap against a typo (an extra zero), in the ad account currency */
export const AD_MAX_DAILY = 5000;
export const AD_MAX_LIFETIME = 50000;
