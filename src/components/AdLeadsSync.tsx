"use client";
/* takes leads from Meta lead-form ads (through Zernio) into the CRM. The leads screen runs it quietly on
   open (at most every few minutes per tab); the ads screen has a button for it. */
import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { useApp } from "@/components/AppCtx";
import type { Row } from "@/lib/crm";

const EVERY = 5 * 60 * 1000;

export async function syncAdLeads(org: string): Promise<Row> {
  const r = await fetch("/api/zernio/ads/leads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ org }) }).catch(() => null);
  const j = r ? await r.json().catch(() => ({})) : {};
  return r && r.ok ? j : { ok: false, error: j.error || (r ? r.status : "no connection") };
}

/* quiet background run; calls onNew when leads were added */
export function useAdLeadsSync(org: string, onNew: () => void) {
  const { toast } = useApp();
  useEffect(() => {
    if (!org) return;
    const k = "adleads:" + org;
    try { if (Date.now() - Number(sessionStorage.getItem(k) || 0) < EVERY) return; sessionStorage.setItem(k, String(Date.now())); } catch { /* no storage: run anyway */ }
    syncAdLeads(org).then((j) => {
      if (j.added > 0) { toast(j.added === 1 ? "נכנס ליד חדש מהמודעות" : "נכנסו " + j.added + " לידים חדשים מהמודעות"); onNew(); }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org]);
}

export function AdLeadsButton() {
  const { org, toast } = useApp();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    const j = await syncAdLeads(org);
    setBusy(false);
    if (!j.ok && j.error) return toast("הלידים לא נמשכו: " + j.error, true);
    if (j.none) return toast("אין עמוד פייסבוק או אינסטגרם מחובר", true);
    toast(j.added ? (j.added === 1 ? "נכנס ליד חדש" : "נכנסו " + j.added + " לידים חדשים") + (j.returned ? " · " + j.returned + " פניות חוזרות" : "") : j.returned ? j.returned + " פניות חוזרות נרשמו בכרטיסים" : "אין לידים חדשים מהטפסים");
  };
  return <button className="btn sm" disabled={busy} onClick={run}><Icon n="download" s={14} />{busy ? "מושך…" : "לידים מהמודעות"}</button>;
}
