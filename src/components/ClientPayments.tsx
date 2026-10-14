"use client";
/* Payments on a client card, all amounts incl. VAT:
   first payment · monthly retainer (one row per month) · other payments.
   Each row: paid / not paid, how much was actually paid, and how it was paid. */
import { useMemo, useState } from "react";
import { sb } from "@/lib/supabase/browser";
import { Panel, Empty } from "@/components/Shell";
import Icon from "@/components/Icon";
import { productCatalog } from "@/lib/products";
import { useApp } from "@/components/AppCtx";
import { EditField } from "@/components/Blocks";
import { fmtDate, money, today, type Row } from "@/lib/crm";

export const PAY_METHODS = ["אשראי", "העברה", "צ'ק", "מזומן"] as const;
const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
const ym = (d: string) => (d || "").slice(0, 7);
const addM = (k: string, n: number) => { const [y, m] = k.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); };
const mName = (k: string) => MONTHS[Number(k.slice(5, 7)) - 1] + " " + k.slice(0, 4);

export const paidOf = (p: Row) => (p.paid_at ? Number(p.paid_amount ?? p.amount) : 0);
export const owedOf = (p: Row) => Math.max(0, Number(p.amount || 0) - paidOf(p));

export default function ClientPayments({ client, pays, retainerDefault, until, onSave, onDone }: {
  client: Row; pays: Row[]; retainerDefault: number; until?: string; /* yyyy-mm: the last retainer month, when every retainer product has an end */ onSave: (patch: Row, log?: string) => Promise<void> | void; onDone: () => void;
}) {
  const { org, toast } = useApp();
  const now = ym(today());
  const first = pays.filter((p) => p.kind === "first");
  const monthly = pays.filter((p) => p.kind === "retainer" || p.period);
  const other = pays.filter((p) => !first.includes(p) && !monthly.includes(p));
  const retAmt = Number(client.retainer_amount ?? 0) || retainerDefault;
  const fromKey = client.retainer_from ? ym(client.retainer_from) : monthly.length ? monthly.map((p) => p.period || ym(p.due)).sort()[0] : "";
  const months: string[] = [];
  const last = until && until < addM(now, 1) ? until : addM(now, 1);
  if (fromKey && retAmt) for (let k = fromKey; k <= last && months.length < 60; k = addM(k, 1)) months.push(k);
  // months that have a payment row but fall outside the range still show
  monthly.forEach((p) => { const k = p.period || ym(p.due); if (!months.includes(k)) months.push(k); });
  months.sort();

  const paidTotal = pays.reduce((a, p) => a + paidOf(p), 0);
  const owed = pays.filter((p) => p.due <= today()).reduce((a, p) => a + owedOf(p), 0);

  async function setPaid(p: Row, on: boolean) {
    const patch = on ? { paid_at: p.paid_at || today(), paid_amount: p.paid_amount ?? p.amount } : { paid_at: null, paid_amount: null };
    const { error } = await sb().from("crm_payments").update(patch).eq("id", p.id);
    if (error) return toast(error.message, true);
    onDone();
  }
  async function monthPaid(k: string, row: Row | undefined, on: boolean) {
    if (row) return setPaid(row, on);
    if (!on) return;
    const { error } = await sb().from("crm_payments").insert({
      org_id: org, client_id: client.id, what: "ריטיינר " + k.slice(5, 7) + "/" + k.slice(0, 4), amount: Math.round(retAmt),
      due: k + "-01", period: k, kind: "retainer", paid_at: today(), paid_amount: Math.round(retAmt), method: client.pay_method || null,
    });
    if (error) return toast(error.message, true);
    onDone();
  }
  const upd = async (p: Row, patch: Row) => { const { error } = await sb().from("crm_payments").update(patch).eq("id", p.id); if (error) toast(error.message, true); else onDone(); };

  return (
    <Panel icon="wallet" title="תשלומים" right={<span className="tiny">סכומים כולל מע&quot;מ</span>}>
      <div className="psum">
        <div><small>שולם עד היום</small><b>{money(paidTotal)}</b></div>
        <div><small>עוד לא שולם</small><b className={owed ? "bad" : ""}>{money(owed)}</b></div>
        <div><small>ריטיינר חודשי</small><b>{retAmt ? money(retAmt) : "-"}</b></div>
      </div>
      <label className="field" style={{ maxWidth: 220 }}><span>אופן תשלום</span>
        <select className="inp sm" value={client.pay_method || ""} onChange={(e) => onSave({ pay_method: e.target.value || null }, "אופן תשלום: " + (e.target.value || "לא נקבע"))}>
          <option value="">לא נקבע</option>{PAY_METHODS.map((m) => <option key={m}>{m}</option>)}
        </select>
      </label>

      <div className="prow2 phead"><span /><span>סכום</span><span>שולם בפועל</span><span>אופן</span><span>מצב</span></div>
      <h4 className="psec">תשלום ראשון</h4>
      {first.length ? first.map((p) => <PayRow key={p.id} p={p} onPaid={setPaid} onUpd={upd} />)
        : <AddPayment clientId={client.id} kind="first" label="הגדרת תשלום ראשון" method={client.pay_method} onDone={onDone} />}

      <h4 className="psec">ריטיינר חודשי</h4>
      <div className="f2" style={{ maxWidth: 420 }}>
        <label className="field"><span>סכום חודשי, כולל מע&quot;מ</span>
          <EditField className="inp sm" type="number" value={client.retainer_amount ?? ""} placeholder={retainerDefault ? String(retainerDefault) + " (לפי המוצרים)" : "ללא ריטיינר"}
            onSave={(v) => onSave({ retainer_amount: v === "" ? null : Number(v) || null }, "ריטיינר: " + (v || "לפי המוצרים"))} />
        </label>
        <label className="field"><span>מאיזה חודש</span>
          <input className="inp sm" type="month" value={client.retainer_from ? ym(client.retainer_from) : ""} onChange={(e) => onSave({ retainer_from: e.target.value ? e.target.value + "-01" : null })} />
        </label>
      </div>
      {!months.length ? <Empty>{retAmt ? "בוחרים מאיזה חודש הריטיינר מתחיל" : "אין ריטיינר. כותבים סכום חודשי, או משייכים מוצר עם ריטיינר."}</Empty> : months.map((k) => {
        const row = monthly.find((p) => (p.period || ym(p.due)) === k);
        return row ? <PayRow key={k} p={row} title={mName(k)} onPaid={setPaid} onUpd={upd} />
          : (
            <div className="prow2" key={k}>
              <span className="pw"><b>{mName(k)}</b>{k > now ? <span className="meta">צפוי</span> : null}</span>
              <span className="pa">{money(retAmt)}</span>
              <span className="pp meta">-</span>
              <span className="pm" />
              <PaidToggle on={false} onChange={(v) => monthPaid(k, undefined, v)} />
            </div>
          );
      })}

      <h4 className="psec">תשלומים נוספים</h4>
      {!other.length ? <span className="tiny">אין</span> : other.map((p) => <PayRow key={p.id} p={p} onPaid={setPaid} onUpd={upd} />)}
      <AddPayment clientId={client.id} kind="other" label="תשלום" method={client.pay_method} onDone={onDone} />
    </Panel>
  );
}

function PaidToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <span className="ptog" role="group" aria-label="מצב תשלום">
      <button type="button" className={on ? "y" : ""} onClick={() => !on && onChange(true)}>שולם</button>
      <button type="button" className={!on ? "n" : ""} onClick={() => on && onChange(false)}>לא שולם</button>
    </span>
  );
}

function PayRow({ p, title, onPaid, onUpd }: { p: Row; title?: string; onPaid: (p: Row, on: boolean) => void; onUpd: (p: Row, patch: Row) => void }) {
  const late = !p.paid_at && p.due < today();
  const partial = p.paid_at && Number(p.paid_amount ?? p.amount) < Number(p.amount);
  return (
    <div className="prow2">
      <span className="pw"><b>{title || p.what}</b>
        <span className={"meta" + (late ? " bad" : "")}>{p.paid_at ? "שולם " + fmtDate(p.paid_at) : (late ? "באיחור · " : "לתשלום ") + fmtDate(p.due)}{partial ? " · חלקי" : ""}</span></span>
      <span className="pa"><EditField className="inp sm" type="number" value={p.amount} placeholder="סכום"
        onSave={(v) => { const n = Math.round(Number(v)); if (n > 0) onUpd(p, { amount: n }); }} /></span>
      <span className="pp">
        <EditField className="inp sm" type="number" value={p.paid_at ? p.paid_amount ?? p.amount : ""} placeholder="שולם בפועל"
          onSave={(v) => { const n = v === "" ? null : Number(v); onUpd(p, n ? { paid_amount: n, paid_at: p.paid_at || today() } : { paid_amount: null, paid_at: null }); }} />
      </span>
      <span className="pm">
        <select className="inp sm" value={p.method || ""} onChange={(e) => onUpd(p, { method: e.target.value || null })} aria-label="אופן תשלום">
          <option value="">אופן</option>{PAY_METHODS.map((m) => <option key={m}>{m}</option>)}
        </select>
      </span>
      <PaidToggle on={!!p.paid_at} onChange={(v) => onPaid(p, v)} />
    </div>
  );
}

