// Subscription → entitlement engine (server-side only).
// Both the checkout-verification route and the webhook route funnel through
// `applySubscriptionState`, so the user's plan is always derived from verified
// gateway state, never from anything the browser claims.

import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { creditLedger, payments, subscriptions, users, type Subscription, type User } from "@/db/schema";
import { PLAN_DEFS, isPaidPlan, type PlanName } from "@/lib/plans";
import { tsToDate, type RzPayment, type RzSubscription } from "@/lib/razorpay";

/** Gateway statuses that grant access. */
const ENTITLED = new Set(["authenticated", "active"]);
/** Statuses where access continues until the paid period ends. */
const GRACE = new Set(["pending", "cancelled", "paused", "halted", "completed"]);

export function subscriptionGrantsAccess(sub: Subscription, now = new Date()): boolean {
  if (ENTITLED.has(sub.status)) return true;
  if (GRACE.has(sub.status) && sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() > now.getTime()) {
    return true;
  }
  return false;
}

/** The subscription that currently entitles the user, if any (highest tier first). */
export async function activeSubscriptionFor(userId: string): Promise<Subscription | null> {
  const rows = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, userId),
        inArray(subscriptions.status, ["authenticated", "active", "pending", "cancelled", "paused", "halted", "completed"])
      )
    )
    .orderBy(desc(subscriptions.updatedAt));
  const now = new Date();
  const live = rows.filter((s) => subscriptionGrantsAccess(s, now));
  if (live.length === 0) return null;
  const rank: Record<string, number> = { Business: 2, Pro: 1 };
  live.sort((a, b) => (rank[b.plan] ?? 0) - (rank[a.plan] ?? 0));
  return live[0];
}

/**
 * Sets the user's plan + credit allowance. When upgrading to a paid plan the
 * usage counter resets so the new allowance is available immediately; when
 * downgrading, usage is capped at the new limit.
 */
async function setUserPlan(user: User, plan: PlanName, reason: string): Promise<User> {
  const limit = PLAN_DEFS[plan].features.monthlyCredits;
  const upgrading = limit > user.creditsLimit;
  const [updated] = await db
    .update(users)
    .set({
      plan,
      creditsLimit: limit,
      creditsUsed: upgrading ? 0 : Math.min(user.creditsUsed, limit),
      creditsCycleStart: upgrading ? new Date() : user.creditsCycleStart,
    })
    .where(eq(users.id, user.id))
    .returning();
  await db.insert(creditLedger).values({
    userId: user.id,
    delta: updated.creditsLimit - updated.creditsUsed - (user.creditsLimit - user.creditsUsed),
    balanceAfter: updated.creditsLimit - updated.creditsUsed,
    reason,
    meta: `${user.plan} → ${plan}`,
  });
  return updated;
}

/** Recomputes the user's plan from their subscriptions and persists it if it changed. */
export async function reconcileUserPlan(userId: string, reason = "plan_sync"): Promise<User | null> {
  const user = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!user) return null;
  const active = await activeSubscriptionFor(userId);
  const target: PlanName = active && isPaidPlan(active.plan) ? active.plan : "Free";
  if (user.plan === target && user.creditsLimit === PLAN_DEFS[target].features.monthlyCredits) return user;
  return setUserPlan(user, target, reason);
}

/**
 * Persists verified gateway state for a subscription and reconciles the owner's plan.
 * Idempotent: safe to call for every webhook retry.
 */
