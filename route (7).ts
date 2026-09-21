import { NextRequest, NextResponse } from "next/server";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { passwordResetTokens, users } from "@/db/schema";
import { hashPassword, hashToken } from "@/lib/auth";
import { passwordIssue } from "@/lib/validation";

export const dynamic = "force-dynamic";

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"•".repeat(Math.max(2, local.length - visible.length))}@${domain}`;
}

async function findValidToken(token: string) {
  if (!token || token.length < 20) return null;
  const rows = await db
    .select({ id: passwordResetTokens.id, userId: passwordResetTokens.userId, email: users.email })
    .from(passwordResetTokens)
    .innerJoin(users, eq(users.id, passwordResetTokens.userId))
    .where(
      and(
        eq(passwordResetTokens.tokenHash, hashToken(token)),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, new Date())
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

/** Validate a reset token before showing the form. */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const row = await findValidToken(token);
  if (!row) return NextResponse.json({ valid: false });
  return NextResponse.json({ valid: true, email: maskEmail(row.email) });
}

/** Set a new password using a valid token. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const token = String(body?.token ?? "");
  const password = String(body?.password ?? "");

  const issue = passwordIssue(password);
  if (issue) return NextResponse.json({ message: issue, field: "password" }, { status: 400 });

  const row = await findValidToken(token);
  if (!row) {
    return NextResponse.json(
      { message: "This reset link is invalid or has expired. Please request a new one." },
      { status: 400 }
    );
  }

  await db.update(users).set({ passwordHash: hashPassword(password) }).where(eq(users.id, row.userId));
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(passwordResetTokens.userId, row.userId), isNull(passwordResetTokens.usedAt)));

  return NextResponse.json({ ok: true });
}
