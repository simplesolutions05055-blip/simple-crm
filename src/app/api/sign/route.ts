import { NextResponse, type NextRequest } from "next/server";
import { sbAnon } from "@/lib/supabase/server";

const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  if (!b) return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  const png = s(b.png, 400000);
  if (!png.startsWith("data:image/png;base64,")) return NextResponse.json({ error: "חסרה חתימה" }, { status: 400 });
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "";
  const { data, error } = await sbAnon().rpc("crm_sign_quote", {
    p_token: s(b.token, 64).replace(/[^a-f0-9]/gi, ""),
    p_name: s(b.name, 120), p_biz: s(b.biz, 160), p_idno: s(b.idno, 20), p_email: s(b.email, 160),
    p_png: png, p_ip: ip, p_ua: s(req.headers.get("user-agent"), 300),
  });
  if (error) {
    const msg = error.message.includes("already signed") ? "ההצעה כבר נחתמה."
      : error.message.includes("not open") ? "ההצעה כבר לא פתוחה לחתימה."
      : error.message.includes("missing") ? "חסרים שם או חתימה." : "החתימה לא נשמרה. נסו שוב.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json(data);
}
