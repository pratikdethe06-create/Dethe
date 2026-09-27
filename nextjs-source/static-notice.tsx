"use client";

import { Info } from "lucide-react";
import { BACKEND_AVAILABLE, IS_STATIC_BUILD } from "@/lib/api-base";

const FEATURE_COPY: Record<string, string> = {
  studio: "Voice generation, previews and credits run on the DetheAI server.",
  login: "Sign in, sign up and Google login need the DetheAI server.",
  video: "Video to Text uploads and transcription run on the DetheAI server.",
  pricing: "Subscriptions and payments are processed by the DetheAI server and Razorpay webhooks.",
  dashboard: "Your projects, credits and subscription live on the DetheAI server.",
};

/**
 * Rendered only in the static (cPanel) build when no backend URL is configured.
 * It tells the visitor plainly that the feature is offline here — nothing is faked.
 */
export function StaticHostingNotice({
  feature,
  className = "",
}: {
  feature: keyof typeof FEATURE_COPY;
  className?: string;
}) {
  if (!IS_STATIC_BUILD || BACKEND_AVAILABLE) return null;
  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-2xl border border-[#f3d9cd] bg-[#fff5ef] px-4 py-3 text-sm leading-6 text-[#8a4a33] ${className}`}
    >
      <Info className="mt-1 size-4 shrink-0 text-[#b95e42]" />
      <div>
        <p className="font-extrabold">This part of DetheAI isn’t active on this hosting yet.</p>
        <p className="text-[13px]">
          {FEATURE_COPY[feature]} This copy of the site is a static build (no server), so the
          feature is shown for preview only and will not work until the DetheAI backend is
          connected.
        </p>
      </div>
    </div>
  );
}
