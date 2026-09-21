import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  SESSION_DAYS_REMEMBER,
  billingOf,
  clientIp,
  createToken,
  hashPassword,
  rateLimit,
  safeUser,
  setSessionCookie,
} from "@/lib/auth";
import { isValidEmail, normalizeEmail, passwordIssue } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim().replace(/\s+/g, " ");
  const email = normalizeEmail(String(body?.email ?? ""));
  const password = String(body?.password ?? "");

  if (name.length < 2 || name.length > 60) {
    return NextResponse.json(
      { message: "Please enter your full name (2–60 characters).", field: "name" },
      { status: 400 }
    );
  }
  if (!isValidEmail(email)) {
    return NextResponse.json(
      { message: "Enter a valid email address.", field: "email" },
      { status: 400 }
    );
  }
  const issue = passwordIssue(password);
  if (issue) {
    return NextResponse.json({ message: issue, field: "password" }, { status: 400 });
  }

  const limit = rateLimit(`signup:${clientIp(req)}`, 10, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { message: "Too many accounts created from this network. Please try again later." },
      { status: 429 }
    );
  }

  const existing = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
  if (existing) {
    return NextResponse.json(
      {
        message: existing.passwordHash
          ? "An account with this email already exists. Sign in instead."
          : "This email already uses Google sign-in. Continue with Google to access your account.",
        field: "email",
        code: existing.passwordHash ? "EXISTS" : "GOOGLE_ONLY",
      },
      { status: 409 }
    );
  }

  const [user] = await db
    .insert(users)
    .values({ name, email, passwordHash: hashPassword(password), lastLoginAt: new Date() })
    .returning();

  const token = await createToken({ userId: user.id, email: user.email }, SESSION_DAYS_REMEMBER);
  const res = NextResponse.json({ user: safeUser(user), billing: billingOf(user) }, { status: 201 });
  setSessionCookie(res, req, token, SESSION_DAYS_REMEMBER);
  return res;
}
