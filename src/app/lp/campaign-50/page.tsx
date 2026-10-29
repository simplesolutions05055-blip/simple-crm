import type { Metadata } from "next";
import { preload } from "react-dom";
import "../lp.css";
import LeadForm from "../LeadForm";
import Offer from "../Offer";
import { ChatIcon } from "../WaFab";
import TikTokPixel from "../TikTokPixel";

/* landing page for the "קמפיין AI" first-month promo (traffic from the TikTok / Meta ads).
   Prices match the AI campaign quote: 600 before VAT a month, the first month at 50%. */
export const metadata: Metadata = {
  title: "ניהול קמפיין ממומן · החודש הראשון ב-50% הנחה | Simple Solutions",
  description: "ניהול קמפיין ממומן במטא או בטיקטוק לעסקים נותני שירות. החודש הראשון 300 ₪ במקום 600 ₪, לפני מע\"מ. בלי התחייבות לחודשים.",
  robots: { index: false, follow: false },
};

const WA = "https://wa.me/972549020253?text=" + encodeURIComponent("היי מאור, ראיתי את המבצע של 50% על ניהול קמפיין ואשמח לפרטים");

/* the headline words blur in one by one; each word is its own span with its own delay */
function Words({ text, from, gold }: { text: string; from: number; gold?: boolean }) {
  return text.split(" ").map((w, i) => (
    <span className="lp-w" key={i}>
      <span className={gold ? "lp-grad" : undefined} style={{ animationDelay: `${(from + i * 0.08).toFixed(2)}s` }}>{w}</span>
    </span>
  ));
}

export default function Page() {
  preload("/lp/fonts/heebo-hebrew-wght-normal.woff2", { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  preload("/lp/fonts/space-grotesk-latin-wght-normal.woff2", { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  return (
    <div className="lp">
      <div className="lp-sky" aria-hidden="true">
        <span className="lp-aurora a1" /><span className="lp-aurora a2" /><span className="lp-aurora a3" />
        <span className="lp-beams" /><span className="lp-stars" /><span className="lp-grain" />
      </div>
      <header className="lp-top"><span className="lp-logo-chip"><img src="/lp/logo.webp" alt="Simple Solutions" className="lp-logo" width={241} height={104} /></span><a className="lp-wa-fab" href={WA} aria-label="וואטסאפ" title="וואטסאפ"><ChatIcon /></a></header>

      <main className="lp-hero">
        <span className="lp-badge"><i />לזמן מוגבל בלבד</span>
        <h1 className="lp-h1">
          <span className="lp-line"><Words text="מבצע מיוחד" from={0.15} /></span>
          <span className="lp-line"><Words text="למצטרפים חדשים" from={0.33} gold /></span>
        </h1>
        <span className="lp-trust">+50 לקוחות פעילים</span>
        <Offer />
        <div className="lp-horizon">
        <section className="lp-panel" id="form">
          <div className="lp-card-head"><h2>לתיאום שיחה קצרה</h2><p className="lp-muted">משאירים שם וטלפון, ומאור חוזר אליך.</p></div>
          <LeadForm page="campaign-50" cta="שמרו לי את המבצע" wide />
        </section>
        </div>
      </main>

      <TikTokPixel />
      <footer className="lp-credit">נבנה על ידי <a href="https://www.simple-solution.co.il/" target="_blank" rel="noopener">Simple Solution</a></footer>
    </div>
  );
}
