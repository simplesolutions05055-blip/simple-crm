/* the offer: one glass card in the page's celestial style. On the right the price ("300" is drawn by CSS from an
   animated integer that counts down from 600 once on load, see lp.css); on the left a "50%" emblem with a gold
   light orbiting it. The real price sits in a visually hidden line for screen readers. */
export default function Offer() {
  return (
    <div className="lp-offer">
      <p className="lp-sr">300 ₪ לחודש הראשון במקום 600 ₪, 50% הנחה. מהחודש השני 600 ₪ לחודש, המחירים לפני מע&quot;מ</p>
      <div className="lp-deal" aria-hidden="true">
        <div className="lp-deal-main">
          <span className="lp-deal-eyebrow">החודש הראשון</span>
          <div className="lp-deal-price">
            <span className="lp-offer-amount" dir="ltr"><span className="lp-offer-num" /><span className="lp-offer-cur">₪</span></span>
            <s className="lp-offer-old" dir="ltr">600 ₪</s>
          </div>
          <span className="lp-deal-note">מהחודש השני 600 ₪ לחודש<span className="lp-offer-vat"><span className="lp-dot"> · </span>לפני מע&quot;מ</span></span>
        </div>
        <span className="lp-deal-sep" />
        <div className="lp-emblem">
          <span className="lp-orbit"><i /></span>
          <b dir="ltr">50%</b>
          <small>הנחה</small>
        </div>
      </div>
    </div>
  );
}
