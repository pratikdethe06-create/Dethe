import type { Metadata } from "next";
import { Suspense } from "react";
import ResetPasswordClient from "@/components/ResetPasswordClient";

export const metadata: Metadata = {
  title: "Choose a new password · DetheAi",
};

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center bg-[#fffaf2] text-sm font-semibold text-[#8f8378]">
          Loading…
        </div>
      }
    >
      <ResetPasswordClient />
    </Suspense>
  );
}
