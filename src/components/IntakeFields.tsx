"use client";
/* One section of an intake form: shared by the internal editor and the client's public form.
   ro: read only (a sent form, or the office before pressing "עריכה"). */
import { useState } from "react";
import { shown, type Accounts, type Answers, type AnswerValue, type FormField, type UploadedFile } from "@/lib/intake-forms";

type Up = (files: File[]) => Promise<UploadedFile[]>;
export type SecretApi = {
  save: (key: string, label: string, url: string, user: string, value: string) => Promise<boolean>;
  reveal?: (key: string) => Promise<string | null>;
};
type Common = { name: string; upload?: Up; onOpenFile?: (f: UploadedFile) => void; secret?: SecretApi; ro?: boolean };

export default function IntakeFields({ fields, a, set, ...rest }: Common & { fields: FormField[]; a: Answers; set: (id: string, v: AnswerValue) => void }) {
  return (
    <div className={"ifields" + (rest.ro ? " ro" : "")}>
      {fields.filter((f) => shown(f, a)).map((f) => <Field key={f.id} f={f} v={a[f.id]} set={(v) => set(f.id, v)} {...rest} />)}
    </div>
  );
}

function Label({ f }: { f: FormField }) {
  return <span className="iq">{f.q}{f.h ? <small>{f.h}</small> : null}</span>;
}

function Field({ f, v, set, name, upload, onOpenFile, secret, ro }: Common & { f: FormField; v: AnswerValue | undefined; set: (v: AnswerValue) => void }) {
  const [busy, setBusy] = useState(false);
  const cls = "ifield" + (f.show ? " isub" : "");
  if (f.t === "r" || f.t === "c") {
    const sel = (Array.isArray(v) ? v : v ? [v] : []) as string[];
    if (ro && !sel.length) return <div className={cls}><Label f={f} /><span className="iempty">לא מולא</span></div>;
    return (
      <div className={cls}><Label f={f} />
        <div className="pills">{(f.o || []).map((o) => {
          const on = sel.includes(o);
          return (
            <label key={o} className={"pillck" + (on ? " on" : "")}>
              <input type={f.t === "r" ? "radio" : "checkbox"} name={name + f.id} checked={on} disabled={ro}
                onChange={() => set(f.t === "r" ? o : on ? sel.filter((x) => x !== o) : [...sel, o])} />{o}
            </label>
          );
        })}</div>
      </div>
    );
  }
  if (f.t === "d") {
    const on = !!v;
    return (
      <label className={cls + " idone" + (on ? " on" : "")}>
        <input type="checkbox" checked={on} disabled={ro} onChange={(e) => set(e.target.checked ? "בוצע" : "")} />
        <Label f={f} /><span className="itag">{on ? "בוצע" : "לסמן כשבוצע"}</span>
      </label>
    );
  }
  if (f.t === "l") return <ListField f={f} v={v} set={set} ro={ro} cls={cls} />;
  if (f.t === "p") return <AccountsField f={f} v={v} set={set} secret={secret} ro={ro} cls={cls} />;
  if (f.t === "f") {
    const list = (Array.isArray(v) ? v : []).filter((x): x is UploadedFile => !!x && typeof x === "object" && !Array.isArray(x));
    return (
      <div className={cls}><Label f={f} />
        {list.length ? <div className="ifiles">{list.map((x, i) => (
          <span key={x.path + i} className="ifile">
            {onOpenFile ? <button type="button" className="iopen" onClick={() => onOpenFile(x)}>{x.name}</button> : <span>{x.name}</span>}
            {!ro ? <button type="button" aria-label="הסרה" onClick={() => set(list.filter((_, n) => n !== i))}>×</button> : null}
          </span>
        ))}</div> : null}
        {upload && !ro ? (
          <label className={"iupload" + (busy ? " busy" : "")}>
            <input type="file" multiple hidden disabled={busy} onChange={async (e) => {
              const files = Array.from(e.target.files || []);
              e.target.value = "";
              if (!files.length) return;
              setBusy(true);
              const up = await upload(files);
              setBusy(false);
              if (up.length) set([...list, ...up]);
            }} />
            {busy ? "מעלה…" : "+ העלאת קבצים"}
          </label>
        ) : !list.length ? <span className="iempty">לא הועלו קבצים</span> : null}
      </div>
    );
  }
  if (ro && !String(v || "").trim()) return <div className={cls}><Label f={f} /><span className="iempty">לא מולא</span></div>;
  return (
    <label className={cls}><Label f={f} />
      {f.t === "a"
        ? <textarea className="inp" rows={3} readOnly={ro} value={(v as string) || ""} onChange={(e) => set(e.target.value)} />
        : <input className="inp" type={f.t === "n" ? "number" : "text"} inputMode={f.t === "n" ? "decimal" : undefined} dir="auto" readOnly={ro} value={(v as string) || ""} onChange={(e) => set(e.target.value)} />}
    </label>
  );
}

