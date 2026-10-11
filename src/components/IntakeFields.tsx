"use client";
/* One section of an intake form: shared by the internal editor and the client's public form. */
import { useState } from "react";
import type { Answers, FormField, UploadedFile } from "@/lib/intake-forms";

type Up = (files: File[]) => Promise<UploadedFile[]>;

export default function IntakeFields({ fields, a, set, name, upload, onOpenFile }: {
  fields: FormField[]; a: Answers; set: (id: string, v: Answers[string]) => void; name: string;
  upload?: Up; onOpenFile?: (f: UploadedFile) => void;
}) {
  return (
    <div className="ifields">
      {fields.map((f) => <Field key={f.id} f={f} v={a[f.id]} set={(v) => set(f.id, v)} name={name} upload={upload} onOpenFile={onOpenFile} />)}
    </div>
  );
}

function Field({ f, v, set, name, upload, onOpenFile }: { f: FormField; v: Answers[string] | undefined; set: (v: Answers[string]) => void; name: string; upload?: Up; onOpenFile?: (f: UploadedFile) => void }) {
  const [busy, setBusy] = useState(false);
  const label = <span className="iq">{f.q}{f.h ? <small>{f.h}</small> : null}</span>;
  if (f.t === "r" || f.t === "c") {
    const sel = (Array.isArray(v) ? v : v ? [v] : []) as string[];
    return (
      <div className="ifield">{label}
        <div className="pills">{(f.o || []).map((o) => {
          const on = sel.includes(o);
          return (
            <label key={o} className={"pillck" + (on ? " on" : "")}>
              <input type={f.t === "r" ? "radio" : "checkbox"} name={name + f.id} checked={on}
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
      <label className={"ifield idone" + (on ? " on" : "")}>
        <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked ? "בוצע" : "")} />
        {label}<span className="itag">{on ? "בוצע" : "לסמן כשבוצע"}</span>
      </label>
    );
  }
  if (f.t === "f") {
    const list = (Array.isArray(v) ? v : []).filter((x): x is UploadedFile => typeof x === "object");
    return (
      <div className="ifield">{label}
        {list.length ? <div className="ifiles">{list.map((x, i) => (
          <span key={x.path + i} className="ifile">
            {onOpenFile ? <button type="button" onClick={() => onOpenFile(x)}>{x.name}</button> : <span>{x.name}</span>}
            <button type="button" aria-label="הסרה" onClick={() => set(list.filter((_, n) => n !== i))}>×</button>
          </span>
        ))}</div> : null}
        {upload ? (
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
        ) : !list.length ? <span className="tiny">לא הועלו קבצים</span> : null}
      </div>
    );
  }
  return (
    <label className="ifield">{label}
      {f.t === "a"
        ? <textarea className="inp" rows={3} value={(v as string) || ""} onChange={(e) => set(e.target.value)} />
        : <input className="inp" type={f.t === "n" ? "number" : "text"} inputMode={f.t === "n" ? "decimal" : undefined} value={(v as string) || ""} onChange={(e) => set(e.target.value)} />}
    </label>
  );
}
