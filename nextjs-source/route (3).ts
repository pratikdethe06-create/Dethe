import { NextRequest, NextResponse } from "next/server";
import { getOrigin, randomToken } from "@/lib/auth";
import { safeNext } from "@/lib/validation";

export const dynamic = "force-dynamic";

const OAUTH_COOKIE = "vaani_oauth";

/** Step 1 of Google sign-in: redirect the browser to Google's consent screen. */
export async function GET(req: NextRequest) {
  const origin = getOrigin(req);
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      `${origin}/login?error=google_not_configured&next=${encodeURIComponent(next)}`
    );
  }

  const state = randomToken(24);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${origin}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    include_granted_scopes: "true",
    prompt: "select_account",
  });

  const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  res.cookies.set(OAUTH_COOKIE, JSON.stringify({ state, next }), {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/",
    maxAge: 10 * 60,
  });
  return res;
}
