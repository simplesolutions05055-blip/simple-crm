/* Zernio (social posting and ads API), server side only. One Zernio profile per business (org); the
   profile id is kept in crm_settings.social.zernio. The API key comes from the ZERNIO_API_KEY env var, or
   from Supabase Vault ("zernio_api_key") through an RPC that also needs the server-only GCAL_SERVER_KEY. */
import { sbAnon, sbServer } from "@/lib/supabase/server";

const BASE = "https://zernio.com/api/v1";
export const ZERNIO_TZ = "Asia/Jerusalem";
export const ZERNIO_PLATFORMS = ["facebook", "instagram", "tiktok", "linkedin", "youtube"] as const;

let cachedKey = "";
async function apiKey(): Promise<string> {
  if (process.env.ZERNIO_API_KEY) return process.env.ZERNIO_API_KEY;
  if (cachedKey) return cachedKey;
  if (!process.env.GCAL_SERVER_KEY) return "";
  /* a signed-in member first; the nightly job and the webhook have no session and use the server-key RPC */
  let data: unknown = null;
  try {
    const supa = await sbServer();
    data = (await supa.rpc("crm_zernio_key", { p_key: process.env.GCAL_SERVER_KEY })).data;
  } catch { /* no request scope (cookies) */ }
  if (!data) data = (await sbAnon().rpc("crm_ads_job", { p_key: process.env.GCAL_SERVER_KEY, p_op: "zernio_key" })).data;
  if (!data) return "";
  cachedKey = String(data);
  return cachedKey;
}

/* the profile's account, after checking it belongs to this business */
export async function ownAccount(org: string, accountId: string) {
  const profileId = await profileFor(org, false);
  if (!profileId) return null;
  return (await accountsFor(profileId)).find((a) => a.id === accountId) || null;
}

export async function zernioConfigured() {
  return !!(await apiKey());
}

type J = Record<string, unknown>;

export class ZError extends Error {
  constructor(msg: string, public status: number, public code: string, public addon: boolean) { super(msg); }
}

/* every write carries an Idempotency-Key, so a retried call never creates a second ad or campaign */
export async function zapi(path: string, init?: RequestInit & { idem?: string }): Promise<J> {
  const { idem, ...rest } = init || {};
  const write = !!rest.method && rest.method !== "GET";
  const r = await fetch(BASE + path, {
    ...rest,
    headers: {
      authorization: "Bearer " + (await apiKey()), "content-type": "application/json",
      ...(write ? { "Idempotency-Key": idem || crypto.randomUUID() } : {}),
      ...((rest.headers as Record<string, string>) || {}),
    },
    cache: "no-store",
  });
  const text = await r.text();
  let j: J = {};
  try { j = text ? JSON.parse(text) : {}; } catch { j = { message: text.slice(0, 300) }; }
  if (!r.ok) {
    const code = String(j.code || j.error_code || "");
    const addon = j.requiresAddon === true || /ADDON/i.test(code);
    throw new ZError(String(j.message || j.error || "HTTP " + r.status), r.status, code, addon);
  }
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

export type ZAccount = {
  id: string; platform: string; username: string; name: string; active: boolean;
  followers: number | null; picture: string; url: string; parent: string;
};
/* ads connections show up in the same list under their own platform names */
export const ADS_PLATFORMS = ["metaads", "tiktokads", "googleads", "linkedinads", "pinterestads", "xads", "redditads"];

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
      active: a.isActive !== false && a.needsReconnection !== true,
      followers: typeof a.followersCount === "number" ? a.followersCount : null,
      picture: String(a.profilePicture || ""),
      url: String(a.profileUrl || ""),
      parent: String(a.parentAccountId || ""),
    }))
    .filter((a) => a.id);
}

/* turns a thrown error into the JSON the screens read: addon = the Zernio plan lacks the add-on */
export function zfail(e: unknown) {
  const m = (e as Error).message;
  if (m === "no_access") return { body: { error: m }, status: 403 };
  if (e instanceof ZError) return { body: { error: m, code: e.code, addon: e.addon || e.status === 402 }, status: e.addon || e.status === 402 ? 402 : 502 };
  return { body: { error: m }, status: 502 };
}
