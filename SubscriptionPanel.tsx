"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CreditCard,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import { it } from "@/components/toast";
import { loadSession } from "@/components/auth-gate";
import type { BillingSummary } from "@/lib/auth";
import type { PlanDef } from "@/lib/plans";
import { apiFetch } from "@/lib/api-base";

interface SubSummary {
  id: string;
  plan: string;
  billingCycle: string;
  status: string;
  amount: number;
  currency: string;
  startedAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  nextChargeAt: string | null;
  cancelAtPeriodEnd: boolean;
  cancelledAt: string | null;
  lastPaymentAt: string | null;
  lastPaymentStatus: string | null;
}

interface PaymentRow {
  id: string;
  providerPaymentId: string;
  amount: number;
  currency: string;
  status: string;
  method: string | null;
  description: string;
  createdAt: string;
}

interface Data {
  billing: BillingSummary;
  plan: PlanDef;
  subscription: SubSummary | null;
  payments: PaymentRow[];
  paymentsEnabled: boolean;
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  active: { label: "Active", tone: "bg-[#dcefe4] text-[#1b7d5d]" },
  authenticated: { label: "Active", tone: "bg-[#dcefe4] text-[#1b7d5d]" },
  pending: { label: "Payment due", tone: "bg-[#fff0e5] text-[#a14f35]" },
  halted: { label: "Payment failed", tone: "bg-[#fde6de] text-[#b3462e]" },
  cancelled: { label: "Cancelled", tone: "bg-[#f5efe8] text-[#786d63]" },
  completed: { label: "Completed", tone: "bg-[#f5efe8] text-[#786d63]" },
  expired: { label: "Expired", tone: "bg-[#f5efe8] text-[#786d63]" },
  paused: { label: "Paused", tone: "bg-[#fff0e5] text-[#a14f35]" },
  created: { label: "Awaiting payment", tone: "bg-[#f5efe8] text-[#786d63]" },
};

