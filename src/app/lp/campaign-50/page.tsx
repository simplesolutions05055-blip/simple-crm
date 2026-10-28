import type { Metadata } from "next";
import "../lp.css";
import LeadForm from "../LeadForm";
import WaFab, { ChatIcon } from "../WaFab";

/* landing page for the "קמפיין AI" first-month promo (traffic from the TikTok / Meta ads).
   Prices match the AI campaign quote: 600 before VAT a month, the first month at 50%. */
export const metadata: Metadata = {
  title: "ניהול קמפיין ממומן · החודש הראשון ב-50% הנחה | Simple Solutions",
  description: "ניהול קמפיין ממומן במטא או בטיקטוק לעסקים נותני שירות. החודש הראשון 300 ₪ במקום 600 ₪, לפני מע\"מ. בלי התחייבות לחודשים.",
  robots: { index: false, follow: false },
};

const WA = "https://wa.me/972549020253?text=" + encodeURIComponent("היי מאור, ראיתי את המבצע של 50% על ניהול קמפיין ואשמח לפרטים");
const LOGO = "https://simple-solutions-site.vercel.app/logo-simple-solutions.png";

const INC = [
  ["בניית הקמפיין והמודעות", "מאפס, במטא (פייסבוק ואינסטגרם) או בטיקטוק. קהל, מסרים ומודעות."],
  ["מעקב ואופטימיזציה שוטפת", "הקמפיין מנוהל דרך מערכת AI שאני מפתח, שבודקת את המספרים כל יום. כל שינוי נשען על הנתונים של העסק שלך."],
  ["פגישת תוצאות כל שבועיים", "רואים מה עובד, לאן הולך כל שקל ומה משפרים."],
  ["איש קשר אחד", "מדברים ישירות איתי, בלי לרדוף אחרי כמה גורמים."],
];
const STEPS = [
  ["שיחה קצרה", "מכירים את העסק ובודקים שזה מתאים לך."],
  ["אפיון וחומרים", "עד 3 ימים לקליטת החומרים והגישות."],
  ["הקמפיין באוויר", "עד 4 ימים מסיום פגישת האפיון, ומשם פגישת תוצאות כל שבועיים."],
];
const FAQ = [
  ["תקציב הפרסום כלול במחיר?", "לא. תקציב הפרסום משולם ישירות לפלטפורמה, מכרטיס האשראי שלך. המחיר כאן הוא על הניהול."],
  ["יש התחייבות לכמה חודשים?", "לא. אפשר לעצור בכל שלב בהודעה של 10 ימים מראש."],
  ["מטא או טיקטוק?", "פלטפורמה אחת לבחירתך. בשיחה נבדוק יחד איפה הקהל שלך נמצא. פלטפורמה נוספת מתומחרת בנפרד."],
  ["אתם מתחייבים לתוצאות?", "לא, כי התוצאה תלויה גם בעסק ובשוק. מה שאני כן מתחייב אליו: מעקב שוטף, ופגישה כל שבועיים עם המספרים האמיתיים."],
];

