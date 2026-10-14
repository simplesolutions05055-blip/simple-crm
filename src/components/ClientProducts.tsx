"use client";
/* Products on a client card: what was sold (one-off and/or retainer), the list price for the
   record, the supplier and what the supplier costs (monthly or one-off), and the margin.
   Storage keeps the monthly charge generator's meaning of billing/price:
     retainer -> billing 'חודשי', price = monthly price, setup_price = one-off sale price
     one-off  -> billing 'חד-פעמי', price = one-off sale price */
import { useEffect, useMemo, useState } from "react";
import { sb } from "@/lib/supabase/browser";
import { Panel, Modal, St, Empty } from "@/components/Shell";
import Icon from "@/components/Icon";
import { useApp } from "@/components/AppCtx";
import { fmtDate, money, today, type Row, pastePhone } from "@/lib/crm";

export const SUP_BILLING = ["חודשי", "חד-פעמי"] as const;

export const isRetainer = (s: Row) => s.billing === "חודשי";
export const oneoffOf = (s: Row) => Number((isRetainer(s) ? s.setup_price : s.price) || 0);
export const monthlyOf = (s: Row) => (isRetainer(s) ? Number(s.price || 0) : 0);

/* a monthly supplier cost that is still being paid although the client or the product ended */
export function needsStop(s: Row, client?: Row | null) {
  if (s.supplier_billing !== "חודשי" || !s.supplier_active || s.supplier_keep || !Number(s.supplier_cost)) return false;
  const c = client || s.client;
  const clientGone = !!c && (["הסתיים", "עזב"].includes(c.status) || !!c.left_at);
  return clientGone || s.status === "הסתיים";
}

export function useSuppliers() {
  const [rows, setRows] = useState<Row[]>([]);
  const load = async () => {
    const { data } = await sb().from("crm_suppliers").select("*").is("archived_at", null).order("name");
    setRows(data || []);
  };
  useEffect(() => { load(); }, []);
  return { suppliers: rows, reload: load };
}

export function StopAlerts({ rows, onDone, showClient }: { rows: Row[]; onDone: () => void; showClient?: boolean }) {
  const { toast } = useApp();
  if (!rows.length) return null;
  return (
    <Panel icon="alert" title="לעצור תשלום לספק">
      {rows.map((s) => {
        const c = s.client;
        const why = c && (["הסתיים", "עזב"].includes(c.status) || c.left_at)
          ? "הלקוח " + (showClient ? "\"" + c.biz + "\" " : "") + (c.status === "הסתיים" ? "הסתיים" : "עזב") + (c.left_at ? " ב-" + fmtDate(c.left_at) : "")
          : "המוצר הסתיים" + (showClient && c ? " אצל \"" + c.biz + "\"" : "") + (s.end_date ? " ב-" + fmtDate(s.end_date) : "");
        return (
          <div className="lrow" key={s.id}>
            <span className="ic-alert"><Icon n="alert" s={15} /></span>
            <span className="grow"><b>{(s.supplier?.name || "ספק") + " · " + s.name}</b>
              <span className="meta">{why} · {money(s.supplier_cost)} לחודש עדיין פעיל</span></span>
            <button className="btn sm" onClick={async () => {
              const { error } = await sb().from("crm_client_services").update({ supplier_active: false, supplier_stopped_at: today() }).eq("id", s.id);
              if (error) return toast(error.message, true);
              toast("הריטיינר לספק נעצר"); onDone();
            }}>עצירה</button>
            <button className="btn sm ghost" onClick={async () => { await sb().from("crm_client_services").update({ supplier_keep: true }).eq("id", s.id); onDone(); }}>להמשיך</button>
          </div>
        );
      })}
    </Panel>
  );
}

