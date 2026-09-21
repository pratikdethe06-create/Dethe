"use client";

import Link from "next/link";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { useSession } from "@/components/auth-gate";
import type { CheckoutState } from "@/components/use-checkout";
import type { BillingCycle } from "@/lib/plans";

const RANK: Record<string, number> = { Free: 0, Pro: 1, Business: 2 };

/**
 * Plan button that knows the user's real plan:
 *  - guests → sign up (returns to checkout afterwards)
 *  - current plan → "Current plan"
 *  - paid plan → opens real Razorpay checkout
 */
export function PlanCta({
  plan,
  cycle,
  primary,
  compact = false,
  onSubscribe,
  checkoutState,
  checkoutPlan,
  className = "",
}: {
  plan: "Free" | "Pro" | "Business";
  cycle: BillingCycle;
  primary: boolean;
  compact?: boolean;
  onSubscribe: (plan: "Pro" | "Business", cycle: BillingCycle) => void;
  checkoutState: CheckoutState;
  checkoutPlan: string | null;
  className?: string;
}) {
  const { user, loading } = useSession();
  const base = `${compact ? "py-2.5 text-xs" : "py-3 text-sm"} flex w-full items-center justify-center rounded-xl font-bold transition ${className}`;
  const primaryCls = "bg-[#1b7d5d] text-white shadow-[0_8px_18px_rgba(27,125,93,.22)] hover:-translate-y-0.5";
  const ghostCls = "border border-[#d8cec2] bg-white text-[#5f574f] hover:border-[#1b7d5d] hover:text-[#1b7d5d]";
  const currentCls = "border border-[#dcefe4] bg-[#f4fbf6] text-[#1b7d5d] cursor-default";

  const busy = checkoutState !== "idle" && checkoutPlan === plan;
  const otherBusy = checkoutState !== "idle" && checkoutPlan !== plan;

  if (loading) return <span className={`${base} ${ghostCls} animate-pulse`}>&nbsp;</span>;

  if (!user) {
    return (
      <Link
        href={`/login?mode=signup&plan=${plan.toLowerCase()}&billing=${cycle}${
          plan === "Free" ? "" : `&next=${encodeURIComponent(`/pricing?plan=${plan.toLowerCase()}&billing=${cycle}&checkout=1`)}`
        }`}
        className={`${base} ${primary ? primaryCls : ghostCls}`}
      >
        {plan === "Free" ? "Start for free" : `Choose ${plan}`}
        <ArrowRight className="ml-2 size-4" />
      </Link>
    );
  }

  const currentRank = RANK[user.plan] ?? 0;
  if (user.plan === plan) {
    return (
      <span className={`${base} ${currentCls}`}>
        <Check className="mr-1.5 size-4" /> Current plan
      </span>
    );
  }
  if (plan === "Free") {
    return (
      <Link href="/dashboard" className={`${base} ${ghostCls}`}>
        Manage in dashboard
      </Link>
    );
  }
  const label = RANK[plan] > currentRank ? `Upgrade to ${plan}` : `Switch to ${plan}`;
  return (
    <button
      onClick={() => onSubscribe(plan, cycle)}
      disabled={busy || otherBusy}
      className={`${base} ${primary ? primaryCls : ghostCls} disabled:cursor-not-allowed disabled:opacity-70`}
    >
      {busy ? (
        <>
          <Loader2 className="mr-2 size-4 animate-spin" />
          {checkoutState === "verifying" ? "Confirming payment…" : checkoutState === "paying" ? "Complete payment…" : "Opening checkout…"}
        </>
      ) : (
        <>
          {label} <ArrowRight className="ml-2 size-4" />
        </>
      )}
    </button>
  );
}
