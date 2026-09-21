"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { it } from "@/components/toast";
import { loadSession } from "@/components/auth-gate";
import type { BillingCycle } from "@/lib/plans";
import { apiFetch } from "@/lib/api-base";

interface RazorpayCheckoutResponse {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  subscription_id: string;
  name: string;
  description: string;
  image?: string;
  prefill?: { name?: string; email?: string };
  notes?: Record<string, string>;
  theme?: { color: string };
  handler: (response: RazorpayCheckoutResponse) => void;
  modal?: { ondismiss?: () => void; confirm_close?: boolean };
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => { open: () => void; on: (event: string, cb: (r: unknown) => void) => void };
  }
}

let scriptPromise: Promise<boolean> | null = null;
function loadCheckoutScript(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.async = true;
      s.onload = () => resolve(Boolean(window.Razorpay));
      s.onerror = () => {
        scriptPromise = null;
        resolve(false);
      };
      document.body.appendChild(s);
    });
  }
  return scriptPromise;
}

export type CheckoutState = "idle" | "starting" | "paying" | "verifying";

/**
 * Starts a real subscription purchase:
 *  1. POST /api/billing/checkout  → server creates the gateway subscription
 *  2. Razorpay Checkout collects the payment (card / UPI / netbanking)
 *  3. POST /api/billing/verify    → server verifies signature + re-fetches payment, activates plan
 */
export function useCheckout() {
  const [state, setState] = useState<CheckoutState>("idle");
  const [activePlan, setActivePlan] = useState<string | null>(null);
  const router = useRouter();

  const subscribe = useCallback(
    async (plan: "Pro" | "Business", billing: BillingCycle) => {
      if (state !== "idle") return;
      setActivePlan(plan);
      setState("starting");
      try {
        const res = await apiFetch("/api/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan, billing }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
          router.push(`/login?mode=signup&plan=${plan.toLowerCase()}&billing=${billing}&next=${encodeURIComponent(`/pricing?plan=${plan.toLowerCase()}&billing=${billing}&checkout=1`)}`);
          return;
        }
        if (!res.ok) throw new Error(data.message || "Could not start checkout.");

        const ok = await loadCheckoutScript();
        if (!ok || !window.Razorpay) throw new Error("Payment window could not be loaded. Please disable ad-blockers and retry.");

        setState("paying");
        await new Promise<void>((resolve) => {
          const rzp = new window.Razorpay!({
            key: data.keyId,
            subscription_id: data.subscriptionId,
            name: "DetheAI",
            description: data.description,
            image: `${window.location.origin}/apple-icon`,
            prefill: data.prefill,
            notes: { plan, billing },
            theme: { color: "#1b7d5d" },
            modal: {
              confirm_close: true,
              ondismiss: () => {
                it.info("Checkout closed — no payment was made.");
                resolve();
              },
            },
            handler: async (response) => {
              setState("verifying");
              try {
                const v = await apiFetch("/api/billing/verify", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(response),
                });
                const vd = await v.json().catch(() => ({}));
                if (!v.ok) throw new Error(vd.message || "Payment verification failed.");
                await loadSession(true);
                it.success(`🎉 ${plan} plan activated — ${Number(vd.billing?.creditsLimit ?? 0).toLocaleString()} credits are ready.`);
                router.push("/dashboard?upgraded=1");
              } catch (err) {
                it.error(err instanceof Error ? err.message : "Payment verification failed.");
              } finally {
                resolve();
              }
            },
          });
          rzp.on("payment.failed", (r: unknown) => {
            const reason = (r as { error?: { description?: string } })?.error?.description;
            it.error(reason ? `Payment failed: ${reason}` : "Payment failed. Please try another method.");
          });
          rzp.open();
        });
      } catch (err) {
        it.error(err instanceof Error ? err.message : "Could not start checkout.");
      } finally {
        setState("idle");
        setActivePlan(null);
      }
    },
    [state, router]
  );

  return { subscribe, state, activePlan };
}