export default function ClientProducts({ clientId, client, svc, onDone }: { clientId: string; client: Row; svc: Row[]; onDone: () => void }) {
  const { suppliers, reload } = useSuppliers();
  const [edit, setEdit] = useState<Row | null | "new">(null);
  const byId = useMemo(() => Object.fromEntries(suppliers.map((s) => [s.id, s])), [suppliers]);
  const { toast } = useApp();
  const alerts = svc.filter((s) => needsStop(s, client)).map((s) => ({ ...s, client, supplier: byId[s.supplier_id] }));

  return (
    <>
      <StopAlerts rows={alerts} onDone={onDone} />
      <Panel icon="pkg" title="מוצרים ושירותים" right={<button className="btn sm primary" onClick={() => setEdit("new")}><Icon n="plus" s={15} />שיוך מוצר</button>}>
        {!svc.length ? <Empty>אין מוצרים. משייכים מוצר מהכפתור למעלה, או שהם נוצרים לבד כשהלקוח חותם על הצעה.</Empty> : svc.map((s) => {
          const sup = byId[s.supplier_id];
          const one = oneoffOf(s), mon = monthlyOf(s), cost = Number(s.supplier_cost || 0);
          const costMon = s.supplier_billing === "חודשי" && s.supplier_active ? cost : 0;
          const costOne = s.supplier_billing === "חד-פעמי" ? cost : 0;
          return (
            <div className="prow" key={s.id}>
              <div className="prow-main">
                <button className="linkish" onClick={() => setEdit(s)} title="עריכה">
                  <b>{s.name}</b>
                  {s.description ? <span className="meta">{s.description}</span> : null}
                </button>
                <div className="prow-nums">
                  {s.list_price ? <span className="meta"><s>{money(s.list_price)}</s></span> : null}
                  {one ? <span><b>{money(one)}</b> <span className="meta">חד פעמי</span></span> : null}
                  {mon ? <span><b>{money(mon)}</b> <span className="meta">לחודש</span></span> : null}
                  {!one && !mon ? <span className="meta">ללא מחיר</span> : null}
                </div>
              </div>
              <div className="prow-sub">
                <span className="meta">{isRetainer(s) ? "ריטיינר · " + (s.end_date ? fmtDate(s.start_date) + " עד " + fmtDate(s.end_date) : "מ-" + fmtDate(s.start_date)) : "חד פעמי · " + fmtDate(s.start_date)}</span>
                {sup || cost ? (
                  <span className="meta">
                    <Icon n="user" s={13} />{sup?.name || "ספק"}{cost ? " · " + money(cost) + (s.supplier_billing === "חודשי" ? " לחודש" : " חד פעמי") : ""}
                    {s.supplier_billing === "חודשי" && cost ? (
                      <label className={"pillck mini" + (s.supplier_active ? " on" : "")} title="ריטיינר ספק פעיל">
                        <input type="checkbox" checked={!!s.supplier_active} onChange={async (e) => {
                          const on = e.target.checked;
                          const { error } = await sb().from("crm_client_services").update({ supplier_active: on, supplier_stopped_at: on ? null : today(), supplier_keep: false }).eq("id", s.id);
                          if (error) return toast(error.message, true);
                          onDone();
                        }} />{s.supplier_active ? "פעיל" : "נעצר " + fmtDate(s.supplier_stopped_at)}
                      </label>
                    ) : null}
                  </span>
                ) : null}
                {mon || one ? <span className="meta">רווח: <b className={mon - costMon < 0 || one - costOne < 0 ? "bad" : "okc"}>
                  {[mon ? money(mon - costMon) + " לחודש" : "", one ? money(one - costOne) + " חד פעמי" : ""].filter(Boolean).join(" · ")}</b></span> : null}
                <select className="inp sm" style={{ width: 100, marginInlineStart: "auto" }} value={s.status} onChange={async (e) => {
                  const patch: Row = { status: e.target.value };
                  if (e.target.value === "הסתיים" && !s.end_date) patch.end_date = today();
                  if (e.target.value === "פעיל") patch.supplier_keep = false;
                  await sb().from("crm_client_services").update(patch).eq("id", s.id); onDone();
                }}>{["פעיל", "מושהה", "הסתיים"].map((x) => <option key={x}>{x}</option>)}</select>
              </div>
            </div>
          );
        })}
      </Panel>
      {edit ? <ProductModal clientId={clientId} row={edit === "new" ? null : edit} suppliers={suppliers} reloadSuppliers={reload}
        onClose={() => setEdit(null)} onDone={() => { setEdit(null); onDone(); }} /> : null}
    </>
  );
}

