import type { Metadata } from "next";
import { sbAnon, sbServer } from "@/lib/supabase/server";
import PublicQuote from "./PublicQuote";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "הצעת מחיר · Simple Solution", robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const clean = (token || "").replace(/[^a-f0-9]/gi, "").slice(0, 64);
  // the owner looking at his own link is not a client view
  const { data: me } = await (await sbServer()).auth.getUser();
  const { data } = clean ? await sbAnon().rpc("crm_public_quote", { p_token: clean, p_track: !me.user }) : { data: null };
  if (!data) {
    return (
      <div className="qpub"><div className="state" style={{ justifyContent: "center" }}>ההצעה לא נמצאה. אם קיבלתם קישור, בקשו קישור חדש.</div></div>
    );
  }
  return <PublicQuote token={clean} data={data} />;
}
