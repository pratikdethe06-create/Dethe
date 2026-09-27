import type { Metadata } from "next";
import { Suspense } from "react";
import LoginClient from "@/components/LoginClient";

export const metadata: Metadata = {
  title: "Sign in · DetheAi",
  description: "Sign in or create your free DetheAi account to open the Voice Studio.",
};

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center bg-[#fffaf2] text-sm font-semibold text-[#8f8378]">
          Loading…
        </div>
      }
    >
      <LoginClient />
    </Suspense>
  );
}
