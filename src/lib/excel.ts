/* Excel import / export: field specs and the pure logic (no DB, no DOM) */
import { STAGES, OFF_STAGES, SOURCES, INDUSTRIES, BUDGETS, CLIENT_STATUS, FIT, LINKS, type Row } from "./crm";

export type Kind = "leads" | "clients";
export type FKind = "text" | "phone" | "email" | "date" | "datetime" | "number" | "bool" | "enum" | "money";
export type Field = {
  key: string;            // column key; "fit.x" / "links.x" for json parts
  label: string;          // Hebrew header in the file
  kind: FKind;
  options?: readonly string[];
  strict?: boolean;       // value must be one of options
  ro?: boolean;           // export only
  required?: boolean;     // needed to create a new record
  aliases?: string[];
  width?: number;
};

const PHONE_AL = ["phone", "mobile", "tel", "נייד", "פלאפון", "סלולרי", "מספר טלפון", "טלפון נייד", "מס טלפון"];
const MAIL_AL = ["email", "e-mail", "mail", "אימייל", "דואל", "דוא\"ל", "כתובת מייל", "אי מייל"];

export const FIELDS: Record<Kind, Field[]> = {
  leads: [
    { key: "name", label: "שם", kind: "text", required: true, aliases: ["name", "full name", "שם מלא", "שם הליד", "שם פרטי", "שם איש קשר", "איש קשר"], width: 18 },
    { key: "biz", label: "עסק", kind: "text", aliases: ["business", "company", "שם העסק", "חברה", "שם החברה"], width: 18 },
    { key: "phone", label: "טלפון", kind: "phone", aliases: PHONE_AL, width: 14 },
    { key: "email", label: "מייל", kind: "email", aliases: MAIL_AL, width: 24 },
    { key: "industry", label: "תחום", kind: "enum", options: INDUSTRIES, aliases: ["industry", "ענף", "תחום עיסוק"], width: 16 },
    { key: "source", label: "מקור", kind: "enum", options: SOURCES, aliases: ["source", "מקור ליד", "מאיפה הגיע"], width: 12 },
    { key: "campaign", label: "קמפיין", kind: "text", aliases: ["campaign", "שם קמפיין"], width: 16 },
    { key: "landing_page", label: "עמוד שממנו הגיע", kind: "text", aliases: ["landing_page", "עמוד מקור"], width: 20 },
    { key: "budget", label: "תקציב", kind: "enum", options: BUDGETS, aliases: ["budget"], width: 13 },
    { key: "value", label: "שווי עסקה", kind: "money", aliases: ["value", "שווי", "סכום", "סכום עסקה"], width: 12 },
    { key: "stage", label: "שלב", kind: "enum", options: [...STAGES, ...OFF_STAGES], strict: true, aliases: ["stage", "סטטוס", "שלב בתהליך"], width: 13 },
    { key: "pain", label: "כאב", kind: "text", aliases: ["pain", "כאב הלקוח", "מה הכאב", "הערות", "הערה", "notes"], width: 30 },
    { key: "next_step", label: "הצעד הבא", kind: "text", aliases: ["next step", "צעד הבא", "משימה הבאה"], width: 22 },
    { key: "next_at", label: "תאריך הצעד הבא", kind: "date", aliases: ["next_at", "תאריך צעד הבא", "תאריך מעקב"], width: 14 },
    { key: "reason", label: "סיבת פסילה", kind: "text", aliases: ["reason", "סיבה"], width: 16 },
    { key: "marketing_consent", label: "הסכמה לדיוור", kind: "bool", aliases: ["consent", "marketing consent", "אישור דיוור", "מאשר דיוור"], width: 12 },
    ...FIT.map(([k, l]): Field => ({ key: "fit." + k, label: "התאמה: " + l, kind: "bool", width: 14 })),
    ...LINKS.map(([k, l]): Field => ({ key: "links." + k, label: l, kind: "text", aliases: k === "site" ? ["website", "site", "כתובת אתר"] : [k], width: 22 })),
    { key: "last_contact_at", label: "נגיעה אחרונה", kind: "datetime", ro: true, width: 16 },
    { key: "created_at", label: "נוצר", kind: "datetime", ro: true, aliases: ["תאריך יצירה", "created"], width: 16 },
    { key: "archived_at", label: "הועבר לארכיון", kind: "datetime", ro: true, width: 16 },
    { key: "id", label: "מזהה מערכת", kind: "text", aliases: ["id", "מזהה"], width: 38 },
  ],
  clients: [
    { key: "biz", label: "שם העסק", kind: "text", required: true, aliases: ["business", "company", "עסק", "לקוח", "חברה", "שם הלקוח"], width: 20 },
    { key: "contact", label: "איש קשר", kind: "text", aliases: ["contact", "name", "שם", "שם איש קשר", "שם מלא"], width: 18 },
    { key: "phone", label: "טלפון", kind: "phone", aliases: PHONE_AL, width: 14 },
    { key: "email", label: "מייל", kind: "email", aliases: MAIL_AL, width: 24 },
    { key: "industry", label: "תחום", kind: "enum", options: INDUSTRIES, aliases: ["industry", "ענף"], width: 16 },
    { key: "status", label: "סטטוס", kind: "enum", options: CLIENT_STATUS, strict: true, aliases: ["status", "מצב"], width: 12 },
    { key: "since", label: "לקוח מאז", kind: "date", aliases: ["since", "תאריך התחלה", "התחלה"], width: 13 },
    { key: "wa_group", label: "קבוצת וואטסאפ", kind: "text", aliases: ["whatsapp group", "קבוצה"], width: 20 },
    { key: "next_step", label: "הצעד הבא", kind: "text", aliases: ["next step", "צעד הבא"], width: 22 },
    { key: "next_at", label: "תאריך הצעד הבא", kind: "date", aliases: ["תאריך צעד הבא"], width: 14 },
    { key: "churn_reason", label: "סיבת עזיבה", kind: "text", aliases: ["churn reason"], width: 16 },
    ...LINKS.map(([k, l]): Field => ({ key: "links." + k, label: l, kind: "text", aliases: k === "site" ? ["website", "site", "כתובת אתר"] : [k], width: 22 })),
    { key: "monthly", label: "חודשי פעיל, לפני מע\"מ", kind: "money", ro: true, width: 14 },
    { key: "open", label: "פתוח לגבייה", kind: "money", ro: true, width: 13 },
    { key: "last_contact_at", label: "נגיעה אחרונה", kind: "datetime", ro: true, width: 16 },
    { key: "created_at", label: "נוצר", kind: "datetime", ro: true, width: 16 },
    { key: "archived_at", label: "הועבר לארכיון", kind: "datetime", ro: true, width: 16 },
    { key: "id", label: "מזהה מערכת", kind: "text", aliases: ["id", "מזהה"], width: 38 },
  ],
};

