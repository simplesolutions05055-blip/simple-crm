/* the nightly Simple Ads run (pg_cron at 02:30 UTC calls this with the server key):
   webhook registration, per campaign the night's numbers + the daily rules, a backup sync of leads,
   and a retry for drafts that were approved but did not go up. Answers at once and works after the response. */
import { NextResponse, after, type NextRequest } from "next/server";
import { allOrgs, backupLeads, ensureWebhook, publishDraft, runCampaign } from "@/lib/ads-actions";
import { campaignTree, checkCronKey, day, job } from "@/lib/ads-server";
import { accountsFor } from "@/lib/zernio";

export const maxDuration = 300;
type J = Record<string, unknown>;

async function run(origin: string, only?: string) {
  try { await ensureWebhook(origin); } catch (e) { console.error("ads webhook register", (e as Error).message); }
  for (const info of await allOrgs()) {
    if (only && info.org_id !== only) continue;
    const accs = await accountsFor(info.profile_id).catch(() => null);
    for (const row of info.campaigns) {
      if (row.disconnected) {
        /* back to work once the account shows as connected again */
        const acc = accs?.find((a) => a.id === row.account_id);
        if (!acc?.active) continue;
        await job("campaign_patch", info.org_id, { campaign: row.campaign_id, disconnected: false });
        await job("log", info.org_id, { action: "account:reconnected", name: String(row.name || ""), reason: "החשבון מחובר שוב. המערכת חוזרת לעבוד", campaign_id: row.campaign_id });
      }
      try { await runCampaign(info, row, origin); }
      catch (e) {
        await job("log", info.org_id, { action: "engine:error", ok: false, name: String(row.name || ""), reason: "הבדיקה הלילית נכשלה, תנסה שוב מחר: " + (e as Error).message.slice(0, 300), campaign_id: row.campaign_id }).catch(() => undefined);
      }
    }
    try { await backupLeads(info); } catch (e) { console.error("ads lead backup", (e as Error).message); }
    /* approved drafts that did not go up (an error, or approved from the email while Meta was busy) */
    const approved = ((await job<J[]>("drafts", info.org_id, { status: ["approved"] }).catch(() => [])) || []).filter((d) => !d.ad_id);
    for (const d of approved) {
      const row = info.campaigns.find((c) => c.campaign_id === d.campaign_id) || {};
      const now = new Date();
      const c = await campaignTree(info.profile_id, String(d.campaign_id), day(new Date(now.getTime() - 6 * 86400000)), day(now)).catch(() => null);
      if (c) await publishDraft(info.org_id, d, c, row, "מערכת");
    }
  }
}

export async function POST(req: NextRequest) {
  if (!checkCronKey(req.headers.get("x-cron-key"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as J;
  const origin = req.nextUrl.origin;
  after(() => run(origin, typeof b.org === "string" ? b.org : undefined));
  return NextResponse.json({ ok: true, started: true }, { status: 202 });
}
