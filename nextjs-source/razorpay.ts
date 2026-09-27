// Razorpay REST client (server-side only). Uses the Basic-auth HTTP API directly
// so there is no SDK bundle and every call is explicit.

import { createHmac, timingSafeEqual } from "crypto";
import { PLAN_DEFS, planAmountPaise, type BillingCycle } from "@/lib/plans";

const API = "https://api.razorpay.com/v1";

export function razorpayConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

export function razorpayKeyId(): string {
  return process.env.RAZORPAY_KEY_ID ?? "";
}

function authHeader(): string {
  const id = process.env.RAZORPAY_KEY_ID ?? "";
  const secret = process.env.RAZORPAY_KEY_SECRET ?? "";
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}

export class RazorpayError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function rz<T>(method: "GET" | "POST" | "PATCH", path: string, body?: unknown): Promise<T> {
  if (!razorpayConfigured()) {
    throw new RazorpayError(503, "NOT_CONFIGURED", "Payments are not configured on this server.");
  }
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: { code?: string; description?: string };
  } & T;
  if (!res.ok) {
    throw new RazorpayError(
      res.status,
      data.error?.code ?? "RAZORPAY_ERROR",
      data.error?.description ?? `Razorpay request failed (HTTP ${res.status})`
    );
  }
  return data as T;
}

/* ---------------- entities ---------------- */

export interface RzPlan {
  id: string;
  period: "monthly" | "yearly";
  interval: number;
  item: { id: string; name: string; amount: number; currency: string };
}

export interface RzSubscription {
  id: string;
  plan_id: string;
  customer_id: string | null;
  status:
    | "created"
    | "authenticated"
    | "active"
    | "pending"
    | "halted"
    | "cancelled"
    | "completed"
    | "expired"
    | "paused";
  current_start: number | null;
  current_end: number | null;
  charge_at: number | null;
  start_at: number | null;
  end_at: number | null;
  ended_at: number | null;
  paid_count: number;
  total_count: number;
  short_url?: string;
  notes?: Record<string, string>;
}

export interface RzPayment {
  id: string;
  amount: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  method?: string;
  description?: string;
  email?: string;
  error_description?: string | null;
  created_at: number;
}

export interface RzCustomer {
  id: string;
  name: string;
  email: string;
}

/* ---------------- plans (auto-provisioned once) ---------------- */

const planCache = new Map<string, string>();

function envPlanId(plan: "Pro" | "Business", cycle: BillingCycle): string | undefined {
  const key = `RAZORPAY_PLAN_${plan.toUpperCase()}_${cycle.toUpperCase()}`;
  return process.env[key];
}

/**
 * Returns the Razorpay plan id for a DetheAI plan/cycle. Uses env overrides when
 * present; otherwise finds an existing plan by name or creates it (amounts come
 * from the catalogue, never from the client).
 */
export async function ensureRazorpayPlan(plan: "Pro" | "Business", cycle: BillingCycle): Promise<string> {
  const fromEnv = envPlanId(plan, cycle);
  if (fromEnv) return fromEnv;
  const cacheKey = `${plan}:${cycle}`;
  const cached = planCache.get(cacheKey);
  if (cached) return cached;

  const name = `DetheAI ${plan} (${cycle})`;
  const amount = planAmountPaise(plan, cycle);

  const list = await rz<{ items: RzPlan[] }>("GET", "/plans?count=100");
  const existing = list.items.find(
    (p) =>
      p.item?.name === name &&
      p.period === cycle &&
      p.interval === 1 &&
      p.item.amount === amount &&
      p.item.currency === "INR"
  );
  if (existing) {
    planCache.set(cacheKey, existing.id);
    return existing.id;
  }

  const created = await rz<RzPlan>("POST", "/plans", {
    period: cycle,
    interval: 1,
    item: {
      name,
      amount,
      currency: "INR",
      description: `${PLAN_DEFS[plan].tagline} · ${PLAN_DEFS[plan].features.monthlyCredits.toLocaleString("en-IN")} credits / month`,
    },
    notes: { dethe_plan: plan, dethe_cycle: cycle },
  });
  planCache.set(cacheKey, created.id);
  return created.id;
}

/* ---------------- customers / subscriptions / payments ---------------- */

export async function createCustomer(name: string, email: string): Promise<RzCustomer> {
  return rz<RzCustomer>("POST", "/customers", { name, email, fail_existing: "0" });
}

export async function createSubscription(opts: {
  planId: string;
  customerId?: string | null;
  cycle: BillingCycle;
  notes: Record<string, string>;
}): Promise<RzSubscription> {
  // Charge for up to 10 years; renewals continue automatically until cancelled.
  const totalCount = opts.cycle === "yearly" ? 10 : 120;
  return rz<RzSubscription>("POST", "/subscriptions", {
    plan_id: opts.planId,
    total_count: totalCount,
    quantity: 1,
    customer_notify: 1,
    ...(opts.customerId ? { customer_id: opts.customerId } : {}),
    notes: opts.notes,
  });
}

export async function fetchSubscription(id: string): Promise<RzSubscription> {
  return rz<RzSubscription>("GET", `/subscriptions/${id}`);
}

export async function fetchPayment(id: string): Promise<RzPayment> {
  return rz<RzPayment>("GET", `/payments/${id}`);
}

export async function cancelSubscription(id: string, atCycleEnd: boolean): Promise<RzSubscription> {
  return rz<RzSubscription>("POST", `/subscriptions/${id}/cancel`, {
    cancel_at_cycle_end: atCycleEnd ? 1 : 0,
  });
}

/* ---------------- signatures ---------------- */

function safeEqualHex(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

/** Checkout success handler: HMAC-SHA256(payment_id|subscription_id, key_secret) */
export function verifyCheckoutSignature(paymentId: string, subscriptionId: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET ?? "";
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(`${paymentId}|${subscriptionId}`).digest("hex");
  return safeEqualHex(expected, signature);
}

/** Webhook: HMAC-SHA256(raw_body, webhook_secret) must equal X-Razorpay-Signature */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? "";
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqualHex(expected, signature);
}

export function tsToDate(ts: number | null | undefined): Date | null {
  return typeof ts === "number" && ts > 0 ? new Date(ts * 1000) : null;
}
