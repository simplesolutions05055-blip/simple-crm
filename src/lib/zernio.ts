/* Zernio (social posting and ads API), server side only. One Zernio profile per business (org); the
   profile id is kept in crm_settings.social.zernio. The API key lives only in the ZERNIO_API_KEY env var. */
import { sbServer } from "@/lib/supabase/server";

const BASE = "https://zernio.com/api/v1";
export const ZERNIO_TZ = "Asia/Jerusalem";
export const ZERNIO_PLATFORMS = ["facebook", "instagram", "tiktok", "linkedin", "youtube"] as const;

export function zernioConfigured() {
  return !!process.env.ZERNIO_API_KEY;
}

type J = Record<string, unknown>;

export async function zapi(path: string, init?: RequestInit): Promise<J> {
  const r = await fetch(BASE + path, {
    ...init,
    headers: { authorization: "Bearer " + process.env.ZERNIO_API_KEY, "content-type": "application/json", ...(init?.headers || {}) },
    cache: "no-store",
  });
  const text = await r.text();
  let j: J = {};
  try { j = text ? JSON.parse(text) : {}; } catch { j = { message: text.slice(0, 300) }; }
  if (!r.ok) throw new Error(String(j.message || j.error || "HTTP " + r.status));
  return j;
}

/* reads the org's social settings through the user's session (RLS decides access) */
async function orgSocial(org: string) {
  const supa = await sbServer();
  const { data, error } = await supa.from("crm_settings").select("social").eq("org_id", org).single();
  if (error || !data) throw new Error("no_access");
  return { supa, social: (data.social || {}) as J };
}

export async function profileFor(org: string, create: boolean): Promise<string | null> {
  const { supa, social } = await orgSocial(org);
  const z = (social.zernio || {}) as J;
  if (z.profile_id) return String(z.profile_id);
  if (!create) return null;
  const j = await zapi("/profiles", { method: "POST", body: JSON.stringify({ name: "Simple CRM " + org.slice(0, 8), externalId: org }) });
  const id = String(((j.profile || {}) as J)._id || "");
  if (!id) throw new Error("profile_create_failed");
  const { error } = await supa.from("crm_settings").update({ social: { ...social, zernio: { ...z, profile_id: id, created_at: new Date().toISOString() } } }).eq("org_id", org);
  if (error) throw new Error(error.message);
  return id;
}

export type ZAccount = { id: string; platform: string; username: string; name: string; active: boolean };

export async function accountsFor(profileId: string): Promise<ZAccount[]> {
  const j = await zapi("/accounts?profileId=" + encodeURIComponent(profileId));
  const list = (Array.isArray(j.accounts) ? j.accounts : Array.isArray(j.data) ? j.data : []) as J[];
  return list
    .filter((a) => {
      const p = a.profileId as unknown;
      const pid = p && typeof p === "object" ? String((p as J)._id || "") : String(p || "");
      return !pid || pid === profileId;
    })
    .map((a) => ({
      id: String(a._id || a.accountId || a.id || ""),
      platform: String(a.platform || ""),
      username: String(a.username || ""),
      name: String(a.displayName || a.selectedPageName || a.name || ""),
      active: a.isActive !== false,
    }))
    .filter((a) => a.id);
}
