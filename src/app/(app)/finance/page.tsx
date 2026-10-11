"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { sb } from "@/lib/supabase/browser";
import { Top, Panel, Empty, Modal, St } from "@/components/Shell";
import Icon from "@/components/Icon";
import { useApp } from "@/components/AppCtx";
import { StopAlerts, SupplierModal, needsStop } from "@/components/ClientProducts";
import { buildFlow, monthName, nis0, ym, supplierCostIn, expenseIn, type MonthRow } from "@/lib/finance";
import { fmtDate, today, type Row } from "@/lib/crm";

const TABS = ["סקירה", "הוצאות", "ספקים"] as const;
const CATS = ["משרד", "תוכנות ומנויים", "פרסום", "ציוד", "שכר ופרילנסרים", "רכב", "מקצועי (רו\"ח, עו\"ד)", "כללי"];

export default function Finance() {
  const { settings } = useApp();
  const [tab, setTab] = useState<(typeof TABS)[number]>("סקירה");
  const [data, setData] = useState<{ pays: Row[]; svc: Row[]; exp: Row[]; clients: Row[]; sups: Row[] } | null>(null);
  const now = ym(today());
  const [month, setMonth] = useState(now);

  const load = async () => {
    const [p, s, e, c, u] = await Promise.all([
      sb().from("crm_payments").select("id,amount,due,paid_at,what,client_id"),
      sb().from("crm_client_services").select("*,client:crm_clients(id,biz,status,left_at,archived_at),supplier:crm_suppliers(id,name)"),
      sb().from("crm_expenses").select("*").order("start_date", { ascending: false }),
      sb().from("crm_clients").select("id,biz,status,left_at,churn_reason,archived_at"),
      sb().from("crm_suppliers").select("*").is("archived_at", null).order("name"),
    ]);
    setData({ pays: p.data || [], svc: s.data || [], exp: e.data || [], clients: c.data || [], sups: u.data || [] });
  };
  useEffect(() => { load(); }, []);

  const flow = useMemo(() => (data ? buildFlow(now, settings.vat, data.pays, data.svc, data.exp, data.clients) : []), [data, now, settings.vat]);
  const cur = flow.find((m) => m.key === month) || flow.find((m) => m.current);
  const idx = flow.findIndex((m) => m.key === month);

  return (
    <>
      <Top title="כספים" sub='הכנסות, הוצאות ותזרים. הכל לפי מה שמוזן במערכת, לפני מע"מ.' />
      <div className="content">
        <div className="tabs">{TABS.map((t) => <button key={t} className={"btn sm" + (tab === t ? " on" : "")} onClick={() => setTab(t)}>{t}</button>)}</div>
        {!data || !cur ? <div className="loading" style={{ minHeight: 200 }}>טוען…</div>
          : tab === "סקירה" ? <Overview flow={flow} cur={cur} idx={idx} setMonth={setMonth} data={data} reload={load} />
          : tab === "הוצאות" ? <Expenses data={data} month={month} reload={load} />
          : <Suppliers data={data} reload={load} />}
      </div>
    </>
  );
}

