"use client";
/* client access: the client's accounts with their logins. VaultBox (encrypted logins) is no longer on the client card. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { sb } from "@/lib/supabase/browser";
import Icon from "./Icon";
import { Panel, Empty, St } from "./Shell";
import { useApp } from "./AppCtx";
import { EditField } from "./Blocks";
import { ACCESS_STATUS, ACCESS_STATUS_CLS, ACCESS_DEFAULTS, accessMessage, fmtDateTime, waLink, type Row } from "@/lib/crm";

const PLATS = ["פייסבוק", "אינסטגרם", "טיקטוק", "גוגל"];

/* client accounts: one row per asset with its link, user name and password (readable, by request),
   the partner-access status, and the instructions message to the client */
export function AccessBox({ clientId, contact, phone, onLog }: { clientId: string; contact?: string; phone?: string | null; onLog?: () => void }) {
  const { org, toast, settings } = useApp();
  const [rows, setRows] = useState<Row[]>([]);
  const [adding, setAdding] = useState(false);
  const EMPTY = { platform: PLATS[0], other: "", ref: "", username: "", password: "" };
  const [f, setF] = useState(EMPTY);
  const load = async () => {
    const { data } = await sb().from("crm_client_access").select("*").eq("client_id", clientId).order("sort").order("created_at");
    setRows(data || []);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [clientId]);

  async function upd(r: Row, patch: Row) {
    setRows((x) => x.map((y) => (y.id === r.id ? { ...y, ...patch } : y)));
    const { error } = await sb().from("crm_client_access").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", r.id);
    if (error) return toast("לא נשמר: " + error.message, true);
    if (patch.status) {
      await sb().from("crm_activities").insert({ org_id: org, client_id: clientId, type: "מערכת", text: "גישה ל" + r.asset + ": " + patch.status, by: "מערכת" });
      onLog?.();
    }
  }
  async function addOne() {
    const platform = f.platform === "אחר" ? f.other.trim() : f.platform;
    if (!platform) return toast("כותבים את שם הפלטפורמה", true);
    const { error } = await sb().from("crm_client_access").insert({ org_id: org, client_id: clientId, platform, asset: platform, ref: f.ref.trim(),
      username: f.username.trim(), password: f.password, status: f.username || f.password ? "יש גישה" : "לא התחיל", sort: rows.length + 1 });
    if (error) return toast(error.message, true);
    await sb().from("crm_activities").insert({ org_id: org, client_id: clientId, type: "מערכת", text: "נוסף נכס: " + platform, by: "מערכת" });
    setF(EMPTY); setAdding(false); load(); onLog?.();
  }
  const copy = (v: string, what: string) => { if (!v) return; navigator.clipboard.writeText(v).then(() => toast(what + " הועתק"), () => toast("לא הועתק", true)); };
  const done = rows.filter((r) => r.status === "יש גישה").length;
  const msg = accessMessage(settings.agency, contact || "", rows);

  return (
    <Panel icon="key" title="גישה לחשבונות" right={<div className="bar">
      {rows.length ? <span className="tiny">{done}/{rows.length} עם גישה</span> : null}
      {adding ? null : <button className="btn sm primary" onClick={() => setAdding(true)}><Icon n="plus" s={15} />הוספת נכס</button>}
    </div>}>
      {adding ? (
        <div className="acc-new">
          <div className="acc-new-h"><b>נכס חדש</b><button className="btn sm ghost" onClick={() => { setAdding(false); setF(EMPTY); }}><Icon n="x" s={14} />סגירה</button></div>
          <div className="pills">
            {[...PLATS, "אחר"].map((p) => <button key={p} type="button" className={"pillck" + (f.platform === p ? " on" : "")} onClick={() => setF({ ...f, platform: p })}>{p}</button>)}
          </div>
          {f.platform === "אחר" ? <input className="inp sm" placeholder="שם הפלטפורמה (למשל: אתר, דומיין, יוטיוב)" value={f.other} onChange={(e) => setF({ ...f, other: e.target.value })} /> : null}
          <input className="inp sm ltr" type="url" inputMode="url" placeholder="קישור לעמוד" value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} />
          <div className="f2">
            <input className="inp sm ltr" autoComplete="off" placeholder="שם משתמש" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} />
            <input className="inp sm ltr" autoComplete="off" placeholder="סיסמה" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          </div>
          <div className="bar"><button className="btn sm primary" onClick={addOne}><Icon n="check" s={15} />שמירה</button></div>
        </div>
      ) : null}
      {!rows.length ? <Empty>עוד אין נכסים ברשימה</Empty> : rows.map((r) => (
        <div className="acc-row" key={r.id}>
          <div className="acc-top">
            <b>{r.asset}</b>{r.platform !== r.asset ? <span className="meta">{r.platform}</span> : null}
            <span className="grow" />
            <select className="inp sm" style={{ width: 122 }} value={r.status} onChange={(e) => upd(r, { status: e.target.value })}>
              {ACCESS_STATUS.map((s) => <option key={s}>{s}</option>)}
            </select>
            <St cls={ACCESS_STATUS_CLS[r.status]}>{r.status === "יש גישה" ? "✓" : "·"}</St>
            <button className="btn icon sm ghost" title="מחיקה" onClick={async () => {
              if (!confirm("להסיר את " + r.asset + " מהרשימה?")) return;
              await sb().from("crm_client_access").delete().eq("id", r.id); load();
            }}><Icon n="trash" s={15} /></button>
          </div>
          <div className="acc-f">
            <label><span>קישור</span><EditField className="fi ltr" value={r.ref} placeholder="קישור לעמוד" onSave={(v) => upd(r, { ref: v.trim() })} />
              {r.ref ? <a className="btn icon sm ghost" href={/^https?:/.test(r.ref) ? r.ref : "https://" + r.ref} target="_blank" rel="noreferrer" title="פתיחה"><Icon n="link" s={14} /></a> : null}</label>
            <label><span>משתמש</span><EditField className="fi ltr" value={r.username} placeholder="שם משתמש" onSave={(v) => upd(r, { username: v.trim() })} />
              {r.username ? <button type="button" className="btn icon sm ghost" title="העתקה" onClick={() => copy(r.username, "שם המשתמש")}><Icon n="copy" s={14} /></button> : null}</label>
            <label><span>סיסמה</span><EditField className="fi ltr" value={r.password} placeholder="סיסמה" onSave={(v) => upd(r, { password: v })} />
              {r.password ? <button type="button" className="btn icon sm ghost" title="העתקה" onClick={() => copy(r.password, "הסיסמה")}><Icon n="copy" s={14} /></button> : null}</label>
          </div>
          {r.notes ? <span className="tiny">{r.notes}</span> : null}
        </div>
      ))}
      <div className="bar" style={{ marginTop: 10 }}>
        {!rows.length ? (
          <button className="btn sm" onClick={async () => {
            const { error } = await sb().from("crm_client_access").insert(ACCESS_DEFAULTS.map(([platform, asset], i) => ({ org_id: org, client_id: clientId, platform, asset, sort: i + 1 })));
            if (error) return toast(error.message, true);
            load();
          }}><Icon n="list" s={15} />רשימת נכסים בסיסית</button>
        ) : null}
        <button className="btn sm ghost" onClick={() => { navigator.clipboard.writeText(msg); toast("ההוראות הועתקו"); }}><Icon n="copy" s={14} />העתקת ההוראות</button>
      </div>
      {!settings.agency?.meta_bm && !settings.agency?.google_mcc && !settings.agency?.tiktok_bc ? (
        <p className="tiny" style={{ marginBottom: 0 }}>כדי שההוראות יכללו את המזהים שלך, ממלאים אותם <Link href="/settings/business">בהגדרות, בפרטי העסק</Link>.</p>
      ) : null}
    </Panel>
  );
}

