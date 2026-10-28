import type { Metadata } from "next";
import { preload } from "react-dom";
import "../lp.css";
import LeadForm from "../LeadForm";
import Offer from "../Offer";
import { ChatIcon } from "../WaFab";

/* landing page for the "קמפיין AI" first-month promo (traffic from the TikTok / Meta ads).
   Prices match the AI campaign quote: 600 before VAT a month, the first month at 50%. */
export const metadata: Metadata = {
  title: "ניהול קמפיין ממומן · החודש הראשון ב-50% הנחה | Simple Solutions",
  description: "ניהול קמפיין ממומן במטא או בטיקטוק לעסקים נותני שירות. החודש הראשון 300 ₪ במקום 600 ₪, לפני מע\"מ. בלי התחייבות לחודשים.",
  robots: { index: false, follow: false },
};

const WA = "https://wa.me/972549020253?text=" + encodeURIComponent("היי מאור, ראיתי את המבצע של 50% על ניהול קמפיין ואשמח לפרטים");

/* the headline words rise one by one (as on simple-solution.co.il); each word is its own span with its own delay */
function Words({ text, from, gold }: { text: string; from: number; gold?: boolean }) {
  return text.split(" ").map((w, i) => (
    <span className="lp-w" key={i}>
      <span className={gold ? "lp-gold" : undefined} style={{ animationDelay: `${(from + i * 0.08).toFixed(2)}s` }}>{w}</span>
    </span>
  ));
}

export default function Page() {
  preload("/lp/fonts/heebo-hebrew-wght-normal.woff2", { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  preload("/lp/fonts/space-grotesk-latin-wght-normal.woff2", { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  return (
    <div className="lp">
      <header className="lp-top"><span className="lp-logo-chip"><img src="/lp/logo.webp" alt="Simple Solutions" className="lp-logo" width={241} height={104} /></span><a className="lp-wa-fab" href={WA} aria-label="וואטסאפ" title="וואטסאפ"><ChatIcon /></a></header>

      <section className="lp-hero">
        <div className="lp-bg-mark" aria-hidden="true"><img src="/lp/s-mark.webp" alt="" width={557} height={713} decoding="async" /></div>
        <div className="lp-wrap lp-hero-grid">
          <span className="lp-brand-pill" dir="ltr">SIMPLE SOLUTIONS · BUSINESS OS</span>
          <h1 className="lp-h1">
            <span className="lp-line"><Words text="מבצע מיוחד" from={0.15} /></span>
            <span className="lp-line"><Words text="למצטרפים חדשים" from={0.31} gold /></span>
          </h1>
          <span className="lp-trust">+50 לקוחות פעילים</span>
          <div className="lp-a-offer"><Offer /></div>
          <div className="lp-photo"><img src="/lp/woman-purple.webp" alt="" width={759} height={716} fetchPriority="high" /></div>
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
