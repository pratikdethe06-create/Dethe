import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { passwordResetTokens, users } from "@/db/schema";
import { clientIp, getOrigin, hashToken, randomToken, rateLimit } from "@/lib/auth";
import { emailConfigured, passwordResetEmail, sendEmail } from "@/lib/mailer";
import { isValidEmail, normalizeEmail } from "@/lib/validation";

export const dynamic = "force-dynamic";

const GENERIC = "If an account exists for this email, we've sent a password reset link.";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = normalizeEmail(String(body?.email ?? ""));

  if (!isValidEmail(email)) {
    return NextResponse.json(
      { message: "Enter the email linked to your account.", field: "email" },
      { status: 400 }
    );
  }

  const limit = rateLimit(`forgot:${clientIp(req)}`, 6, 15 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { message: "Too many reset requests. Please try again in a few minutes." },
      { status: 429 }
    );
  }

  const configured = emailConfigured();
  const user = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];

  if (user) {
    // Invalidate previous unused tokens, then issue a fresh 30-minute token.
    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)));

    const token = randomToken(32);
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });

    const link = `${getOrigin(req)}/reset-password?token=${encodeURIComponent(token)}`;
    if (configured) {
      try {
        await sendEmail({ to: user.email, ...passwordResetEmail(user.name, link) });
      } catch (err) {
        console.error("[auth] reset email failed:", err instanceof Error ? err.message : err);
      }
    } else {
      console.log(`[auth] Password reset link for ${user.email}: ${link}`);
    }

    if (process.env.AUTH_DEBUG_RESET_LINKS === "true") {
      return NextResponse.json({ message: GENERIC, emailConfigured: configured, link });
    }
  }

  return NextResponse.json({ message: GENERIC, emailConfigured: configured });
}
