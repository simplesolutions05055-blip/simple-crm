"use client";
/* closing and reopening work items from any screen: a dated task, or the "הצעד הבא" of a lead or client */
import { sb } from "@/lib/supabase/browser";
import { pushToCalendar } from "./AiPlan";
import type { Row } from "@/lib/crm";

/* mark a task done (or open again). Returns an error message, or "" when it worked.
   A task that sits in Google Calendar leaves the calendar when done and comes back when reopened. */
export async function setTaskDone(task: Row, done: boolean, gcalOn: boolean): Promise<string> {
  const { error } = await sb().from("crm_tasks").update({ done }).eq("id", task.id);
  if (error) return error.message;
  if (gcalOn && task.gcal_event_id) pushToCalendar(task.id, done).catch(() => undefined);
  return "";
}

/* the next step was done: clear it from the card and note it in the card's history */
export async function doneNextStep(org: string, rec: "lead" | "client", id: string, title: string): Promise<string> {
  const table = rec === "lead" ? "crm_leads" : "crm_clients";
  const { error } = await sb().from(table).update({ next_step: null, next_at: null, next_time: null }).eq("id", id);
  if (error) return error.message;
  await sb().from("crm_activities").insert({ org_id: org, [rec === "lead" ? "lead_id" : "client_id"]: id, type: "מערכת", text: "בוצע הצעד הבא: " + (title || "צעד הבא"), by: "מערכת" });
  return "";
}
