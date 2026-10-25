import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = [/^\/login/, /^\/auth\//, /^\/q\//, /^\/f\//, /^\/a\//, /^\/api\/(sign|reject|n8n|wa|noa)(\/|$)/, /^\/api\/ads\/(cron|creative|webhook|approve)(\/|$)/];

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (PUBLIC.some((r) => r.test(path))) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  // getClaims checks the token's signature locally when the project signs with asymmetric keys,
  // so a page load does not wait on a round trip to the auth server (it falls back to one otherwise)
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:png|jpg|svg|ico|webp)$).*)"],
};
