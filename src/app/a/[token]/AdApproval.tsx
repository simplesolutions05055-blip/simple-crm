"use client";
import { useState } from "react";

type D = { status: string; reason: string; campaign: string; copy: Record<string, string>; feed: string; story: string; expired: boolean };
const DONE: Record<string, string> = { approved: "אושרה", live: "באוויר", rejected: "נדחתה", change: "התבקש שינוי", failed: "לא עלתה", generating: "בהכנה" };

export default function AdApproval({ t, d }: { t: string; d: D }) {
  const [state, setState] = useState<string>(d.status === "pending" && !d.expired ? "" : d.expired && d.status === "pending" ? "פג תוקף הקישור" : "ההצעה כבר טופלה: " + (DONE[d.status] || d.status));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [asking, setAsking] = useState(false);
  async function send(decision: string) {
    if (decision === "change" && !note.trim()) return setAsking(true);
    setBusy(true);
    const r = await fetch("/api/ads/approve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t, decision, note: note.trim() }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r || !r.ok) return setState("לא נשמר: " + (j.error || "נסה שוב"));
    setState(decision === "approved" ? (j.live ? "אושר. המודעה עלתה לאוויר" : j.note || "אושר") : decision === "change" ? j.note || "קיבלנו את בקשת השינוי" : "המודעה נדחתה. שום דבר לא השתנה בקמפיין");
  }
  const c = d.copy;
  return (
    <div className="ipub" dir="rtl">
      <div className="icard" style={{ maxWidth: 560, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>מודעה חדשה לאישור</h1>
        <p style={{ margin: "0 0 12px", color: "#5a6380" }}>קמפיין: <b>{d.campaign}</b></p>
        <p style={{ background: "#fff7e6", borderRadius: 8, padding: 10, margin: "0 0 14px" }}><b>למה: </b>{d.reason}</p>
        {d.feed ? <img src={d.feed} alt="" style={{ width: "100%", borderRadius: 10, display: "block" }} /> : null}
        <p style={{ whiteSpace: "pre-wrap", margin: "12px 0 4px" }} dir="auto">{c.meta_body}</p>
        <p style={{ fontWeight: 700, margin: "0 0 2px" }} dir="auto">{c.meta_headline}</p>
        {c.meta_description ? <p style={{ margin: 0, color: "#5a6380" }} dir="auto">{c.meta_description}</p> : null}
        {d.story ? <details style={{ marginTop: 12 }}><summary>הגרסה לסטורי ורילס</summary><img src={d.story} alt="" style={{ width: "60%", borderRadius: 10, display: "block", margin: "8px auto 0" }} /></details> : null}
        {state ? <p style={{ marginTop: 16, fontWeight: 700 }}>{state}</p> : (
          <div style={{ marginTop: 16 }}>
            {asking ? <textarea className="inp" rows={3} style={{ width: "100%", marginBottom: 8 }} placeholder="מה לשנות? לדוגמה: כותרת יותר ישירה, בלי המילה מבצע" value={note} onChange={(e) => setNote(e.target.value)} /> : null}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn primary" disabled={busy} onClick={() => send("approved")}>אישור והעלאה</button>
              <button className="btn" disabled={busy} onClick={() => send("change")}>{asking ? "שליחת בקשת השינוי" : "בקשת שינוי"}</button>
              <button className="btn ghost" disabled={busy} onClick={() => confirm("לדחות את המודעה?") && send("rejected")}>דחייה</button>
            </div>
            <p style={{ fontSize: 13, color: "#5a6380", marginTop: 10 }}>המודעה עולה רק אחרי אישור. אם היא מחליפה מודעה קיימת, הקודמת נעצרת רק אחרי שהחדשה עלתה.</p>
          </div>
        )}
      </div>
    </div>
  );
}
