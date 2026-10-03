"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { sb } from "@/lib/supabase/browser";
import { DEFAULT_PRICING, DEFAULT_TEMPLATE, withPricing, withTemplate, type Pricing, type Template } from "@/lib/quote-engine";
import type { Row } from "@/lib/crm";

export type Settings = { vat: number; valid_days: number; wa_template: string; n8n_webhook: string | null; onboarding: string[]; pricing: Pricing; template: Template; wa: Row; agency: Row; gcal: Row };
type Ctx = {
  org: string;
  email: string;
  settings: Settings;
  saveSettings: (patch: Partial<Row>) => Promise<boolean>;
  toast: (msg: string, bad?: boolean) => void;
  counts: { tasksDue: number };
  refreshCounts: () => void;
};
const C = createContext<Ctx | null>(null);
export function useApp() {
  const c = useContext(C);
  if (!c) throw new Error("no app context");
  return c;
}

export default function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ org: string; email: string; settings: Settings } | null>(null);
  const [err, setErr] = useState("");
  const [t, setT] = useState<{ msg: string; bad?: boolean } | null>(null);
  const [counts, setCounts] = useState({ tasksDue: 0 });

  const toast = useCallback((msg: string, bad?: boolean) => {
    setT({ msg, bad });
    setTimeout(() => setT(null), 2600);
  }, []);

  const refreshCounts = useCallback(async () => {
    const { count } = await sb().from("crm_tasks").select("id", { count: "exact", head: true }).eq("done", false).lte("due_date", new Date().toISOString().slice(0, 10));
    setCounts({ tasksDue: count || 0 });
  }, []);

  useEffect(() => {
    (async () => {
      const { data: u } = await sb().auth.getUser();
      // remember this address for the login screen's quick-pick list
      try {
        const e = (u.user?.email || "").toLowerCase();
        if (e) {
          const list: string[] = JSON.parse(localStorage.getItem("sscrm_emails") || "[]");
          localStorage.setItem("sscrm_emails", JSON.stringify([e, ...list.filter((x) => x !== e)].slice(0, 5)));
        }
      } catch { /* private mode */ }
      const { data: m, error } = await sb().from("crm_members").select("org_id").limit(1);
      if (error || !m?.length) {
        setErr("המשתמש " + (u.user?.email || "") + " לא מורשה למערכת.");
        return;
      }
      const org = m[0].org_id as string;
      const { data: s } = await sb().from("crm_settings").select("*").eq("org_id", org).single();
      const row = (s || {}) as Row;
      // first run: write the template's price list and texts into settings
      const patch: Row = {};
      if (!row.pricing || !row.pricing.tracks) patch.pricing = DEFAULT_PRICING;
      if (!row.quote_template || !row.quote_template.owner) patch.quote_template = { ...DEFAULT_TEMPLATE, ...(row.quote_template?.owner ? row.quote_template : {}) };
      if (Object.keys(patch).length) await sb().from("crm_settings").update(patch).eq("org_id", org);
      setState({
        org,
        email: u.user?.email || "",
        settings: {
          vat: Number(row.vat ?? 18),
          valid_days: Number(row.valid_days ?? 14),
          wa_template: row.wa_template || "",
          n8n_webhook: row.n8n_webhook || null,
          onboarding: row.onboarding || [],
          wa: row.wa || {},
          agency: row.agency || {},
          gcal: row.gcal || {},
          pricing: withPricing(patch.pricing || row.pricing),
          template: withTemplate(patch.quote_template || row.quote_template),
        },
      });
      refreshCounts();
    })();
  }, [refreshCounts]);

  const saveSettings = useCallback(async (p: Partial<Row>) => {
    if (!state) return false;
    const db: Row = { ...p, updated_at: new Date().toISOString() };
    if ("template" in db) { db.quote_template = db.template; delete db.template; }
    const { error } = await sb().from("crm_settings").update(db).eq("org_id", state.org);
    if (error) { toast("השמירה נכשלה: " + error.message, true); return false; }
    setState((s) => (s ? { ...s, settings: { ...s.settings, ...(p as Partial<Settings>) } } : s));
    return true;
  }, [state, toast]);

  if (err) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <p>{err}</p>
        <button className="btn" onClick={async () => { await sb().auth.signOut(); location.href = "/login"; }}>יציאה</button>
      </div>
    );
  }
  if (!state) return <div className="loading">טוען…</div>;
  return (
    <C.Provider value={{ ...state, saveSettings, toast, counts, refreshCounts }}>
      {children}
      {t ? <div className={"toast" + (t.bad ? " bad" : "")}>{t.msg}</div> : null}
    </C.Provider>
  );
}