export const NAMES: Record<Kind, { many: string; one: string; sheet: string; table: string; customKey: string }> = {
  leads: { many: "לידים", one: "ליד", sheet: "לידים", table: "crm_leads", customKey: "details" },
  clients: { many: "לקוחות", one: "לקוח", sheet: "לקוחות", table: "crm_clients", customKey: "info" },
};

/* ---------- value helpers ---------- */
export function norm(s: string) {
  return String(s ?? "").toLowerCase().replace(/[\s"'`׳״_\-.:,()]/g, "");
}
/** cell value from exceljs (rich text, hyperlink, formula...) or csv into a primitive */
export function cellValue(v: unknown): string | number | boolean | Date | null {
  if (v == null) return null;
  if (v instanceof Date || typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "string") return v.trim() === "" ? null : v;
  if (typeof v === "object") {
    const o = v as Row;
    if (Array.isArray(o.richText)) return o.richText.map((r: Row) => r.text).join("");
    if ("result" in o) return cellValue(o.result);
    if ("text" in o) return cellValue(o.hyperlink && typeof o.text !== "string" ? o.hyperlink : o.text);
    if ("hyperlink" in o) return cellValue(o.hyperlink);
    if ("error" in o) return null;
  }
  return String(v);
}
export function phoneNorm(v: unknown): string | null {
  if (v == null || v === "") return null;
  const raw = String(typeof v === "number" ? Math.round(v) : v).trim();
  const plus = raw.startsWith("+");
  let d = raw.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("972")) d = "0" + d.slice(3).replace(/^0/, "");
  else if (plus) return "+" + d;
  else if (d.length === 9 && /^[23489567]/.test(d)) d = "0" + d; // Excel dropped the leading zero
  return d;
}
/** the part of a phone that identifies it, for matching */
export function phoneKey(v: unknown) {
  const p = phoneNorm(v);
  return p ? p.replace(/\D/g, "").slice(-9) : "";
}
const pad = (n: number) => (n < 10 ? "0" : "") + n;
export function dateNorm(v: unknown): string | null | undefined {
  if (v == null || v === "") return null;
  if (v instanceof Date) return isNaN(+v) ? undefined : v.getUTCFullYear() + "-" + pad(v.getUTCMonth() + 1) + "-" + pad(v.getUTCDate());
  if (typeof v === "number") {
    if (v < 20000 || v > 80000) return undefined;
    return dateNorm(new Date(Math.round((v - 25569) * 86400000)));
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) return valid(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  return undefined;
}
function valid(y: number, mo: number, d: number) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return undefined;
  return y + "-" + pad(mo) + "-" + pad(d);
}
export function boolNorm(v: unknown): boolean | null | undefined {
  if (v == null || v === "") return null;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const s = norm(String(v));
  if (["כן", "yes", "y", "true", "v", "✓", "✔", "x", "1", "מאשר", "מאשרת", "יש"].includes(s)) return true;
  if (["לא", "no", "n", "false", "0", "אין", "לאמאשר"].includes(s)) return false;
  return undefined;
}
export function numNorm(v: unknown): number | null | undefined {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[₪,\s]|ש"ח|nis|ils/gi, "");
  if (!s) return null;
  const n = Number(s);
  return isFinite(n) ? n : undefined;
}

/* ---------- column mapping ---------- */
export const IGNORE = "__ignore";
export const CUSTOM = "__custom";

export function autoMap(kind: Kind, headers: string[]): string[] {
  const used = new Set<string>();
  const fields = FIELDS[kind].filter((f) => !f.ro);
  return headers.map((h) => {
    const n = norm(h);
    if (!n) return IGNORE;
    const f = fields.find((f) => !used.has(f.key) && [f.label, f.key, ...(f.aliases || [])].some((a) => norm(a) === n));
    if (f) { used.add(f.key); return f.key; }
    // export-only columns are recognised and skipped, not turned into custom fields
    if (FIELDS[kind].some((f) => f.ro && [f.label, f.key, ...(f.aliases || [])].some((a) => norm(a) === n))) return IGNORE;
    return CUSTOM;
  });
}

/* ---------- parse rows ---------- */
export type Parsed = { line: number; data: Row; custom: { label: string; value: string }[]; errors: string[]; warns: string[] };

export function parseRows(kind: Kind, headers: string[], rows: unknown[][], map: string[]): Parsed[] {
  const fields = Object.fromEntries(FIELDS[kind].map((f) => [f.key, f]));
  const out: Parsed[] = [];
  rows.forEach((r, i) => {
    const p: Parsed = { line: i + 2, data: {}, custom: [], errors: [], warns: [] };
    let any = false;
    map.forEach((key, c) => {
      if (key === IGNORE) return;
      const v = cellValue(r[c]);
      if (v == null || v === "") return;
      any = true;
      if (key === CUSTOM) {
        const label = String(headers[c] || "").trim();
        if (label) p.custom.push({ label, value: v instanceof Date ? dateNorm(v) || "" : String(v).trim() });
        return;
      }
      const f = fields[key];
      if (!f) return;
      const bad = (what: string) => p.warns.push(`"${f.label}": ${what}, השדה לא ייובא`);
      switch (f.kind) {
        case "phone": { const ph = phoneNorm(v); if (ph && ph.replace(/\D/g, "").length < 9) p.warns.push(`"${f.label}": המספר ${ph} נראה קצר`); p.data[key] = ph; break; }
        case "email": { const s = String(v).trim().toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) bad("כתובת לא תקינה"); else p.data[key] = s; break; }
        case "date": { const d = dateNorm(v); if (d === undefined) bad("תאריך לא מזוהה (" + String(v) + ")"); else p.data[key] = d; break; }
        case "money": case "number": { const n = numNorm(v); if (n === undefined) bad("לא מספר"); else p.data[key] = n; break; }
        case "bool": { const b = boolNorm(v); if (b === undefined) bad("צריך כן או לא"); else p.data[key] = b; break; }
        case "enum": {
          const s = String(v).trim();
          const hit = f.options?.find((o) => norm(o) === norm(s));
          if (hit) p.data[key] = hit;
          else if (f.strict) bad(`"${s}" לא ברשימה (${f.options!.join(", ")})`);
          else p.data[key] = s;
          break;
        }
        default: p.data[key] = v instanceof Date ? dateNorm(v) : String(v).trim();
      }
    });
    if (any) out.push(p);
  });
  return out;
}

