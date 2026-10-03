/* Google Calendar, server side only. The refresh token lives in Vault and is read through an RPC
   that also needs GCAL_SERVER_KEY, so a browser session alone cannot read it. */
import { sbServer } from "@/lib/supabase/server";

export const GCAL_SCOPES = "openid email https://www.googleapis.com/auth/calendar.events";
export const TZ = "Asia/Jerusalem";

export function gcalConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GCAL_SERVER_KEY);
}

export function redirectUri(origin: string) {
  return origin + "/api/gcal/callback";
}

export async function accessToken(): Promise<string> {
  const supa = await sbServer();
  const { data: refresh, error } = await supa.rpc("crm_gcal_token", { p_key: process.env.GCAL_SERVER_KEY });
  if (error) throw new Error(error.message);
  if (!refresh) throw new Error("not_connected");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: String(refresh), grant_type: "refresh_token",
    }),
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error(j.error === "invalid_grant" ? "reconnect" : "token_failed");
  return j.access_token as string;
}

export async function gapi(token: string, path: string, init?: RequestInit) {
  const r = await fetch("https://www.googleapis.com/calendar/v3" + path, {
    ...init,
    headers: { authorization: "Bearer " + token, "content-type": "application/json", ...(init?.headers || {}) },
    cache: "no-store",
  });
  if (r.status === 204) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j?.error?.message || "google_error"), { status: r.status });
  return j;
}

/* local date "2026-10-04" + "09:30" -> RFC3339 in Israel time (handles summer/winter offset) */
export function localToRfc(date: string, time: string) {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const off = tzOffsetMin(new Date(guess));
  return new Date(guess - off * 60000).toISOString();
}
function tzOffsetMin(at: Date) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(at).reduce<Record<string, string>>((a, x) => ((a[x.type] = x.value), a), {});
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return Math.round((asUtc - at.getTime()) / 60000);
}
export function dayBounds(from: string, to: string) {
  const next = new Date(Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10) + 1)).toISOString().slice(0, 10);
  return { timeMin: localToRfc(from, "00:00"), timeMax: localToRfc(next, "00:00") };
}
