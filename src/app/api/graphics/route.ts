import { NextResponse, type NextRequest } from "next/server";
import { sbServer } from "@/lib/supabase/server";
import { G_MODELS, G_QUALITY, G_SIZES } from "@/lib/graphics";

/* image models can take a couple of minutes at high quality */
export const maxDuration = 300;

/* body: { org, prompt, overlay?, size, model, quality }. The business's own OpenAI key (Vault) pays for it.
   The image is saved to the public crm-graphics bucket (the networks fetch it by URL when posting) */
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const org = String(b.org || "");
  const prompt = String(b.prompt || "").trim().slice(0, 4000);
  const overlay = String(b.overlay || "").trim().slice(0, 300);
  const size = G_SIZES.some((s) => s[0] === b.size) ? String(b.size) : G_SIZES[0][0];
  const model = G_MODELS.some((m) => m[0] === b.model) ? String(b.model) : G_MODELS[0][0];
  const quality = G_QUALITY.some((q) => q[0] === b.quality) ? String(b.quality) : "high";
  if (!org || !prompt) return NextResponse.json({ error: "כותבים מה לצייר" }, { status: 400 });
  if (!process.env.GCAL_SERVER_KEY) return NextResponse.json({ error: "חסר מפתח שרת" }, { status: 500 });

  const supa = await sbServer();
  const { data: key, error: kerr } = await supa.rpc("crm_org_secret", { p_key: process.env.GCAL_SERVER_KEY, p_org: org, p_name: "openai_api_key" });
  if (kerr) return NextResponse.json({ error: "אין גישה" }, { status: 403 });
  if (!key) return NextResponse.json({ error: "missing_key" }, { status: 400 });

  const full = prompt + "\n\n" + (overlay
    ? "Text in the image: render exactly this Hebrew text, right-to-left, letter for letter as given, and no other text: \"" + overlay + "\""
    : "Do not put any text, letters or logos in the image.");
  const r = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { authorization: "Bearer " + key, "content-type": "application/json" },
    body: JSON.stringify({ model, prompt: full, size, quality, n: 1, output_format: "jpeg", output_compression: 92 }),
    cache: "no-store",
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return NextResponse.json({ error: "OpenAI: " + (j?.error?.message || r.status) }, { status: 502 });
  const b64 = j?.data?.[0]?.b64_json;
  if (!b64) return NextResponse.json({ error: "OpenAI לא החזיר תמונה" }, { status: 502 });

  const id = crypto.randomUUID();
  const path = org + "/" + id + ".jpg";
  const up = await supa.storage.from("crm-graphics").upload(path, Buffer.from(b64, "base64"), { contentType: "image/jpeg", upsert: false });
  if (up.error) return NextResponse.json({ error: "שמירת התמונה נכשלה: " + up.error.message }, { status: 500 });
  const url = supa.storage.from("crm-graphics").getPublicUrl(path).data.publicUrl;
  const { data: row, error } = await supa.from("crm_graphics").insert({ id, org_id: org, prompt, overlay: overlay || null, size, model, path, url }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, graphic: row });
}
