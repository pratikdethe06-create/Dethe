import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  SESSION_DAYS,
  SESSION_DAYS_REMEMBER,
  billingOf,
  clientIp,
  createToken,
  rateLimit,
  safeUser,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { isValidEmail, normalizeEmail } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = normalizeEmail(String(body?.email ?? ""));
  const password = String(body?.password ?? "");
  const remember = Boolean(body?.remember);

  if (!isValidEmail(email)) {
    return NextResponse.json(
      { message: "Enter a valid email address.", field: "email" },
      { status: 400 }
    );
  }
  if (!password) {
    return NextResponse.json({ message: "Enter your password.", field: "password" }, { status: 400 });
  }

  const limit = rateLimit(`login:${clientIp(req)}:${email}`, 8, 15 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      {
        message: `Too many sign-in attempts. Please try again in ${Math.max(1, Math.ceil(limit.retryAfterSec / 60))} min.`,
      },
      { status: 429 }
    );
  }

  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = rows[0];
  if (!user) {
    return NextResponse.json(
      { message: "No account found with this email. Create one to get started.", field: "email" },
      { status: 401 }
    );
  }
  if (!user.passwordHash) {
    return NextResponse.json(
      {
        message: "This account was created with Google. Please continue with Google to sign in.",
        code: "GOOGLE_ONLY",
      },
      { status: 401 }
    );
  }
  if (!verifyPassword(password, user.passwordHash)) {
    return NextResponse.json(
      { message: "Incorrect password. Please try again.", field: "password" },
      { status: 401 }
    );
  }

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

  const days = remember ? SESSION_DAYS_REMEMBER : SESSION_DAYS;
  const token = await createToken({ userId: user.id, email: user.email }, days);
  const res = NextResponse.json({ user: safeUser(user), billing: billingOf(user) });
  setSessionCookie(res, req, token, days);
  return res;
}
