"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { sb } from "@/lib/supabase/browser";
import { Top, Panel, St, Empty, Modal } from "@/components/Shell";
import Icon from "@/components/Icon";
import { useApp } from "@/components/AppCtx";
import { QUOTE_STATUS_CLS, fmtDate, money, type Row } from "@/lib/crm";

const FILTERS = ["הכל", "טיוטה", "נשלחה", "נצפתה", "נחתמה", "נדחתה", "פגה"];

export default function Quotes() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [f, setF] = useState("הכל");
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    (async () => {
      const { data } = await sb().from("crm_quotes").select("id,no,status,totals,views,created_at,sent_at,signed_at,lead:crm_leads(name,biz),client:crm_clients(biz,contact)").order("created_at", { ascending: false });
      setRows(data || []);
    })();
  }, []);
  const list = useMemo(() => (rows || []).filter((r) => f === "הכל" || r.status === f), [rows, f]);
  const signed = (rows || []).filter((r) => r.status === "נחתמה");
  const sent = (rows || []).filter((r) => r.sent_at);

  return (
    <>
      <Top title="הצעות מחיר" sub={rows ? `${sent.length} נשלחו · ${signed.length} נחתמו` : ""} right={<button className="btn primary" onClick={() => setAdding(true)}><Icon n="plus" s={16} />הצעה חדשה</button>} />
      <div className="content">
        <div className="tabs">{FILTERS.map((s) => <button key={s} className={"btn sm" + (f === s ? " on" : "")} onClick={() => setF(s)}>{s}</button>)}</div>
        <Panel>
          {!rows ? <div className="loading" style={{ minHeight: 120 }}>טוען…</div> : !list.length ? <Empty>אין הצעות בתצוגה הזו</Empty> : (
            <div className="scroll">
              <table className="tbl">
                <thead><tr><th>מספר</th><th>עבור</th><th>מה</th><th>לחודש</th><th>חד פעמי</th><th>סטטוס</th><th>צפיות</th><th>תאריך</th></tr></thead>
                <tbody>
                  {list.map((q) => (
                    <tr key={q.id} className="click" onClick={() => router.push("/quotes/" + q.id)}>
                      <td className="mono">{q.no}</td>
                      <td><b>{q.client?.biz || q.lead?.biz || q.lead?.name || "-"}</b><div className="sub">{q.client?.contact || (q.lead?.biz ? q.lead?.name : "")}</div></td>
                      <td>{q.totals?.title?.split(" · ")[0] || "-"}</td>
                      <td>{q.totals?.monthly ? money(q.totals.monthly) : "-"}</td>
                      <td>{q.totals?.oneoff ? money(q.totals.oneoff) : "-"}</td>
                      <td><St cls={QUOTE_STATUS_CLS[q.status]}>{q.status}</St></td>
                      <td>{q.views || 0}</td>
                      <td><span className="meta">{fmtDate(q.signed_at || q.sent_at || q.created_at)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="tiny" style={{ marginTop: 10 }}>הסכומים לפני מע&quot;מ.</p>
        </Panel>
      </div>
      {adding ? <NewQuote onClose={() => setAdding(false)} /> : null}
    </>
  );
}

function NewQuote({ onClose }: { onClose: () => void }) {
  const { org, toast } = useApp();
  const [opts, setOpts] = useState<{ v: string; l: string }[]>([]);
  const [link, setLink] = useState("");
  useEffect(() => {
    (async () => {
      const [l, c] = await Promise.all([
        sb().from("crm_leads").select("id,name,biz,stage").is("archived_at", null).not("stage", "in", "(לקוח,נפסל)").order("created_at", { ascending: false }),
        sb().from("crm_clients").select("id,biz").is("archived_at", null).order("biz"),
      ]);
      setOpts([...(l.data || []).map((x: Row) => ({ v: "l:" + x.id, l: "ליד · " + x.name + (x.biz ? " · " + x.biz : "") + " (" + x.stage + ")" })), ...(c.data || []).map((x: Row) => ({ v: "c:" + x.id, l: "לקוח · " + x.biz }))]);
    })();
  }, []);
  async function create() {
    const { data, error } = await sb().from("crm_quotes").insert({
      org_id: org, lead_id: link.startsWith("l:") ? link.slice(2) : null, client_id: link.startsWith("c:") ? link.slice(2) : null,
    }).select("id").single();
    if (error) return toast(error.message, true);
    location.href = "/quotes/" + data.id;
  }
  return (
    <Modal title="הצעה חדשה" icon="file" onClose={onClose}>
      <label className="field"><span>עבור מי</span>
        <select className="inp" value={link} onChange={(e) => setLink(e.target.value)}>
          <option value="">בחירת ליד או לקוח</option>
          {opts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
      </label>
      <p className="tiny" style={{ margin: 0 }}>ההצעה מקושרת לליד או ללקוח, כדי שחתימה תפתח לקוח ושירותים לבד.</p>
      <div className="bar"><button className="btn primary" disabled={!link} onClick={create}>יצירה</button><button className="btn ghost" onClick={onClose}>ביטול</button></div>
    </Modal>
  );
}
