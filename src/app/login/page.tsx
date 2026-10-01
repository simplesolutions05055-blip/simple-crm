"use client";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase/browser";

const KEY = "sscrm_emails";
function loadEmails(): string[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
function rememberEmail(e: string) {
  try {
    const list = [e, ...loadEmails().filter((x) => x !== e)].slice(0, 5);
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch { /* private mode */ }
}
function forgetEmail(e: string) {
  try { localStorage.setItem(KEY, JSON.stringify(loadEmails().filter((x) => x !== e))); } catch { /* */ }
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [saved, setSaved] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "sent">("email");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const list = loadEmails();
    setSaved(list);
    if (list[0]) setEmail(list[0]);
    if (new URLSearchParams(location.search).get("e")) setErr("הקישור לא תקין או שפג תוקפו. שלחו קישור חדש.");
  }, []);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const addr = email.trim().toLowerCase();
    setBusy(true); setErr("");
    const { error } = await sb().auth.signInWithOtp({
      email: addr,
      options: { emailRedirectTo: location.origin + "/auth/callback", shouldCreateUser: true },
    });
    setBusy(false);
    if (error) {
      if (/rate|security purposes|seconds/i.test(error.message)) {
        rememberEmail(addr);
        setErr("כבר נשלח אליך קישור לאחרונה. בדקו את תיבת המייל (גם בספאם) ולחצו עליו. אפשר לבקש קישור חדש בעוד כמה דקות.");
      } else setErr("השליחה נכשלה: " + error.message);
      return;
    }
    rememberEmail(addr);
    setSaved(loadEmails());
    setStep("sent");
  }
  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const { error } = await sb().auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) setErr("הקוד לא תקין או שפג תוקפו.");
    else location.href = "/";
  }

  return (
    <div className="loginwrap">
      <form className="panel loginbox" onSubmit={step === "email" ? send : verify} autoComplete="on">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Simple Solution" style={{ width: 170, alignSelf: "center" }} />
        <h1 style={{ fontSize: 20, textAlign: "center" }}>כניסה ל-simple-CRM</h1>
        {step === "email" ? (
          <>
            <label className="field"><span>מייל</span>
              <input className="inp ltr" type="email" name="email" autoComplete="username email" list="saved-emails" required
                value={email} onChange={(e) => setEmail(e.target.value)} autoFocus={!email} />
              <datalist id="saved-emails">{saved.map((s) => <option key={s} value={s} />)}</datalist>
            </label>
            {saved.length ? (
              <div className="pills">
                {saved.map((s) => (
                  <span key={s} className={"pillck" + (s === email.trim().toLowerCase() ? " on" : "")} onClick={() => setEmail(s)} style={{ direction: "ltr" }}>
                    {s}
                    <button type="button" aria-label="הסרה" title="הסרה מהרשימה"
                      onClick={(ev) => { ev.stopPropagation(); forgetEmail(s); setSaved(loadEmails()); if (email === s) setEmail(""); }}
                      style={{ border: 0, background: "none", cursor: "pointer", color: "var(--faint)", padding: 0, marginInlineStart: 4 }}>×</button>
                  </span>
                ))}
              </div>
            ) : null}
            <button className="btn primary" disabled={busy}>{busy ? "שולח…" : "שליחת קישור כניסה"}</button>
          </>
        ) : (
          <>
            <p style={{ margin: 0, color: "var(--soft)" }}>נשלח מייל ל-{email.trim().toLowerCase()}. לוחצים על הקישור במייל, באותו מכשיר ובאותו דפדפן.</p>
            <label className="field"><span>קוד מהמייל (אם הגיע קוד במקום קישור)</span>
              <input className="inp ltr" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
            </label>
            <button className="btn primary" disabled={busy || code.trim().length < 6}>כניסה עם קוד</button>
            <button type="button" className="btn ghost" onClick={() => setStep("email")}>חזרה</button>
          </>
        )}
        {err ? <p style={{ color: "var(--bad)", margin: 0 }}>{err}</p> : null}
        <p className="tiny" style={{ margin: 0, textAlign: "center" }}>אחרי כניסה המערכת זוכרת אותך במכשיר הזה, ולא צריך להתחבר שוב בכל פעם.</p>
      </form>
    </div>
  );
}
