import { NextResponse, type NextRequest } from "next/server";
import { ZERNIO_TZ, accountsFor, profileFor, zapi, zernioConfigured } from "@/lib/zernio";

/* body: { org, content, accountIds: string[], when?: "YYYY-MM-DDTHH:mm" (Israel time; empty = publish now), mediaUrl? } */
export async function POST(req: NextRequest) {
  if (!(await zernioConfigured())) return NextResponse.json({ error: "missing" }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  const org = String(b.org || "");
  const content = String(b.content || "").trim();
  const ids: string[] = Array.isArray(b.accountIds) ? b.accountIds.map(String) : [];
  const when = String(b.when || "");
  const mediaUrl = String(b.mediaUrl || "").trim();
  if (!org || !content || !ids.length) return NextResponse.json({ error: "חסר טקסט או חשבון" }, { status: 400 });
  if (when && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(when)) return NextResponse.json({ error: "תאריך לא תקין" }, { status: 400 });
  if (mediaUrl && !/^https:\/\//.test(mediaUrl)) return NextResponse.json({ error: "קישור למדיה חייב להתחיל ב-https" }, { status: 400 });
  try {
    const profileId = await profileFor(org, false);
    if (!profileId) return NextResponse.json({ error: "אין חשבונות מחוברים" }, { status: 400 });
    /* only accounts that belong to this business's profile */
    const mine = (await accountsFor(profileId)).filter((a) => ids.includes(a.id));
    if (!mine.length) return NextResponse.json({ error: "החשבונות שנבחרו לא שייכים לעסק הזה" }, { status: 400 });
    const body: Record<string, unknown> = {
      content,
      platforms: mine.map((a) => ({ platform: a.platform, accountId: a.id })),
      ...(when ? { scheduledFor: when + ":00", timezone: ZERNIO_TZ } : { publishNow: true }),
      ...(mediaUrl ? { mediaItems: [{ url: mediaUrl }] } : {}),
    };
    const j = await zapi("/posts", { method: "POST", body: JSON.stringify(body) });
    const post = (j.post || {}) as Record<string, unknown>;
    return NextResponse.json({ ok: true, id: post._id || null, status: post.status || null, platforms: post.platforms || [] });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
