import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import { billingOf, getUserWithFreshCredits, safeUser } from "@/lib/auth";
import { fetchPayment, fetchSubscription, razorpayConfigured, verifyCheckoutSignature } from "@/lib/razorpay";
import { applySubscriptionState, reconcileUserPlan, summarize } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";

/**
 * Step 2 of a purchase: Checkout's success handler posts the gateway's ids + signature.
 * We (a) verify the HMAC with the secret key, (b) confirm the subscription belongs to
 * this user in OUR database, (c) re-fetch subscription + payment from the gateway and
 * only then activate the plan. Webhooks will confirm/adjust independently.
 */
export async function POST(req: NextRequest) {
  const user = await getUserWithFreshCredits(req);
  if (!user) return NextResponse.json({ message: "Please sign in." }, { status: 401 });
  if (!razorpayConfigured()) return NextResponse.json({ message: "Payments not configured." }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const paymentId = String(body?.razorpay_payment_id ?? "");
  const subscriptionId = String(body?.razorpay_subscription_id ?? "");
  const signature = String(body?.razorpay_signature ?? "");
  if (!paymentId || !subscriptionId || !signature) {
    return NextResponse.json({ message: "Missing payment details." }, { status: 400 });
  }

  // The subscription id must be one WE created for THIS user.
  const local = (
    await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.providerSubscriptionId, subscriptionId), eq(subscriptions.userId, user.id)))
      .limit(1)
  )[0];
  if (!local) {
    return NextResponse.json({ message: "Unknown subscription for this account." }, { status: 404 });
  }

  if (!verifyCheckoutSignature(paymentId, local.providerSubscriptionId, signature)) {
    console.warn("[billing] bad checkout signature", { user: user.id, subscriptionId });
    return NextResponse.json({ message: "Payment verification failed." }, { status: 400 });
  }

  try {
    const [remote, payment] = await Promise.all([fetchSubscription(subscriptionId), fetchPayment(paymentId)]);
    if (payment.status !== "captured" && payment.status !== "authorized") {
      return NextResponse.json(
        { message: `Payment not completed (status: ${payment.status}).`, code: "PAYMENT_NOT_CAPTURED" },
        { status: 402 }
      );
    }
    if (payment.amount !== local.amountPaise) {
      console.warn("[billing] amount mismatch", { expected: local.amountPaise, got: payment.amount });
      return NextResponse.json({ message: "Payment amount mismatch." }, { status: 400 });
    }

    const updated = await applySubscriptionState(remote, { payment, source: "checkout" });
    const fresh = (await reconcileUserPlan(user.id, "checkout_verified")) ?? user;
    return NextResponse.json({
      ok: true,
      user: safeUser(fresh),
      billing: billingOf(fresh),
      subscription: updated ? summarize(updated) : null,
    });
  } catch (err) {
    console.error("[billing] verify failed:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { message: "We couldn't confirm the payment yet. If you were charged, your plan will activate automatically within a few minutes." },
      { status: 502 }
    );
  }
}