/* separate rows, with "add a row". One column: string[]. Several: string[][]. */
function ListField({ f, v, set, ro, cls }: { f: FormField; v: AnswerValue | undefined; set: (v: AnswerValue) => void; ro?: boolean; cls: string }) {
  const cols = f.cols && f.cols.length > 1 ? f.cols : null;
  const min = Math.max(1, f.n || 3);
  const raw = (Array.isArray(v) ? v : typeof v === "string" && v ? [v] : []) as unknown[];
  const rows: string[][] = raw.map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? "")) : [String(r ?? "")]));
  const shownRows = ro ? rows.filter((r) => r.some((c) => c.trim())) : [...rows, ...Array.from({ length: Math.max(0, min - rows.length) }, () => [] as string[])];
  const put = (i: number, c: number, val: string) => {
    const next = shownRows.map((r) => [...r]);
    next[i][c] = val;
    set(cols ? next.map((r) => cols.map((_, k) => r[k] || "")) : next.map((r) => r[0] || ""));
  };
  const add = () => {
    const next = shownRows.map((r) => [...r]);
    next.push([]);
    set(cols ? next.map((r) => cols.map((_, k) => r[k] || "")) : next.map((r) => r[0] || ""));
  };
  const del = (i: number) => {
    const next = shownRows.filter((_, k) => k !== i);
    set(cols ? next.map((r) => cols.map((_, k) => r[k] || "")) : next.map((r) => r[0] || ""));
  };
  const word = cols ? (cols[0] === "שאלה" ? "שאלה" : cols[0]) : "שורה";
  return (
    <div className={cls}><Label f={f} />
      {ro && !shownRows.length ? <span className="iempty">לא מולא</span> : null}
      <div className="ilist">
        {shownRows.map((r, i) => cols ? (
          <div key={i} className="ipair">
            <span className="inum">{i + 1}</span>
            <div className="ipair-in">
              {cols.map((c, k) => k === 0
                ? <input key={k} className="inp" placeholder={c} dir="auto" readOnly={ro} value={r[k] || ""} onChange={(e) => put(i, k, e.target.value)} />
                : <textarea key={k} className="inp" rows={2} placeholder={c} dir="auto" readOnly={ro} value={r[k] || ""} onChange={(e) => put(i, k, e.target.value)} />)}
            </div>
            {!ro && shownRows.length > min ? <button type="button" className="idel" aria-label="מחיקת השורה" onClick={() => del(i)}>×</button> : null}
          </div>
        ) : (
          <div key={i} className="irow">
            <span className="inum">{i + 1}</span>
            <input className="inp" dir="auto" readOnly={ro} value={r[0] || ""} onChange={(e) => put(i, 0, e.target.value)} />
            {!ro && shownRows.length > min ? <button type="button" className="idel" aria-label="מחיקת השורה" onClick={() => del(i)}>×</button> : null}
          </div>
        ))}
      </div>
      {!ro ? <button type="button" className="iaddrow" onClick={add}>+ הוספת {word}</button> : null}
    </div>
  );
}

