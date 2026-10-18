/* project types and the checklist each one starts with. The business can edit these in settings
   (crm_settings.project_templates); this list is used until it does. */
import type { Row } from "./crm";

export type ProjectTemplate = { name: string; steps: string[] };

export const PROJECT_TEMPLATES_DEFAULT: ProjectTemplate[] = [
  { name: "אתר תדמית", steps: ["פגישת אפיון", "קבלת חומרים (טקסטים, תמונות, לוגו)", "עיצוב ראשוני", "סשן תיקונים 1", "סשן תיקונים 2", "חיבור דומיין", "עלייה לאוויר"] },
  { name: "דף נחיתה", steps: ["פגישת אפיון", "קבלת חומרים", "עיצוב", "סשן תיקונים", "חיבור טופס לידים ל-CRM", "עלייה לאוויר"] },
  { name: "קמפיין AI", steps: ["אפיון וקליטת חומרים", "קבלת גישה לחשבונות הפלטפורמה", "בניית הקמפיין והמודעות", "אישור הלקוח", "עלייה לאוויר", "פגישת תוצאות ראשונה"] },
  { name: "צ'אטבוט", steps: ["פגישת אפיון", "כתיבת תסריט השיחה", "חיבור וואטסאפ, פייסבוק ואינסטגרם", "בדיקות", "אישור הלקוח", "עלייה לאוויר"] },
  { name: "ניהול סושיאל (חודש)", steps: ["פגישת תכנון חודשית", "לוח תוכן", "אישור הלקוח", "הפקה", "פרסום", "דוח סוף חודש"] },
];
export const EMPTY_KIND = "פרויקט ריק";

export function projectTemplates(saved: unknown): ProjectTemplate[] {
  if (!Array.isArray(saved)) return PROJECT_TEMPLATES_DEFAULT;
  return saved
    .filter((t) => t && typeof t.name === "string" && t.name.trim())
    .map((t) => ({ name: String(t.name).trim(), steps: (Array.isArray(t.steps) ? t.steps : []).map((s: unknown) => String(s).trim()).filter(Boolean) }));
}

/* checklist progress from items:crm_project_items(id,done) */
export function progress(p: Row) {
  const items = (p.items || []) as Row[];
  const done = items.filter((i) => i.done).length;
  return { done, total: items.length, pct: items.length ? Math.round((done / items.length) * 100) : 0 };
}
