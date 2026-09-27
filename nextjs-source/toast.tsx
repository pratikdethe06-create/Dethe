"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Info, XCircle } from "lucide-react";

export type ToastKind = "success" | "error" | "info";

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

export function toast(message: string, kind: ToastKind = "success") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("vaani-toast", { detail: { message, kind, id: Date.now() + Math.random() } })
  );
}

export const it = {
  success: (message: string) => toast(message, "success"),
  error: (message: string) => toast(message, "error"),
  info: (message: string) => toast(message, "info"),
};

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as ToastItem;
      setItems((prev) => [...prev.slice(-2), detail]);
      window.setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== detail.id));
      }, 3400);
    };
    window.addEventListener("vaani-toast", handler);
    return () => window.removeEventListener("vaani-toast", handler);
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 z-[100] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4 sm:left-auto sm:right-6 sm:translate-x-0 sm:px-0">
      {items.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-[0_16px_40px_rgba(23,35,31,.18)] ${
            t.kind === "success"
              ? "border-[#dcefe4] bg-[#f4fbf6] text-[#254b3a]"
              : t.kind === "error"
                ? "border-[#f3d9cd] bg-[#fff5ef] text-[#a14f35]"
                : "border-[#e8ded2] bg-[#fffdf8] text-[#403831]"
          }`}
        >
          {t.kind === "success" ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#1b7d5d]" />
          ) : t.kind === "error" ? (
            <XCircle className="mt-0.5 size-4 shrink-0 text-[#b95e42]" />
          ) : (
            <Info className="mt-0.5 size-4 shrink-0 text-[#1b7d5d]" />
          )}
          <span className="leading-6">{t.message}</span>
        </div>
      ))}
    </div>
  );
}