/* ---------- plan: what happens to each row ---------- */
export type Plan = { p: Parsed; action: "new" | "update" | "skip" | "error"; target?: Row; why?: string };

export function planImport(kind: Kind, parsed: Parsed[], existing: Row[], onMatch: "update" | "skip"): Plan[] {
  const byId = new Map(existing.map((r) => [r.id, r]));
  const byPhone = new Map<string, Row>();
  existing.filter((r) => !r.archived_at).forEach((r) => { const k = phoneKey(r.phone); if (k && !byPhone.has(k)) byPhone.set(k, r); });
  const req = FIELDS[kind].find((f) => f.required)!;
  const seen = new Map<string, number>();
  return parsed.map((p): Plan => {
    if (p.errors.length) return { p, action: "error", why: p.errors.join("; ") };
    const pk = phoneKey(p.data.phone);
    if (pk) {
      if (seen.has(pk)) return { p, action: "skip", why: `אותו טלפון כמו בשורה ${seen.get(pk)}` };
      seen.set(pk, p.line);
    }
    const id = p.data.id ? String(p.data.id).trim() : "";
    const target = (id && byId.get(id)) || (pk ? byPhone.get(pk) : undefined);
    if (id && !byId.has(id) && !target) p.warns.push("מזהה מערכת לא נמצא, תיווצר רשומה חדשה");
    if (target) {
      if (onMatch === "skip") return { p, action: "skip", target, why: "קיים במערכת" };
      return { p, action: "update", target };
    }
    if (!p.data[req.key]) return { p, action: "error", why: `חסר "${req.label}"` };
    return { p, action: "new" };
  });
}

