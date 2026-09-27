import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { SESSION_DAYS_REMEMBER, createToken, getOrigin, setSessionCookie } from "@/lib/auth";
import { safeNext } from "@/lib/validation";

export const dynamic = "force-dynamic";

const OAUTH_COOKIE = "vaani_oauth";

interface GoogleProfile {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

/** Step 2 of Google sign-in: exchange the code server-side and create the session. */
export async function GET(req: NextRequest) {
  const origin = getOrigin(req);
  const params = req.nextUrl.searchParams;

  let saved: { state?: string; next?: string } = {};
  try {
    const raw = req.cookies.get(OAUTH_COOKIE)?.value;
    saved = raw ? (JSON.parse(raw) as { state?: string; next?: string }) : {};
  } catch {
    saved = {};
  }
  const next = safeNext(saved.next);

  const fail = (reason: string) => {
    const res = NextResponse.redirect(`${origin}/login?error=${reason}&next=${encodeURIComponent(next)}`);
    res.cookies.set(OAUTH_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  };

  if (params.get("error")) return fail("google_cancelled");

  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state || !saved.state || state !== saved.state) return fail("google_state");

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return fail("google_not_configured");

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${origin}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!tokenRes.ok) {
      console.error("[auth] google token exchange failed:", tokenRes.status, await tokenRes.text().catch(() => ""));
      return fail("google_failed");
    }
    const tokens = (await tokenRes.json()) as { access_token?: string };
    if (!tokens.access_token) return fail("google_failed");

    const profileRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!profileRes.ok) return fail("google_failed");
    const profile = (await profileRes.json()) as GoogleProfile;
    if (!profile.sub || !profile.email) return fail("google_failed");
    if (profile.email_verified === false) return fail("google_unverified");

    const email = profile.email.toLowerCase();
    let user = (await db.select().from(users).where(eq(users.googleId, profile.sub)).limit(1))[0];

    if (!user) {
      const byEmail = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
      if (byEmail) {
        // Link Google to the existing email account.
        [user] = await db
          .update(users)
          .set({
            googleId: profile.sub,
            avatarUrl: byEmail.avatarUrl ?? profile.picture ?? null,
            lastLoginAt: new Date(),
          })
          .where(eq(users.id, byEmail.id))
          .returning();
      } else {
        [user] = await db
          .insert(users)
          .values({
            name: profile.name?.trim() || email.split("@")[0],
            email,
            googleId: profile.sub,
            avatarUrl: profile.picture ?? null,
            passwordHash: null,
            lastLoginAt: new Date(),
          })
          .returning();
      }
    } else {
      await db
        .update(users)
        .set({ lastLoginAt: new Date(), avatarUrl: user.avatarUrl ?? profile.picture ?? null })
        .where(eq(users.id, user.id));
    }

    const token = await createToken({ userId: user.id, email: user.email }, SESSION_DAYS_REMEMBER);
    const res = NextResponse.redirect(`${origin}${next}`);
    setSessionCookie(res, req, token, SESSION_DAYS_REMEMBER);
    res.cookies.set(OAUTH_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  } catch (err) {
    console.error("[auth] google sign-in error:", err instanceof Error ? err.message : err);
    return fail("google_failed");
  }
}
