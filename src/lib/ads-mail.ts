/* emails from the ads engine through the business's own Gmail (address in settings, app password in Vault):
   the approval link for a new ad, and alerts (an ad rejected by Meta, the ad account disconnected) */
import nodemailer from "nodemailer";
import { job } from "@/lib/ads-server";

type J = Record<string, unknown>;
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://app.simple-solution.co.il").replace(/\/$/, "");

export type EngineSettings = { smtp_user?: string; notify_email?: string; business?: string; site?: string; colors?: string; logo_url?: string; brand_in_ads?: boolean; phone?: string };

async function transport(org: string, engine: EngineSettings) {
  const user = String(engine.smtp_user || "").trim();
  if (!user) return null;
  const pass = await job<string | null>("secret", org, { name: "smtp_app_password" }).catch(() => null);
  if (!pass) return null;
  return { t: nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass: String(pass).replace(/\s+/g, "") } }), user };
}

const shell = (title: string, inner: string) => `<!doctype html><html dir="rtl" lang="he"><body style="margin:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#1d2433">
<div style="max-width:560px;margin:0 auto;padding:24px 16px"><div style="background:#fff;border-radius:14px;padding:22px;border:1px solid #e3e7f0">
<h2 style="margin:0 0 12px;font-size:20px">${esc(title)}</h2>${inner}</div>
<p style="font-size:12px;color:#7a8299;text-align:center">נשלח ממערכת המודעות של ה-CRM</p></div></body></html>`;

export async function sendMail(org: string, engine: EngineSettings, subject: string, title: string, inner: string): Promise<string> {
  const tr = await transport(org, engine);
  if (!tr) return "no_smtp";
  const to = String(engine.notify_email || tr.user).trim();
  await tr.t.sendMail({ from: tr.user, to, subject, html: shell(title, inner) });
  return "";
}

/* the approval email: the ad itself, why the system wants it, and one link to the approval page */
export async function sendApproval(org: string, engine: EngineSettings, d: J, campaignName: string): Promise<string> {
  const c = (d.copy || {}) as J;
  const link = APP_URL + "/a/" + encodeURIComponent(String(d.token || ""));
  const inner = `<p style="margin:0 0 6px;color:#4a5370">קמפיין: <b>${esc(campaignName)}</b></p>
<p style="margin:0 0 14px;background:#fff7e6;border-radius:8px;padding:10px;font-size:14px"><b>למה:</b> ${esc(d.reason)}</p>
${d.image_feed ? `<img src="${esc(d.image_feed)}" alt="" style="width:100%;border-radius:10px;display:block;margin-bottom:12px">` : ""}
<p style="margin:0 0 6px;font-size:15px;white-space:pre-wrap">${esc(c.meta_body)}</p>
<p style="margin:0 0 18px;font-weight:bold">${esc(c.meta_headline)}</p>
<a href="${esc(link)}" style="display:inline-block;background:#1f3c88;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:bold">לצפייה ואישור</a>
<p style="font-size:12px;color:#7a8299;margin-top:14px">בעמוד אפשר לאשר, לבקש שינוי או לדחות. המודעה עולה רק אחרי אישור, והמודעה הקודמת נעצרת רק אחרי שהחדשה עלתה. הקישור אישי, אל תעביר אותו.</p>`;
  return sendMail(org, engine, "מודעה חדשה ממתינה לאישור: " + campaignName, "מודעה חדשה ממתינה לאישור שלך", inner);
}

export async function sendAlert(org: string, engine: EngineSettings, subject: string, text: string, linkPath = "/ads"): Promise<string> {
  const inner = `<p style="font-size:15px;white-space:pre-wrap">${esc(text)}</p><a href="${esc(APP_URL + linkPath)}" style="display:inline-block;background:#1f3c88;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px">לכניסה ל-CRM</a>`;
  return sendMail(org, engine, subject, subject, inner).catch((e) => (e as Error).message);
}
