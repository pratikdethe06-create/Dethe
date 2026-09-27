import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { subscriptions, users } from "@/db/schema";
import { getUserWithFreshCredits } from "@/lib/auth";
import { PLAN_DEFS, isBillingCycle, isPaidPlan, planAmountPaise } from "@/lib/plans";
import {
  RazorpayError,
  createCustomer,
  createSubscription,
  ensureRazorpayPlan,
  razorpayConfigured,
  razorpayKeyId,
} from "@/lib/razorpay";
import { activeSubscriptionFor } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";

/**
 * Step 1 of a purchase: create a gateway subscription for the signed-in user.
 * The browser only receives the subscription id + public key id to open Checkout.
 * Amounts, plan ids and the owner are decided here — never taken from the client.
 */
export async function POST(req: NextRequest) {
  const user = await getUserWithFreshCredits(req);
  if (!user) {
    return NextResponse.json({ message: "Please sign in to subscribe.", code: "AUTH_REQUIRED" }, { status: 401 });
  }
  if (!razorpayConfigured()) {
    return NextResponse.json(
      { message: "Online payments aren't enabled on this server yet.", code: "PAYMENTS_NOT_CONFIGURED" },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const plan = body?.plan;
  const cycle = body?.billing;
  if (!isPaidPlan(plan) || !isBillingCycle(cycle)) {
    return NextResponse.json({ message: "Choose a valid plan and billing cycle." }, { status: 400 });
  }

  const current = await activeSubscriptionFor(user.id);
  if (current && current.plan === plan && current.billingCycle === cycle && current.cancelAtPeriodEnd === 0) {
    return NextResponse.json(
      { message: `You're already on the ${plan} plan (${cycle}).`, code: "ALREADY_SUBSCRIBED" },
      { status: 409 }
    );
  }

  try {
    let customerId = user.paymentCustomerId;
    if (!customerId) {
      const customer = await createCustomer(user.name, user.email);
      customerId = customer.id;
      await db.update(users).set({ paymentCustomerId: customerId }).where(eq(users.id, user.id));
    }

    const planId = await ensureRazorpayPlan(plan, cycle);
    const remote = await createSubscription({
      planId,
      customerId,
      cycle,
      notes: { dethe_user_id: user.id, dethe_plan: plan, dethe_cycle: cycle, dethe_email: user.email },
    });

    await db.insert(subscriptions).values({
      userId: user.id,
      providerSubscriptionId: remote.id,
      providerPlanId: planId,
      providerCustomerId: customerId,
      plan,
      billingCycle: cycle,
      amountPaise: planAmountPaise(plan, cycle),
      status: remote.status,
    });

    return NextResponse.json({
      keyId: razorpayKeyId(),
      subscriptionId: remote.id,
      plan,
      billing: cycle,
      amount: planAmountPaise(plan, cycle) / 100,
      description: `DetheAI ${plan} · ${cycle === "yearly" ? "yearly" : "monthly"} · ${PLAN_DEFS[plan].features.monthlyCredits.toLocaleString("en-IN")} credits/month`,
      prefill: { name: user.name, email: user.email },
    });
  } catch (err) {
    const message = err instanceof RazorpayError ? err.message : "Could not start checkout. Please try again.";
    console.error("[billing] checkout failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ message }, { status: err instanceof RazorpayError ? 502 : 500 });
  }
}
