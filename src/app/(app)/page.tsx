"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase/browser";
import { Top, Panel, St, Empty } from "@/components/Shell";
import Icon from "@/components/Icon";
import { STAGES, today, fmtDate, money, ago, QUOTE_STATUS_CLS, type Row } from "@/lib/crm";
import { useApp } from "@/components/AppCtx";

export default function Dashboard() {
  const { settings } = useApp();
  const [d, setD] = useState<Row | null>(null);

  useEffect(() => {
    (async () => {
      const t = today();
      const since = new Date(Date.now() - 7 * 86400000).toISOString();
      const [leads, tasks, quotes, pays, services] = await Promise.all([
        sb().from("crm_leads").select("id,name,biz,stage,created_at,next_step,next_at,last_contact_at").is("archived_at", null),
        sb().from("crm_tasks").select("id,title,due_date,lead_id,client_id").eq("done", false).lte("due_date", t).order("due_date"),
        sb().from("crm_quotes").select("id,no,status,views,sent_at,totals,lead:crm_leads(name,biz),client:crm_clients(biz)").in("status", ["נשלחה", "נצפתה"]).order("sent_at", { ascending: false }),
        sb().from("crm_payments").select("id,what,amount,due,client:crm_clients(id,biz)").is("paid_at", null).lte("due", t).order("due"),
        sb().from("crm_client_services").select("price,billing,status,client:crm_clients(status)").eq("billing", "חודשי").eq("status", "פעיל"),
      ]);
      const L = leads.data || [];
      const mrr = (services.data || []).filter((s: Row) => s.client && ["בקליטה", "פעיל", "בסיכון"].includes(s.client.status)).reduce((a: number, s: Row) => a + Number(s.price), 0);
      setD({
        newLeads: L.filter((l: Row) => l.created_at >= since).length,
        untouched: L.filter((l: Row) => l.stage === "חדש" && !l.last_contact_at),
        pipe: STAGES.map((s) => ({ s, n: L.filter((l: Row) => l.stage === s).length })),
        next: L.filter((l: Row) => l.next_at && l.next_at <= t && !["לקוח", "נפסל"].includes(l.stage)).sort((a: Row, b: Row) => a.next_at.localeCompare(b.next_at)),
        tasks: tasks.data || [],
        quotes: quotes.data || [],
        pays: pays.data || [],
        mrr,
      });
    })();
  }, []);

  if (!d) return <><Top title="לוח בקרה" /><div className="content"><div className="loading" style={{ minHeight: 200 }}>טוען…</div></div></>;
  const maxPipe = Math.max(1, ...d.pipe.map((p: Row) => p.n));
  const overdueSum = d.pays.reduce((a: number, p: Row) => a + Number(p.amount), 0);

  return (
    <>
      <Top title="לוח בקרה" sub={new Date().toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" })} />
      <div className="content">
        <div className="grid g4">
          <Kpi icon="target" v={d.newLeads} l="לידים חדשים, 7 ימים" c="var(--navy)" href="/leads" />
          <Kpi icon="file" v={d.quotes.length} l="הצעות פתוחות" c="var(--gold)" href="/quotes" />
          <Kpi icon="repeat" v={money(d.mrr)} l='הכנסה חודשית קבועה, לפני מע"מ' c="var(--ok)" href="/clients" />
          <Kpi icon="wallet" v={d.pays.length ? money(overdueSum) : "0"} l="תשלומים שמועדם עבר" c={d.pays.length ? "var(--bad)" : "var(--muted)"} href="/clients" />
        </div>

        <Panel icon="trend" title="צינור הלידים" right={<Link className="btn sm" href="/leads">ללוח הלידים</Link>}>
          <div className="pipe">
            {d.pipe.map((p: Row) => (
              <div key={p.s}>
                <span className="sub">{p.s}</span>
                <b>{p.n}</b>
                <span className="track"><i style={{ width: (p.n / maxPipe) * 100 + "%" }} /></span>
              </div>
            ))}
          </div>
        </Panel>

        <div className="grid g2">
          <div className="col">
            <Panel icon="flag" title="להיום">
              {!d.tasks.length && !d.next.length && !d.untouched.length ? <Empty>אין משימות או צעדים פתוחים להיום</Empty> : null}
              {d.untouched.map((l: Row) => (
                <Link key={"u" + l.id} href={"/leads/" + l.id} className="lrow link" style={{ textDecoration: "none", color: "inherit" }}>
                  <Icon n="alert" className="bad-i" />
                  <span className="grow"><b>{l.name}{l.biz ? " · " + l.biz : ""}</b><span className="meta bad">ליד חדש שעוד לא נוצר איתו קשר · {ago(l.created_at)}</span></span>
                </Link>
              ))}
              {d.next.map((l: Row) => (
                <Link key={"n" + l.id} href={"/leads/" + l.id} className="lrow link" style={{ textDecoration: "none", color: "inherit" }}>
                  <Icon n="flag" />
                  <span className="grow"><b>{l.next_step || "צעד הבא"}</b><span className="meta">{l.name} · {fmtDate(l.next_at)}</span></span>
                  {l.next_at < today() ? <St cls="bad">באיחור</St> : <St cls="gold">היום</St>}
                </Link>
              ))}
              {d.tasks.map((t: Row) => (
                <Link key={"t" + t.id} href="/tasks" className="lrow link" style={{ textDecoration: "none", color: "inherit" }}>
                  <Icon n="tasks" />
                  <span className="grow"><b>{t.title}</b><span className="meta">משימה · {fmtDate(t.due_date)}</span></span>
                  {t.due_date < today() ? <St cls="bad">באיחור</St> : <St cls="gold">היום</St>}
                </Link>
              ))}
            </Panel>
          </div>
          <div className="col">
            <Panel icon="file" title="הצעות שמחכות לתשובה">
              {!d.quotes.length ? <Empty>אין הצעות פתוחות</Empty> : null}
              {d.quotes.map((q: Row) => (
                <Link key={q.id} href={"/quotes/" + q.id} className="lrow link" style={{ textDecoration: "none", color: "inherit" }}>
                  <span className="grow"><b>{q.client?.biz || q.lead?.biz || q.lead?.name || "הצעה"} · {q.no}</b>
                    <span className="meta"><Icon n="eye" s={14} />{q.views} צפיות · נשלחה {ago(q.sent_at)}</span></span>
                  <St cls={QUOTE_STATUS_CLS[q.status]}>{q.status}</St>
                </Link>
              ))}
            </Panel>
            <Panel icon="wallet" title="גבייה">
              {!d.pays.length ? <Empty>אין תשלומים פתוחים שמועדם עבר</Empty> : null}
              {d.pays.map((p: Row) => (
                <Link key={p.id} href={"/clients/" + p.client?.id} className="lrow link" style={{ textDecoration: "none", color: "inherit" }}>
                  <span className="grow"><b>{p.client?.biz}</b><span className="meta bad">{p.what} · {fmtDate(p.due)}</span></span>
                  <b>{money(p.amount)}</b>
                </Link>
              ))}
            </Panel>
          </div>
        </div>
        <p className="tiny">מע&quot;מ במערכת: {settings.vat}%</p>
      </div>
    </>
  );
}

function Kpi({ icon, v, l, c, href }: { icon: string; v: React.ReactNode; l: string; c: string; href: string }) {
  return (
    <Link href={href} className="panel kpi" style={{ textDecoration: "none", color: "inherit" }}>
      <div className="top-row"><span className="kic" style={{ color: c }}><Icon n={icon} /></span></div>
      <span className="v">{v}</span>
      <span className="lbl2">{l}</span>
    </Link>
  );
}
