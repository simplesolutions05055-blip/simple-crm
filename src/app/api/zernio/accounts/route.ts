import { NextResponse, type NextRequest } from "next/server";
import { accountsFor, ownAccount, profileFor, zapi, zernioConfigured, zfail } from "@/lib/zernio";

export async function GET(req: NextRequest) {
  if (!(await zernioConfigured())) return NextResponse.json({ configured: false, accounts: [] });
  const org = req.nextUrl.searchParams.get("org") || "";
  if (!org) return NextResponse.json({ error: "missing org" }, { status: 400 });
  try {
    const profileId = await profileFor(org, false);
    if (!profileId) return NextResponse.json({ configured: true, accounts: [] });
    return NextResponse.json({ configured: true, accounts: await accountsFor(profileId) });
  } catch (e) {
    const f = zfail(e);
    return NextResponse.json({ configured: true, accounts: [], ...f.body }, { status: f.status });
  }
}

/* disconnect one account of this business: body { org, accountId } */
export async function DELETE(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const org = String(b.org || "");
  const id = String(b.accountId || "");
  if (!org || !id) return NextResponse.json({ error: "חסר חשבון" }, { status: 400 });
  try {
    if (!(await ownAccount(org, id))) return NextResponse.json({ error: "החשבון לא שייך לעסק הזה" }, { status: 403 });
    await zapi("/accounts/" + encodeURIComponent(id), { method: "DELETE" });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const f = zfail(e);
    return NextResponse.json(f.body, { status: f.status });
  }
}
