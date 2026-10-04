"use client";
/* Excel import / export modal for leads and clients */
import { useMemo, useRef, useState } from "react";
import { sb } from "@/lib/supabase/browser";
import { Modal, St } from "./Shell";
import Icon from "./Icon";
import { useApp } from "./AppCtx";
import { today, type Row } from "@/lib/crm";
import {
  FIELDS, NAMES, IGNORE, CUSTOM, autoMap, parseRows, planImport, payload, parseCsv, decodeText,
  exportValue, customLabels, customValue, cellValue, type Kind, type Field, type Plan,
} from "@/lib/excel";

type Sheet = { file: string; headers: string[]; rows: unknown[][] };
const HEAD = "FF2D1B69", HEAD_RO = "FF8A8FA3";

async function excel() { return (await import("exceljs")).default; }

async function loadAll(kind: Kind, withArchived: boolean) {
  let q = kind === "leads"
    ? sb().from("crm_leads").select("*")
    : sb().from("crm_clients").select("*,services:crm_client_services(price,billing,status),payments:crm_payments(amount,paid_at)");
  if (!withArchived) q = q.is("archived_at", null);
  const all: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q.order("created_at", { ascending: false }).range(from, from + 999);
    if (error) throw error;
    all.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  if (kind === "clients") all.forEach((c) => {
    c.monthly = (c.services || []).filter((s: Row) => s.billing === "חודשי" && s.status === "פעיל").reduce((a: number, s: Row) => a + Number(s.price), 0);
    c.open = (c.payments || []).filter((p: Row) => !p.paid_at).reduce((a: number, p: Row) => a + Number(p.amount), 0);
  });
  return all;
}

