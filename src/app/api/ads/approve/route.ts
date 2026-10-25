/* the one-time approval link from the email (public, the token is the key):
   POST { t, decision: "approved" | "change" | "rejected", note? }. Approved goes up to Meta right away;
   a change request makes a new version with the note. */
import { NextResponse, after, type NextRequest } from "next/server";
import { sbAnon } from "@/lib/supabase/server";
import { fireCreative, orgInfo, publishDraft } from "@/lib/ads-actions";
import { campaignTree, day, job } from "@/lib/ads-server";

export const maxDuration = 60;
type J = Record<string, unknown>;
const str = (v: unknown, max = 500) => String(v ?? "").trim().slice(0, max);

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as J;
  const t = str(b.t, 64).replace(/[^a-f0-9]/g, ""), decision = str(b.decision, 20), note = str(b.note, 1000);
  if (t.length !== 48 || !["approved", "change", "rejected"].includes(decision)) return NextResponse.json({ error: "bad request" }, { status: 400 });
  if (decision === "change" && !note) return NextResponse.json({ error: "כותבים מה לשנות" }, { status: 400 });
  const { data, error } = await sbAnon().rpc("crm_ads_draft_token", { p_key: process.env.GCAL_SERVER_KEY || "", p_token: t, p_decide: decision, p_note: note });
  if (error) return NextResponse.json({ error: error.message.includes("already") ? "ההצעה הזו כבר טופלה או שפג תוקפה" : "לא נשמר" }, { status: 400 });
  const d = (data || null) as J | null;
  if (!d) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
  const org = str(d.org_id, 64);
  if (decision === "approved") {
    const info = await orgInfo(org);
    const row = info?.campaigns.find((c) => c.campaign_id === d.campaign_id) || {};
    const now = new Date();
    const c = info ? await campaignTree(info.profile_id, str(d.campaign_id, 80), day(new Date(now.getTime() - 6 * 86400000)), day(now)).catch(() => null) : null;
    if (!c) return NextResponse.json({ ok: true, note: "אושר. המודעה תעלה בבדיקה הלילית" });
    const r = await publishDraft(org, d, c, row, "משתמש");
    return NextResponse.json(r.ok ? { ok: true, live: true } : { ok: true, note: "אושר, אבל ההעלאה נכשלה: " + r.error + ". ננסה שוב בבדיקה הלילית" });
  }
  if (decision === "change") {
    const nd = await job<J>("draft_new", org, { campaign_id: d.campaign_id, adset_id: d.adset_id, replaces_ad_id: d.replaces_ad_id, kind: d.kind, reason: d.reason, by: "משתמש", brief: { ...((d.brief || {}) as J), change_request: note, previous: d.copy } });
    const origin = req.nextUrl.origin;
    if (nd?.id) after(() => fireCreative(origin, org, String(nd.id)));
    return NextResponse.json({ ok: true, note: "קיבלנו. גרסה חדשה תישלח אליך במייל" });
  }
  return NextResponse.json({ ok: true });
}