function cfield(label: string, value: string) {
  return { id: Math.random().toString(36).slice(2, 10), label, type: /^https?:\/\//i.test(value) ? "url" : "text", value };
}
function mergeCustom(list: Row[] = [], add: { label: string; value: string }[]) {
  const out = list.map((x) => ({ ...x }));
  add.forEach((a) => {
    const hit = out.find((x) => norm(x.label) === norm(a.label));
    if (hit) hit.value = a.value; else out.push(cfield(a.label, a.value));
  });
  return out;
}

/** DB payload for a planned row. For updates only the filled-in cells change. */
export function payload(kind: Kind, pl: Plan, org: string): Row {
  const { data, custom } = pl.p;
  const t = pl.target;
  const flat: Row = {}; const fit: Row = {}; const links: Row = {};
  Object.entries(data).forEach(([k, v]) => {
    if (k === "id") return;
    if (k.startsWith("fit.")) fit[k.slice(4)] = v;
    else if (k.startsWith("links.")) links[k.slice(6)] = v;
    else flat[k] = v;
  });
  const ck = NAMES[kind].customKey;
  const out: Row = { ...flat };
  if (!t) out.org_id = org;
  if (kind === "leads") {
    if (Object.keys(fit).length || !t) out.fit = { ...(t?.fit || { market: false, active: false, budget: false, decider: false, pain: false }), ...fit };
    if (Object.keys(links).length) out.links = { ...(t?.links || {}), ...links };
    if (flat.marketing_consent === true && !t?.marketing_consent) { out.consent_at = new Date().toISOString(); out.consent_text = "יובא מקובץ אקסל"; }
  } else if (Object.keys(links).length) {
    out.info = { ...(t?.info || {}), links: { ...(t?.info?.links || {}), ...links } };
  }
  if (custom.length || !t) {
    const base = t?.custom || (kind === "leads" ? { links: [], details: [] } : { info: [] });
    out.custom = { ...base, [ck]: mergeCustom(base[ck] || [], custom) };
  }
  return out;
}

/* ---------- csv ---------- */
export function parseCsv(text: string): string[][] {
  text = text.replace(/^﻿/, "");
  const first = text.split(/\r?\n/, 1)[0];
  const delim = [",", ";", "\t"].map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = []; let row: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); rows.push(row); row = []; cur = "";
    } else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}
export function decodeText(buf: ArrayBuffer) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); }
  catch { return new TextDecoder("windows-1255").decode(buf); }
}

/* ---------- export rows ---------- */
export function exportValue(kind: Kind, f: Field, r: Row): unknown {
  if (f.key.startsWith("fit.")) return r.fit?.[f.key.slice(4)] ? "כן" : "לא";
  if (f.key.startsWith("links.")) return (kind === "leads" ? r.links : r.info?.links)?.[f.key.slice(6)] || null;
  const v = r[f.key];
  if (v == null || v === "") return null;
  if (f.kind === "bool") return v ? "כן" : "לא";
  if (f.kind === "date") { const [y, m, d] = String(v).slice(0, 10).split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); }
  if (f.kind === "datetime") { const d = new Date(v); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes())); }
  if (f.kind === "money" || f.kind === "number") return Number(v);
  return v;
}
export function customLabels(kind: Kind, rows: Row[]) {
  const ck = NAMES[kind].customKey;
  const fixed = new Set(FIELDS[kind].map((f) => norm(f.label)));
  const seen = new Map<string, string>();
  rows.forEach((r) => (r.custom?.[ck] || []).forEach((c: Row) => { const n = norm(c.label); if (c.label && !fixed.has(n) && !seen.has(n)) seen.set(n, c.label); }));
  return [...seen.values()];
}
export function customValue(kind: Kind, r: Row, label: string) {
  const hit = (r.custom?.[NAMES[kind].customKey] || []).find((c: Row) => norm(c.label) === norm(label));
  return hit?.value || null;
}
