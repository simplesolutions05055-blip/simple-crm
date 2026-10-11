"use client";
import type { Template } from "@/lib/quote-engine";
import type { AiModel } from "@/lib/ai-campaign";
import type { SignedInfo } from "@/components/QuoteDoc";

function Sec({ badge, title }: { badge: string; title: string }) {
  return (
    <div className="sec">
      <span className="badge">{badge}</span>
      <h3>{title}</h3>
      <span className="line" />
    </div>
  );
}

const dmy = (iso: string) => {
  const [y, m, d] = (iso || "").split("-");
  return d && m && y ? `${d}/${m}/${y}` : "";
};

export default function AiQuoteDoc({ m, T, to, biz, date, until, signed, children, pay }: {
  m: AiModel; T: Template; to: string; biz: string; date: string; until: string;
  signed?: SignedInfo; children?: React.ReactNode; pay?: React.ReactNode;
}) {
  const inc = m.inc.filter((c) => !c.no);
  const exc = m.inc.filter((c) => c.no);
  return (
    <div className="qd aq">
      <div className="page">
        <div className="aq-top">
          <span className="tag">{T.tag}</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/quote-logo.png" alt={T.name} />
        </div>
        <div className="hero">
          <div className="hero-title" style={{ marginTop: 0 }}>
            <h1>{m.title}</h1>
            <p>{m.sub}</p>
          </div>
          <div className="aq-meta">
            <div><small>לכבוד</small><b>{to || " "}</b></div>
            <div><small>שם העסק</small><b>{biz || " "}</b></div>
            <div><small>תאריך</small><b>{dmy(date)}</b></div>
            <div><small>בתוקף עד</small><b>{dmy(until)}</b></div>
          </div>
        </div>
        <div className="rule" />

        <div className="body">
          {m.promo ? (
            <div className="notice">
              <span>מבצע הצטרפות: החודש הראשון בחצי מחיר</span>
              <span className="chip">לזמן מוגבל</span>
            </div>
          ) : null}

          <div className="pricecard">
            <div className="what">
              <h2>{m.price.title}</h2>
              <p>{m.price.desc}</p>
            </div>
            <div className="aq-amount">
              {m.promo ? <div className="aq-badge">{m.promoPct}%<br />הנחה</div> : null}
              <div className="aq-fig">
                {m.price.was ? <div className="was">{m.price.was}</div> : null}
                <div className="num">{m.price.num}</div>
                <div className="sub">{m.price.sub}</div>
              </div>
            </div>
          </div>

          <Sec badge="✓" title="מה כלול" />
          <div className="cards">
            {inc.map((c, i) => (
              <div className="card" key={i}><span className="mark">✓</span><span className="txt"><b>{c.t}</b><span>{c.s}</span></span></div>
            ))}
          </div>
          <div className="cards" style={{ marginTop: 12 }}>
            {exc.map((c, i) => (
              <div className="card" key={i}><span className="mark no">✕</span><span className="txt"><b>{c.t}</b><span>{c.s}</span></span></div>
            ))}
          </div>

          <Sec badge="₪" title="סיכום לתשלום" />
          <div className="summary">
            {m.summary.map((r, i) => (
              <div key={i} className={"row " + r.cls}><span>{r.a}</span><span>{r.b}</span></div>
            ))}
          </div>
          {m.summaryNote ? <p className="note">{m.summaryNote}</p> : null}

          <Sec badge="⏱" title="לוחות זמנים" />
          <div className="tl">
            {m.timelines.map((r, i) => <div className="r" key={i}><b>{r.t}</b><span>{r.s}</span></div>)}
          </div>
          <p className="note">{m.timelinesNote}</p>

          <Sec badge="+" title="תוספות אפשריות, בתוספת תשלום" />
          <table className="aq-add">
            <thead><tr><th>התוספת</th><th>לפני מע&quot;מ</th><th>כולל מע&quot;מ</th></tr></thead>
            <tbody>
              {m.addons.map((r, i) => (
                <tr key={i} className={r.on ? "on" : ""}>
                  <td><b>{r.t}{r.on ? <em className="aq-picked">נבחר</em> : null}</b><span>{r.d}</span></td>
                  <td><span className="money">{r.net}</span></td>
                  <td><span className="money">{r.gross}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="note">{m.addonsNote}</p>

          <Sec badge="i" title="תנאים והגבלות" />
          <div className="terms">{m.terms.map((x, i) => <div key={i}>{x}</div>)}</div>

          {signed ? (
            <>
              <div className="signed">
                <div className="signed-img">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {signed.png ? <img src={signed.png} alt="חתימה" /> : null}
                </div>
                <div className="signed-meta">
                  <b>נחתם על ידי {signed.name}{signed.biz ? ", " + signed.biz : ""}</b>
                  <span>{new Date(signed.signed_at).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })}</span>
                  {signed.doc_hash ? <span className="hash">מזהה גרסה: {signed.doc_hash.slice(0, 16)}</span> : null}
                </div>
              </div>
              {pay}
            </>
          ) : children ? (
            children
          ) : (
            <div className="sign">
              <div><div className="ln" /><p>חתימת הלקוח</p></div>
              <div><div className="ln" /><p>שם מלא</p></div>
              <div><div className="ln" /><p>תאריך</p></div>
            </div>
          )}
        </div>

        <div className="foot">
          <div className="who"><b>{T.name}</b><span>{T.owner} · ע.מ. {T.bizId}</span></div>
          <div className="cta">{T.cta}</div>
          <div className="site">{T.phone} · {T.email}</div>
        </div>
      </div>
    </div>
  );
}
