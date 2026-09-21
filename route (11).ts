import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { creditLedger } from "@/db/schema";
import { billingOf, getUserWithFreshCredits } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Current credit balance + the last 20 ledger entries (spends and resets). */
export async function GET(req: NextRequest) {
  const user = await getUserWithFreshCredits(req);
  if (!user) {
    return NextResponse.json({ message: "Please login" }, { status: 401 });
  }
  const history = await db
    .select({
      id: creditLedger.id,
      delta: creditLedger.delta,
      balanceAfter: creditLedger.balanceAfter,
      reason: creditLedger.reason,
      words: creditLedger.words,
      meta: creditLedger.meta,
      createdAt: creditLedger.createdAt,
    })
    .from(creditLedger)
    .where(eq(creditLedger.userId, user.id))
    .orderBy(desc(creditLedger.createdAt))
    .limit(20);

  return NextResponse.json({
    ...billingOf(user),
    history: history.map((h) => ({ ...h, createdAt: h.createdAt.toISOString() })),
  });
}
