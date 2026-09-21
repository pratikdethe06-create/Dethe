"use client";

import { useState } from "react";
import { Check, Minus, Sparkles } from "lucide-react";
import type { BillingCycle } from "@/lib/voices";
import { PlanCta } from "@/components/plan-cta";
import type { CheckoutState } from "@/components/use-checkout";

type Cell =
  | { kind: "text"; value: string }
  | { kind: "yes"; note?: string }
  | { kind: "no" };

interface Row {
  label: string;
  hint?: string;
  cells: [Cell, Cell, Cell];
}

const PLAN_NAMES = ["Free", "Pro", "Business"] as const;
type PlanName = (typeof PLAN_NAMES)[number];

const PLAN_META: Record<PlanName, { tagline: string; monthly: string; yearly: string }> = {
  Free: { tagline: "For trying your next idea", monthly: "₹0", yearly: "₹0" },
  Pro: { tagline: "For creators who ship often", monthly: "₹799", yearly: "₹665" },
  Business: { tagline: "For teams and agencies", monthly: "₹2,499", yearly: "₹1,999" },
};

const text = (value: string): Cell => ({ kind: "text", value });
const yes = (note?: string): Cell => ({ kind: "yes", note });
const no = (): Cell => ({ kind: "no" });

const ROWS: Row[] = [
  {
    label: "Monthly credits",
    hint: "5 credits per 100 words",
    cells: [text("10,000"), text("50,000"), text("200,000")],
  },
  { label: "Indian languages", cells: [text("All 11"), text("All 11"), text("All 11")] },
  { label: "Voice profiles", cells: [text("50"), text("250+"), text("550+")] },
  {
    label: "Characters / generation",
    cells: [text("1,000"), text("4,000"), text("Unlimited")],
  },
  { label: "Voice style selection", cells: [no(), yes(), yes()] },
  {
    label: "Download audio (MP3/WAV)",
    cells: [no(), yes(), yes("High Quality")],
  },
  { label: "API access", cells: [no(), no(), yes()] },
  { label: "Team workspace", cells: [no(), no(), yes("Up to 5 seats")] },
  {
    label: "Support",
    cells: [text("Community"), text("Priority Email"), text("24/7 Dedicated Manager")],
  },
];

function CellValue({ cell, highlight = false }: { cell: Cell; highlight?: boolean }) {
  if (cell.kind === "no") {
    return (
      <span className="inline-flex items-center justify-center" aria-label="Not included">
        <Minus className="size-4 text-[#cfc4b8]" />
      </span>
    );
  }
  if (cell.kind === "yes") {
    return (
      <span className="inline-flex flex-col items-center gap-1" aria-label="Included">
        <span
          className={`grid size-6 place-items-center rounded-full ${
            highlight ? "bg-[#1b7d5d] text-white" : "bg-[#dcefe4] text-[#1b7d5d]"
          }`}
        >
          <Check className="size-3.5" strokeWidth={3} />
        </span>
        {cell.note && (
          <span className="text-[11px] font-bold leading-4 text-[#1b7d5d]">{cell.note}</span>
        )}
      </span>
    );
  }
  return (
    <span className={`text-sm font-bold ${highlight ? "text-[#17231f]" : "text-[#5f574f]"}`}>
      {cell.value}
    </span>
  );
}

