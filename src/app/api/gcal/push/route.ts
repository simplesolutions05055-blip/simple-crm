import { NextResponse, type NextRequest } from "next/server";
import { sbServer } from "@/lib/supabase/server";
import { accessToken, gapi, gcalConfigured, localToRfc } from "@/lib/gcal";

/* POST {task_id, remove?} -> creates / updates / deletes the Google event for a CRM task */
export async function POST(req: NextRequest) {
  if (!gcalConfigured()) return NextResponse.json({ error: "missing" }, { status: 400 });
  const { task_id, remove } = await req.json().catch(() => ({}));
  if (!task_id) return NextResponse.json({ error: "task_id" }, { status: 400 });
  const supa = await sbServer();
  const { data: t, error } = await supa.from("crm_tasks").select("*,lead:crm_leads(name,phone),client:crm_clients(biz,phone)").eq("id", task_id).single();
  if (error || !t) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const token = await accessToken();
    if (remove || t.done) {
      if (t.gcal_event_id) await gapi(token, "/calendars/primary/events/" + encodeURIComponent(t.gcal_event_id), { method: "DELETE" }).catch(() => null);
      await supa.from("crm_tasks").update({ gcal_event_id: null }).eq("id", t.id);
      return NextResponse.json({ ok: true, removed: true });
    }
    const who = t.client?.biz || t.lead?.name || "";
    const phone = t.client?.phone || t.lead?.phone || "";
    const desc = [t.description, who ? "שיוך: " + who : "", phone ? "טלפון: " + phone : "", "נוצר מ-simple-CRM"].filter(Boolean).join("\n");
    const body: Record<string, unknown> = { summary: t.title, description: desc, extendedProperties: { private: { crm_task: t.id } } };
    if (t.start_time) {
      const start = localToRfc(t.due_date, String(t.start_time).slice(0, 5));
      body.start = { dateTime: start, timeZone: "Asia/Jerusalem" };
      body.end = { dateTime: new Date(new Date(start).getTime() + (t.duration_min || 30) * 60000).toISOString(), timeZone: "Asia/Jerusalem" };
    } else {
      const next = new Date(Date.UTC(+t.due_date.slice(0, 4), +t.due_date.slice(5, 7) - 1, +t.due_date.slice(8, 10) + 1)).toISOString().slice(0, 10);
      body.start = { date: t.due_date };
      body.end = { date: next };
    }
    let ev;
    if (t.gcal_event_id) {
      ev = await gapi(token, "/calendars/primary/events/" + encodeURIComponent(t.gcal_event_id), { method: "PATCH", body: JSON.stringify(body) })
        .catch(async (e) => ((e as { status?: number }).status === 404 || (e as { status?: number }).status === 410 ? gapi(token, "/calendars/primary/events", { method: "POST", body: JSON.stringify(body) }) : Promise.reject(e)));
    } else {
      ev = await gapi(token, "/calendars/primary/events", { method: "POST", body: JSON.stringify(body) });
    }
    await supa.from("crm_tasks").update({ gcal_event_id: ev.id }).eq("id", t.id);
    return NextResponse.json({ ok: true, event_id: ev.id, link: ev.htmlLink });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
