"use client";
/* graphics made with the OpenAI Images API, kept per business and shown inside the CRM.
   The OpenAI key is the business's own, stored in Vault; the browser only learns whether one is saved. */
import { useEffect, useRef, useState } from "react";
import { sb } from "@/lib/supabase/browser";
import { Panel, Empty } from "@/components/Shell";
import Icon from "@/components/Icon";
import { useApp } from "@/components/AppCtx";
import { fmtDate, type Row } from "@/lib/crm";
import { G_MODELS, G_QUALITY, G_SIZES } from "@/lib/graphics";

const sizeName = (s: string) => G_SIZES.find((x) => x[0] === s)?.[1] || s;

export function useGraphics(limit = 60) {
  const { org } = useApp();
  const [rows, setRows] = useState<Row[] | null>(null);
  const load = async () => {
    const { data } = await sb().from("crm_graphics").select("*").eq("org_id", org).order("created_at", { ascending: false }).limit(limit);
    setRows(data || []);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [org]);
  return { rows, load };
}

function KeyPanel({ has, onDone }: { has: boolean; onDone: () => void }) {
  const { org, toast } = useApp();
  const [v, setV] = useState("");
  const [open, setOpen] = useState(!has);
  async function save(val: string) {
    const { error } = await sb().rpc("crm_set_org_secret", { p_org: org, p_name: "openai_api_key", p_value: val });
    if (error) return toast(error.message === "not allowed" ? "רק בעל העסק יכול לשמור מפתח" : error.message, true);
    setV(""); setOpen(false); toast(val ? "המפתח נשמר" : "המפתח הוסר"); onDone();
  }
  if (has && !open) return (
    <div className="bar" style={{ justifyContent: "space-between" }}>
      <span className="tiny"><Icon n="lock" s={13} /> מפתח OpenAI שמור בכספת</span>
      <span className="bar">
        <button className="btn sm ghost" onClick={() => setOpen(true)}>החלפה</button>
        <button className="btn sm ghost danger" onClick={() => { if (confirm("להסיר את מפתח OpenAI?")) save(""); }}>הסרה</button>
      </span>
    </div>
  );
  return (
    <div className="set-card">
      <b>חיבור ל-OpenAI</b>
      <span className="tiny">1. נכנסים ל-<a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">platform.openai.com/api-keys</a> ויוצרים מפתח (מתחיל ב-sk-). 2. בודקים שיש יתרה ב-<a href="https://platform.openai.com/settings/organization/billing/overview" target="_blank" rel="noopener noreferrer">Billing</a>. 3. מדביקים כאן. המפתח נשמר מוצפן ולא מוצג שוב.</span>
      <div className="bar" style={{ marginTop: 8 }}>
        <input className="inp ltr" style={{ flex: 1 }} type="password" autoComplete="off" value={v} onChange={(e) => setV(e.target.value)} placeholder="sk-..." />
        <button className="btn primary" disabled={!v.trim().startsWith("sk-")} onClick={() => save(v.trim())}>שמירה</button>
        {has ? <button className="btn ghost" onClick={() => setOpen(false)}>ביטול</button> : null}
      </div>
    </div>
  );
}

