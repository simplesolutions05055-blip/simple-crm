"use client";
import { createContext, useContext, useState } from "react";
import type { Model, Template, Card } from "@/lib/quote-engine";

/* sections the reader opens on demand; the internal previews start them open */
const FoldOpen = createContext(false);
function Fold({ badge, title, children }: { badge: string; title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(useContext(FoldOpen));
  return (
    <div className={"fold" + (open ? " open" : "")}>
      <button type="button" className="sec fold-h" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="badge">{badge}</span>
        <h3>{title}</h3>
        <span className="line" />
        <span className="chev" aria-hidden>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
        </span>
      </button>
      <div className="fold-b">{children}</div>
    </div>
  );
}

function Sec({ badge, title }: { badge: string; title: string }) {
  return (
    <div className="sec">
      <span className="badge">{badge}</span>
      <h3>{title}</h3>
      <span className="line" />
    </div>
  );
}

function Cards({ cards }: { cards: Card[] }) {
  return (
    <div className="cards">
      {cards.map((c) => (
        <div className="card" key={c.key}>
          <span className="mark">✓</span>
          <span className="txt">
            <b>{c.t}</b>
            <span>{c.s}</span>
            {c.x ? <em>✘ לא כלול: {c.x}</em> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

export type SignedInfo = { name: string; biz?: string; signed_at: string; png?: string; doc_hash?: string } | null;

export default function QuoteDoc({ m, T, signed, children, openAll }: { m: Model; T: Template; signed?: SignedInfo; children?: React.ReactNode; openAll?: boolean }) {
  return (
    <FoldOpen.Provider value={!!openAll}>
    <div className="qd">
      <div className="page">
        <div className="hero">
          <div className="hero-top">
            <span className="tag">{T.tag}</span>
            <div className="logo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/quote-logo.png" alt={T.name} />
            </div>
          </div>
          <div className="hero-title">
            <h1>{m.title}</h1>
            <p>{m.sub}</p>
          </div>
        </div>
        <div className="rule" />

        <div className="body">
          <div className="notice">
            <span>{m.brief}</span>
            <span className="chip">{m.to}</span>
          </div>

          <div className="pricecard">
            <div className="what">
              <h2>{m.pname}</h2>
              <p>{m.pdesc}</p>
            </div>
            <div className="amount">
              {m.amounts.map((a, i) => (
                <div key={i} className={"fig" + (a.second ? " second" : "")}>
                  {a.num ? <div className="num">{a.num}</div> : null}
                  <div className="sub">{a.sub}</div>
                </div>
              ))}
            </div>
          </div>

          <Sec badge="☰" title={m.tableHead} />
          {m.matrix ? (
            <table>
              <thead>
                <tr>
                  <th>מה כלול</th>
                  {m.matrix.head.map((h, i) => (
                    <th key={i} className={h.sel ? "sel" : ""}>{h.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {m.matrix.rows.map((r, i) => (
                  <tr key={i} className={r.total ? "total" : ""}>
                    <td>{r.t}</td>
                    {r.cells.map((c, j) => (
                      <td key={j} className={c.sel ? "sel" : ""}>
                        {c.text !== undefined ? <span className="money">{c.text}</span> : <span className={c.yes ? "yes" : "no"}>{c.yes ? "✔" : "✘"}</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table>
              <thead>
                <tr><th>השירות</th><th>מה כולל</th></tr>
              </thead>
              <tbody>
                {(m.customRows || []).map((r, i) => (
                  <tr key={i}>
                    <td>{r.t}</td>
                    <td style={{ textAlign: "right", fontWeight: 400, color: "#6b6b8a" }}>{r.d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="note">
            {m.tableNote.text}
            {m.tableNote.bold ? (<><br /><b>{m.tableNote.bold}</b></>) : null}
            {m.custom ? <> המחירים מרוכזים בסעיף &quot;סיכום לתשלום&quot; בתחתית המסמך.</> : null}
          </p>

          <Fold badge="✓" title={m.incHead}>
            <Cards cards={m.inc} />
            <p className="note">{m.incNote}</p>
          </Fold>

          {m.addons ? (
            <>
              <Fold badge="+" title="תוספות חד פעמיות">
                <table>
                  <thead><tr><th>התוספת</th><th>מה כולל</th></tr></thead>
                  <tbody>{m.addons.rows.map((r, i) => <tr key={i}><td>{r.t}</td><td>{r.d}</td></tr>)}</tbody>
                </table>
                <p className="note">{m.addons.note}</p>
              </Fold>
            </>
          ) : null}

          {m.web ? (
            <>
              <Fold badge="◫" title={m.web.head}>
                <Cards cards={m.web.cards} />
                <p className="note">{m.web.note}</p>
              </Fold>
            </>
          ) : null}

          {m.msg ? (
            <>
              <Fold badge="✆" title="דיוור וואטסאפ, איך זה עובד">
              <div style={{ marginBottom: 12 }}>
                <div className="gift">
                  <span className="txt"><b>{m.msg.gift.t}</b><span>{m.msg.gift.s}</span></span>
                  <span className="pill"><s>{m.msg.gift.was}</s><b>ללא עלות</b></span>
                  <span className="ico">🎁</span>
                </div>
              </div>
              <Cards cards={m.msg.cards} />
              <table style={{ marginTop: 12 }}>
                <thead><tr><th>חבילת הודעות לרכישה, תוספת</th><th>מחיר החבילה</th></tr></thead>
                <tbody>
                  {m.msg.packs.map((p, i) => (
                    <tr key={i} className={p.on ? "total" : ""}><td>{p.t}</td><td><span className="money">{p.price}</span></td></tr>
                  ))}
                </tbody>
              </table>
              <p className="note">{m.msg.note}</p></Fold>
            </>
          ) : null}

          {m.gift ? (
            <>
              <Sec badge="★" title="מתנת ההצטרפות" />
              <div className="gift">
                <span className="txt"><b>{m.gift.title}</b><span>{m.gift.sub}</span></span>
                <span className="pill"><s>{Math.round(m.gift.was).toLocaleString("he-IL")} ₪</s><b>{m.gift.pill}</b></span>
                <span className="ico">{m.gift.ico}</span>
              </div>
              <p className="note">{T.giftNote}</p>
            </>
          ) : null}

          <Fold badge="₪" title="סיכום לתשלום">
            <div className="summary">
              {m.summary.map((r, i) => (
                <div key={i} className={"row " + r.cls}>
                  <span>{r.a}</span>
                  <span>{r.was ? <><s>{r.was}</s> </> : null}{r.b}</span>
                </div>
              ))}
            </div>
          </Fold>

          <Fold badge="⏱" title="לוחות זמנים">
          <div className="tl">
            {m.timelines.map((r, i) => <div className="r" key={i}><b>{r.t}</b><span>{r.s}</span></div>)}
          </div>
          <p className="note">{T.timelinesNote}</p>
          {m.webTimelines.length ? (
            <div className="tl" style={{ marginTop: 12 }}>
              {m.webTimelines.map((r, i) => <div className="r" key={i}><b>{r.t}</b><span>{r.s}</span></div>)}
            </div>
          ) : null}
          </Fold>

          <Fold badge="i" title="תנאים והגבלות">
            <div className="terms">{m.terms.map((x, i) => <div key={i}>{x}</div>)}</div>
          </Fold>

          {signed ? (
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