export function VaultBox({ clientId, onLog }: { clientId: string; onLog?: () => void }) {
  const { toast } = useApp();
  const [rows, setRows] = useState<Row[]>([]);
  const [shown, setShown] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ label: "", url: "", username: "", secret: "" });
  const load = async () => {
    const { data } = await sb().from("crm_vault_items").select("*").eq("client_id", clientId).order("created_at");
    setRows(data || []);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [clientId]);

  return (
    <Panel icon="lock" title="כספת">
      <p className="tiny" style={{ marginTop: 0 }}>רק למה שאין לו גישת שותף: ניהול האתר, הדומיין, האחסון. מוצפן, וכל צפייה נרשמת ביומן.</p>
      {!rows.length ? <Empty>הכספת ריקה</Empty> : rows.map((r) => (
        <div className="lrow" key={r.id} style={{ alignItems: "flex-start" }}>
          <span className="grow">
            <b>{r.label}</b>
            {r.url ? <a className="meta ltr" href={r.url.startsWith("http") ? r.url : "https://" + r.url} target="_blank" rel="noreferrer">{r.url}</a> : null}
            {r.username ? <span className="meta ltr" style={{ display: "block" }}>{r.username}</span> : null}
            {shown[r.id] !== undefined ? <div className="code" style={{ marginTop: 6 }}>{shown[r.id]}</div> : null}
            {r.last_revealed_at ? <span className="meta">נצפתה לאחרונה {fmtDateTime(r.last_revealed_at)}</span> : null}
          </span>
          {shown[r.id] !== undefined ? (
            <>
              <button className="btn icon sm" title="העתקה" onClick={() => { navigator.clipboard.writeText(shown[r.id]); toast("הועתק"); }}><Icon n="copy" s={15} /></button>
              <button className="btn icon sm ghost" title="הסתרה" onClick={() => setShown(({ [r.id]: _, ...x }) => x)}><Icon n="eyeoff" s={15} /></button>
            </>
          ) : (
            <button className="btn icon sm" title="הצגת הסיסמה" onClick={async () => {
              const { data, error } = await sb().rpc("crm_vault_reveal", { p_id: r.id });
              if (error) return toast(error.message, true);
              setShown((x) => ({ ...x, [r.id]: String(data ?? "") }));
              setTimeout(() => setShown(({ [r.id]: _, ...x }) => x), 30000);
              onLog?.(); load();
            }}><Icon n="eye" s={15} /></button>
          )}
          <button className="btn icon sm ghost" title="עדכון סיסמה" onClick={async () => {
            const v = prompt("סיסמה חדשה ל" + r.label);
            if (!v) return;
            const { error } = await sb().rpc("crm_vault_update", { p_id: r.id, p_label: null, p_url: null, p_username: null, p_secret: v });
            if (error) return toast(error.message, true);
            toast("עודכן");
          }}><Icon n="pen" s={15} /></button>
          <button className="btn icon sm ghost" title="מחיקה" onClick={async () => {
            if (!confirm("למחוק את " + r.label + " מהכספת? אי אפשר לשחזר.")) return;
            const { error } = await sb().rpc("crm_vault_delete", { p_id: r.id });
            if (error) return toast(error.message, true);
            onLog?.(); load();
          }}><Icon n="trash" s={15} /></button>
        </div>
      ))}
      {adding ? (
        <form className="form" style={{ marginTop: 10 }} autoComplete="off" onSubmit={async (e) => {
          e.preventDefault();
          if (!f.label.trim() || !f.secret) return toast("צריך שם וסיסמה", true);
          const { error } = await sb().rpc("crm_vault_add", { p_client: clientId, p_label: f.label, p_url: f.url, p_username: f.username, p_secret: f.secret });
          if (error) return toast(error.message, true);
          setF({ label: "", url: "", username: "", secret: "" }); setAdding(false); onLog?.(); load();
        }}>
          <label className="field"><span>מה זה</span><input className="inp" placeholder="למשל: ניהול האתר" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></label>
          <label className="field"><span>כתובת כניסה</span><input className="inp ltr" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} /></label>
          <label className="field"><span>שם משתמש</span><input className="inp ltr" autoComplete="off" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></label>
          <label className="field"><span>סיסמה</span><input className="inp ltr" type="password" autoComplete="new-password" value={f.secret} onChange={(e) => setF({ ...f, secret: e.target.value })} /></label>
          <div className="full bar"><button className="btn sm primary">שמירה בכספת</button><button type="button" className="btn sm ghost" onClick={() => setAdding(false)}>ביטול</button></div>
        </form>
      ) : <button className="add" onClick={() => setAdding(true)}><Icon n="plus" s={15} />פריט לכספת</button>}
    </Panel>
  );
}