export function GraphicsStudio() {
  const { org, toast } = useApp();
  const [has, setHas] = useState<boolean | null>(null);
  const { rows, load } = useGraphics();
  const [prompt, setPrompt] = useState("");
  const [overlay, setOverlay] = useState("");
  const [size, setSize] = useState(G_SIZES[0][0]);
  const [model, setModel] = useState(G_MODELS[0][0]);
  const [quality, setQuality] = useState("high");
  const [busy, setBusy] = useState(0);
  const [view, setView] = useState<Row | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkKey = async () => {
    const { data } = await sb().rpc("crm_org_secret_status", { p_org: org, p_name: "openai_api_key" });
    setHas(!!data);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { checkKey(); }, [org]);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  async function make() {
    if (!prompt.trim()) return toast("כותבים מה צריך להיות בתמונה", true);
    setBusy(1);
    const t0 = Date.now();
    timer.current = setInterval(() => setBusy(Math.max(1, Math.round((Date.now() - t0) / 1000))), 1000);
    const r = await fetch("/api/graphics", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ org, prompt, overlay, size, model, quality }) }).catch(() => null);
    if (timer.current) clearInterval(timer.current);
    setBusy(0);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok) {
      if (j.error === "missing_key") { setHas(false); return toast("חסר מפתח OpenAI", true); }
      return toast("לא נוצר: " + (j.error || (r ? r.status : "אין חיבור")), true);
    }
    toast("הגרפיקה מוכנה");
    load();
    setView(j.graphic);
  }
  async function del(g: Row) {
    if (!confirm("למחוק את הגרפיקה? פוסטים שכבר פורסמו איתה לא יושפעו.")) return;
    await sb().storage.from("crm-graphics").remove([g.path]);
    const { error } = await sb().from("crm_graphics").delete().eq("id", g.id);
    if (error) return toast(error.message, true);
    if (view?.id === g.id) setView(null);
    load();
  }
  const again = (g: Row) => { setPrompt(g.prompt || ""); setOverlay(g.overlay || ""); if (g.size) setSize(g.size); window.scrollTo({ top: 0, behavior: "smooth" }); };

  return (
    <>
      <div className="grid g2b">
        <Panel icon="pen" title="יצירת גרפיקה">
          {has === null ? <p className="tiny">טוען…</p> : <KeyPanel has={has} onDone={checkKey} />}
          {has ? (
            <div className="form" style={{ marginTop: 12 }}>
              <label className="field full"><span>מה בתמונה (אפשר בעברית)</span>
                <textarea className="inp" rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="לדוגמה: בעל עסק קטן מחייך מול מחשב נייד במשרד מואר, סגנון צילום טבעי, צבעי סגול וזהב" /></label>
              <label className="field full"><span>טקסט שיופיע על התמונה (לא חובה)</span>
                <input className="inp" dir="auto" value={overlay} onChange={(e) => setOverlay(e.target.value)} placeholder="לדוגמה: 50% הנחה על החודש הראשון" /></label>
              <label className="field"><span>גודל</span><select className="inp" value={size} onChange={(e) => setSize(e.target.value)}>{G_SIZES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
              <label className="field"><span>מודל</span><select className="inp" value={model} onChange={(e) => setModel(e.target.value)}>{G_MODELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
              <label className="field"><span>איכות</span><select className="inp" value={quality} onChange={(e) => setQuality(e.target.value)}>{G_QUALITY.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
              <div className="full bar">
                <button className="btn primary" disabled={!!busy} onClick={make}><Icon n="star" s={15} />{busy ? "יוצר… " + busy + " שנ'" : "יצירה"}</button>
                {busy ? <span className="tiny">באיכות גבוהה זה יכול לקחת עד שתי דקות. אפשר להישאר בעמוד.</span> : null}
              </div>
              <p className="tiny full" style={{ margin: 0 }}>כל תמונה מחויבת בחשבון ה-OpenAI שלך. טקסט בעברית על התמונה כדאי לבדוק אות אות לפני פרסום.</p>
            </div>
          ) : null}
        </Panel>
        <Panel icon="eye" title="תצוגה">
          {view ? (
            <>
              <img src={view.url} alt={view.prompt} style={{ width: "100%", borderRadius: 12, display: "block" }} />
              <GraphicActions g={view} onDel={() => del(view)} onAgain={() => again(view)} />
            </>
          ) : <Empty>בוחרים גרפיקה מהגלריה או יוצרים חדשה</Empty>}
        </Panel>
      </div>
      <Panel icon="layout" title="הגלריה" right={rows ? <span className="tiny">{rows.length}</span> : undefined}>
        {!rows ? <p className="tiny">טוען…</p> : !rows.length ? <Empty>עוד אין גרפיקות</Empty> : (
          <div className="gal">
            {rows.map((g) => (
              <button key={g.id} className={"galit" + (view?.id === g.id ? " on" : "")} onClick={() => setView(g)} title={g.prompt}>
                <img src={g.url} alt={g.prompt} loading="lazy" />
                <span className="tiny">{sizeName(g.size)} · {fmtDate(g.created_at)}</span>
              </button>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}

function GraphicActions({ g, onDel, onAgain }: { g: Row; onDel: () => void; onAgain: () => void }) {
  const { toast } = useApp();
  return (
    <>
      <p className="tiny" dir="auto" style={{ margin: "10px 0 0" }}>{g.prompt}{g.overlay ? " · טקסט: " + g.overlay : ""}</p>
      <div className="bar" style={{ marginTop: 10, flexWrap: "wrap" }}>
        <a className="btn sm" href={g.url + "?download=" + encodeURIComponent("graphic-" + String(g.id).slice(0, 8) + ".jpg")}><Icon n="download" s={14} />הורדה</a>
        <button className="btn sm" onClick={() => { navigator.clipboard.writeText(g.url); toast("הקישור הועתק"); }}><Icon n="copy" s={14} />העתקת קישור</button>
        <a className="btn sm" href={"/settings/connections?tab=" + encodeURIComponent("רשתות חברתיות") + "&media=" + encodeURIComponent(g.url)}><Icon n="send" s={14} />לפוסט</a>
        <button className="btn sm" onClick={onAgain}><Icon n="repeat" s={14} />עוד גרסה</button>
        <button className="btn sm ghost danger" onClick={onDel}><Icon n="trash" s={14} />מחיקה</button>
      </div>
    </>
  );
}

/* small strip to pick one of the recent graphics as a post's media */
export function GraphicPicker({ value, onPick }: { value: string; onPick: (url: string) => void }) {
  const { rows } = useGraphics(12);
  if (!rows?.length) return null;
  return (
    <div className="full">
      <span className="tiny">או בוחרים גרפיקה מהגלריה:</span>
      <div className="galmini">
        {rows.map((g) => (
          <button key={g.id} type="button" className={value === g.url ? "on" : ""} onClick={() => onPick(value === g.url ? "" : g.url)} title={g.prompt}>
            <img src={g.url} alt={g.prompt} loading="lazy" />
          </button>
        ))}
      </div>
    </div>
  );
}
