"use client";
import type { Template } from "@/lib/quote-engine";
import type { AiModel } from "@/lib/ai-campaign";
import { Fold, FoldOpen, type SignedInfo } from "@/components/QuoteDoc";

const dmy = (iso: string) => {
  const [y, m, d] = (iso || "").split("-");
  return d && m && y ? `${d}/${m}/${y}` : "";
};

/* renders the AI campaign and the products quote: both produce this model (minus their totals) */
type DocModel = Omit<AiModel, "totals">;

export default function AiQuoteDoc({ m, T, to, biz, date, until, signed, children, pay, openAll }: {
  m: DocModel; T: Template; to: string; biz: string; date: string; until: string;
  signed?: SignedInfo; children?: React.ReactNode; pay?: React.ReactNode; openAll?: boolean;
}) {
  const inc = m.inc.filter((c) => !c.no);
  const exc = m.inc.filter((c) => c.no);
  return (
    <FoldOpen.Provider value={!!openAll}>
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
          {m.notice ? (
            <div className="notice">
              <span>{m.notice.text}</span>
              <span className="chip">{m.notice.chip}</span>
            </div>
          ) : m.promo ? (
            <div className="notice">
              <span>מבצע הצטרפות: החודש הראשון בחצי מחיר</span>
              <span className="chip">לזמן מוגבל</span>
            </div>
          ) : null}

          <div className="pricecard">
            <div className="what">
              {m.price.title && !m.figs ? <h2>{m.price.title}</h2> : null}
              {m.price.desc && !m.figs ? <p>{m.price.desc}</p> : null}
              {m.priceLines?.length ? (
                <div className="aq-plines">
                  {m.priceLines.map((r, i) => (
                    <div key={i}><span className="nm">{r.a}</span><span className="k">{r.k ? <i>{r.k}</i> : null}</span><span className="money">{r.was ? <s>{r.was}</s> : null}<bdi>{r.b}</bdi></span></div>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="aq-figs">
              {(m.figs || [{ label: m.price.title, was: m.price.was, num: m.price.num }]).map((f, i) => (
                <div className="aq-f" key={i}>
                  <small>{f.label}</small>
                  <span className="v">{f.was ? <s><bdi>{f.was}</bdi></s> : null}<b><bdi>{f.num}</bdi></b></span>
                </div>
              ))}
              <span className="aq-vat">לפני מע&quot;מ</span>
            </div>
          </div>          <Fold badge="✓" title="מה כלול">
          {m.incGroups ? m.incGroups.map((g, n) => (
            <div className="aq-group" key={n}>
              {m.incGroups!.length > 1 ? <h4>{g.title}</h4> : null}
              <div className="cards">
                {g.items.map((c, i) => (
                  <div className="card" key={i}><span className={"mark" + (c.no ? " no" : "")}>{c.no ? "✕" : "✓"}</span><span className="txt"><b>{c.t}</b><span>{c.s}</span></span></div>
                ))}
              </div>
            </div>
          )) : <>
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
          </>}
          </Fold>

          <Fold badge="₪" title="סיכום לתשלום">
          <div className="summary">
            {m.summary.map((r, i) => (
              <div key={i} className={"row " + r.cls}><span>{r.a}</span><span>{r.was ? <s className="aq-was">{r.was}</s> : null}<bdi>{r.b}</bdi></span></div>
            ))}
          </div>
          {m.summaryNote ? <p className="note">{m.summaryNote}</p> : null}
          </Fold>

          <Fold badge="⏱" title="לוחות זמנים">
          <div className="tl">
            {m.timelines.map((r, i) => <div className="r" key={i}><b>{r.t}</b><span>{r.s}</span></div>)}
          </div>
          <p className="note">{m.timelinesNote}</p>
          </Fold>

          <Fold badge="+" title="תוספות אפשריות, בתוספת תשלום">
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
          </Fold>

          <Fold badge="i" title="תנאים והגבלות">
            {m.termGroups ? m.termGroups.map((g, n) => (
              <div className="aq-group" key={n}>
                <h4>{g.title}</h4>
                <div className="terms">{g.items.map((x, i) => <div key={i}>{x}</div>)}</div>
              </div>
            )) : <div className="terms">{m.terms.map((x, i) => <div key={i}>{x}</div>)}</div>}
          </Fold>

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
    </FoldOpen.Provider>
  );
}
