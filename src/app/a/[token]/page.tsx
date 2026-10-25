import type { Metadata } from "next";
import { sbAnon } from "@/lib/supabase/server";
import AdApproval from "./AdApproval";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "אישור מודעה", robots: { index: false, follow: false } };

/* the page behind the approval email: the ad, why, and approve / ask for a change / reject */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = (token || "").toLowerCase().replace(/[^a-f0-9]/g, "").slice(0, 48);
  const { data } = t.length === 48 ? await sbAnon().rpc("crm_ads_draft_token", { p_key: process.env.GCAL_SERVER_KEY || "", p_token: t }) : { data: null };
  if (!data) return <div className="ipub"><div className="icard istate">הקישור לא נמצא.</div></div>;
  const d = data as Record<string, unknown>;
  return (
    <AdApproval t={t} d={{
      status: String(d.status || ""), reason: String(d.reason || ""), campaign: String(d.campaign_name || ""),
      copy: (d.copy || {}) as Record<string, string>, feed: String(d.image_feed || ""), story: String(d.image_story || ""),
      expired: Date.parse(String(d.expires_at || "")) < Date.now(),
    }} />
  );
}