export async function applySubscriptionState(
  remote: RzSubscription,
  opts: { payment?: RzPayment | null; source: "checkout" | "webhook"; eventType?: string }
): Promise<Subscription | null> {
  const existing = (
    await db.select().from(subscriptions).where(eq(subscriptions.providerSubscriptionId, remote.id)).limit(1)
  )[0];
  if (!existing) {
    // Unknown subscription (e.g. created outside DetheAI) — try to attach via notes.
    const userId = remote.notes?.dethe_user_id;
    const plan = remote.notes?.dethe_plan;
    const cycle = remote.notes?.dethe_cycle;
    if (!userId || !isPaidPlan(plan) || (cycle !== "monthly" && cycle !== "yearly")) return null;
    const owner = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
    if (!owner) return null;
    await db.insert(subscriptions).values({
      userId,
      providerSubscriptionId: remote.id,
      providerPlanId: remote.plan_id,
      providerCustomerId: remote.customer_id,
      plan,
      billingCycle: cycle,
      amountPaise: PLAN_DEFS[plan][cycle === "yearly" ? "yearlyTotal" : "monthlyPrice"] * 100,
      status: remote.status,
    });
    return applySubscriptionState(remote, opts);
  }

  const payment = opts.payment ?? null;
  const paymentOk = payment?.status === "captured" || payment?.status === "authorized";
  const now = new Date();

  const statusAllowsStart = remote.status === "authenticated" || remote.status === "active";
  const startedAt = existing.startedAt ?? (statusAllowsStart || paymentOk ? now : null);
  const cancelledAt =
    remote.status === "cancelled" ? (existing.cancelledAt ?? now) : existing.cancelledAt;

  const [updated] = await db
    .update(subscriptions)
    .set({
      status: remote.status,
      providerPlanId: remote.plan_id,
      providerCustomerId: remote.customer_id ?? existing.providerCustomerId,
      startedAt,
      currentPeriodStart: tsToDate(remote.current_start) ?? existing.currentPeriodStart,
      currentPeriodEnd: tsToDate(remote.current_end) ?? tsToDate(remote.end_at) ?? existing.currentPeriodEnd,
      nextChargeAt: remote.status === "cancelled" ? null : tsToDate(remote.charge_at),
      cancelledAt,
      cancelAtPeriodEnd:
        remote.status === "cancelled" && (tsToDate(remote.current_end)?.getTime() ?? 0) > now.getTime() ? 1 : 0,
      paidCount: remote.paid_count ?? existing.paidCount,
      lastPaymentId: paymentOk ? payment!.id : existing.lastPaymentId,
      lastPaymentAt: paymentOk ? tsToDate(payment!.created_at) ?? now : existing.lastPaymentAt,
      lastPaymentStatus: payment?.status ?? existing.lastPaymentStatus,
      updatedAt: now,
    })
    .where(eq(subscriptions.id, existing.id))
    .returning();

  if (payment) {
    await db
      .insert(payments)
      .values({
        userId: existing.userId,
        subscriptionId: existing.id,
        providerPaymentId: payment.id,
        providerSubscriptionId: remote.id,
        amountPaise: payment.amount,
        currency: payment.currency,
        status: payment.status,
        method: payment.method ?? null,
        description: payment.description ?? payment.error_description ?? "",
        source: opts.source,
      })
      .onConflictDoNothing({ target: payments.providerPaymentId });
    if (paymentOk && existing.providerCustomerId === null && remote.customer_id) {
      await db.update(users).set({ paymentCustomerId: remote.customer_id }).where(eq(users.id, existing.userId));
    }
  }

  // A fresh successful charge on an active subscription starts a new credit month.
  if (paymentOk && opts.eventType === "subscription.charged" && remote.status === "active") {
    const owner = (await db.select().from(users).where(eq(users.id, existing.userId)).limit(1))[0];
    if (owner && owner.plan === existing.plan) {
      const limit = PLAN_DEFS[existing.plan as PlanName]?.features.monthlyCredits ?? owner.creditsLimit;
      await db
        .update(users)
        .set({ creditsUsed: 0, creditsLimit: limit, creditsCycleStart: now })
        .where(eq(users.id, owner.id));
      await db.insert(creditLedger).values({
        userId: owner.id,
        delta: limit,
        balanceAfter: limit,
        reason: "renewal_reset",
        meta: `${existing.plan} renewal · ${payment!.id}`,
      });
    }
  }

  await reconcileUserPlan(existing.userId, `subscription_${remote.status}`);
  return updated;
}

/* ---------------- public shapes ---------------- */

export interface SubscriptionSummary {
  id: string;
  plan: string;
  billingCycle: string;
  status: string;
  amount: number; // INR
  currency: string;
  startedAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  nextChargeAt: string | null;
  cancelAtPeriodEnd: boolean;
  cancelledAt: string | null;
  lastPaymentAt: string | null;
  lastPaymentStatus: string | null;
  providerSubscriptionId: string;
}

export function summarize(sub: Subscription): SubscriptionSummary {
  return {
    id: sub.id,
    plan: sub.plan,
    billingCycle: sub.billingCycle,
    status: sub.status,
    amount: Math.round(sub.amountPaise / 100),
    currency: sub.currency,
    startedAt: sub.startedAt?.toISOString() ?? null,
    currentPeriodStart: sub.currentPeriodStart?.toISOString() ?? null,
    currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
    nextChargeAt: sub.nextChargeAt?.toISOString() ?? null,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd === 1,
    cancelledAt: sub.cancelledAt?.toISOString() ?? null,
    lastPaymentAt: sub.lastPaymentAt?.toISOString() ?? null,
    lastPaymentStatus: sub.lastPaymentStatus,
    providerSubscriptionId: sub.providerSubscriptionId,
  };
}
