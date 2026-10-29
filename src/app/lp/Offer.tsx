import Fifty from "./Fifty";

/* the offer: one centred price line, so the eye reads one thing.
   "300" is drawn by CSS from an animated integer (it counts down from 600 once on load, see lp.css); the real
   price sits in a visually hidden line for screen readers and for browsers without the animation. */
export default function Offer() {
  return (
    <div className="lp-offer">
      <p className="lp-sr">300 ₪ לחודש הראשון במקום 600 ₪</p>
      <div className="lp-offer-price" aria-hidden="true">
        <span className="lp-offer-only">רק</span>
        <span className="lp-offer-amount" dir="ltr"><span className="lp-offer-num" /><span className="lp-offer-cur">₪</span></span>
        <s className="lp-offer-old" dir="ltr">600 ₪</s>
        <Fifty />
      </div>
      <p className="lp-offer-sub">לחודש הראשון. מהחודש השני 600 ₪ לחודש</p>
      <p className="lp-offer-vat">המחירים לפני מע&quot;מ</p>
    </div>
  );
}
