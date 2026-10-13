"use client";
/* Settings · intake templates sent to clients: edit questions, sections, and the WhatsApp message. */
import { useState } from "react";
import { Panel } from "@/components/Shell";
import Icon from "@/components/Icon";
import { useApp } from "@/components/AppCtx";
import IntakeFields from "@/components/IntakeFields";
import { CLIENT_FORMS, clientForms, INTAKE_MSG_DEFAULT } from "@/lib/client-forms";
import type { Answers, FormField, IntakeForm } from "@/lib/intake-forms";

const TYPES: [FormField["t"], string][] = [
  ["t", "טקסט קצר"], ["a", "טקסט ארוך"], ["n", "מספר"], ["r", "בחירה אחת"], ["c", "כמה בחירות"], ["d", "דרישה: סימון בוצע"], ["f", "העלאת קבצים"], ["l", "שורות נפרדות"], ["p", "נכסים: קישור, משתמש וסיסמה"],
];
const SHORT: Record<string, string> = { c_campaign: "קמפיין", c_site: "אתר", c_lp: "דף נחיתה", c_social: "סושיאל", c_auto: "אוטומציות" };
const newId = () => "x" + Math.random().toString(36).slice(2, 8);
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export default function IntakeTemplates() {
  const { settings, saveSettings, toast } = useApp();
  const forms = clientForms(settings.intake_templates);
  const [kind, setKind] = useState(forms[0].kind);
  const [draft, setDraft] = useState<IntakeForm>(() => clone(forms[0]));
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState(false);
  const [pa, setPa] = useState<Answers>({});
  const [msg, setMsg] = useState<string>((settings.wa?.intake_text as string) || INTAKE_MSG_DEFAULT);
  const edited = !!settings.intake_templates?.[kind];

  const pick = (k: string) => {
    if (dirty && !confirm("יש שינויים שלא נשמרו. לעבור בלי לשמור?")) return;
    setKind(k); setDraft(clone(clientForms(settings.intake_templates).find((f) => f.kind === k)!)); setDirty(false); setPa({});
  };
  const upd = (fn: (d: IntakeForm) => void) => { setDraft((d) => { const n = clone(d); fn(n); return n; }); setDirty(true); };

  async function save() {
    const clean: IntakeForm = { ...draft, sections: draft.sections.filter((s) => s.title.trim() || s.fields.length).map((s) => ({ ...s, fields: s.fields.filter((f) => f.q.trim()) })) };
    if (await saveSettings({ intake_templates: { ...settings.intake_templates, [kind]: clean } })) { setDraft(clean); setDirty(false); toast("התבנית נשמרה"); }
  }
  async function reset() {
    if (!confirm("להחזיר את התבנית לגרסה המקורית? השינויים שעשית בה יימחקו.")) return;
    const next = { ...settings.intake_templates };
    delete next[kind];
    if (await saveSettings({ intake_templates: next })) { setDraft(clone(CLIENT_FORMS.find((f) => f.kind === kind)!)); setDirty(false); toast("הוחזר למקור"); }
  }

  return (
    <div className="col">
      <div className="tabs">{forms.map((f) => <button key={f.kind} className={"btn" + (kind === f.kind ? " on" : "")} onClick={() => pick(f.kind)}>{SHORT[f.kind] || f.title}</button>)}</div>

      <Panel icon="note" title={draft.title} right={<div className="bar">
        <button className="btn sm ghost" onClick={() => setPreview((p) => !p)}><Icon n="eye" s={15} />{preview ? "חזרה לעריכה" : "תצוגה כמו אצל הלקוח"}</button>
        {edited ? <button className="btn sm ghost" onClick={reset}><Icon n="reset" s={15} />החזרה למקור</button> : null}
        <button className="btn sm primary" disabled={!dirty} onClick={save}><Icon n="check" s={15} />שמירה</button>
      </div>}>
        <p className="tiny" style={{ marginTop: 0 }}>שינוי כאן חל על שאלונים שיישלחו מעכשיו. שאלון שכבר נשלח נשאר כמו שהיה.</p>
        {preview ? (
          <div className="col" style={{ maxWidth: 560 }}>
            <p style={{ margin: 0 }}>{draft.intro}</p>
            {draft.sections.map((s, i) => (
              <div key={i} className="itpl-prev"><h3>{s.title}</h3>
                <IntakeFields fields={s.fields} a={pa} set={(id, v) => setPa((x) => ({ ...x, [id]: v }))} name={"p" + i} upload={async () => []} /></div>
            ))}
          </div>
        ) : (
          <div className="col">
            <div className="form">
              <label className="field full"><span>כותרת</span><input className="inp" value={draft.title} onChange={(e) => upd((d) => { d.title = e.target.value; })} /></label>
              <label className="field full"><span>פתיח ללקוח</span><textarea className="inp" rows={2} value={draft.intro} onChange={(e) => upd((d) => { d.intro = e.target.value; })} /></label>
            </div>
            {draft.sections.map((s, si) => (
              <div key={si} className="itpl-sec">
                <div className="itpl-sh">
                  <span className="itpl-n">שלב {si + 1}</span>
                  <input className="inp sm" value={s.title} placeholder="שם השלב" onChange={(e) => upd((d) => { d.sections[si].title = e.target.value; })} />
                  <button className="btn icon sm ghost" title="שלב למעלה" disabled={!si} onClick={() => upd((d) => { const [x] = d.sections.splice(si, 1); d.sections.splice(si - 1, 0, x); })}><span aria-hidden>↑</span></button>
                  <button className="btn icon sm ghost" title="מחיקת השלב" onClick={() => { if (confirm("למחוק את השלב \"" + s.title + "\" וכל השאלות בו?")) upd((d) => { d.sections.splice(si, 1); }); }}><Icon n="trash" s={15} /></button>
                </div>
                {s.fields.map((f, fi) => (
                  <div key={f.id} className="itpl-f">
                    <div className="itpl-row">
                      <input className="inp sm" value={f.q} placeholder="השאלה" onChange={(e) => upd((d) => { d.sections[si].fields[fi].q = e.target.value; })} />
                      <select className="inp sm" value={f.t} aria-label="סוג תשובה" onChange={(e) => upd((d) => { const x = d.sections[si].fields[fi]; x.t = e.target.value as FormField["t"]; if ((x.t === "r" || x.t === "c") && !x.o?.length) x.o = ["כן", "לא"]; if (x.t === "p" && !x.o?.length) x.o = ["אינסטגרם", "פייסבוק", "טיקטוק"]; if (x.t === "l" && !x.n) x.n = 3; })}>
                        {TYPES.map(([t, l]) => <option key={t} value={t}>{l}</option>)}
                      </select>
                      <span className="bar" style={{ gap: 2, flexWrap: "nowrap" }}>
                        <button className="btn icon sm ghost" title="למעלה" disabled={!fi} onClick={() => upd((d) => { const fs = d.sections[si].fields; [fs[fi - 1], fs[fi]] = [fs[fi], fs[fi - 1]]; })}><span aria-hidden>↑</span></button>
                        <button className="btn icon sm ghost" title="מחיקה" onClick={() => upd((d) => { d.sections[si].fields.splice(fi, 1); })}><Icon n="x" s={14} /></button>
                      </span>
                    </div>
                    <input className="inp sm itpl-h" value={f.h || ""} placeholder="הסבר קטן מתחת לשאלה (לא חובה)" onChange={(e) => upd((d) => { const x = d.sections[si].fields[fi]; if (e.target.value) x.h = e.target.value; else delete x.h; })} />
                    {f.t === "l" ? (
                      <div className="itpl-row2">
                        <label className="tiny">כמה שורות בהתחלה <input className="inp sm" type="number" min={1} max={10} value={f.n || 3} onChange={(e) => upd((d) => { d.sections[si].fields[fi].n = Math.min(10, Math.max(1, Number(e.target.value) || 1)); })} /></label>
                        <label className="tiny">עמודות (לשאלה ותשובה: שאלה, תשובה) <input className="inp sm" value={(f.cols || []).join(", ")} placeholder="עמודה אחת"
                          onChange={(e) => upd((d) => { const c = e.target.value.split(",").map((x) => x.trimStart()); const x = d.sections[si].fields[fi]; if (c.filter(Boolean).length > 1) x.cols = c; else delete x.cols; })} /></label>
                      </div>
                    ) : null}
                    {f.show ? <span className="tiny">מופיעה רק כשבשאלה הקודמת בוחרים &quot;{f.show.v}&quot;</span> : null}
                    {f.t === "r" || f.t === "c" || f.t === "p" ? (
                      <input className="inp sm itpl-h" value={(f.o || []).join(", ")} placeholder={f.t === "p" ? "פלטפורמות, מופרדות בפסיק" : "אפשרויות, מופרדות בפסיק"}
                        onChange={(e) => upd((d) => { d.sections[si].fields[fi].o = e.target.value.split(",").map((x) => x.trimStart()); })}
                        onBlur={() => upd((d) => { const x = d.sections[si].fields[fi]; x.o = (x.o || []).map((o) => o.trim()).filter(Boolean); })} />
                    ) : null}
                  </div>
                ))}
                <button className="add" onClick={() => upd((d) => { d.sections[si].fields.push({ id: newId(), t: "a", q: "" }); })}><Icon n="plus" s={15} />שאלה</button>
              </div>
            ))}
            <button className="btn sm" style={{ alignSelf: "flex-start" }} onClick={() => upd((d) => { d.sections.push({ title: "שלב חדש", internal: false, fields: [{ id: newId(), t: "a", q: "" }] }); })}><Icon n="plus" s={15} />שלב חדש</button>
          </div>
        )}
      </Panel>

      <Panel icon="wa" title="ההודעה שנשלחת עם הקישור" right={<button className="btn sm primary" onClick={async () => { if (await saveSettings({ wa: { ...settings.wa, intake_text: msg } })) toast("נשמר"); }}>שמירה</button>}>
        <p className="tiny" style={{ marginTop: 0 }}>{"{שם}"} מתחלף בשם הפרטי של הלקוח, {"{קישור}"} בקישור לשאלון. כשהוואטסאפ האוטומטי מחובר ונבחרה תבנית לשאלון (בחיבורים וקשר), נשלחת התבנית המאושרת במקום הטקסט הזה.</p>
        <textarea className="inp" rows={3} value={msg} onChange={(e) => setMsg(e.target.value)} />
      </Panel>
    </div>
  );
}
