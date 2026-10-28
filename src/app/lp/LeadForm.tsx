"use client";
/* the lead form of the CRM's landing pages: name + phone, terms (required), updates (optional, unchecked).
   The ad's utm parameters travel with the lead so the CRM knows it came from TikTok / Meta. */
import { useEffect, useRef, useState } from "react";

export default function LeadForm({ page, cta, wide }: { page: string; cta: string; wide?: boolean }) {
  const [f, setF] = useState({ name: "", phone: "", terms: false, marketing: false, website: "" });
  const [state, setState] = useState<"" | "busy" | "done">("");
  const [err, setErr] = useState("");
  const t0 = useRef(0);
  useEffect(() => { t0.current = Date.now(); }, []);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (f.name.trim().length < 2) return setErr("כותבים שם");
    if (!/^0\d{8,9}$/.test(f.phone.replace(/[^\d]/g, ""))) return setErr("מספר טלפון ישראלי, מתחיל ב-0");
    if (!f.terms) return setErr("צריך לאשר את התנאים ומדיניות הפרטיות");
    setState("busy");
    const q = new URLSearchParams(location.search);
    const r = await fetch("/api/lp/lead", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ page, ...f, ms: Date.now() - t0.current, url: location.href.slice(0, 300), utm_source: q.get("utm_source") || "", utm_campaign: q.get("utm_campaign") || "", utm_content: q.get("utm_content") || "" }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok || !j.ok) { setState(""); return setErr(j.error || "השליחה נכשלה. אפשר לכתוב לנו בוואטסאפ"); }
    setState("done");
  }
  if (state === "done") return <div className="lp-done"><b>הפרטים התקבלו, תודה.</b><span>מאור יחזור אליך לשיחה קצרה.</span></div>;
  return (
    <form className={"lp-form" + (wide ? " wide" : "")} onSubmit={send} noValidate>
      <div className="lp-row">
      <input className="lp-inp" placeholder="שם מלא" autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <input className="lp-inp" placeholder="טלפון" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
      {wide ? <button className="lp-btn" disabled={state === "busy"}>{state === "busy" ? "שולח…" : cta}</button> : null}
      </div>
      <input className="lp-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" name="website" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} />
      <label className="lp-check"><input type="checkbox" checked={f.terms} onChange={(e) => setF({ ...f, terms: e.target.checked })} /><span>קראתי ואני מאשר/ת את <a href="https://www.simple-solution.co.il/terms.html" target="_blank" rel="noopener noreferrer">התנאים</a> ו<a href="https://www.simple-solution.co.il/privacy.html" target="_blank" rel="noopener noreferrer">מדיניות הפרטיות</a></span></label>
      <label className="lp-check"><input type="checkbox" checked={f.marketing} onChange={(e) => setF({ ...f, marketing: e.target.checked })} /><span>אשמח לקבל עדכונים ומבצעים במייל ובוואטסאפ (לא חובה)</span></label>
      {err ? <p className="lp-err">{err}</p> : null}
      {!wide ? <button className="lp-btn full" disabled={state === "busy"}>{state === "busy" ? "שולח…" : cta}</button> : null}
    </form>
  );
}
