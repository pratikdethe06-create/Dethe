// Plan catalogue — the single source of truth for what each plan grants.
// Shared by server (entitlements, credits) and browser (display). No secrets here.

export type PlanName = "Free" | "Pro" | "Business";
export type BillingCycle = "monthly" | "yearly";

export interface PlanFeatures {
  monthlyCredits: number;
  /** Max characters per generation; null = unlimited (still capped by API safety limit) */
  maxCharacters: number | null;
  voiceProfiles: number;
  styleSelection: boolean;
  downloadAudio: boolean;
  highQualityAudio: boolean;
  apiAccess: boolean;
  teamSeats: number;
  support: string;
}

export interface PlanDef {
  name: PlanName;
  tagline: string;
  /** INR per month when billed monthly */
  monthlyPrice: number;
  /** INR effective per month when billed yearly */
  yearlyMonthlyPrice: number;
  /** INR charged once per year */
  yearlyTotal: number;
  features: PlanFeatures;
}

export const PLAN_DEFS: Record<PlanName, PlanDef> = {
  Free: {
    name: "Free",
    tagline: "For trying your next idea",
    monthlyPrice: 0,
    yearlyMonthlyPrice: 0,
    yearlyTotal: 0,
    features: {
      monthlyCredits: 10_000,
      maxCharacters: 1_000,
      voiceProfiles: 50,
      styleSelection: false,
      downloadAudio: false,
      highQualityAudio: false,
      apiAccess: false,
      teamSeats: 1,
      support: "Community",
    },
  },
  Pro: {
    name: "Pro",
    tagline: "For creators who ship often",
    monthlyPrice: 799,
    yearlyMonthlyPrice: 665,
    yearlyTotal: 7_990,
    features: {
      monthlyCredits: 50_000,
      maxCharacters: 4_000,
      voiceProfiles: 250,
      styleSelection: true,
      downloadAudio: true,
      highQualityAudio: false,
      apiAccess: false,
      teamSeats: 1,
      support: "Priority Email",
    },
  },
  Business: {
    name: "Business",
    tagline: "For teams and agencies",
    monthlyPrice: 2_499,
    yearlyMonthlyPrice: 1_999,
    yearlyTotal: 23_988,
    features: {
      monthlyCredits: 200_000,
      maxCharacters: null,
      voiceProfiles: 550,
      styleSelection: true,
      downloadAudio: true,
      highQualityAudio: true,
      apiAccess: true,
      teamSeats: 5,
      support: "24/7 Dedicated Manager",
    },
  },
};

export const PAID_PLANS: PlanName[] = ["Pro", "Business"];

export function isPlanName(v: unknown): v is PlanName {
  return v === "Free" || v === "Pro" || v === "Business";
}

export function isPaidPlan(v: unknown): v is "Pro" | "Business" {
  return v === "Pro" || v === "Business";
}

export function isBillingCycle(v: unknown): v is BillingCycle {
  return v === "monthly" || v === "yearly";
}

/** Amount charged per billing period, in paise (Razorpay's unit). */
export function planAmountPaise(plan: "Pro" | "Business", cycle: BillingCycle): number {
  const def = PLAN_DEFS[plan];
  return (cycle === "yearly" ? def.yearlyTotal : def.monthlyPrice) * 100;
}

export function planFeatures(plan: string): PlanFeatures {
  return (isPlanName(plan) ? PLAN_DEFS[plan] : PLAN_DEFS.Free).features;
}
