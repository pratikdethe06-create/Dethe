import { NextRequest, NextResponse } from "next/server";
import { billingOf, entitlementsOf, getUserWithFreshCredits, safeUser } from "@/lib/auth";
import { activeSubscriptionFor, reconcileUserPlan, summarize } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Rolls credits over automatically when a new monthly cycle has started.
  const user = await getUserWithFreshCredits(req);
  if (!user) {
    return NextResponse.json({ message: "Please login" }, { status: 401 });
  }
  // Paid users: make sure the plan still matches a live subscription (expiry safety net).
  const fresh = user.plan !== "Free" ? ((await reconcileUserPlan(user.id)) ?? user) : user;
  const active = fresh.plan !== "Free" ? await activeSubscriptionFor(fresh.id) : null;
  return NextResponse.json({
    user: safeUser(fresh),
    billing: billingOf(fresh),
    entitlements: entitlementsOf(fresh),
    subscription: active ? summarize(active) : null,
  });
}
