"use client";

import type { BillingCycle, Plan } from "@/lib/voices";
import { planPrice } from "@/lib/voices";

/**
 * Monthly / Yearly switch. Brand-green when yearly is active, with a
 * "Save 20%" badge next to the Yearly label.
 */
export function BillingToggle({
  value,
  onChange,
  className = "",
}: {
  value: BillingCycle;
  onChange: (cycle: BillingCycle) => void;
  className?: string;
}) {
  const yearly = value === "yearly";
  const toggle = () => onChange(yearly ? "monthly" : "yearly");

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div className="inline-flex items-center gap-3 rounded-full border border-[#eadfd2] bg-[#fffdf8] py-2 pl-4 pr-2 shadow-[0_6px_20px_rgba(64,50,34,.06)] sm:gap-4 sm:pl-5">
        <button
          type="button"
          onClick={() => onChange("monthly")}
          className={`text-sm font-bold transition-colors duration-300 ${
            yearly ? "text-[#9a8d80] hover:text-[#5f574f]" : "text-[#17231f]"
          }`}
        >
          Monthly
        </button>

        <button
          type="button"
          role="switch"
          aria-checked={yearly}
          aria-label="Toggle yearly billing"
          onClick={toggle}
          className={`billing-switch relative h-7 w-[52px] shrink-0 rounded-full transition-colors duration-300 ease-out focus:outline-none focus-visible:ring-4 focus-visible:ring-[#dcefe4] ${
            yearly ? "bg-[#1b7d5d]" : "bg-[#d8cec2]"
          }`}
        >
          <span
            className={`absolute left-[3px] top-[3px] size-[22px] rounded-full bg-white shadow-[0_2px_6px_rgba(23,35,31,.25)] transition-transform duration-300 ease-[cubic-bezier(.34,1.4,.64,1)] ${
              yearly ? "translate-x-[25px]" : "translate-x-0"
            }`}
          />
        </button>

        <button
          type="button"
          onClick={() => onChange("yearly")}
          className="flex items-center gap-2 rounded-full pr-1 text-sm font-bold"
        >
          <span
            className={`transition-colors duration-300 ${
              yearly ? "text-[#17231f]" : "text-[#9a8d80] hover:text-[#5f574f]"
            }`}
          >
            Yearly
          </span>
          <span
            className={`rounded-full bg-[#dcefe4] px-2.5 py-1 text-[11px] font-extrabold text-[#1b7d5d] transition-all duration-300 ${
              yearly ? "scale-100 opacity-100" : "scale-95 opacity-80"
            }`}
          >
            Save 20%
          </span>
        </button>
      </div>
    </div>
  );
}

/**
 * Animated price block: price crossfades between cycles and the yearly
 * "Billed … annually" note slides in without shifting the card layout.
 */
export function PlanPrice({
  plan,
  cycle,
  size = "md",
}: {
  plan: Plan;
  cycle: BillingCycle;
  size?: "md" | "lg";
}) {
  const yearly = cycle === "yearly";
  const price = planPrice(plan, cycle);
  const showNote = yearly && Boolean(plan.yearlyNote);

  return (
    <div className="mt-4">
      <p
        key={`${plan.title}-${cycle}`}
        className={`display price-swap font-extrabold ${size === "lg" ? "text-4xl" : "text-3xl"}`}
      >
        {price}
        <span className="text-sm font-semibold text-[#9a8d80]"> / month</span>
      </p>
      <div
        className={`grid transition-all duration-300 ease-out ${
          showNote ? "mt-1 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
        aria-hidden={!showNote}
      >
        <p className="overflow-hidden text-xs font-semibold text-[#9a8d80]">{plan.yearlyNote}</p>
      </div>
    </div>
  );
}
