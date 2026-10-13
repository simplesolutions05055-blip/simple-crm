"use client";
/* The client's intake form: one topic per step, saved while typing, files uploaded inside the form. */
import { useEffect, useRef, useState } from "react";
import { sb } from "@/lib/supabase/browser";
import IntakeFields, { type SecretApi } from "@/components/IntakeFields";
import { filledCount, type Answers, type AnswerValue, type IntakeForm, type UploadedFile } from "@/lib/intake-forms";

type Data = { title: string; org: string; form: IntakeForm; answers: Answers; submitted_at: string | null; name: string; biz: string };
const MAX_FILE = 25 * 1024 * 1024;

export default function PublicIntake({ token, data }: { token: string; data: Data }) {
  const form: IntakeForm = { ...data.form, sections: data.form.sections.filter((s) => !s.internal) };
  const steps = form.sections;
  const [a, setA] = useState<Answers>(data.answers || {});
  const [step, setStep] = useState(0);
  const [saved, setSaved] = useState<"" | "saving" | "saved" | "error">("");
  const [done, setDone] = useState(!!data.submitted_at);
  const [justSent, setJustSent] = useState(false);
  const [sentAt, setSentAt] = useState<string | null>(data.submitted_at);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(a);
  const topRef = useRef<HTMLDivElement>(null);
  const mins = Math.max(3, Math.round(steps.reduce((n, s) => n + s.fields.length, 0) * 0.5));

  async function persist(next: Answers, submit = false) {
    const { n, all } = filledCount(form, next);
    setSaved("saving");
    const { data: r, error } = await sb().rpc("crm_save_intake", { p_token: token, p_answers: next, p_filled: n, p_total: all, p_submit: submit });
    if (error) { setSaved("error"); return false; }
    if (r?.submitted && !submit) { setDone(true); return false; }
    setSaved("saved");
    return true;
  }
  const secret: SecretApi = {
    save: async (key, label, url, user, value) => {
      const { error } = await sb().rpc("crm_intake_secret", { p_token: token, p_key: key, p_label: label, p_url: url, p_user: user, p_value: value });
      return !error;
    },
  };
  function set(id: string, v: AnswerValue) {
    const next = { ...latest.current, [id]: v };
    latest.current = next;
    setA(next);
    setSaved("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => persist(latest.current), 800);
  }
  async function flush() {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; return persist(latest.current); }
    return true;
  }
  useEffect(() => {
    const away = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; persist(latest.current); } };
    window.addEventListener("pagehide", away);
    return () => window.removeEventListener("pagehide", away);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function upload(files: File[]): Promise<UploadedFile[]> {
    const out: UploadedFile[] = [];
    const big = files.filter((f) => f.size > MAX_FILE);
    if (big.length) setErr("קבצים גדולים מ-25MB לא הועלו: " + big.map((f) => f.name).join(", "));
    for (const f of files.filter((x) => x.size <= MAX_FILE)) {
      const ext = (f.name.match(/\.([a-z0-9]{1,8})$/i)?.[1] || "bin").toLowerCase();
      const path = data.org + "/intake/" + token + "/" + crypto.randomUUID() + "." + ext;
      const { error } = await sb().storage.from("crm-docs").upload(path, f, { contentType: f.type || undefined, upsert: false });
      if (error) { setErr("הקובץ " + f.name + " לא הועלה. נסו שוב."); continue; }
      out.push({ name: f.name, path, size: f.size });
    }
    return out;
  }

  const go = async (to: number) => {
    await flush();
    setStep(to);
    setErr("");
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  async function submit() {
    setSending(true);
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const ok = await persist(latest.current, true);
    setSending(false);
    if (ok) { setDone(true); setJustSent(true); setSentAt(new Date().toISOString()); window.scrollTo({ top: 0, behavior: "smooth" }); }
    else setErr("השליחה לא הצליחה. בדקו את החיבור ונסו שוב.");
  }

  const { n, all } = filledCount(form, a);
  const s = steps[step];
  const last = step === steps.length - 1;

  if (done) return (
    <div className="ipub">
      {justSent ? (
        <div className="icard ithanks">
          <div className="icheck" aria-hidden>✓</div>
          <h1>תודה{data.name ? " " + data.name : ""}, השאלון התקבל</h1>
          <p>התשובות הגיעו אלינו. נעבור עליהן ונחזור אליכם.</p>
          <small>{data.biz}</small>
        </div>
      ) : (
        <header className="ihead">
          <small>{data.biz}</small>
          <h1>{form.title}</h1>
          {sentAt ? <p>נשלח ב-{new Date(sentAt).toLocaleDateString("he-IL")}</p> : null}
        </header>
      )}
      <div className="ilock">השאלון נשלח וננעל. אפשר לראות את התשובות, לא לשנות אותן.</div>
      {steps.map((x, i) => (
        <section key={x.title + i} className="icard">
          <h2>{x.title}</h2>
          <IntakeFields fields={x.fields} a={a} set={() => {}} name={"r" + i} ro />
        </section>
      ))}
    </div>
  );

  return (
    <div className="ipub" ref={topRef}>
      <header className="ihead">
        <small>{data.biz} · כ-{mins} דקות</small>
        <h1>{form.title}</h1>
        {step === 0 ? <p>{data.name ? "היי " + data.name + ", " : ""}{form.intro}</p> : null}
        <div className="iprog" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={step + 1}>
          {steps.map((x, i) => <span key={x.title} className={i < step ? "on" : i === step ? "cur" : ""} />)}
        </div>
        <div className="istep"><span>שלב {step + 1} מתוך {steps.length} · {s.title}</span>
          <span className={"isave " + saved}>{saved === "saving" ? "שומר…" : saved === "saved" ? "נשמר" : saved === "error" ? "לא נשמר, בדקו חיבור" : ""}</span></div>
      </header>

      <main className="icard">
        <h2>{s.title}</h2>
        <IntakeFields fields={s.fields} a={a} set={set} name={"s" + step} upload={upload} secret={secret} />
        {err ? <p className="ierr">{err}</p> : null}
      </main>

      <nav className="inav">
        {step > 0 ? <button type="button" className="ib ghost" onClick={() => go(step - 1)}>הקודם</button> : <span />}
        {last
          ? <button type="button" className="ib main" disabled={sending} onClick={submit}>{sending ? "שולח…" : "שליחה"}</button>
          : <button type="button" className="ib main" onClick={() => go(step + 1)}>הבא</button>}
      </nav>
      <p className="ifoot">מולאו {n} מתוך {all}. התשובות נשמרות תוך כדי. אפשר לסגור ולחזור לאותו קישור בכל שלב.</p>
    </div>
  );
}
