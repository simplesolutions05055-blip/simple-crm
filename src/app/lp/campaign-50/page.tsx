import type { Metadata } from "next";
import "../lp.css";
import LeadForm from "../LeadForm";
import PriceBadge from "../PriceBadge";
import Fifty from "../Fifty";
import { ChatIcon } from "../WaFab";

/* landing page for the "קמפיין AI" first-month promo (traffic from the TikTok / Meta ads).
   Prices match the AI campaign quote: 600 before VAT a month, the first month at 50%. */
export const metadata: Metadata = {
  title: "ניהול קמפיין ממומן · החודש הראשון ב-50% הנחה | Simple Solutions",
  description: "ניהול קמפיין ממומן במטא או בטיקטוק לעסקים נותני שירות. החודש הראשון 300 ₪ במקום 600 ₪, לפני מע\"מ. בלי התחייבות לחודשים.",
  robots: { index: false, follow: false },
};

const WA = "https://wa.me/972549020253?text=" + encodeURIComponent("היי מאור, ראיתי את המבצע של 50% על ניהול קמפיין ואשמח לפרטים");
const LOGO = "https://simple-solutions-site.vercel.app/logo-simple-solutions.png";

export default function Page() {
  return (
    <div className="lp">
      <header className="lp-top"><span className="lp-logo-chip"><img src={LOGO} alt="Simple Solutions" className="lp-logo" /></span><a className="lp-wa-fab" href={WA} aria-label="וואטסאפ" title="וואטסאפ"><ChatIcon /></a></header>

      <section className="lp-hero">
        <div className="lp-wrap lp-hero-grid">
          <h1 className="lp-h1"><span>מבצע מיוחד</span><span className="lp-gold">למצטרפים חדשים</span></h1>
          <div className="lp-a-fifty"><Fifty /><span>הנחה</span></div>
          <div className="lp-a-price"><PriceBadge /></div>
          <div className="lp-a-next">
            <p className="lp-next">מהחודש השני והלאה רק 600 ש&quot;ח לחודש בלבד</p>
            <p className="lp-vat">המחירים לפני מע&quot;מ</p>
            <div className="lp-limited"><span>לזמן מוגבל בלבד</span></div>
          </div>
          <div className="lp-a-photo"><img src="/lp/woman-purple.webp" alt="" width={759} height={716} /></div>
        </div>
      </section>

      <section className="lp-formbar" id="form">
        <div className="lp-wrap">
          <div className="lp-card wide">
            <div className="lp-card-head"><h2>לתיאום שיחה קצרה</h2><p className="lp-muted">משאירים שם וטלפון, ומאור חוזר אליך.</p></div>
            <LeadForm page="campaign-50" cta="שמרו לי את המבצע" wide />
          </div>
        </div>
      </section>

      <footer className="lp-credit">נבנה על ידי <a href="https://www.simple-solution.co.il/" target="_blank" rel="noopener">Simple Solution</a></footer>
    </div>
  );
}
