"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, LockKeyhole, Sparkles, X } from "lucide-react";
import type { BillingSummary, SafeUser } from "@/lib/auth";
import { apiFetch, apiUrl } from "@/lib/api-base";

/* ------------------------------------------------------------------ */
/*  Shared session store (one request, many components)               */
/* ------------------------------------------------------------------ */

export interface SessionData {
  user: SafeUser | null;
  billing: BillingSummary | null;
}

let cache: Promise<SessionData> | null = null;
const listeners = new Set<(s: SessionData) => void>();

export function loadSession(force = false): Promise<SessionData> {
  if (!cache || force) {
    cache = apiFetch("/api/auth/me", { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as SessionData) : { user: null, billing: null }))
      .catch(() => ({ user: null, billing: null }));
    cache.then((s) => listeners.forEach((l) => l(s)));
  }
  return cache;
}

export function useSession() {
  const [state, setState] = useState<SessionData & { loading: boolean }>({
    user: null,
    billing: null,
    loading: true,
  });

  useEffect(() => {
    let alive = true;
    const listener = (s: SessionData) => {
      if (alive) setState({ ...s, loading: false });
    };
    listeners.add(listener);
    loadSession().then(listener);
    return () => {
      alive = false;
      listeners.delete(listener);
    };
  }, []);

  const refresh = useCallback(() => loadSession(true), []);
  return { ...state, refresh };
}

export async function signOut(redirectTo = "/") {
  await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => null);
  cache = null;
  window.location.href = redirectTo;
}

/* ------------------------------------------------------------------ */
/*  Sign-in prompt shown when a guest tries to use the studio          */
/* ------------------------------------------------------------------ */

export type GateReason = "generate" | "listen" | "studio";

const COPY: Record<GateReason, { title: string; body: string }> = {
  generate: {
    title: "Sign in to generate your voiceover",
    body: "Natural DetheAi voices are available to signed-in members. It's free to start — 10,000 credits every month.",
  },
  listen: {
    title: "Sign in to hear this voice",
    body: "Voice previews use real studio audio, so they're available to signed-in members. Create a free account in seconds.",
  },
  studio: {
    title: "Sign in to open the Voice Studio",
    body: "Your projects, credits and downloads live in your DetheAi account.",
  },
};

function GoogleG({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export { GoogleG };

export function AuthGateModal({
  open,
  onClose,
  reason,
  next = "/#studio",
}: {
  open: boolean;
  onClose: () => void;
  reason: GateReason;
  next?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const copy = COPY[reason];
  const q = `next=${encodeURIComponent(next)}`;

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-[#17231f]/55 backdrop-blur-sm" onClick={onClose} />
      <div className="modal-pop relative w-full max-w-md rounded-t-[28px] border border-[#eadfd2] bg-[#fffdf8] p-6 shadow-[0_30px_90px_rgba(23,35,31,.35)] sm:rounded-[28px] sm:p-8">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 grid size-9 place-items-center rounded-full bg-[#f5efe8] text-[#6f675e] hover:text-[#1b7d5d]"
        >
          <X className="size-4" />
        </button>
        <span className="grid size-12 place-items-center rounded-2xl bg-[#dcefe4] text-[#1b7d5d]">
          <LockKeyhole className="size-5" />
        </span>
        <h3 className="display mt-4 text-2xl font-extrabold tracking-[-.04em] text-[#17231f]">
          {copy.title}
        </h3>
        <p className="mt-2 text-sm leading-6 text-[#776f66]">{copy.body}</p>

        <div className="mt-6 grid gap-2.5">
          <a
            href={apiUrl(`/api/auth/google?${q}`)}
            className="flex items-center justify-center gap-3 rounded-xl border border-[#d8cec2] bg-white py-3 text-sm font-bold text-[#403831] transition hover:border-[#1b7d5d] hover:bg-[#f7fcf8]"
          >
            <GoogleG /> Continue with Google
          </a>
          <Link
            href={`/login?${q}`}
            className="flex items-center justify-center rounded-xl bg-[#1b7d5d] py-3 text-sm font-bold text-white shadow-[0_8px_18px_rgba(27,125,93,.22)]"
          >
            Sign in with email <ArrowRight className="ml-2 size-4" />
          </Link>
          <Link
            href={`/login?mode=signup&${q}`}
            className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-[#1b7d5d] hover:underline"
          >
            <Sparkles className="size-4" /> Create a free account
          </Link>
        </div>
        <p className="mt-4 text-center text-[11px] leading-5 text-[#a09488]">
          Free plan · 10,000 credits / month · No card required
        </p>
      </div>
    </div>
  );
}
