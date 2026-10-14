import { NextResponse, type NextRequest } from "next/server";
import { ownAccount, zapi, zfail } from "@/lib/zernio";

/* audience search for the builder: ?org&accountId&adAccountId&kind=city|interest&q */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const org = p.get("org") || "", accountId = p.get("accountId") || "", q = (p.get("q") || "").trim();
  const kind = p.get("kind") === "interest" ? "interest" : "city";
  if (!org || !accountId || q.length < 2) return NextResponse.json({ results: [] });
  try {
    if (!(await ownAccount(org, accountId))) return NextResponse.json({ error: "no_access" }, { status: 403 });
    const s = new URLSearchParams({ accountId, q, limit: "12", dimension: kind === "city" ? "geo" : "interest" });
    if (kind === "city") { s.set("geoType", "city"); s.set("countryCode", "IL"); }
    if (p.get("adAccountId")) s.set("adAccountId", p.get("adAccountId")!);
    const j = await zapi("/ads/targeting/search?" + s);
    const list = (Array.isArray(j.results) ? j.results : []) as Record<string, unknown>[];
    return NextResponse.json({ results: list.map((r) => ({ id: String(r.id || ""), name: String(r.name || ""), path: Array.isArray(r.path) ? (r.path as string[]).join(" > ") : "", size: typeof r.audienceSize === "number" ? r.audienceSize : null })) });
  } catch (e) {
    const f = zfail(e);
    return NextResponse.json({ results: [], ...f.body }, { status: f.status });
  }
}
