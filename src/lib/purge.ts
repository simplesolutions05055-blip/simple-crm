/* permanent client delete, done from the browser one table at a time (child rows first):
   documents and their files, quotes, tasks, AI suggestions, vault items, then the client itself.
   Products, payments, onboarding and history go with the client by cascade.
   withLead: also delete the lead the client came from; otherwise it stays as "סגירת פנייה".
   Returns null when done, or the error to show. */
import { sb } from "@/lib/supabase/browser";
import type { Row } from "@/lib/crm";

export async function purgeClient(c: Row, withLead: boolean, org: string): Promise<string | null> {
  const db = sb();
  const fail = (what: string, e: { message: string } | null) => "לא נמחק (" + what + "): " + (e?.message || "");
  const ors = (col: string, ids: string[]) => (ids.length ? "," + col + ".in.(" + ids.join(",") + ")" : "");
  const { data: ls } = await db.from("crm_leads").select("id").or("client_id.eq." + c.id + (c.lead_id ? ",id.eq." + c.lead_id : ""));
  const leads = (ls || []).map((x: Row) => x.id as string);
  const lw = withLead ? leads : [];
  const { data: qs } = await db.from("crm_quotes").select("id").or("client_id.eq." + c.id + ors("lead_id", lw));
  const qids = (qs || []).map((x: Row) => x.id as string);
  const { data: ds } = await db.from("crm_documents").select("id,path").or("client_id.eq." + c.id + ors("quote_id", qids) + ors("lead_id", lw));
  const paths = (ds || []).map((x: Row) => x.path).filter(Boolean) as string[];
  if (ds?.length) { const r = await db.from("crm_documents").delete().in("id", ds.map((x: Row) => x.id)); if (r.error) return fail("מסמכים", r.error); }
  if (qids.length) {
    await db.from("crm_client_services").update({ quote_id: null }).in("quote_id", qids);
    await db.from("crm_documents").update({ quote_id: null }).in("quote_id", qids);
    await db.from("crm_quotes").update({ replaced_by: null }).in("replaced_by", qids);
    const r = await db.from("crm_quotes").delete().in("id", qids);
    if (r.error) return fail("הצעות מחיר", r.error);
  }
  await db.from("crm_tasks").delete().or("client_id.eq." + c.id + ors("lead_id", lw));
  await db.from("crm_ai_suggestions").delete().or("client_id.eq." + c.id + ors("lead_id", lw));
  const { data: vs } = await db.from("crm_vault_items").select("id").eq("client_id", c.id);
  for (const v of vs || []) { const r = await db.rpc("crm_vault_delete", { p_id: v.id }); if (r.error) return fail("כספת", r.error); }
  if (leads.length) await db.from("crm_leads").update({ client_id: null }).in("id", leads);
  if (c.lead_id) await db.from("crm_clients").update({ lead_id: null }).eq("id", c.id);
  const r = await db.from("crm_clients").delete().eq("id", c.id);
  if (r.error) return fail("לקוח", r.error);
  if (leads.length) {
    if (withLead) await db.from("crm_leads").delete().in("id", leads);
    else {
      await db.from("crm_leads").update({ stage: "סגירת פנייה", reason: "הלקוח נמחק" }).in("id", leads);
      await db.from("crm_leads").update({ archived_at: null }).in("id", leads); // stays archived if an active lead has the same phone
      await db.from("crm_activities").insert(leads.map((l: string) => ({ org_id: org, lead_id: l, type: "מערכת", text: "הלקוח שנוצר מהליד נמחק לצמיתות", by: "מערכת" })));
    }
  }
  if (paths.length) await db.storage.from("crm-docs").remove(paths);
  return null;
}