function Overview({ flow, cur, idx, setMonth, data, reload }: { flow: MonthRow[]; cur: MonthRow; idx: number; setMonth: (k: string) => void; data: { svc: Row[]; clients: Row[] }; reload: () => void }) {
  const alerts = data.svc.filter((s) => needsStop(s)).map((s) => s);
  const left = data.clients.filter((c) => c.left_at && flow.some((m) => m.key === ym(c.left_at))).sort((a, b) => b.left_at.localeCompare(a.left_at));
  return (
    <>
      <div className="bar">
        <h2 style={{ fontSize: 18 }}>{monthName(cur.key)}{cur.future ? " · צפי" : ""}</h2>
        <button className="btn sm" disabled={idx <= 0} onClick={() => setMonth(flow[idx - 1].key)}>→ חודש קודם</button>
        <button className="btn sm" disabled={idx >= flow.length - 1} onClick={() => setMonth(flow[idx + 1].key)}>חודש הבא ←</button>
      </div>
      <div className="grid g4">
        <Kpi l={cur.future ? "הכנסות צפויות" : "הכנסות שהתקבלו"} v={nis0(cur.income)} c="var(--navy)" />
        <Kpi l="עוד לגבייה החודש" v={nis0(cur.open)} c="var(--warn)" />
        <Kpi l="הוצאות" v={nis0(cur.suppliers + cur.manual)} c="var(--soft)" sub={"ספקים " + nis0(cur.suppliers) + " · ידניות " + nis0(cur.manual)} />
        <Kpi l="תזרים נטו" v={nis0(cur.net)} c={cur.net < 0 ? "var(--bad)" : "var(--ok)"} />
      </div>

      <StopAlerts rows={alerts} onDone={reload} showClient />

      <Panel icon="trend" title="תזרים 12 חודשים">
        <FlowChart flow={flow} sel={cur.key} onPick={setMonth} />
        <div className="scroll" style={{ marginTop: 14 }}>
          <table className="tbl fin">
            <thead><tr><th>חודש</th><th>הכנסות</th><th>פתוח לגבייה</th><th>הוצאות ספקים</th><th>הוצאות ידניות</th><th>נטו</th><th>יתרה מצטברת</th></tr></thead>
            <tbody>
              {flow.map((m) => (
                <tr key={m.key} className={"click" + (m.future ? " fut" : "") + (m.key === cur.key ? " sel" : "")} onClick={() => setMonth(m.key)}>
                  <td>{m.label}{m.current ? " · החודש" : m.future ? " · צפי" : ""}</td>
                  <td>{nis0(m.income)}</td>
                  <td>{m.open ? nis0(m.open) : "-"}</td>
                  <td>{nis0(m.suppliers)}</td>
                  <td>{nis0(m.manual)}</td>
                  <td className={m.net < 0 ? "neg" : "pos"}>{nis0(m.net)}</td>
                  <td>{nis0(m.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="tiny" style={{ margin: "8px 0 0" }}>הכנסות: תשלומים שסומנו &quot;שולם&quot;, לפי תאריך התשלום. צפי: ריטיינרים פעילים ותשלומים פתוחים. הוצאות ספקים נלקחות מהמוצרים בכרטיסי הלקוחות. היתרה המצטברת מתחילה מאפס בחודש הראשון בטבלה.</p>
      </Panel>

      <Panel icon="user" title="נטישת לקוחות">
        <div className="churn">
          {flow.filter((m) => !m.future).map((m) => (
            <div key={m.key} title={m.label + ": " + m.churn + " לקוחות עזבו"}>
              <span className="cb" style={{ height: Math.min(100, m.churn * 26) + "%" }} />
              <b>{m.churn || ""}</b>
              <small>{m.label}</small>
            </div>
          ))}
        </div>
        {!left.length ? <Empty>אין לקוחות שעזבו בחודשים האלה</Empty> : left.map((c) => (
          <Link key={c.id} href={"/clients/" + c.id} className="lrow link" style={{ textDecoration: "none", color: "inherit" }}>
            <span className="grow"><b>{c.biz}</b><span className="meta">{c.status} ב-{fmtDate(c.left_at)}{c.churn_reason ? " · " + c.churn_reason : ""}</span></span>
          </Link>
        ))}
      </Panel>
    </>
  );
}

function Kpi({ l, v, c, sub }: { l: string; v: string; c: string; sub?: string }) {
  return (
    <div className="panel stat">
      <span className="hi" style={{ color: c, borderColor: c }}><Icon n="wallet" s={18} /></span>
      <div><b>{v}</b><span className="sub">{l}</span>{sub ? <span className="sub tiny">{sub}</span> : null}</div>
    </div>
  );
}

/* grouped bars: income vs expenses per month, one scale, hover/tap shows the month */
function FlowChart({ flow, sel, onPick }: { flow: MonthRow[]; sel: string; onPick: (k: string) => void }) {
  const [hov, setHov] = useState<string | null>(null);
  const max = Math.max(1, ...flow.map((m) => Math.max(m.income, m.suppliers + m.manual)));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const h = hov ? flow.find((m) => m.key === hov) : null;
  return (
    <div className="fchart">
      <div className="legend"><span><i style={{ background: "var(--c-in)" }} />הכנסות</span><span><i style={{ background: "var(--c-out)" }} />הוצאות</span><span className="tiny">חודשים עתידיים: צפי</span></div>
      <div className="fplot">
        <div className="fgrid">{ticks.map((t) => <div key={t} style={{ bottom: (t / top) * 100 + "%" }}><span>{t ? Math.round(t / 1000) + "K" : "0"}</span></div>)}</div>
        <div className="fbars">
          {flow.map((m) => {
            const out = m.suppliers + m.manual;
            return (
              <button key={m.key} className={"fcol" + (m.key === sel ? " sel" : "") + (m.future ? " fut" : "")}
                onMouseEnter={() => setHov(m.key)} onMouseLeave={() => setHov(null)} onFocus={() => setHov(m.key)} onBlur={() => setHov(null)}
                onClick={() => onPick(m.key)} aria-label={m.label + ": הכנסות " + nis0(m.income) + ", הוצאות " + nis0(out)}>
                <span className="b in" style={{ height: (m.income / top) * 100 + "%" }} />
                <span className="b out" style={{ height: (out / top) * 100 + "%" }} />
              </button>
            );
          })}
        </div>
        {h ? <div className="ftip"><b>{monthName(h.key)}{h.future ? " · צפי" : ""}</b><span>הכנסות {nis0(h.income)}</span><span>הוצאות {nis0(h.suppliers + h.manual)}</span><span>נטו {nis0(h.net)}</span></div> : null}
      </div>
      <div className="flabels">{flow.map((m) => <span key={m.key} className={m.key === sel ? "sel" : ""}>{m.label}</span>)}</div>
    </div>
  );
}
function niceStep(max: number) {
  const raw = max / 4;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  return [1, 2, 2.5, 5, 10].map((x) => x * p).find((x) => x >= raw) || raw;
}

function Expenses({ data, month, reload }: { data: { exp: Row[]; svc: Row[] }; month: string; reload: () => void }) {
  const [edit, setEdit] = useState<Row | null | "new">(null);
  const sup = data.svc.filter((s) => supplierCostIn(s, month) > 0);
  const manualNow = data.exp.reduce((a, e) => a + expenseIn(e, month), 0);
  return (
    <>
      <Panel icon="wallet" title="הוצאות ידניות" right={<button className="btn sm primary" onClick={() => setEdit("new")}><Icon n="plus" s={15} />הוצאה</button>}>
        {!data.exp.length ? <Empty>אין הוצאות. מוסיפים הוצאה חודשית קבועה או חד פעמית מהכפתור למעלה.</Empty> : data.exp.map((e) => {
          const ended = e.billing === "חודשי" && e.end_date && e.end_date < today();
          return (
            <button key={e.id} className="lrow link" style={{ width: "100%", background: "none", border: 0, font: "inherit", textAlign: "inherit" }} onClick={() => setEdit(e)}>
              <span className="ic-rep">{e.billing === "חודשי" ? <Icon n="repeat" s={14} /> : "1"}</span>
              <span className="grow"><b>{e.title}</b>
                <span className="meta">{e.category} · {e.billing === "חודשי" ? "חודשי מ-" + fmtDate(e.start_date) + (e.end_date ? " עד " + fmtDate(e.end_date) : "") : "חד פעמי · " + fmtDate(e.start_date)}</span></span>
              {ended ? <St cls="">הסתיים</St> : null}
              <b>{nis0(Number(e.amount))}</b>
            </button>
          );
        })}
        <p className="tiny" style={{ margin: "8px 0 0" }}>בחודש {monthName(month)}: {nis0(manualNow)} הוצאות ידניות.</p>
      </Panel>
      <Panel icon="user" title={"מספקים · " + monthName(month)}>
        {!sup.length ? <Empty>אין עלויות ספקים בחודש הזה</Empty> : sup.map((s) => (
          <Link key={s.id} href={"/clients/" + s.client_id} className="lrow link" style={{ textDecoration: "none", color: "inherit" }}>
            <span className="ic-rep">S</span>
            <span className="grow"><b>{(s.supplier?.name || "ספק") + " · " + s.name}</b><span className="meta">{s.client?.biz} · {s.supplier_billing === "חודשי" ? "חודשי" : "חד פעמי"}{!s.supplier_active ? " · נעצר " + fmtDate(s.supplier_stopped_at) : ""}</span></span>
            <b>{nis0(supplierCostIn(s, month))}</b>
          </Link>
        ))}
        <p className="tiny" style={{ margin: "8px 0 0" }}>נכנס לבד מהמוצרים שבכרטיסי הלקוחות.</p>
      </Panel>
      {edit ? <ExpenseModal row={edit === "new" ? null : edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload(); }} /> : null}
    </>
  );
}

function ExpenseModal({ row, onClose, onDone }: { row: Row | null; onClose: () => void; onDone: () => void }) {
  const { org, toast } = useApp();
  const [f, setF] = useState<Row>(row ? { ...row, end_date: row.end_date || "" } : { title: "", amount: "", category: "כללי", billing: "חודשי", start_date: today(), end_date: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const set = (p: Row) => setF((x) => ({ ...x, ...p }));
  async function save() {
    if (!String(f.title || "").trim() || !Number(f.amount)) return toast("צריך שם וסכום", true);
    setBusy(true);
    const body = { title: String(f.title).trim(), amount: Number(f.amount), category: f.category, billing: f.billing, start_date: f.start_date || today(), end_date: f.billing === "חודשי" && f.end_date ? f.end_date : null, notes: f.notes || "" };
    const res = row ? await sb().from("crm_expenses").update(body).eq("id", row.id) : await sb().from("crm_expenses").insert({ ...body, org_id: org });
    setBusy(false);
    if (res.error) return toast("לא נשמר: " + res.error.message, true);
    onDone();
  }
  return (
    <Modal title={row ? "עריכת הוצאה" : "הוצאה חדשה"} icon="wallet" onClose={onClose}>
      <div className="form">
        <label className="field full"><span>שם ההוצאה</span><input className="inp" autoFocus value={f.title} onChange={(e) => set({ title: e.target.value })} /></label>
        <label className="field"><span>סכום, לפני מע&quot;מ</span><input className="inp" type="number" min={0} value={f.amount} onChange={(e) => set({ amount: e.target.value })} /></label>
        <label className="field"><span>קטגוריה</span><input className="inp" list="exp-cats" value={f.category} onChange={(e) => set({ category: e.target.value })} /></label>
        <datalist id="exp-cats">{CATS.map((c) => <option key={c} value={c} />)}</datalist>
        <div className="field full"><span>סוג</span>
          <div className="tabs" style={{ margin: 0 }}>
            {["חודשי", "חד-פעמי"].map((b) => <button key={b} type="button" className={"btn sm" + (f.billing === b ? " on" : "")} onClick={() => set({ billing: b })}>{b === "חודשי" ? "חודשי" : "חד פעמי"}</button>)}
          </div>
        </div>
        <label className="field"><span>{f.billing === "חודשי" ? "מתאריך" : "תאריך"}</span><input className="inp" type="date" value={f.start_date} onChange={(e) => set({ start_date: e.target.value })} /></label>
        {f.billing === "חודשי" ? <label className="field"><span>עד תאריך (לא חובה)</span><input className="inp" type="date" value={f.end_date} onChange={(e) => set({ end_date: e.target.value })} /></label> : <span />}
        <label className="field full"><span>הערות</span><input className="inp" value={f.notes} onChange={(e) => set({ notes: e.target.value })} /></label>
        <div className="full bar">
          <button className="btn primary" disabled={busy} onClick={save}>{busy ? "שומר…" : "שמירה"}</button>
          <button className="btn ghost" onClick={onClose}>ביטול</button>
          {row ? <button className="btn ghost" style={{ marginInlineStart: "auto" }} onClick={async () => {
            if (!confirm("למחוק את ההוצאה?")) return;
            await sb().from("crm_expenses").delete().eq("id", row.id); onDone();
          }}><Icon n="trash" s={15} />מחיקה</button> : null}
        </div>
      </div>
    </Modal>
  );
}

function Suppliers({ data, reload }: { data: { sups: Row[]; svc: Row[] }; reload: () => void }) {
  const [edit, setEdit] = useState<Row | null | "new">(null);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <Panel icon="user" title="ספקים" right={<button className="btn sm primary" onClick={() => setEdit("new")}><Icon n="plus" s={15} />ספק חדש</button>}>
        {!data.sups.length ? <Empty>אין ספקים. מוסיפים כאן, או ישירות מחלון &quot;שיוך מוצר&quot; בכרטיס לקוח.</Empty> : (
          <div className="scroll">
            <table className="tbl">
              <thead><tr><th>ספק</th><th>תחום</th><th>טלפון</th><th>עלות ברירת מחדל</th><th>פעיל אצל</th><th>לחודש עכשיו</th><th /></tr></thead>
              <tbody>
                {data.sups.map((s) => {
                  const rows = data.svc.filter((x) => x.supplier_id === s.id);
                  const act = rows.filter((x) => x.supplier_billing === "חודשי" ? x.supplier_active : x.status === "פעיל");
                  const mon = rows.filter((x) => x.supplier_billing === "חודשי" && x.supplier_active).reduce((a, x) => a + Number(x.supplier_cost || 0), 0);
                  return [
                    <tr key={s.id} className="click" onClick={() => setOpen(open === s.id ? null : s.id)}>
                      <td><b>{s.name}</b></td><td>{s.field || "-"}</td><td className="ltr" style={{ textAlign: "right" }}>{s.phone || "-"}</td>
                      <td>{s.default_cost ? nis0(Number(s.default_cost)) + (s.default_billing === "חודשי" ? " לחודש" : " חד פעמי") : "-"}</td>
                      <td>{new Set(act.map((x) => x.client_id)).size} לקוחות</td>
                      <td>{mon ? nis0(mon) : "-"}</td>
                      <td><button className="btn sm ghost" onClick={(e) => { e.stopPropagation(); setEdit(s); }}><Icon n="pen" s={14} />עריכה</button></td>
                    </tr>,
                    open === s.id ? (
                      <tr key={s.id + "h"} className="hist"><td colSpan={7}>
                        {!rows.length ? <span className="tiny">אין עדיין מוצרים עם הספק הזה.</span> : (
                          <table className="tbl inner">
                            <thead><tr><th>לקוח · מוצר</th><th>עלות</th><th>מ-</th><th>עד</th><th>מצב</th></tr></thead>
                            <tbody>{rows.map((x) => (
                              <tr key={x.id}>
                                <td><Link href={"/clients/" + x.client_id}>{x.client?.biz}</Link> · {x.name}</td>
                                <td>{nis0(Number(x.supplier_cost || 0))} {x.supplier_billing === "חודשי" ? "לחודש" : "חד פעמי"}</td>
                                <td>{fmtDate(x.start_date)}</td>
                                <td>{x.supplier_billing === "חודשי" ? (x.supplier_active ? "-" : fmtDate(x.supplier_stopped_at)) : "-"}</td>
                                <td>{x.supplier_billing === "חודשי" ? <St cls={x.supplier_active ? (needsStop(x) ? "bad" : "ok") : ""}>{x.supplier_active ? (needsStop(x) ? "לעצור" : "פעיל") : "נעצר"}</St> : <St cls="">חד פעמי</St>}</td>
                              </tr>
                            ))}</tbody>
                          </table>
                        )}
                      </td></tr>
                    ) : null,
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {edit ? <SupplierModal row={edit === "new" ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} /> : null}
    </>
  );
}
