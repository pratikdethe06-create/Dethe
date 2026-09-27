"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Check, LockKeyhole } from "lucide-react";
import { Footer, Header } from "@/components/chrome";
import { BillingToggle, PlanPrice } from "@/components/billing-toggle";
import { PlanComparison } from "@/components/plan-comparison";
import { PlanCta } from "@/components/plan-cta";
import { StaticHostingNotice } from "@/components/static-notice";

import { useCheckout } from "@/components/use-checkout";
import { useSession } from "@/components/auth-gate";
import { Toaster } from "@/components/toast";
import { PLANS, type BillingCycle } from "@/lib/voices";

const FAQS = [
  {
    q: "How do credits work?",
    a: "Credits are charged per 100-word block of your script: 1–100 words = 5 credits, 101–200 = 10, 201–300 = 15, and so on (always rounded up to the next block). The Free plan's 10,000 credits cover up to 200,000 words a month. Credits are deducted only after your audio is generated successfully and reset every month.",
  },
  {
    q: "Which languages are supported?",
    a: "Hindi, English, Odia, Tamil, Telugu, Marathi, Bengali, Gujarati, Punjabi, Kannada and Malayalam — with 50 natural voice profiles for each language.",
  },
  {
    q: "Can I switch plans later?",
    a: "Yes. Start free and upgrade to Pro or Business whenever your workflow grows. You can change or cancel your plan at any time.",
  },
];

function PricingPageInner() {
  const params = useSearchParams();
  const [cycle, setCycle] = useState<BillingCycle>(params.get("billing") === "yearly" ? "yearly" : "monthly");
  const { subscribe, state: checkoutState, activePlan: checkoutPlan } = useCheckout();
  const { user, loading } = useSession();
  const autoStarted = useRef(false);

  // After sign-up from a plan button we land here with ?checkout=1 → open checkout automatically.
  useEffect(() => {
    if (autoStarted.current || loading || !user) return;
    if (params.get("checkout") !== "1") return;
    const plan = params.get("plan");
    const billing = params.get("billing") === "yearly" ? "yearly" : "monthly";
    const target = plan === "pro" ? "Pro" : plan === "business" ? "Business" : null;
    if (target && user.plan !== target) {
      autoStarted.current = true;
      subscribe(target, billing);
    }
  }, [loading, user, params, subscribe]);

  return (
    <div className="min-h-screen">
      <Header />

      <main>
        <section className="grain px-5 pb-14 pt-14 sm:px-8 lg:pt-20">
          <div className="container text-center">
            <p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#1b7d5d]">
              Simple pricing
            </p>
            <h1 className="display mx-auto mt-3 max-w-2xl text-5xl font-extrabold leading-[1.02]">
              Start free. Grow when you’re ready.
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-[#81766c]">
              Use the studio to explore voices, then add plans when your workflow grows.
            </p>

            <div className="mx-auto mt-8 max-w-2xl text-left">
              <StaticHostingNotice feature="pricing" className="mb-6" />
            </div>
            <BillingToggle value={cycle} onChange={setCycle} className="mt-8" />

            <div className="mx-auto mt-8 grid max-w-5xl gap-4 text-left md:grid-cols-3">
              {PLANS.map((plan) => (
                <div
                  key={plan.title}
                  className={`relative rounded-3xl border bg-[#fffdf8] p-6 ${
                    plan.title === "Pro"
                      ? "border-[#1b7d5d] shadow-[0_18px_50px_rgba(27,125,93,.15)]"
                      : "border-[#eadfd2]"
                  }`}
                >
                  {plan.title === "Pro" && (
                    <span className="absolute -top-3 left-6 rounded-full bg-[#1b7d5d] px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide text-white">
                      Most popular
                    </span>
                  )}
                  <p className="text-sm font-extrabold text-[#1b7d5d]">{plan.title}</p>
                  <PlanPrice plan={plan} cycle={cycle} />
                  <p className="mt-2 text-sm text-[#81766c]">{plan.copy}</p>
                  <ul className="mt-6 space-y-3 text-sm font-semibold text-[#5f574f]">
                    {plan.items.map((feat) => (
                      <li key={feat} className="flex items-center gap-2">
                        <Check className="size-4 shrink-0 text-[#1b7d5d]" /> {feat}
                      </li>
                    ))}
                  </ul>
                  <PlanCta
                    plan={plan.title as "Free" | "Pro" | "Business"}
                    cycle={cycle}
                    primary={plan.title === "Pro"}
                    onSubscribe={subscribe}
                    checkoutState={checkoutState}
                    checkoutPlan={checkoutPlan}
                    className="mt-7"
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 pb-16 pt-6 sm:px-8">
          <div className="container max-w-5xl">
            <PlanComparison cycle={cycle} onSubscribe={subscribe} checkoutState={checkoutState} checkoutPlan={checkoutPlan} />
            <p className="mx-auto mt-8 flex max-w-2xl items-start gap-2 text-center text-xs leading-5 text-[#9a8d80]">
              <LockKeyhole className="mt-0.5 size-3.5 shrink-0" />
              Payments are processed securely by Razorpay (UPI, cards, net banking). DetheAI never
              stores card numbers, CVV, or other sensitive payment details. Cancel anytime from your
              dashboard.
            </p>
          </div>
        </section>

        <section className="border-t border-[#eadfd2] bg-[#fffdf8] px-5 py-16 sm:px-8">
          <div className="container max-w-3xl">
            <h2 className="display text-center text-3xl font-extrabold">
              Questions, answered.
            </h2>
            <div className="mt-8 grid gap-4">
              {FAQS.map((f) => (
                <div
                  key={f.q}
                  className="rounded-2xl border border-[#eadfd2] bg-[#f7f2ea] p-5 sm:p-6"
                >
                  <p className="text-sm font-extrabold text-[#2f3e36]">{f.q}</p>
                  <p className="mt-2 text-sm leading-6 text-[#81766c]">{f.a}</p>
                </div>
              ))}
            </div>
            <div className="mt-10 rounded-[28px] bg-[#1b7d5d] p-8 text-center sm:p-10">
              <h3 className="display text-3xl font-extrabold text-white">
                Ready to give your words a human voice?
              </h3>
              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#d8eddf]">
                Start free today and create your first voiceover in minutes.
              </p>
              <Link
                href="/login?mode=signup"
                className="mt-6 inline-block rounded-full bg-white px-6 py-3.5 text-sm font-bold text-[#1b7d5d]"
              >
                Create your free account <ArrowRight className="ml-2 inline size-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
      <Toaster />
    </div>
  );
}

export default function PricingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#fffaf2]" />}>
      <PricingPageInner />
    </Suspense>
  );
}
