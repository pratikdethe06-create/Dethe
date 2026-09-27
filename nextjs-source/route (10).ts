import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { payments, subscriptions } from "@/db/schema";
import { billingOf, getUserWithFreshCredits, safeUser } from "@/lib/auth";
import { PLAN_DEFS, isPlanName } from "@/lib/plans";
import { cancelSubscription, fetchSubscription, razorpayConfigured } from "@/lib/razorpay";
import { activeSubscriptionFor, applySubscriptionState, reconcileUserPlan, summarize } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";

/** Current plan, active subscription, entitlements and recent payments for the dashboard. */
export async function GET(req: NextRequest) {
  const user = await getUserWithFreshCredits(req);
  if (!user) return NextResponse.json({ message: "Please login" }, { status: 401 });

  // Self-heal: if a paid period silently lapsed (missed webhook), reconcile now.
  const fresh = (await reconcileUserPlan(user.id, "plan_sync")) ?? user;
  const active = await activeSubscriptionFor(fresh.id);
  const recent = await db
    .select({
      id: payments.id,
      providerPaymentId: payments.providerPaymentId,
      amountPaise: payments.amountPaise,
      currency: payments.currency,
      status: payments.status,
      method: payments.method,
      description: payments.description,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .where(eq(payments.userId, fresh.id))
    .orderBy(desc(payments.createdAt))
    .limit(12);
  const history = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, fresh.id))
    .orderBy(desc(subscriptions.createdAt))
    .limit(10);

  const plan = isPlanName(fresh.plan) ? fresh.plan : "Free";
  return NextResponse.json({
    user: safeUser(fresh),
    billing: billingOf(fresh),
    plan: PLAN_DEFS[plan],
    subscription: active ? summarize(active) : null,
    subscriptions: history.map(summarize),
    payments: recent.map((p) => ({
      ...p,
      amount: Math.round(p.amountPaise / 100),
      createdAt: p.createdAt.toISOString(),
    })),
    paymentsEnabled: razorpayConfigured(),
  });
}

/** Cancel the active subscription (access continues until the paid period ends). */
export async function DELETE(req: NextRequest) {
  const user = await getUserWithFreshCredits(req);
  if (!user) return NextResponse.json({ message: "Please login" }, { status: 401 });
  const active = await activeSubscriptionFor(user.id);
  if (!active) return NextResponse.json({ message: "No active subscription to cancel." }, { status: 404 });
  if (active.status === "cancelled") {
    return NextResponse.json({ message: "This subscription is already cancelled." }, { status: 409 });
  }
  try {
    const remote = await cancelSubscription(active.providerSubscriptionId, true);
    const updated = await applySubscriptionState(remote, { source: "webhook", eventType: "subscription.cancelled" });
    const fresh = (await reconcileUserPlan(user.id, "subscription_cancelled")) ?? user;
    return NextResponse.json({
      ok: true,
      subscription: updated ? summarize(updated) : null,
      billing: billingOf(fresh),
      user: safeUser(fresh),
    });
  } catch (err) {
    console.error("[billing] cancel failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ message: "Could not cancel right now. Please try again." }, { status: 502 });
  }
}

/** Re-sync the active subscription from the gateway (manual "Refresh status"). */
export async function PATCH(req: NextRequest) {
  const user = await getUserWithFreshCredits(req);
  if (!user) return NextResponse.json({ message: "Please login" }, { status: 401 });
  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, user.id))
    .orderBy(desc(subscriptions.createdAt))
    .limit(3);
  try {
    for (const row of rows) {
      const remote = await fetchSubscription(row.providerSubscriptionId);
      await applySubscriptionState(remote, { source: "webhook", eventType: "subscription.updated" });
    }
    const fresh = (await reconcileUserPlan(user.id, "manual_sync")) ?? user;
    const active = await activeSubscriptionFor(fresh.id);
    return NextResponse.json({ ok: true, billing: billingOf(fresh), subscription: active ? summarize(active) : null });
  } catch (err) {
    console.error("[billing] sync failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ message: "Could not refresh from the payment provider." }, { status: 502 });
  }
}
