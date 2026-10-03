import { NextResponse, type NextRequest } from "next/server";
import { accessToken, dayBounds, gapi, gcalConfigured } from "@/lib/gcal";

type GEvent = { id: string; summary?: string; location?: string; htmlLink?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string }; extendedProperties?: { private?: Record<string, string> } };

export async function GET(req: NextRequest) {
  if (!gcalConfigured()) return NextResponse.json({ connected: false, reason: "missing" });
  const from = req.nextUrl.searchParams.get("from") || "";
  const to = req.nextUrl.searchParams.get("to") || from;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return NextResponse.json({ error: "bad dates" }, { status: 400 });
  try {
    const token = await accessToken();
    const { timeMin, timeMax } = dayBounds(from, to);
    const q = new URLSearchParams({ timeMin, timeMax, singleEvents: "true", orderBy: "startTime", maxResults: "250", timeZone: "Asia/Jerusalem" });
    const j = await gapi(token, "/calendars/primary/events?" + q.toString());
    const events = ((j?.items || []) as GEvent[]).map((e) => ({
      id: e.id, title: e.summary || "(ללא כותרת)", location: e.location || "", link: e.htmlLink || "",
      start: e.start?.dateTime || e.start?.date || "", end: e.end?.dateTime || e.end?.date || "",
      allDay: !e.start?.dateTime, crmTask: e.extendedProperties?.private?.crm_task || null,
    }));
    return NextResponse.json({ connected: true, events });
  } catch (e) {
    const m = (e as Error).message;
    return NextResponse.json({ connected: m !== "not_connected", reason: m, events: [] });
  }
}
