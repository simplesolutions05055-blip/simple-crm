"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { sb } from "@/lib/supabase/browser";
import { Panel, Modal, St, Empty } from "@/components/Shell";
import Icon from "@/components/Icon";
import { useApp } from "@/components/AppCtx";
import { fmtDate, type Row } from "@/lib/crm";
import { INTAKE_FORMS, formByKind, formText, filledCount, type Answers, type IntakeForm } from "@/lib/intake-forms";

/* documents of a lead or a client: intake forms and signed quotes.
   A lead's documents stay visible on the client card after the lead becomes a client. */
export function DocsBox({ leadId, clientId, who }: { leadId?: string; clientId?: string; who: string }) {
  const { org, toast } = useApp();
  const [rows, setRows] = useState<Row[]>([]);
  const [pick, setPick] = useState(false);
  const [open, setOpen] = useState<{ doc: Row | null; form: IntakeForm } | null>(null);

  const load = async () => {
    let q = sb().from("crm_documents").select("id,kind,title,data,quote_id,created_at,updated_at").order("created_at", { ascending: false });
    if (leadId && clientId) q = q.or(`lead_id.eq.${leadId},client_id.eq.${clientId}`);
    else if (leadId) q = q.eq("lead_id", leadId);
    else q = q.eq("client_id", clientId!);
    const { data, error } = await q;
    if (error) return toast("המסמכים לא נטענו: " + error.message, true);
    setRows(data || []);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [leadId, clientId]);

  async function save(doc: Row | null, form: IntakeForm, answers: Answers) {
    const { n, all } = filledCount(form, answers);
    const body = { data: { answers, filled: n, total: all }, updated_at: new Date().toISOString() };
    const res = doc
      ? await sb().from("crm_documents").update(body).eq("id", doc.id).select("id").single()
      : await sb().from("crm_documents").insert({ ...body, org_id: org, lead_id: leadId || null, client_id: clientId || null, kind: "intake:" + form.kind, title: form.title }).select("id").single();
    if (res.error) { toast("האפיון לא נשמר: " + res.error.message, true); return false; }
    await sb().from("crm_activities").insert({ org_id: org, lead_id: leadId || null, client_id: clientId || null, type: "מערכת", text: (doc ? "עודכן: " : "נשמר: ") + form.title, by: "מערכת" });
    toast("נשמר");
    setOpen((o) => (o ? { ...o, doc: { ...(o.doc || {}), id: res.data.id, data: body.data } } : o));
    load();
    return true;
  }

  return (
    <Panel icon="note" title="מסמכים ואפיונים" right={<button className="btn sm primary" onClick={() => setPick(true)}><Icon n="plus" s={15} />אפיון חדש</button>}>
      {!rows.length ? <Empty>אין מסמכים</Empty> : rows.map((d) => {
        const form = d.kind?.startsWith("intake:") ? formByKind(d.kind.slice(7)) : undefined;
        if (d.kind === "quote_signed" && d.quote_id) return (
          <Link key={d.id} href={"/quotes/" + d.quote_id} className="lrow link" style={{ textDecoration: "none", color: "inherit" }}>
            <span className="grow"><b>{d.title}</b><span className="meta">נחתמה {fmtDate(d.created_at)}</span></span>
            <St cls="ok">חתומה</St>
          </Link>
        );
        return (
          <button key={d.id} className="lrow link" style={{ width: "100%", background: "none", border: 0, textAlign: "inherit", font: "inherit" }}
            onClick={() => form && setOpen({ doc: d, form })} disabled={!form}>
            <span className="grow"><b>{d.title}</b><span className="meta">עודכן {fmtDate(d.updated_at || d.created_at)}{d.data?.total ? " · מולאו " + d.data.filled + " מתוך " + d.data.total : ""}</span></span>
            <St cls={d.data?.filled && d.data.filled === d.data.total ? "ok" : "info"}>אפיון</St>
          </button>
        );
      })}

      {pick ? (
        <Modal title="איזה אפיון לפתוח?" icon="note" onClose={() => setPick(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {INTAKE_FORMS.map((f) => (
              <button key={f.kind} className="btn" style={{ justifyContent: "flex-start", height: "auto", padding: "12px 14px", textAlign: "start" }}
                onClick={() => { setPick(false); setOpen({ doc: null, form: f }); }}>
                <span><b style={{ display: "block" }}>{f.title}</b><span className="tiny">{f.intro}</span></span>
              </button>
            ))}
          </div>
        </Modal>
      ) : null}

      {open ? <FormModal key={open.doc?.id || open.form.kind} doc={open.doc} form={open.form} who={who} onSave={(a) => save(open.doc, open.form, a)} onClose={() => setOpen(null)} /> : null}
    </Panel>
  );
}

function FormModal({ doc, form, who, onSave, onClose }: { doc: Row | null; form: IntakeForm; who: string; onSave: (a: Answers) => Promise<boolean>; onClose: () => void }) {
  const [a, setA] = useState<Answers>(() => (doc?.data?.answers as Answers) || {});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const set = (id: string, v: string | string[]) => { setA((x) => ({ ...x, [id]: v })); setDirty(true); };
  const close = () => { if (dirty && !confirm("יש שינויים שלא נשמרו. לסגור בלי לשמור?")) return; onClose(); };
  const { n, all } = filledCount(form, a);

  return (
    <Modal title={form.title} icon="note" onClose={close} wide>
      <p className="tiny" style={{ margin: 0 }}>{form.intro} · מולאו {n} מתוך {all}</p>
      {form.sections.map((s) => (
        <div key={s.title} style={s.internal ? { border: "2px dashed var(--gold-2)", borderRadius: 12, padding: 12 } : undefined}>
          <h3 style={{ fontSize: 15, margin: "4px 0 10px" }}>{s.title}{s.internal ? <span className="tiny"> · לא נשלח ללקוח</span> : null}</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {s.fields.map((f) => {
              const v = a[f.id];
              if (f.t === "r" || f.t === "c") {
                const sel = Array.isArray(v) ? v : v ? [v] : [];
                return (
                  <div key={f.id}><span className="tiny" style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>{f.q}</span>
                    <div className="pills">{f.o!.map((o) => {
                      const on = sel.includes(o);
                      return (
                        <label key={o} className={"pillck" + (on ? " on" : "")}>
                          <input type={f.t === "r" ? "radio" : "checkbox"} name={form.kind + f.id} checked={on}
                            onChange={() => set(f.id, f.t === "r" ? o : on ? sel.filter((x) => x !== o) : [...sel, o])} />{o}
                        </label>
                      );
                    })}</div>
                  </div>
                );
              }
              return (
                <label key={f.id} style={{ display: "block" }}><span className="tiny" style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>{f.q}</span>
                  {f.t === "a"
                    ? <textarea className="inp" rows={3} value={(v as string) || ""} onChange={(e) => set(f.id, e.target.value)} />
                    : <input className="inp" type={f.t === "n" ? "number" : "text"} value={(v as string) || ""} onChange={(e) => set(f.id, e.target.value)} />}
                </label>
              );
            })}
          </div>
        </div>
      ))}
      <div className="bar" style={{ position: "sticky", bottom: -24, background: "var(--surface)", padding: "12px 0 0", justifyContent: "flex-end" }}>
        <button className="btn sm ghost" onClick={async () => {
          try { await navigator.clipboard.writeText(formText(form, a, who)); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ }
        }}><Icon n="copy" s={15} />{copied ? "הועתק" : "העתקה למשרד"}</button>
        <button className="btn sm ghost" onClick={close}>סגירה</button>
        <button className="btn sm primary" disabled={busy} onClick={async () => { setBusy(true); const ok = await onSave(a); setBusy(false); if (ok) setDirty(false); }}>
          <Icon n="check" s={15} />{busy ? "שומר…" : "שמירה"}
        </button>
      </div>
    </Modal>
  );
}