/* per platform: link, user name, password. The password is sent to the vault on leaving the field. */
function AccountsField({ f, v, set, secret, ro, cls }: { f: FormField; v: AnswerValue | undefined; set: (v: AnswerValue) => void; secret?: SecretApi; ro?: boolean; cls: string }) {
  const acc = (v && typeof v === "object" && !Array.isArray(v) ? v : {}) as Accounts;
  const [pw, setPw] = useState<Record<string, string>>({});
  const [st, setSt] = useState<Record<string, "" | "saving" | "error">>({});
  const [shownPw, setShownPw] = useState<Record<string, string>>({});
  const put = (p: string, patch: Accounts[string]) => set({ ...acc, [p]: { ...(acc[p] || {}), ...patch } });
  async function savePw(p: string) {
    const val = pw[p];
    if (!val || !secret) return;
    setSt((s) => ({ ...s, [p]: "saving" }));
    const ok = await secret.save(f.id + ":" + p, p, acc[p]?.url || "", acc[p]?.user || "", val);
    setSt((s) => ({ ...s, [p]: ok ? "" : "error" }));
    if (ok) { setPw((x) => ({ ...x, [p]: "" })); put(p, { pw: true }); }
  }
  const plats = f.o || [];
  const has = (p: string) => !!(acc[p] && (acc[p].url || acc[p].user || acc[p].pw));
  const [opened, setOpened] = useState<string[]>([]);
  const list = plats.filter((p) => has(p) || (!ro && opened.includes(p)));
  const rest = ro ? [] : plats.filter((p) => !list.includes(p));
  return (
    <div className={cls}><Label f={f} />
      {ro && !list.length ? <span className="iempty">לא מולא</span> : null}
      {rest.length ? <div className="pills">{rest.map((p) => (
        <button key={p} type="button" className="pillck iplat" onClick={() => setOpened((o) => [...o, p])}>+ {p}</button>
      ))}</div> : null}
      <div className="iaccs">
        {list.map((p) => {
          const x = acc[p] || {};
          return (
            <div key={p} className="iacc">
              <b>{p}</b>
              <input className="inp" type="url" inputMode="url" dir="ltr" placeholder={p === "אתר" ? "כתובת האתר" : "קישור לעמוד"} readOnly={ro} value={x.url || ""} onChange={(e) => put(p, { url: e.target.value })} />
              <div className="iacc-row">
                <input className="inp" dir="ltr" autoComplete="off" placeholder="שם משתמש" readOnly={ro} value={x.user || ""} onChange={(e) => put(p, { user: e.target.value })} />
                {ro ? (
                  <div className="ipw-ro">
                    {x.pw ? <>
                      <span dir="ltr">{shownPw[p] ?? "••••••"}</span>
                      {secret?.reveal && shownPw[p] === undefined ? <button type="button" className="iopen" onClick={async () => {
                        const val = await secret.reveal!(f.id + ":" + p);
                        setShownPw((s) => ({ ...s, [p]: val ?? "לא נמצאה" }));
                      }}>הצגה</button> : null}
                    </> : <span className="tiny">אין סיסמה</span>}
                  </div>
                ) : (
                  <input className="inp" type="password" dir="ltr" autoComplete="new-password" disabled={!secret}
                    placeholder={x.pw ? "סיסמה נשמרה. להחלפה כותבים חדשה" : "סיסמה"} value={pw[p] || ""}
                    onChange={(e) => setPw((s) => ({ ...s, [p]: e.target.value }))} onBlur={() => savePw(p)} />
                )}
              </div>
              {!ro ? <span className={"ipw-st" + (st[p] === "error" ? " bad" : "")}>
                {st[p] === "saving" ? "שומר את הסיסמה…" : st[p] === "error" ? "הסיסמה לא נשמרה. נסו שוב." : x.pw ? "✓ הסיסמה נשמרה מוצפנת" : ""}
              </span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
