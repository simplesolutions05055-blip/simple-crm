import { NextResponse, type NextRequest } from "next/server";
import { accountsFor, profileFor, zernioConfigured } from "@/lib/zernio";

export async function GET(req: NextRequest) {
  if (!zernioConfigured()) return NextResponse.json({ configured: false, accounts: [] });
  const org = req.nextUrl.searchParams.get("org") || "";
  if (!org) return NextResponse.json({ error: "missing org" }, { status: 400 });
  try {
    const profileId = await profileFor(org, false);
    if (!profileId) return NextResponse.json({ configured: true, accounts: [] });
    return NextResponse.json({ configured: true, accounts: await accountsFor(profileId) });
  } catch (e) {
    const m = (e as Error).message;
    return NextResponse.json({ configured: true, accounts: [], error: m }, { status: m === "no_access" ? 403 : 502 });
  }
}
