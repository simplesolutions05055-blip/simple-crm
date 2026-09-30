"use client";
import { useState } from "react";
import { sb } from "@/lib/supabase/browser";

export default function Login() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "sent">("email");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const { error } = await sb().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: location.origin + "/auth/callback", shouldCreateUser: true },
    });
    setBusy(false);
    if (error) setErr(error.message.includes("rate") ? "נשלחו יותר מדי בקשות. נסו שוב בעוד כמה דקות." : "השליחה נכשלה: " + error.message);
    else setStep("sent");
  }
  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const { error } = await sb().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) setErr("הקוד לא תקין או שפג תוקפו.");
    else location.href = "/";
  }

  return (
    <div className="loginwrap">
      <form className="panel loginbox" onSubmit={step === "email" ? send : verify}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Simple Solution" style={{ width: 170, alignSelf: "center" }} />
        <h1 style={{ fontSize: 20, textAlign: "center" }}>כניסה ל-simple-CRM</h1>
        {step === "email" ? (
          <>
            <label className="field"><span>מייל</span>
              <input className="inp ltr" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
            </label>
            <button className="btn primary" disabled={busy}>{busy ? "שולח…" : "שליחת קישור כניסה"}</button>
          </>
        ) : (
          <>
            <p style={{ margin: 0, color: "var(--soft)" }}>נשלח מייל ל-{email}. לוחצים על הקישור במייל, או מקלידים כאן קוד אם הגיע.</p>
            <label className="field"><span>קוד מהמייל (לא חובה)</span>
              <input className="inp ltr" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} />
            </label>
            <button className="btn primary" disabled={busy || code.trim().length < 6}>כניסה עם קוד</button>
            <button type="button" className="btn ghost" onClick={() => setStep("email")}>שליחה מחדש</button>
          </>
        )}
        {err ? <p style={{ color: "var(--bad)", margin: 0 }}>{err}</p> : null}
      </form>
    </div>
  );
}
