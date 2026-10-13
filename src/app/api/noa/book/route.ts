/* Noa (the WhatsApp bot) books a phone call in Maor's Google Calendar.
   Called by Make after noa_action created the CRM task.
   POST {secret, task_id, start, end, title, description} -> {booked: true, event_id} | {booked: false}
   The caller proves itself with the bot secret; this route adds the server-side calendar key. */
import { NextResponse, type NextRequest } from "next/server";
import { sbAnon } from "@/lib/supabase/server";
import { gapi } from "@/lib/gcal";

const str = (v: unknown, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(req: NextRequest) {
  const ct = req.headers.get("content-type") || "";
  const b = (ct.includes("application/json")
    ? await req.json().catch(() => ({}))
    : Object.fromEntries((await req.formData().catch(() => new FormData())).entries())) as Record<string, unknown>;
  const secret = str(b.secret, 200);
  const taskId = str(b.task_id, 60);
  const start = str(b.start, 40);
  const end = str(b.end, 40);
  if (!secret || !start || !end || isNaN(Date.parse(start)) || isNaN(Date.parse(end)))
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GCAL_SERVER_KEY)
    return NextResponse.json({ ok: false, error: "calendar not configured" }, { status: 500 });

  const db = sbAnon();
  const { data: refresh, error } = await db.rpc("noa_gcal_token", { p_secret: secret, p_gkey: process.env.GCAL_SERVER_KEY });
  if (error) return NextResponse.json({ ok: false, error: "not allowed" }, { status: 401 });
  if (!refresh) return NextResponse.json({ ok: false, error: "calendar not connected" }, { status: 409 });

  const tr = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: String(refresh), grant_type: "refresh_token",
    }),
  });
  const tj = await tr.json().catch(() => ({}));
  if (!tr.ok || !tj.access_token) return NextResponse.json({ ok: false, error: "calendar token failed" }, { status: 502 });
  const token = tj.access_token as string;

  try {
    // the CRM's scope is calendar.events (no freeBusy), so read the events in the slot instead.
    // all-day events and events marked "free" do not block a call.
    const qs = new URLSearchParams({ timeMin: start, timeMax: end, singleEvents: "true", maxResults: "20" });
    const list = await gapi(token, "/calendars/primary/events?" + qs.toString());
    const busy = ((list?.items || []) as { status?: string; transparency?: string; start?: { dateTime?: string } }[])
      .filter((e) => e.status !== "cancelled" && e.transparency !== "transparent" && !!e.start?.dateTime);
    if (busy.length) {
      if (taskId) await db.rpc("noa_task_booked", { p_secret: secret, p_task: taskId, p_event: null, p_booked: false });
      return NextResponse.json({ ok: true, booked: false });
    }
    const ev = await gapi(token, "/calendars/primary/events", {
      method: "POST",
      body: JSON.stringify({
        summary: str(b.title, 200) || "שיחת טלפון עם ליד",
        description: str(b.description) + "\nנוצר מ-simple-CRM",
        start: { dateTime: start, timeZone: "Asia/Jerusalem" },
        end: { dateTime: end, timeZone: "Asia/Jerusalem" },
        extendedProperties: taskId ? { private: { crm_task: taskId } } : undefined,
      }),
    });
    if (taskId) await db.rpc("noa_task_booked", { p_secret: secret, p_task: taskId, p_event: ev.id, p_booked: true });
    return NextResponse.json({ ok: true, booked: true, event_id: ev.id });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
