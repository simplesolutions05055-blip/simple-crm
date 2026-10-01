import { NextResponse, type NextRequest } from "next/server";
import { sbServer } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const raw = req.nextUrl.searchParams.get("next") || "/";
  const [nextPath, nextQuery = ""] = raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("\\") ? raw.split("?") : ["/"];
  const url = req.nextUrl.clone();
  url.search = "";
  if (code) {
    const supabase = await sbServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    url.pathname = error ? "/login" : nextPath;
    if (error) url.searchParams.set("e", "1");
    else if (nextQuery) url.search = "?" + nextQuery;
  } else {
    url.pathname = "/login";
  }
  return NextResponse.redirect(url);
}