function ProductModal({ clientId, row, suppliers, reloadSuppliers, onClose, onDone }: {
  clientId: string; row: Row | null; suppliers: Row[]; reloadSuppliers: () => Promise<void>; onClose: () => void; onDone: () => void;
}) {
  const { org, settings, toast } = useApp();
  const products = settings.products;
  const init = row ? {
    name: row.name || "", description: row.description || "", list_price: row.list_price ?? "", oneoff: oneoffOf(row) || "",
    retainer: isRetainer(row), monthly: monthlyOf(row) || "", supplier_id: row.supplier_id || "", supplier_cost: row.supplier_cost ?? "",
    supplier_billing: row.supplier_billing || "חודשי", start_date: row.start_date || today(), end_date: row.end_date || "", pay: false,
  } : { name: products[0] || "", description: "", list_price: "", oneoff: "", retainer: false, monthly: "", supplier_id: "", supplier_cost: "", supplier_billing: "חודשי", start_date: today(), end_date: "", pay: true };
  const [f, setF] = useState<Row>(init);
  const [other, setOther] = useState(!!row && !products.includes(row.name));
  const [newSup, setNewSup] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (p: Row) => setF((x) => ({ ...x, ...p }));
  const num = (v: unknown) => (v === "" || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));

  async function save() {
    if (!String(f.name).trim()) return toast("צריך לבחור מוצר", true);
    if (f.retainer && !num(f.monthly)) return toast("ריטיינר צריך מחיר חודשי", true);
    if (f.end_date && f.end_date < f.start_date) return toast("תאריך הסיום לפני תאריך ההתחלה", true);
    setBusy(true);
    const oneoff = num(f.oneoff);
    const body: Row = {
      name: String(f.name).trim(), description: String(f.description || "").trim(), list_price: num(f.list_price),
      billing: f.retainer ? "חודשי" : "חד-פעמי",
      price: f.retainer ? num(f.monthly) || 0 : oneoff || 0,
      setup_price: f.retainer ? oneoff : null,
      supplier_id: f.supplier_id || null,
      supplier_cost: f.supplier_id || num(f.supplier_cost) ? num(f.supplier_cost) : null,
      supplier_billing: f.supplier_id || num(f.supplier_cost) ? f.supplier_billing : null,
      start_date: f.start_date || today(),
      end_date: f.retainer && f.end_date ? f.end_date : null,
    };
    const res = row
      ? await sb().from("crm_client_services").update(body).eq("id", row.id).select("id").single()
      : await sb().from("crm_client_services").insert({ ...body, org_id: org, client_id: clientId, status: "פעיל" }).select("id").single();
    if (res.error) { setBusy(false); return toast("לא נשמר: " + res.error.message, true); }
    const gross = oneoff ? Math.round(oneoff * (1 + settings.vat / 100)) : 0;
    if (!row && f.pay && oneoff) {
      await sb().from("crm_payments").insert({ org_id: org, client_id: clientId, service_id: res.data.id, what: body.name + ", חד פעמי", amount: gross, due: body.start_date });
    }
    // the one-off payment follows the product: a changed one-off price updates it
    if (row && oneoff !== oneoffOf(row)) {
      if (gross) await sb().from("crm_payments").update({ amount: gross, what: body.name + ", חד פעמי" }).eq("service_id", row.id);
    }
    await sb().from("crm_activities").insert({ org_id: org, client_id: clientId, type: "מערכת", text: (row ? "עודכן מוצר: " : "שויך מוצר: ") + body.name, by: "מערכת" });
    setBusy(false);
    onDone();
  }

  return (
    <Modal title={row ? "עריכת מוצר" : "שיוך מוצר"} icon="pkg" onClose={onClose}>
      <div className="form">
        <label className="field"><span>מוצר</span>
          <select className="inp" value={other ? "__other" : f.name} onChange={(e) => { if (e.target.value === "__other") { setOther(true); set({ name: "" }); } else { setOther(false); set({ name: e.target.value }); } }}>
            {products.map((p) => <option key={p} value={p}>{p}</option>)}
            <option value="__other">אחר…</option>
          </select>
        </label>
        {other ? <label className="field"><span>שם המוצר</span><input className="inp" autoFocus value={f.name} onChange={(e) => set({ name: e.target.value })} /></label> : <span />}
        <label className="field full"><span>תיאור</span><input className="inp" value={f.description} placeholder="מה בדיוק כלול (לא חובה)" onChange={(e) => set({ description: e.target.value })} /></label>
        <label className="field"><span>מחיר מקורי</span><input className="inp" type="number" min={0} value={f.list_price} placeholder="לפני הנחה" onChange={(e) => set({ list_price: e.target.value })} /></label>
        <div className="field full"><span>סוג המוצר</span>
          <div className="tabs" style={{ margin: 0 }}>
            <button type="button" className={"btn sm" + (!f.retainer ? " on" : "")} onClick={() => set({ retainer: false })}>חד פעמי</button>
            <button type="button" className={"btn sm" + (f.retainer ? " on" : "")} onClick={() => set({ retainer: true })}>ריטיינר חודשי</button>
          </div>
        </div>
        {f.retainer ? <label className="field"><span>מחיר חודשי, לפני מע&quot;מ</span><input className="inp" type="number" min={0} value={f.monthly} onChange={(e) => set({ monthly: e.target.value })} /></label> : null}
        <label className="field"><span>{f.retainer ? "הקמה, חד פעמי (לא חובה)" : "מחיר, חד פעמי"}</span><input className="inp" type="number" min={0} value={f.oneoff} placeholder="לפני מע&quot;מ" onChange={(e) => set({ oneoff: e.target.value })} /></label>
        <label className="field"><span>{f.retainer ? "חיוב ראשון בתאריך" : "תאריך"}</span><input className="inp" type="date" value={f.start_date} onChange={(e) => set({ start_date: e.target.value })} /></label>
        {f.retainer ? <label className="field"><span>חיוב אחרון בתאריך (לא חובה)</span><input className="inp" type="date" value={f.end_date} min={f.start_date} onChange={(e) => set({ end_date: e.target.value })} /></label> : null}
        {f.retainer ? <span className="tiny full">החיוב החודשי נוצר ב-1 לכל חודש, מהחודש של החיוב הראשון ועד החודש של החיוב האחרון. בלי תאריך אחרון הוא ממשיך עד שעוצרים.</span> : null}

        <div className="full cgroup" style={{ paddingBottom: 0 }}><b>ספק</b></div>
        <label className="field"><span>ספק</span>
          <select className="inp" value={f.supplier_id} onChange={(e) => {
            if (e.target.value === "__new") return setNewSup(true);
            const sp = suppliers.find((x) => x.id === e.target.value);
            set({ supplier_id: e.target.value, ...(sp && (f.supplier_cost === "" || f.supplier_cost === null) ? { supplier_cost: sp.default_cost || "", supplier_billing: sp.default_billing } : {}) });
          }}>
            <option value="">בלי ספק</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}{s.field ? " · " + s.field : ""}</option>)}
            <option value="__new">+ ספק חדש</option>
          </select>
        </label>
        <label className="field"><span>עלות הספק</span><input className="inp" type="number" min={0} value={f.supplier_cost} disabled={!f.supplier_id} onChange={(e) => set({ supplier_cost: e.target.value })} /></label>
        <div className="field full"><span>העלות לספק היא</span>
          <div className="tabs" style={{ margin: 0 }}>
            {SUP_BILLING.map((b) => <button key={b} type="button" disabled={!f.supplier_id} className={"btn sm" + (f.supplier_billing === b ? " on" : "")} onClick={() => set({ supplier_billing: b })}>{b === "חודשי" ? "חודשית" : "חד פעמית"}</button>)}
          </div>
        </div>
        {!row && num(f.oneoff) ? <label className={"pillck" + (f.pay ? " on" : "")} style={{ alignSelf: "end", justifySelf: "start" }}>
          <input type="checkbox" checked={!!f.pay} onChange={(e) => set({ pay: e.target.checked })} />לפתוח תשלום לגבייה על החלק החד פעמי
        </label> : null}
        <div className="full bar">
          <button className="btn primary" disabled={busy} onClick={save}>{busy ? "שומר…" : "שמירה"}</button>
          <button className="btn ghost" onClick={onClose}>ביטול</button>
          {row ? <button className="btn ghost" style={{ marginInlineStart: "auto" }} onClick={async () => {
            if (!confirm("למחוק את המוצר מהלקוח? תשלומים שכבר נוצרו נשארים.")) return;
            const { error } = await sb().from("crm_client_services").delete().eq("id", row.id);
            if (error) return toast(error.message, true);
            onDone();
          }}><Icon n="trash" s={15} />מחיקה</button> : null}
        </div>
      </div>
      {newSup ? <SupplierModal row={null} onClose={() => setNewSup(false)} onSaved={async (s) => { await reloadSuppliers(); setNewSup(false); set({ supplier_id: s.id, supplier_cost: s.default_cost || "", supplier_billing: s.default_billing }); }} /> : null}
    </Modal>
  );
}

