# simple-CRM

המערכת הפנימית של Simple Solution: לידים, לקוחות, הצעות מחיר עם חתימה דיגיטלית, משימות והגדרות.

- כתובת: https://app.simple-solution.co.il
- קוד: Next.js (App Router) על Vercel
- נתונים: Supabase, פרויקט Simple-Solution-Final, כל הטבלאות עם הקידומת `crm_`
- כניסה: קישור למייל, רק למיילים שב-`crm_allowed_emails`

## מבנה
- `src/lib/quote-engine.ts` - מנוע ההצעה (העתק של quote-template (11).html). מחירון ברירת המחדל: `src/lib/pricing-default.json`
- `src/components/QuoteDoc.tsx` - עיצוב ההצעה
- `src/app/q/[token]` - דף ההצעה ללקוח, כולל חתימה
- `src/app/api/n8n/*` - כניסת לידים וסיכום יומי ל-n8n
- `supabase/migrations` - הסכמה והפונקציות

## אחרי חתימה (אוטומטי, בפונקציה crm_sign_quote)
לקוח חדש, שירותים, תשלום חד פעמי, רשימת קליטה, משימת קליטה, תיעוד ואירוע ל-n8n.
חיובים חודשיים נפתחים לבד בתחילת כל חודש (pg_cron).

## הרצה מקומית
```
cp .env.example .env.local   # למלא URL ו-anon key
npm install && npm run dev
```
