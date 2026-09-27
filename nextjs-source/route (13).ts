import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { webhookEvents } from "@/db/schema";
import { verifyWebhookSignature, type RzPayment, type RzSubscription } from "@/lib/razorpay";
import { applySubscriptionState } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";

/**
 * Razorpay → DetheAI webhook. Configure in the Razorpay dashboard:
 *   URL:    https://<your-domain>/api/billing/webhook
 *   Secret: RAZORPAY_WEBHOOK_SECRET
 *   Events: subscription.authenticated, subscription.activated, subscription.charged,
 *           subscription.pending, subscription.halted, subscription.cancelled,
 *           subscription.completed, subscription.paused, subscription.resumed,
 *           subscription.updated, payment.failed
 *
 * The raw body is HMAC-verified with the webhook secret; events are deduped by id.
 */
const HANDLED = new Set([
  "subscription.authenticated",
  "subscription.activated",
  "subscription.charged",
  "subscription.pending",
  "subscription.halted",
  "subscription.cancelled",
  "subscription.completed",
  "subscription.paused",
  "subscription.resumed",
  "subscription.updated",
  "payment.failed",
]);

interface WebhookBody {
  event?: string;
  created_at?: number;
  payload?: {
    subscription?: { entity?: RzSubscription };
    payment?: { entity?: RzPayment & { subscription_id?: string | null } };
  };
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";

  if (!verifyWebhookSignature(rawBody, signature)) {
    console.warn("[webhook] invalid signature");
    return NextResponse.json({ message: "Invalid signature" }, { status: 400 });
  }

  let body: WebhookBody;
  try {
    body = JSON.parse(rawBody) as WebhookBody;
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const eventType = body.event ?? "unknown";
  const eventId =
    req.headers.get("x-razorpay-event-id") ||
    `${eventType}:${body.payload?.payment?.entity?.id ?? ""}:${body.payload?.subscription?.entity?.id ?? ""}:${body.created_at ?? ""}`;

  // Idempotency: record first, skip if we've already processed this delivery.
  const inserted = await db
    .insert(webhookEvents)
    .values({ providerEventId: eventId, eventType, payload: rawBody })
    .onConflictDoNothing({ target: webhookEvents.providerEventId })
    .returning({ id: webhookEvents.id });
  if (inserted.length === 0) {
    return NextResponse.json({ ok: true, duplicate: true });
  }
  const rowId = inserted[0].id;

  if (!HANDLED.has(eventType)) {
    await db.update(webhookEvents).set({ processedAt: new Date() }).where(eq(webhookEvents.id, rowId));
    return NextResponse.json({ ok: true, ignored: eventType });
  }

  try {
    const subscription = body.payload?.subscription?.entity ?? null;
    const payment = body.payload?.payment?.entity ?? null;

    if (subscription) {
      await applySubscriptionState(subscription, { payment, source: "webhook", eventType });
    } else if (eventType === "payment.failed" && payment?.subscription_id) {
      // Failed renewal without a subscription entity: mark the last payment as failed;
      // the follow-up subscription.pending / halted event will adjust entitlement.
      const { fetchSubscription } = await import("@/lib/razorpay");
      const remote = await fetchSubscription(payment.subscription_id);
      await applySubscriptionState(remote, { payment, source: "webhook", eventType });
    }

    await db.update(webhookEvents).set({ processedAt: new Date() }).where(eq(webhookEvents.id, rowId));
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[webhook] processing failed:", eventType, message);
    await db.update(webhookEvents).set({ error: message.slice(0, 500) }).where(eq(webhookEvents.id, rowId));
    // 500 → Razorpay retries with backoff.
    return NextResponse.json({ message: "Processing failed" }, { status: 500 });
  }
}
