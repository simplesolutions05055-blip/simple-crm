"use client";
/* WhatsApp (official API): history + sending, on the lead and client cards */
import { useEffect, useState } from "react";
import Link from "next/link";
import { sb } from "@/lib/supabase/browser";
import Icon from "./Icon";
import { Panel, Empty, St } from "./Shell";
import { useApp } from "./AppCtx";
import { fmtDateTime, waLink, waTemplates, type Row } from "@/lib/crm";

const ST: Record<string, [string, string]> = {
  queued: ["בשליחה", "info"], sent: ["נשלחה", "info"], delivered: ["נמסרה", "ok"], read: ["נקראה", "ok"], failed: ["נכשלה", "bad"], received: ["התקבלה", "warn"],
};

export default function WaBox({ leadId, clientId, phone, name, onLog }: { leadId?: string; clientId?: string; phone?: string | null; name?: string; onLog?: () => void }) {
  const { settings, toast } = useApp();
  const [rows, setRows] = useState<Row[]>([]);
  const [mode, setMode] = useState<"template" | "text">("template");
  const [tpl, setTpl] = useState("");
  const [params, setParams] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const ready = !!settings.wa?.phone_number_id;
  const tpls = waTemplates(settings.wa);

  const load = async () => {
    let q = sb().from("crm_wa_messages").select("*").order("at", { ascending: false }).limit(30);
    q = clientId && leadId ? q.or(`client_id.eq.${clientId},lead_id.eq.${leadId}`) : clientId ? q.eq("client_id", clientId) : q.eq("lead_id", leadId!);
    const { data } = await q;
    setRows(data || []);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [leadId, clientId]);
  // pick the first template and pre-fill the first name
  useEffect(() => {
    if (!tpl && tpls.length) { setTpl(tpls[0].name); setParams(defaults(tpls[0].params)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tpls.length]);
  const first = (name || "").trim().split(" ")[0];
  const defaults = (n: number) => Array.from({ length: n }, (_, i) => (i === 0 ? first : ""));

  const lastIn = rows.find((r) => r.direction === "in");
  const open24 = lastIn && Date.now() - new Date(lastIn.at).getTime() < 24 * 3600 * 1000;

  async function send() {
    if (!phone) return toast("אין מספר טלפון", true);
    setBusy(true);
    const t = tpls.find((x) => x.name === tpl);
    const { error } = await sb().rpc("crm_wa_send", mode === "template"
      ? { p_phone: phone, p_template: tpl, p_lang: t?.lang || "he", p_params: params.map((p) => p.trim()), p_text: null, p_lead: leadId || null, p_client: clientId || null }
      : { p_phone: phone, p_template: null, p_lang: null, p_params: [], p_text: text, p_lead: leadId || null, p_client: clientId || null });
    setBusy(false);
    if (error) return toast("לא נשלח: " + error.message, true);
    setText(""); toast("נשלח. הסטטוס מתעדכן תוך דקה.");
    load(); onLog?.();
    setTimeout(load, 70000);
  }

  return (
    <Panel icon="wa" title="וואטסאפ" right={<button className="btn icon sm ghost" title="רענון" onClick={load}><Icon n="reset" s={15} /></button>}>
      {!ready ? (
        <>
          <p className="tiny" style={{ marginTop: 0 }}>השליחה האוטומטית עוד לא מחוברת. <Link href="/settings">מחברים בהגדרות, בלשונית וואטסאפ</Link>.</p>
          {phone ? <a className="btn sm wa" href={waLink(phone, "היי " + first + ", ")} target="_blank" rel="noreferrer"><Icon n="wa" s={15} />פתיחת שיחה בוואטסאפ</a> : null}
        </>
      ) : !phone ? <Empty>אין מספר טלפון</Empty> : (
        <div className="col" style={{ gap: 8 }}>
          <div className="tabs" style={{ margin: 0 }}>
            <button className={"btn sm" + (mode === "template" ? " on" : "")} onClick={() => setMode("template")}>תבנית</button>
            <button className={"btn sm" + (mode === "text" ? " on" : "")} onClick={() => setMode("text")}>הודעה חופשית</button>
          </div>
          {mode === "template" ? (
            !tpls.length ? <p className="tiny">אין תבניות. מוסיפים אותן בהגדרות, בלשונית וואטסאפ.</p> : (
              <>
                <select className="inp sm" value={tpl} onChange={(e) => { setTpl(e.target.value); setParams(defaults(tpls.find((x) => x.name === e.target.value)?.params || 0)); }}>
                  {tpls.map((t) => <option key={t.name} value={t.name}>{t.label || t.name}</option>)}
                </select>
                {params.map((p, i) => (
                  <input key={i} className="inp sm" placeholder={"משתנה " + (i + 1)} value={p} onChange={(e) => setParams(params.map((x, k) => (k === i ? e.target.value : x)))} />
                ))}
              </>
            )
          ) : (
            <>
              {!open24 ? <p className="tiny" style={{ margin: 0, color: "var(--warn)" }}>הודעה חופשית נמסרת רק עד 24 שעות אחרי שהלקוח כתב לך. מחוץ לחלון הזה שולחים תבנית.</p> : null}
              <textarea className="inp" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="ההודעה" />
            </>
          )}
          <div className="bar">
            <button className="btn sm primary" disabled={busy || (mode === "text" ? !text.trim() : !tpl)} onClick={send}><Icon n="send" s={15} />{busy ? "שולח…" : "שליחה"}</button>
            <a className="btn sm ghost" href={waLink(phone, "")} target="_blank" rel="noreferrer">פתיחה בוואטסאפ</a>
          </div>
        </div>
      )}
      {rows.length ? (
        <div style={{ marginTop: 10 }}>
          {rows.map((r) => (
            <div className="lrow" key={r.id} style={{ alignItems: "flex-start" }}>
              <span className="grow">
                <span style={{ whiteSpace: "pre-wrap", display: "block" }}>{r.direction === "in" ? "← " : "→ "}{r.body}</span>
                <span className="meta">{fmtDateTime(r.at)} · {r.by}{r.error ? " · " + r.error : ""}</span>
              </span>
              <St cls={ST[r.status]?.[1]}>{ST[r.status]?.[0] || r.status}</St>
            </div>
          ))}
        </div>
      ) : null}
    </Panel>
  );
}