async function download(kind: Kind, rows: Row[] | null) {
  const ExcelJS = await excel();
  const N = NAMES[kind];
  const wb = new ExcelJS.Workbook();
  wb.creator = "Simple CRM";
  const ws = wb.addWorksheet(N.sheet, { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
  const template = !rows;
  const fields: Field[] = FIELDS[kind].filter((f) => !template || (!f.ro && f.key !== "id"));
  const extra = rows ? customLabels(kind, rows) : [];
  ws.columns = [
    ...fields.map((f) => ({ header: f.label, key: f.key, width: f.width || 16 })),
    ...extra.map((l, i) => ({ header: l, key: "__c" + i, width: 18 })),
  ];
  (rows || []).forEach((r) => {
    const o: Row = {};
    fields.forEach((f) => { o[f.key] = exportValue(kind, f, r); });
    extra.forEach((l, i) => { o["__c" + i] = customValue(kind, r, l); });
    ws.addRow(o);
  });
  const head = ws.getRow(1);
  head.height = 22;
  head.eachCell((cell, c) => {
    const f = fields[c - 1];
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: f?.ro ? HEAD_RO : HEAD } };
    cell.alignment = { vertical: "middle", horizontal: "right" };
    if (f?.ro) cell.note = "לקריאה בלבד. בייבוא העמודה הזו לא משנה כלום.";
    if (f?.key === "id") cell.note = "אל תשנו. לפי המזהה הייבוא מעדכן את הרשומה הקיימת.";
    if (f?.required) cell.note = "חובה לרשומה חדשה";
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };
  const last = Math.max((rows?.length || 0) + 300, 500);
  fields.forEach((f, i) => {
    const col = ws.getColumn(i + 1);
    if (f.kind === "date") col.numFmt = "dd/mm/yyyy";
    if (f.kind === "datetime") col.numFmt = "dd/mm/yyyy hh:mm";
    if (f.kind === "money") col.numFmt = '#,##0 "₪"';
    if (f.key === "phone") col.numFmt = "@";
    const list = f.kind === "bool" ? ["כן", "לא"] : f.kind === "enum" ? [...(f.options || [])] : null;
    if (!list || f.ro) return;
    for (let r = 2; r <= last; r++) {
      ws.getCell(r, i + 1).dataValidation = {
        type: "list", allowBlank: true, formulae: ['"' + list.join(",") + '"'],
        showErrorMessage: !!(f.strict || f.kind === "bool"), errorStyle: f.strict || f.kind === "bool" ? "stop" : "warning",
        errorTitle: f.label, error: "בחרו ערך מהרשימה",
      };
    }
  });
  const help = wb.addWorksheet("הסבר", { views: [{ rightToLeft: true }] });
  help.getColumn(1).width = 110;
  [
    "איך משתמשים בקובץ",
    "",
    "• כל שורה היא " + N.one + ". השורה הראשונה היא הכותרות, לא משנים אותן.",
    "• עמודות עם כותרת אפורה הן לקריאה בלבד. בייבוא הן לא משנות כלום.",
    "• \"מזהה מערכת\": אם הוא מלא, הייבוא מעדכן את ה" + N.one + " הזה. אם ריק, מחפשים לפי טלפון, ואם אין התאמה נוצר " + N.one + " חדש.",
    "• בעדכון משתנים רק התאים המלאים. תא ריק לא מוחק מידע קיים.",
    "• אפשר להוסיף עמודות משלכם. כל עמודה שהמערכת לא מכירה נשמרת כשדה נוסף בכרטיס, עם הכותרת שלה כשם השדה.",
    "• תאריכים בפורמט 31/12/2026. כן/לא בעמודות ההתאמה וההסכמה לדיוור.",
    "• אפשר לייבא גם קובץ CSV.",
  ].forEach((t, i) => { const c = help.getCell(i + 1, 1); c.value = t; if (i === 0) c.font = { bold: true, size: 14 }; c.alignment = { horizontal: "right", wrapText: true }; });
  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  a.download = template ? `${N.many} - קובץ לייבוא.xlsx` : `${N.many} ${today()}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

async function readFile(f: File): Promise<Sheet> {
  const name = f.name.toLowerCase();
  const buf = await f.arrayBuffer();
  let grid: unknown[][];
  if (name.endsWith(".csv") || name.endsWith(".txt")) grid = parseCsv(decodeText(buf));
  else if (name.endsWith(".xlsx") || name.endsWith(".xlsm")) {
    const ExcelJS = await excel();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.worksheets.find((w) => w.state === "visible" && w.actualRowCount > 0) || wb.worksheets[0];
    if (!ws) throw new Error("הקובץ ריק");
    grid = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals = row.values as unknown[];
      grid.push(vals.slice(1).map(cellValue));
    });
  } else if (name.endsWith(".xls")) throw new Error("קובץ XLS ישן לא נתמך. באקסל: קובץ ← שמירה בשם ← בוחרים Excel Workbook (.xlsx) ומעלים שוב.");
  else throw new Error("אפשר להעלות קובץ אקסל (xlsx) או CSV");
  // header row = first row with at least 2 filled cells
  const hi = grid.findIndex((r) => r.filter((c) => c != null && String(c).trim() !== "").length >= 2);
  if (hi < 0) throw new Error("לא נמצאה שורת כותרות בקובץ");
  const width = Math.max(...grid.map((r) => r.length));
  const headers = Array.from({ length: width }, (_, i) => String(grid[hi][i] ?? "").trim());
  return { file: f.name, headers, rows: grid.slice(hi + 1) };
}

export default function ExcelIO({ kind, onDone }: { kind: Kind; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}><Icon n="sheet" s={16} />אקסל</button>
      {open ? <ExcelModal kind={kind} onClose={(changed) => { setOpen(false); if (changed) onDone(); }} /> : null}
    </>
  );
}

function ExcelModal({ kind, onClose }: { kind: Kind; onClose: (changed: boolean) => void }) {
  const { org, toast, settings } = useApp();
  const N = NAMES[kind];
  const [withArch, setWithArch] = useState(false);
  const [busy, setBusy] = useState("");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [map, setMap] = useState<string[]>([]);
  const [existing, setExisting] = useState<Row[]>([]);
  const [onMatch, setOnMatch] = useState<"update" | "skip">("update");
  const [result, setResult] = useState<{ added: number; updated: number; skipped: number; failed: { line: number; why: string }[] } | null>(null);
  const [drag, setDrag] = useState(false);
  const inp = useRef<HTMLInputElement>(null);

  async function doExport(template: boolean) {
    setBusy(template ? "template" : "export");
    try { await download(kind, template ? null : await loadAll(kind, withArch)); }
    catch (e) { toast("ההורדה נכשלה: " + (e as Error).message, true); }
    setBusy("");
  }
  async function pick(f: File | undefined) {
    if (!f) return;
    setBusy("read");
    try {
      const s = await readFile(f);
      if (!s.rows.length) throw new Error("אין שורות מתחת לכותרות");
      const { data, error } = await sb().from(N.table).select(kind === "leads" ? "id,name,phone,fit,links,custom,marketing_consent,archived_at" : "id,biz,phone,info,custom,archived_at");
      if (error) throw error;
      setExisting((data || []) as Row[]);
      setSheet(s);
      setMap(autoMap(kind, s.headers));
    } catch (e) { toast((e as Error).message, true); }
    setBusy("");
  }

  const parsed = useMemo(() => (sheet ? parseRows(kind, sheet.headers, sheet.rows, map) : []), [kind, sheet, map]);
  const plan = useMemo(() => planImport(kind, parsed, existing, onMatch), [kind, parsed, existing, onMatch]);
  const count = (a: Plan["action"]) => plan.filter((p) => p.action === a).length;
  const req = FIELDS[kind].find((f) => f.required)!;
  const missingReq = !map.includes(req.key);

  async function run() {
    setBusy("import");
    const failed: { line: number; why: string }[] = plan.filter((p) => p.action === "error").map((p) => ({ line: p.p.line, why: p.why || "" }));
    let added = 0, updated = 0;
    const acts: Row[] = [];
    const idCol = kind === "leads" ? "lead_id" : "client_id";
    // new rows, in batches; a failed batch is retried row by row to find the culprit
    const news = plan.filter((p) => p.action === "new");
    const newIds: { id: string; status?: string }[] = [];
    for (let i = 0; i < news.length; i += 200) {
      const chunk = news.slice(i, i + 200);
      const { data, error } = await sb().from(N.table).insert(chunk.map((p) => payload(kind, p, org))).select("id,status:" + (kind === "leads" ? "stage" : "status"));
      if (!error) { (data as unknown as Row[]).forEach((d) => newIds.push({ id: d.id, status: d.status })); added += chunk.length; continue; }
      for (const p of chunk) {
        const r = await sb().from(N.table).insert(payload(kind, p, org)).select("id,status:" + (kind === "leads" ? "stage" : "status")).single();
        if (r.error) failed.push({ line: p.p.line, why: friendly(r.error.message) });
        else { newIds.push({ id: (r.data as unknown as Row).id, status: (r.data as unknown as Row).status }); added++; }
      }
    }
    newIds.forEach((n) => acts.push({ org_id: org, [idCol]: n.id, type: "מערכת", text: "נוצר מייבוא אקסל", by: "מערכת" }));
    for (const p of plan.filter((p) => p.action === "update")) {
      const body = payload(kind, p, org);
      if (!Object.keys(body).length) continue;
      const { error } = await sb().from(N.table).update(body).eq("id", p.target!.id);
      if (error) failed.push({ line: p.p.line, why: friendly(error.message) });
      else { updated++; acts.push({ org_id: org, [idCol]: p.target!.id, type: "מערכת", text: "עודכן מייבוא אקסל", by: "מערכת" }); }
    }
    for (let i = 0; i < acts.length; i += 500) await sb().from("crm_activities").insert(acts.slice(i, i + 500));
    if (kind === "clients") {
      const onb = newIds.filter((n) => n.status === "בקליטה").flatMap((n) => settings.onboarding.map((t, i) => ({ org_id: org, client_id: n.id, title: t, sort: i + 1 })));
      for (let i = 0; i < onb.length; i += 500) await sb().from("crm_onboarding_items").insert(onb.slice(i, i + 500));
    }
    setResult({ added, updated, skipped: count("skip"), failed: failed.sort((a, b) => a.line - b.line) });
    setBusy("");
  }

  const options = FIELDS[kind].filter((f) => !f.ro);
  const used = new Set(map);

  return (
    <Modal title={result ? "הייבוא הסתיים" : sheet ? "ייבוא " + N.many + " מקובץ" : "אקסל: " + N.many} icon="sheet" onClose={() => onClose(!!result)} wide>
      {result ? (
        <div className="xl">
          <div className="xl-sum">
            <div><b>{result.added}</b><span>נוספו</span></div>
            <div><b>{result.updated}</b><span>עודכנו</span></div>
            <div><b>{result.skipped}</b><span>דולגו</span></div>
            <div className={result.failed.length ? "bad" : ""}><b>{result.failed.length}</b><span>נכשלו</span></div>
          </div>
          {result.failed.length ? <Issues title="שורות שלא נכנסו" items={result.failed.map((f) => ({ line: f.line, text: f.why }))} /> : null}
          <div className="bar"><button className="btn primary" onClick={() => onClose(true)}>סגירה</button></div>
        </div>
      ) : !sheet ? (
        <div className="xl">
          <section className="xl-card">
            <h3><Icon n="download" s={16} />הורדה מהמערכת</h3>
            <p className="tiny">כל ה{N.many} עם כל הפרטים, כולל שדות נוספים שהוספתם בכרטיסים.</p>
            <label className="pillck" style={{ alignSelf: "flex-start" }}><input type="checkbox" checked={withArch} onChange={(e) => setWithArch(e.target.checked)} />כולל ארכיון</label>
            <div className="bar">
              <button className="btn primary" disabled={!!busy} onClick={() => doExport(false)}><Icon n="download" s={16} />{busy === "export" ? "מכין קובץ…" : "הורדת כל ה" + N.many}</button>
              <button className="btn" disabled={!!busy} onClick={() => doExport(true)}><Icon n="file" s={16} />{busy === "template" ? "מכין…" : "קובץ ריק לייבוא"}</button>
            </div>
          </section>
          <section className={"xl-card xl-drop" + (drag ? " on" : "")}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}>
            <h3><Icon n="upload" s={16} />העלאה למערכת</h3>
            <p className="tiny">מוסיף {N.many} חדשים ומעדכן קיימים. אפשר להעלות קובץ שהורדתם מכאן אחרי עריכה, או כל קובץ אקסל או CSV עם כותרות.</p>
            <input ref={inp} type="file" hidden accept=".xlsx,.xlsm,.csv,.xls" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
            <div className="bar">
              <button className="btn primary" disabled={!!busy} onClick={() => inp.current?.click()}><Icon n="upload" s={16} />{busy === "read" ? "קורא את הקובץ…" : "בחירת קובץ"}</button>
              <span className="tiny">או גוררים קובץ לכאן</span>
            </div>
          </section>
        </div>
      ) : (
        <div className="xl">
          <p className="tiny" style={{ margin: 0 }}>
            <b>{sheet.file}</b> · {sheet.rows.length} שורות. בדקו לאן נכנסת כל עמודה.
          </p>
          <div className="scroll xl-map">
            <table className="tbl" style={{ minWidth: 520 }}>
              <thead><tr><th>עמודה בקובץ</th><th>דוגמה</th><th>נכנס אל</th></tr></thead>
              <tbody>
                {sheet.headers.map((h, i) => {
                  const sample = sheet.rows.map((r) => cellValue(r[i])).find((v) => v != null && v !== "");
                  return (
                    <tr key={i} className={map[i] === IGNORE ? "off" : ""}>
                      <td><b>{h || "(ללא כותרת)"}</b></td>
                      <td className="meta xl-sample">{sample instanceof Date ? sample.toISOString().slice(0, 10) : String(sample ?? "")}</td>
                      <td>
                        <select className="inp sm" value={map[i]} onChange={(e) => setMap(map.map((m, j) => (j === i ? e.target.value : m)))}>
                          <option value={IGNORE}>לא לייבא</option>
                          {h ? <option value={CUSTOM}>שדה נוסף: {h}</option> : null}
                          {options.map((f) => <option key={f.key} value={f.key} disabled={used.has(f.key) && map[i] !== f.key}>{f.label}</option>)}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="xl-opts">
            <span className="tiny">{N.one} שכבר קיים במערכת (לפי מזהה או טלפון):</span>
            <label className="pillck"><input type="radio" checked={onMatch === "update"} onChange={() => setOnMatch("update")} />לעדכן את הקיים</label>
            <label className="pillck"><input type="radio" checked={onMatch === "skip"} onChange={() => setOnMatch("skip")} />לדלג</label>
          </div>
          {missingReq ? <p className="meta bad" style={{ margin: 0 }}><Icon n="alert" s={14} />אין עמודה של &quot;{req.label}&quot;. אפשר רק לעדכן {N.many} קיימים.</p> : null}
          <div className="xl-sum">
            <div><b>{count("new")}</b><span>חדשים</span></div>
            <div><b>{count("update")}</b><span>עדכונים</span></div>
            <div><b>{count("skip")}</b><span>דילוגים</span></div>
            <div className={count("error") ? "bad" : ""}><b>{count("error")}</b><span>לא ייכנסו</span></div>
          </div>
          <Issues title="מה כדאי לבדוק" items={plan.flatMap((p) => [
            ...(p.action === "error" || (p.action === "skip" && p.why && !p.target) ? [{ line: p.p.line, text: p.why || "", bad: p.action === "error" }] : []),
            ...p.p.warns.map((w) => ({ line: p.p.line, text: w })),
          ])} />
          <div className="bar">
            <button className="btn primary" disabled={!!busy || !(count("new") + count("update"))} onClick={run}>
              {busy === "import" ? "מייבא…" : `ייבוא ${count("new") + count("update")} ${N.many}`}
            </button>
            <button className="btn ghost" disabled={!!busy} onClick={() => setSheet(null)}>קובץ אחר</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Issues({ title, items }: { title: string; items: { line: number; text: string; bad?: boolean }[] }) {
  const [all, setAll] = useState(false);
  if (!items.length) return null;
  const shown = all ? items : items.slice(0, 8);
  return (
    <div className="xl-issues">
      <b>{title} ({items.length})</b>
      <ul>
        {shown.map((x, i) => <li key={i}><St cls={x.bad ? "bad" : "warn"}>שורה {x.line}</St> {x.text}</li>)}
      </ul>
      {items.length > 8 && !all ? <button className="btn sm ghost" onClick={() => setAll(true)}>הצגת הכל</button> : null}
    </div>
  );
}

function friendly(m: string) {
  if (m.includes("crm_leads_phone_uq")) return "כבר יש ליד פעיל עם הטלפון הזה";
  if (m.includes("invalid input syntax")) return "ערך לא תקין באחד השדות";
  return m;
}
