"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import QuoteDoc from "@/components/QuoteDoc";
import { computeQuote, normalizeInput, withPricing, withTemplate } from "@/lib/quote-engine";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Data = Record<string, any>;

export default function PublicQuote({ token, data }: { token: string; data: Data }) {
  const P = withPricing(data.pricing);
  const T = withTemplate(data.template);
  const I = normalizeInput(data.input);
  const m = useMemo(() => computeQuote(P, I, Number(data.vat) || 0, T), [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const [signed, setSigned] = useState(data.signed as Data | null);
  const [status, setStatus] = useState<string>(data.status);
  const open = !signed && (status === "נשלחה" || status === "נצפתה");

  return (
    <div className="qpub">
      {signed ? <div className="state"><b>✓ ההצעה נחתמה.</b><span>{T.thanks}</span><button className="btn sm" onClick={() => window.print()}>שמירה כ-PDF</button></div>
        : status === "פגה" ? <div className="state">תוקף ההצעה הסתיים. אפשר לפנות ל{T.owner} ב-{T.phone} לקבלת הצעה מעודכנת.</div>
        : status === "נדחתה" ? <div className="state">ההצעה סומנה כלא רלוונטית. אם משהו השתנה, אפשר לפנות ל{T.owner} ב-{T.phone}.</div>
        : null}
      <QuoteDoc m={m} T={T} signed={signed ? { name: signed.name, biz: signed.biz, signed_at: signed.signed_at, png: signed.png, doc_hash: signed.doc_hash } : null}>
        {open ? <SignForm token={token} T={T} toName={data.to_name || ""} toBiz={data.to_biz || ""} toEmail={data.to_email || ""}
          onSigned={(s) => { setSigned(s); setStatus("נחתמה"); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          onRejected={() => setStatus("נדחתה")} /> : undefined}
      </QuoteDoc>
    </div>
  );
}

/* the canvas is drawn at device pixel ratio; save it at 1x so phones stay well under the size limit */
function signaturePng(c: HTMLCanvasElement) {
  const r = c.getBoundingClientRect();
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(r.width));
  out.height = Math.max(1, Math.round(r.height));
  out.getContext("2d")!.drawImage(c, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}

function SignForm({ token, T, toName, toBiz, toEmail, onSigned, onRejected }: {
  token: string; T: ReturnType<typeof withTemplate>; toName: string; toBiz: string; toEmail: string;
  onSigned: (s: Data) => void; onRejected: () => void;
}) {
  const [name, setName] = useState(toName);
  const [biz, setBiz] = useState(toBiz);
  const [idno, setIdno] = useState("");
  const [email, setEmail] = useState(toEmail);
  const [agree, setAgree] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const cv = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const c = cv.current!;
    const fit = () => {
      const r = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      c.width = r.width * dpr; c.height = r.height * dpr;
      const ctx = c.getContext("2d")!;
      ctx.scale(dpr, dpr); ctx.lineWidth = 2.4; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#1a1147";
      setDrawn(false);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const pos = (e: React.PointerEvent) => { const r = cv.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const down = (e: React.PointerEvent) => { drawing.current = true; cv.current!.setPointerCapture(e.pointerId); const ctx = cv.current!.getContext("2d")!; const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); };
  const move = (e: React.PointerEvent) => { if (!drawing.current) return; const ctx = cv.current!.getContext("2d")!; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); setDrawn(true); };
  const up = () => { drawing.current = false; };
  const clear = () => { const c = cv.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); setDrawn(false); };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!drawn) return setErr("צריך לחתום בתיבה.");
    setBusy(true); setErr("");
    const png = signaturePng(cv.current!);
    let r: Response | null = null;
    try {
      r = await fetch("/api/sign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, name, biz, idno, email, png }) });
    } catch { /* network */ }
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    // only a real confirmation from the server counts as signed
    if (!r || !r.ok || !j.ok) return setErr(j.error || "החתימה לא נשמרה. בדקו את החיבור ונסו שוב.");
    onSigned({ name, biz, signed_at: j.signed_at, png, doc_hash: j.doc_hash });
  }

  async function reject() {
    const reason = prompt("אפשר לכתוב במשפט מה לא התאים (לא חובה):");
    if (reason === null) return;
    const r = await fetch("/api/reject", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, reason }) });
    if (r.ok) onRejected();
  }

  return (
    <form className="qsign" onSubmit={submit}>
      <h4>{T.signTitle}</h4>
      <div className="fg">
        <label>שם מלא<input type="text" required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
        <label>שם העסק<input type="text" value={biz} onChange={(e) => setBiz(e.target.value)} autoComplete="organization" /></label>
        {T.showIdno ? <label>ת.ז. או ח.פ.<input type="text" inputMode="numeric" value={idno} onChange={(e) => setIdno(e.target.value)} /></label> : null}
        <label>מייל<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
      </div>
      <div className="pad">
        <canvas ref={cv} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
        {!drawn ? <div className="ph">חתימה כאן, עם האצבע או העכבר</div> : null}
        <button type="button" className="clr" onClick={clear}>ניקוי</button>
      </div>
      <label className="agree"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />{T.agree}</label>
      {err ? <div className="err">{err}</div> : null}
      <button className="go" disabled={busy || !agree || !name.trim()}>{busy ? "שומר…" : "אישור וחתימה"}</button>
      <div className="small">{T.signNote}</div>
      <button type="button" className="linkbtn" onClick={reject}>ההצעה לא מתאימה לי כרגע</button>
    </form>
  );
}