export function PlanComparison({
  cycle,
  onSubscribe,
  checkoutState,
  checkoutPlan,
}: {
  cycle: BillingCycle;
  onSubscribe: (plan: "Pro" | "Business", cycle: BillingCycle) => void;
  checkoutState: CheckoutState;
  checkoutPlan: string | null;
}) {
  const [activePlan, setActivePlan] = useState<PlanName>("Pro");
  const activeIdx = PLAN_NAMES.indexOf(activePlan);

  return (
    <div>
      <div className="text-center">
        <p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#1b7d5d]">
          Compare plans
        </p>
        <h2 className="display mt-3 text-3xl font-extrabold tracking-[-.04em] sm:text-4xl">
          Everything, side by side.
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[#81766c]">
          Every plan includes all 11 Indian languages and DetheAi’s natural voice engine.
        </p>
      </div>

      {/* ── Mobile: plan tabs (one column at a time, no squeezing) ── */}
      <div className="mt-7 md:hidden">
        <div
          role="tablist"
          aria-label="Choose a plan to compare"
          className="grid grid-cols-3 rounded-2xl bg-[#f5efe8] p-1 text-sm font-bold"
        >
          {PLAN_NAMES.map((name) => (
            <button
              key={name}
              role="tab"
              aria-selected={activePlan === name}
              onClick={() => setActivePlan(name)}
              className={`relative rounded-xl py-2.5 transition ${
                activePlan === name
                  ? "bg-white text-[#17231f] shadow-sm"
                  : "text-[#8f8378] hover:text-[#5f574f]"
              }`}
            >
              {name}
              {name === "Pro" && (
                <span className="absolute -top-2 right-1 rounded-full bg-[#1b7d5d] px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wide text-white">
                  Popular
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="mt-4 overflow-hidden rounded-3xl border border-[#eadfd2] bg-[#fffdf8]">
          <div className="flex items-end justify-between border-b border-[#eadfd2] bg-[#f7f2ea] px-5 py-4">
            <div>
              <p className="text-sm font-extrabold text-[#1b7d5d]">{activePlan}</p>
              <p className="text-[11px] font-semibold text-[#8f8378]">{PLAN_META[activePlan].tagline}</p>
            </div>
            <p className="display text-2xl font-extrabold text-[#17231f]">
              {cycle === "yearly" ? PLAN_META[activePlan].yearly : PLAN_META[activePlan].monthly}
              <span className="text-xs font-semibold text-[#9a8d80]"> / mo</span>
            </p>
          </div>
          <ul>
            {ROWS.map((row) => (
              <li
                key={row.label}
                className="flex items-center justify-between gap-4 border-b border-[#f1e9dd] px-5 py-3.5 last:border-0"
              >
                <div>
                  <p className="text-sm font-bold text-[#5f574f]">{row.label}</p>
                  {row.hint && <p className="text-[11px] text-[#a09488]">{row.hint}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <CellValue cell={row.cells[activeIdx]} highlight={activePlan === "Pro"} />
                </div>
              </li>
            ))}
          </ul>
          <div className="p-4">
            <PlanCta
              plan={activePlan}
              cycle={cycle}
              primary={activePlan === "Pro"}
              onSubscribe={onSubscribe}
              checkoutState={checkoutState}
              checkoutPlan={checkoutPlan}
            />
          </div>
        </div>
        <p className="mt-3 text-center text-[11px] font-semibold text-[#a09488]">
          Swipe the tabs above to compare Free, Pro and Business.
        </p>
      </div>

      {/* ── Desktop / tablet: full 3-column table (scrolls smoothly if narrow) ── */}
      <div className="hide-scroll -mx-5 mt-8 hidden overflow-x-auto px-5 pb-2 md:block sm:mx-0 sm:px-0">
        <div className="min-w-[720px] overflow-hidden rounded-3xl border border-[#eadfd2] bg-[#fffdf8] shadow-[0_18px_50px_rgba(64,50,34,.06)]">
          <table className="w-full table-fixed border-collapse text-left">
            <colgroup>
              <col className="w-[34%]" />
              <col className="w-[22%]" />
              <col className="w-[22%]" />
              <col className="w-[22%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-[#eadfd2] bg-[#f7f2ea]">
                <th scope="col" className="px-6 py-5 align-bottom text-xs font-extrabold uppercase tracking-[.12em] text-[#8b7e72]">
                  Features
                </th>
                {PLAN_NAMES.map((name) => {
                  const pro = name === "Pro";
                  return (
                    <th
                      key={name}
                      scope="col"
                      className={`relative px-4 py-5 text-center align-bottom ${pro ? "bg-[#eef7f1]" : ""}`}
                    >
                      {pro && (
                        <span className="absolute left-1/2 top-2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-[#1b7d5d] px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">
                          <Sparkles className="size-3" /> Most popular
                        </span>
                      )}
                      <p className={`mt-3 text-sm font-extrabold ${pro ? "text-[#1b7d5d]" : "text-[#17231f]"}`}>
                        {name}
                      </p>
                      <p className="display mt-1 text-2xl font-extrabold text-[#17231f]">
                        {cycle === "yearly" ? PLAN_META[name].yearly : PLAN_META[name].monthly}
                        <span className="text-xs font-semibold text-[#9a8d80]"> / mo</span>
                      </p>
                      <p className="mt-1 text-[11px] font-semibold text-[#8f8378]">{PLAN_META[name].tagline}</p>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, i) => (
                <tr
                  key={row.label}
                  className={`border-b border-[#f1e9dd] transition-colors last:border-0 hover:bg-[#fffaf2] ${
                    i % 2 === 1 ? "bg-[#fdfaf5]" : ""
                  }`}
                >
                  <th scope="row" className="px-6 py-4 text-left font-bold text-[#5f574f]">
                    <span className="text-sm">{row.label}</span>
                    {row.hint && <span className="block text-[11px] font-semibold text-[#a09488]">{row.hint}</span>}
                  </th>
                  {row.cells.map((cell, ci) => {
                    const pro = ci === 1;
                    return (
                      <td key={ci} className={`px-4 py-4 text-center align-middle ${pro ? "bg-[#eef7f1]/60" : ""}`}>
                        <CellValue cell={cell} highlight={pro} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[#eadfd2] bg-[#f7f2ea]">
                <td className="px-6 py-4 text-[11px] font-semibold text-[#a09488]">
                  Prices in INR · {cycle === "yearly" ? "billed annually" : "billed monthly"} · cancel anytime
                </td>
                {PLAN_NAMES.map((name) => {
                  const pro = name === "Pro";
                  return (
                    <td key={name} className={`px-4 py-4 text-center ${pro ? "bg-[#eef7f1]" : ""}`}>
                      <div className="mx-auto max-w-[190px]">
                        <PlanCta
                          plan={name}
                          cycle={cycle}
                          primary={pro}
                          compact
                          onSubscribe={onSubscribe}
                          checkoutState={checkoutState}
                          checkoutPlan={checkoutPlan}
                        />
                      </div>
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