export function SupplierModal({ row, onClose, onSaved }: { row: Row | null; onClose: () => void; onSaved: (s: Row) => void }) {
  const { org, toast } = useApp();
  const [f, setF] = useState<Row>(row ? { ...row } : { name: "", field: "", phone: "", email: "", notes: "", default_cost: "", default_billing: "חודשי" });
  const [busy, setBusy] = useState(false);
  const set = (p: Row) => setF((x) => ({ ...x, ...p }));
  async function save() {
    if (!String(f.name || "").trim()) return toast("צריך שם לספק", true);
    setBusy(true);
    const body = { name: String(f.name).trim(), field: f.field || "", phone: f.phone || null, email: f.email || null, notes: f.notes || "", default_cost: Number(f.default_cost) || 0, default_billing: f.default_billing };
    const res = row
      ? await sb().from("crm_suppliers").update(body).eq("id", row.id).select("*").single()
      : await sb().from("crm_suppliers").insert({ ...body, org_id: org }).select("*").single();
    setBusy(false);
    if (res.error) return toast("לא נשמר: " + res.error.message, true);
    onSaved(res.data);
  }
  return (
    <Modal title={row ? "עריכת ספק" : "ספק חדש"} icon="user" onClose={onClose}>
      <div className="form">
        <label className="field"><span>שם</span><input className="inp" autoFocus value={f.name} onChange={(e) => set({ name: e.target.value })} /></label>
        <label className="field"><span>תחום</span><input className="inp" value={f.field} placeholder="צילום, עיצוב, פיתוח…" onChange={(e) => set({ field: e.target.value })} /></label>
        <label className="field"><span>טלפון</span><input className="inp ltr" type="tel" inputMode="tel" autoComplete="off" value={f.phone || ""} onPaste={(e) => pastePhone(e, (v) => set({ phone: v }))} onChange={(e) => set({ phone: e.target.value.replace(/[^\d+\-\s]/g, "") })} /></label>
        <label className="field"><span>מייל</span><input className="inp ltr" type="email" value={f.email || ""} onChange={(e) => set({ email: e.target.value })} /></label>
        <label className="field"><span>עלות ברירת מחדל</span><input className="inp" type="number" min={0} value={f.default_cost} onChange={(e) => set({ default_cost: e.target.value })} /></label>
        <div className="field"><span>העלות היא</span>
          <div className="tabs" style={{ margin: 0 }}>
            {SUP_BILLING.map((b) => <button key={b} type="button" className={"btn sm" + (f.default_billing === b ? " on" : "")} onClick={() => set({ default_billing: b })}>{b === "חודשי" ? "חודשית" : "חד פעמית"}</button>)}
          </div>
        </div>
        <label className="field full"><span>הערות</span><textarea className="inp" rows={2} value={f.notes} onChange={(e) => set({ notes: e.target.value })} /></label>
        <div className="full bar"><button className="btn primary" disabled={busy} onClick={save}>{busy ? "שומר…" : "שמירה"}</button><button className="btn ghost" onClick={onClose}>ביטול</button></div>
      </div>
    </Modal>
  );
}
