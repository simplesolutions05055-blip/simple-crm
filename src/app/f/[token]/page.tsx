import type { Metadata } from "next";
import { sbAnon, sbServer } from "@/lib/supabase/server";
import PublicIntake from "./PublicIntake";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "שאלון אפיון · Simple Solution", robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const clean = (token || "").toLowerCase().replace(/[^a-f0-9]/g, "").slice(0, 32);
  // the owner checking his own link does not count as the client opening it
  const { data: me } = await (await sbServer()).auth.getUser();
  const { data } = clean.length === 32 ? await sbAnon().rpc("crm_public_intake", { p_token: clean, p_track: !me.user }) : { data: null };
  if (!data || !data.form?.sections) {
    return (
      <div className="ipub"><div className="icard istate">השאלון לא נמצא. אם קיבלתם קישור, בקשו קישור חדש.</div></div>
    );
  }
  return <PublicIntake token={clean} data={data} />;
}