export function SubscriptionPanel({ highlight = false }: { highlight?: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState<"cancel" | "sync" | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/billing/subscription", { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const sync = async () => {
    setBusy("sync");
    try {
      const res = await apiFetch("/api/billing/subscription", { method: "PATCH" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || "Could not refresh.");
      await Promise.all([load(), loadSession(true)]);
      it.success("Subscription status refreshed.");
    } catch (err) {
      it.error(err instanceof Error ? err.message : "Could not refresh.");
    } finally {
      setBusy(null);
    }
  };

  const cancel = async () => {
    setBusy("cancel");
    try {
      const res = await apiFetch("/api/billing/subscription", { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || "Could not cancel.");
      await Promise.all([load(), loadSession(true)]);
      setConfirmCancel(false);
      it.success("Subscription cancelled. Your plan stays active until the end of the paid period.");
    } catch (err) {
      it.error(err instanceof Error ? err.message : "Could not cancel.");
    } finally {
      setBusy(null);
    }
  };

  if (!data) {
    return (
      <section className="rounded-3xl border border-[#eadfd2] bg-[#fffdf8] p-6">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#8f8378]">
          <Loader2 className="size-4 animate-spin text-[#1b7d5d]" /> Loading your plan…
        </div>
      </section>
    );
  }

  const { plan, subscription: sub, billing, payments } = data;
  const isPaid = plan.name !== "Free";
  const status = sub ? STATUS_LABEL[sub.status] ?? { label: sub.status, tone: "bg-[#f5efe8] text-[#786d63]" } : null;

  return (
    <section
      className={`rounded-3xl border bg-[#fffdf8] p-5 sm:p-6 ${
        highlight ? "border-[#1b7d5d] shadow-[0_18px_50px_rgba(27,125,93,.15)]" : "border-[#eadfd2]"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.2em] text-[#9a8d80]">
            <CreditCard className="size-3.5" /> Subscription
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h2 className="display text-2xl font-extrabold text-[#17231f]">{plan.name} plan</h2>
            {isPaid ? (
              <span className="flex items-center gap-1 rounded-full bg-[#dcefe4] px-2.5 py-1 text-[11px] font-extrabold text-[#1b7d5d]">
                <BadgeCheck className="size-3.5" /> Paid
              </span>
            ) : (
              <span className="rounded-full bg-[#f5efe8] px-2.5 py-1 text-[11px] font-extrabold text-[#786d63]">
                Free forever
              </span>
            )}
            {status && sub && (
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${status.tone}`}>
                {sub.cancelAtPeriodEnd ? "Cancels at period end" : status.label}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-[#81766c]">{plan.tagline}</p>
        </div>
        {isPaid && sub ? (
          <div className="text-right">
            <p className="display text-2xl font-extrabold text-[#17231f]">
              ₹{sub.amount.toLocaleString("en-IN")}
              <span className="text-xs font-semibold text-[#9a8d80]"> / {sub.billingCycle === "yearly" ? "year" : "month"}</span>
            </p>
            <p className="text-[11px] font-semibold text-[#8f8378]">billed {sub.billingCycle}</p>
          </div>
        ) : (
          <Link
            href="/pricing"
            className="flex items-center gap-1.5 rounded-full bg-[#1b7d5d] px-4 py-2.5 text-xs font-bold text-white shadow-[0_8px_18px_rgba(27,125,93,.22)]"
          >
            <Sparkles className="size-3.5" /> Upgrade plan <ArrowRight className="size-3.5" />
          </Link>
        )}
      </div>

      {/* entitlements */}
      <div className="mt-5 grid grid-cols-2 gap-2 text-[12px] font-semibold text-[#5f574f] sm:grid-cols-4">
        {[
          [`${plan.features.monthlyCredits.toLocaleString()} credits`, "per month"],
          [plan.features.maxCharacters ? `${plan.features.maxCharacters.toLocaleString()} chars` : "Unlimited", "per generation"],
          [`${plan.features.voiceProfiles}+ voices`, "natural voices"],
          [plan.features.downloadAudio ? (plan.features.highQualityAudio ? "HQ downloads" : "MP3 downloads") : "Browser playback", plan.features.support],
        ].map(([a, b]) => (
          <div key={a} className="rounded-xl bg-[#f7f2ea] px-3 py-2.5">
            <p className="font-extrabold text-[#2f3e36]">{a}</p>
            <p className="text-[11px] text-[#9a8d80]">{b}</p>
          </div>
        ))}
      </div>

      {/* dates */}
      {isPaid && sub && (
        <div className="mt-4 grid gap-2 rounded-2xl border border-[#dcefe4] bg-[#f4fbf6] p-4 text-[12px] font-semibold text-[#5f574f] sm:grid-cols-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#789183]">Started</p>
            <p className="mt-0.5 text-sm font-extrabold text-[#254b3a]">{fmtDate(sub.startedAt)}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#789183]">Current period</p>
            <p className="mt-0.5 text-sm font-extrabold text-[#254b3a]">
              {fmtDate(sub.currentPeriodStart)} → {fmtDate(sub.currentPeriodEnd)}
            </p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[.12em] text-[#789183]">
              <CalendarClock className="size-3" /> {sub.cancelAtPeriodEnd ? "Access ends" : "Next renewal"}
            </p>
            <p className="mt-0.5 text-sm font-extrabold text-[#254b3a]">
              {sub.cancelAtPeriodEnd ? fmtDate(sub.currentPeriodEnd) : fmtDate(sub.nextChargeAt ?? sub.currentPeriodEnd)}
            </p>
          </div>
          {sub.status === "halted" || sub.status === "pending" ? (
            <p className="sm:col-span-3 rounded-xl bg-[#fff0e5] px-3 py-2 text-[#a14f35]">
              Your last payment didn't go through. Please update your payment method in the Razorpay email you
              received, or the plan will revert to Free when the paid period ends.
            </p>
          ) : null}
        </div>
      )}

      {/* actions */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {isPaid && sub && (
          <button
            onClick={sync}
            disabled={busy !== null}
            className="flex items-center gap-1.5 rounded-full border border-[#d8cec2] bg-white px-4 py-2 text-xs font-bold text-[#5f574f] hover:border-[#1b7d5d] hover:text-[#1b7d5d] disabled:opacity-60"
          >
            {busy === "sync" ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            Refresh status
          </button>
        )}
        {isPaid && sub && !sub.cancelAtPeriodEnd && sub.status !== "cancelled" && (
          <>
            <Link
              href="/pricing"
              className="rounded-full border border-[#d8cec2] bg-white px-4 py-2 text-xs font-bold text-[#5f574f] hover:border-[#1b7d5d] hover:text-[#1b7d5d]"
            >
              Change plan
            </Link>
            {confirmCancel ? (
              <span className="flex items-center gap-2 rounded-full bg-[#fff0e5] px-3 py-1.5 text-xs font-bold text-[#a14f35]">
                Cancel at period end?
                <button onClick={cancel} disabled={busy !== null} className="rounded-full bg-[#b95e42] px-3 py-1 text-white">
                  {busy === "cancel" ? "Cancelling…" : "Yes, cancel"}
                </button>
                <button onClick={() => setConfirmCancel(false)} className="text-[#786d63] hover:underline">
                  Keep
                </button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmCancel(true)}
                className="flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold text-[#a08f82] hover:text-[#b95e42]"
              >
                <XCircle className="size-3.5" /> Cancel subscription
              </button>
            )}
          </>
        )}
        {!isPaid && (
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[#9a8d80]">
            <ShieldCheck className="size-3.5 text-[#1b7d5d]" /> {billing.creditsLimit.toLocaleString()} free credits every month · upgrade anytime
          </p>
        )}
      </div>

      {/* payments */}
      {payments.length > 0 && (
        <div className="mt-5">
          <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#9a8d80]">Payment history</p>
          <ul className="mt-2 divide-y divide-[#f1e9dd] rounded-2xl border border-[#eadfd2] bg-white">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
                <div className="min-w-0">
                  <p className="truncate font-bold text-[#403831]">
                    {fmtDate(p.createdAt)} · {p.method ? p.method.toUpperCase() : "Online"}
                  </p>
                  <p className="truncate font-mono text-[10px] text-[#a09488]">{p.providerPaymentId}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-extrabold text-[#17231f]">₹{p.amount.toLocaleString("en-IN")}</p>
                  <p
                    className={`text-[10px] font-bold ${
                      p.status === "captured" || p.status === "authorized" ? "text-[#1b7d5d]" : "text-[#b95e42]"
                    }`}
                  >
                    {p.status}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