export default function Page() {
  return (
    <div className="lp">
      <header className="lp-top"><span className="lp-logo-chip"><img src={LOGO} alt="Simple Solutions" className="lp-logo" /></span><a className="lp-wa lp-wa-sm" href={WA}><ChatIcon />וואטסאפ</a></header>

      <section className="lp-hero">
        <div className="lp-wrap lp-banner">
          <div className="lp-big" aria-label="50% הנחה"><span className="lp-big-num">50<small>%</small></span><span className="lp-big-off">הנחה</span></div>
          <div className="lp-banner-text">
            <h1>מבצע מיוחד <span className="lp-gold">למצטרפים חדשים</span></h1>
            <p className="lp-sub">ניהול קמפיין ממומן במטא או בטיקטוק לעסקים נותני שירות. החודש הראשון ב-300 ₪ במקום 600 ₪ (לפני מע&quot;מ), עם מעקב יומי ופגישת תוצאות כל שבועיים. בלי התחייבות לחודשים.</p>
          </div>
        </div>
        <div className="lp-wrap"><div className="lp-limited"><span>לזמן מוגבל בלבד</span></div></div>
      </section>

      <section className="lp-formbar" id="form">
        <div className="lp-wrap">
          <div className="lp-card wide">
            <div className="lp-card-head"><h2>לתיאום שיחה קצרה</h2><p className="lp-muted">משאירים שם וטלפון, ומאור חוזר אליך.</p></div>
            <LeadForm page="campaign-50" cta="שמרו לי את המבצע" wide />
          </div>
        </div>
      </section>

      <section className="lp-sec">
        <div className="lp-wrap">
          <h2 className="lp-h2">מה מקבלים</h2>
          <div className="lp-grid4">
            {INC.map(([t, s]) => <div key={t} className="lp-item"><span className="lp-dot" /><h3>{t}</h3><p>{s}</p></div>)}
          </div>
        </div>
      </section>

      <section className="lp-sec lp-soft">
        <div className="lp-wrap">
          <h2 className="lp-h2">איך זה עובד</h2>
          <ol className="lp-steps">
            {STEPS.map(([t, s], i) => <li key={t}><span className="lp-num">{i + 1}</span><div><h3>{t}</h3><p>{s}</p></div></li>)}
          </ol>
        </div>
      </section>

      <section className="lp-sec">
        <div className="lp-wrap lp-narrow">
          <h2 className="lp-h2">המחיר, בלי אותיות קטנות</h2>
          <div className="lp-pricebox">
            <div className="lp-prow lp-hl"><span>החודש הראשון</span><span><s>600 ₪</s> <b>300 ₪</b><small>354 ₪ כולל מע&quot;מ</small></span></div>
            <div className="lp-prow"><span>מהחודש השני</span><span><b>600 ₪ לחודש</b><small>708 ₪ כולל מע&quot;מ</small></span></div>
            <ul className="lp-notes">
              <li>תקציב הפרסום לא כלול, ומשולם ישירות לפלטפורמה</li>
              <li>בלי התחייבות למספר חודשים, עצירה בהודעה של 10 ימים מראש</li>
              <li>ההנחה חלה על החודש הראשון בלבד</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="lp-sec lp-soft">
        <div className="lp-wrap lp-narrow">
          <h2 className="lp-h2">שאלות שעולות לפני שמתחילים</h2>
          {FAQ.map(([q, a]) => <details key={q} className="lp-faq"><summary>{q}</summary><p>{a}</p></details>)}
        </div>
      </section>

      <section className="lp-final">
        <div className="lp-wrap lp-narrow">
          <h2>רוצה לבדוק אם זה <span className="lp-gold">מתאים לעסק שלך?</span></h2>
          <p>שיחה קצרה, בלי התחייבות. אם זה לא מתאים, אגיד לך את זה ישר.</p>
          <div className="lp-cta-row">
            <a className="lp-btn" href="#form">שמרו לי את המבצע</a>
            <a className="lp-wa" href={WA}><ChatIcon />לכתוב לי בוואטסאפ</a>
          </div>
        </div>
      </section>

      <footer className="lp-foot">
        <span className="lp-logo-chip sm"><img src={LOGO} alt="" className="lp-logo sm" /></span>
        <p>Simple Solutions · מאור עטייה · <a href="tel:+972509697776">050-969-7776</a> · <a href="mailto:simple.solutions05055@gmail.com">simple.solutions05055@gmail.com</a></p>
        <p><a href="https://www.simple-solution.co.il/privacy.html">מדיניות פרטיות</a> · <a href="https://www.simple-solution.co.il/terms.html">תנאי שימוש</a> · המחירים לפני מע&quot;מ 18%</p>
      </footer>

      <WaFab href={WA} />
    </div>
  );
}
