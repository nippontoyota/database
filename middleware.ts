import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Paths reachable without a session at all.
const PUBLIC_PATHS = ["/login", "/auth/confirm"];
// Paths a signed-in user can reach even before finishing MFA setup/challenge.
const MFA_EXEMPT_PATHS = ["/mfa/enroll", "/mfa/verify", "/set-password", "/auth/signout"];

function matches(pathname: string, paths: string[]) {
  return paths.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

// Runs on every request: refreshes the Supabase session cookie, sends signed-out
// visitors to /login, and enforces mandatory TOTP MFA (enrollment, then a code
// challenge on every session that hasn't passed one yet).
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = matches(pathname, PUBLIC_PATHS);
  const isApi = pathname.startsWith("/api");

  if (!user && !isPublic) {
    if (isApi) {
      return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  if (user && !isPublic && !matches(pathname, MFA_EXEMPT_PATHS)) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const needsChallenge = !!aal && aal.nextLevel === "aal2" && aal.currentLevel !== aal.nextLevel;

    if (needsChallenge) {
      if (isApi) return NextResponse.json({ error: "Verification required." }, { status: 401 });
      const url = request.nextUrl.clone();
      url.pathname = "/mfa/verify";
      return NextResponse.redirect(url);
    }

    const { data: factors } = await supabase.auth.mfa.listFactors();
    const hasVerifiedFactor = factors?.totp.some((f) => f.status === "verified");
    if (!hasVerifiedFactor) {
      if (isApi) {
        return NextResponse.json({ error: "Set up two-factor authentication first." }, { status: 401 });
      }
      const url = request.nextUrl.clone();
      url.pathname = "/mfa/enroll";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