function AddPayment({ clientId, kind, label, method, onDone }: { clientId: string; kind: "first" | "other"; label: string; method?: string | null; onDone: () => void }) {
  const { org, toast, settings } = useApp();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ what: kind === "first" ? "תשלום ראשון" : "", amount: "", due: today(), method: method || "" });
  const [prod, setProd] = useState("");
  const catalog = useMemo(() => productCatalog(settings.pricing, settings.products), [settings.pricing, settings.products]);
  const g = (n: number) => Math.round(n * (1 + settings.vat / 100));
  if (!open) return <button className="add" onClick={() => setOpen(true)}><Icon n="plus" s={15} />{label}</button>;
  return (
    <div className="addpay">
      <select className="inp sm" aria-label="מוצר" value={prod} onChange={(e) => {
        const v = e.target.value; setProd(v);
        const it = catalog.find((x) => x.name === v);
        if (it) setF({ ...f, what: it.name + (it.kind === "monthly" ? ", חודש ראשון" : ""), amount: it.price ? String(g(it.price)) : f.amount });
        else if (v === "__other") setF({ ...f, what: "" });
      }}>
        <option value="">בחירת מוצר…</option>
        {catalog.map((x) => <option key={x.name} value={x.name}>{x.name}{x.price ? " · " + x.price.toLocaleString("he-IL") + " ₪" + (x.kind === "monthly" ? " לחודש" : "") : ""}</option>)}
        <option value="__other">אחר, הקלדה ידנית</option>
      </select>
      <input className="inp sm" placeholder="על מה" value={f.what} onChange={(e) => setF({ ...f, what: e.target.value })} />
      <input className="inp sm" type="number" placeholder="סכום כולל מע&quot;מ" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
      <input className="inp sm" type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} />
      <select className="inp sm" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}><option value="">אופן תשלום</option>{PAY_METHODS.map((m) => <option key={m}>{m}</option>)}</select>
      <div className="bar">
        <button className="btn sm primary" onClick={async () => {
          const amount = Math.round(Number(f.amount) || 0);
          if (!f.what.trim() || !amount) return toast("צריך תיאור וסכום", true);
          const { error } = await sb().from("crm_payments").insert({ org_id: org, client_id: clientId, what: f.what.trim(), amount, due: f.due, kind, method: f.method || null });
          if (error) return toast(error.message, true);
          setOpen(false); onDone();
        }}>הוספה</button>
        <button className="btn sm ghost" onClick={() => setOpen(false)}>ביטול</button>
      </div>
    </div>
  );
}
