import { NextResponse, type NextRequest } from "next/server";
import { sbServer } from "@/lib/supabase/server";
import { accountsFor, profileFor, zapi, zfail } from "@/lib/zernio";
import { leadFromForm } from "@/lib/ads-leads";

type J = Record<string, unknown>;
const str = (v: unknown, max = 500) => String(v ?? "").trim().slice(0, max);
const META = ["facebook", "instagram", "metaads"];
const DAYS = 90;

/* takes leads from the business's Meta lead forms (through Zernio) into crm_leads.
   POST { org } -> { ok, added, returned, seen }. Each lead is taken in once (crm_ad_leads_seen);
   a lead whose phone is already open in the CRM is logged as a returning contact, like the website form. */
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as J;
  const org = str(b.org, 64);
  if (!org) return NextResponse.json({ error: "missing org" }, { status: 400 });
  const supa = await sbServer();
  try {
    const profileId = await profileFor(org, false);
    const accs = profileId ? (await accountsFor(profileId)).filter((a) => META.includes(a.platform)) : [];
    if (!accs.length) return NextResponse.json({ ok: true, added: 0, returned: 0, seen: 0, none: true });
    const since = String(Math.floor(Date.now() / 1000) - DAYS * 86400);
    const leads = new Map<string, { l: J; platform: string }>();
    for (const a of accs) {
      let cursor = "";
      for (let page = 0; page < 5; page++) {
        const q = new URLSearchParams({ accountId: a.id, limit: "100", since, ...(cursor ? { cursor } : {}) });
        const j = await zapi("/ads/leads?" + q.toString());
        for (const l of (j.leads || []) as J[]) {
          const ext = str(l.leadgenId || l.id, 120);
          if (ext && !leads.has(ext)) leads.set(ext, { l, platform: a.platform });
        }
        const pg = (j.pagination || {}) as J;
        if (!pg.hasMore || !pg.cursor) break;
        cursor = String(pg.cursor);
      }
    }
    let added = 0, returned = 0, seen = 0;
    const errors: string[] = [];
    for (const [ext, { l, platform }] of leads) {
      const lead = leadFromForm((l.fields || {}) as Record<string, string>, { platform, formName: str(l.formName, 160) });
      if (!lead.name && !lead.phone) { seen++; continue; }
      const { data, error } = await supa.rpc("crm_ingest_ad_lead", { p_org: org, p_ext: ext, p_lead: lead });
      if (error) { errors.push(error.message); if (error.message.includes("not allowed")) break; continue; }
      const r = (data || {}) as J;
      if (r.seen) seen++; else if (r.duplicate) returned++; else added++;
    }
    return NextResponse.json({ ok: !errors.length, added, returned, seen, ...(errors.length ? { error: errors[0] } : {}) });
  } catch (e) {
    const f = zfail(e);
    return NextResponse.json(f.body, { status: f.status });
  }
}
