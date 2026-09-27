"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, CalendarClock, LogOut, Menu, X, Zap } from "lucide-react";
import { BrandLogo } from "@/components/brand";
import { signOut, useSession } from "@/components/auth-gate";
import type { BillingSummary } from "@/lib/auth";

function formatResetAt(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${date}, ${time}`;
}

function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
}

/** Credits summary shown at the bottom of the mobile menu for signed-in users. */
function MobileCreditsCard({ billing }: { billing: BillingSummary }) {
  const usedPct =
    billing.creditsLimit > 0
      ? Math.min(100, Math.round((billing.creditsUsed / billing.creditsLimit) * 100))
      : 0;
  const low = billing.creditsRemaining <= billing.creditsLimit * 0.1;
  const days = daysUntil(billing.resetsAt);

  return (
    <div className="rounded-2xl border border-[#dcefe4] bg-[#f4fbf6] p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[.14em] text-[#1b7d5d]">
          <Zap className="size-3.5" /> Monthly credits
        </span>
        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-extrabold text-[#5f574f]">
          {billing.planName} plan
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#9a8d80]">Used</p>
          <p className="display mt-0.5 text-xl font-extrabold text-[#b95e42]">
            {billing.creditsUsed.toLocaleString()}
          </p>
          <p className="text-[10px] font-semibold text-[#a09488]">of {billing.creditsLimit.toLocaleString()}</p>
        </div>
        <div className="rounded-xl bg-white px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#9a8d80]">Remaining</p>
          <p className={`display mt-0.5 text-xl font-extrabold ${low ? "text-[#b95e42]" : "text-[#1b7d5d]"}`}>
            {billing.creditsRemaining.toLocaleString()}
          </p>
          <p className="text-[10px] font-semibold text-[#a09488]">
            ≈ {billing.wordsRemaining.toLocaleString()} words
          </p>
        </div>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#dcefe4]">
        <div
          className={`h-full rounded-full transition-all duration-500 ${low ? "bg-[#b95e42]" : "bg-[#1b7d5d]"}`}
          style={{ width: `${usedPct}%` }}
        />
      </div>
      <p className="mt-1.5 text-[11px] font-semibold text-[#789183]">{usedPct}% used this month</p>

      <div className="mt-3 flex items-start gap-2 rounded-xl bg-white px-3 py-2.5 text-[11px] font-semibold text-[#5f574f]">
        <CalendarClock className="mt-0.5 size-3.5 shrink-0 text-[#1b7d5d]" />
        <span>
          Resets to {billing.creditsLimit.toLocaleString()} on{" "}
          <span className="font-extrabold text-[#17231f]">{formatResetAt(billing.resetsAt)}</span>
          <span className="text-[#9a8d80]"> · in {days} {days === 1 ? "day" : "days"}</span>
        </span>
      </div>

      {low && (
        <Link
          href="/pricing"
          className="mt-3 flex items-center justify-center rounded-xl bg-[#1b7d5d] py-2.5 text-xs font-bold text-white"
        >
          Running low — upgrade plan <ArrowRight className="ml-1.5 size-3.5" />
        </Link>
      )}
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <span className="grid size-8 place-items-center rounded-full bg-[#dcefe4] text-[11px] font-extrabold text-[#1b7d5d]">
      {initials || "V"}
    </span>
  );
}

export function Header({ onOpenLibrary }: { onOpenLibrary?: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { user, billing, loading, refresh } = useSession();

  // Pull the latest balance every time the mobile menu is opened.
  useEffect(() => {
    if (menuOpen && user) refresh();
  }, [menuOpen, user, refresh]);

  const goStudio = () => {
    if (pathname === "/") {
      document.getElementById("studio")?.scrollIntoView({ behavior: "smooth" });
    } else {
      router.push("/#studio");
    }
  };

  const openLibrary = () => {
    if (onOpenLibrary) return onOpenLibrary();
    if (pathname === "/") {
      document.getElementById("voices")?.scrollIntoView({ behavior: "smooth" });
    } else {
      router.push("/#voices");
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-[#eadfd2]/70 bg-[#fffaf2]/90 backdrop-blur-xl">
      <div className="container flex h-[74px] items-center justify-between">
        <BrandLogo />
        <nav className="hidden items-center gap-8 text-[13px] font-semibold text-[#6b625a] md:flex">
          <a
            href="#studio"
            onClick={(e) => {
              e.preventDefault();
              goStudio();
            }}
            className="hover:text-[#1b7d5d]"
          >
            Text to Speech
          </a>
          <button onClick={openLibrary} className="hover:text-[#1b7d5d]">
            Voice library
          </button>
          <Link href="/video-to-text" className="flex items-center gap-1.5 hover:text-[#1b7d5d]">
            Video to Text
            <span className="rounded-full bg-[#dcefe4] px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-[#1b7d5d]">
              New
            </span>
          </Link>
          <Link href="/pricing" className="hover:text-[#1b7d5d]">
            Pricing
          </Link>
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {loading ? (
            <span className="h-9 w-40 animate-pulse rounded-full bg-[#f5efe8]" />
          ) : user ? (
            <>
              <Link
                href="/dashboard"
                className="flex items-center gap-2 rounded-full px-2 py-1.5 text-[13px] font-semibold text-[#6b625a] hover:text-[#1b7d5d]"
                title="My projects & credits"
              >
                <Avatar name={user.name} />
                <span className="max-w-[120px] truncate">{user.name.split(" ")[0]}</span>
              </Link>
              <button
                onClick={() => signOut("/")}
                className="flex items-center gap-1.5 px-3 py-2 text-[13px] font-semibold text-[#6b625a] hover:text-[#1b7d5d]"
              >
                <LogOut className="size-3.5" /> Sign out
              </button>
              <button
                onClick={goStudio}
                className="rounded-full bg-[#1b7d5d] px-5 py-2.5 text-[13px] font-bold text-white shadow-[0_5px_16px_rgba(27,125,93,.22)] hover:-translate-y-0.5"
              >
                Voice Studio <ArrowRight className="ml-1 inline size-3.5" />
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="px-3 py-2 text-[13px] font-semibold text-[#6b625a] hover:text-[#1b7d5d]"
              >
                Sign in
              </Link>
              <Link
                href="/login?mode=signup"
                className="rounded-full bg-[#1b7d5d] px-5 py-2.5 text-[13px] font-bold text-white shadow-[0_5px_16px_rgba(27,125,93,.22)] hover:-translate-y-0.5"
              >
                Try it free <ArrowRight className="ml-1 inline size-3.5" />
              </Link>
            </>
          )}
        </div>

        <button
          className="rounded-lg p-2 md:hidden"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {menuOpen && (
        <nav className="border-t border-[#eadfd2] bg-[#fffaf2] px-5 py-4 md:hidden">
          <div className="flex flex-col gap-4 text-sm font-semibold text-[#6b625a]">
            {user && (
              <div className="flex items-center gap-3 rounded-2xl bg-[#f7f2ea] px-3 py-2.5">
                <Avatar name={user.name} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-[#17231f]">{user.name}</p>
                  <p className="truncate text-[11px] text-[#8f8378]">{user.email}</p>
                </div>
              </div>
            )}
            <a
              href="#studio"
              onClick={(e) => {
                e.preventDefault();
                setMenuOpen(false);
                goStudio();
              }}
            >
              Text to Speech
            </a>
            <button
              className="text-left"
              onClick={() => {
                setMenuOpen(false);
                openLibrary();
              }}
            >
              Voice library
            </button>
            <Link href="/video-to-text" onClick={() => setMenuOpen(false)} className="flex items-center gap-2">
              Video to Text
              <span className="rounded-full bg-[#dcefe4] px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-[#1b7d5d]">
                New
              </span>
            </Link>
            <Link href="/pricing" onClick={() => setMenuOpen(false)}>
              Pricing
            </Link>
            {user ? (
              <>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    goStudio();
                  }}
                  className="rounded-full bg-[#1b7d5d] py-3 text-center text-white"
                >
                  Open Voice Studio
                </button>
                <Link href="/dashboard" onClick={() => setMenuOpen(false)}>
                  My projects & credits
                </Link>
                <button onClick={() => signOut("/")} className="text-left text-[#b95e42]">
                  Sign out
                </button>
                {billing && <MobileCreditsCard billing={billing} />}
              </>
            ) : (
              <>
                <Link href="/login" onClick={() => setMenuOpen(false)}>
                  Sign in
                </Link>
                <Link
                  href="/login?mode=signup"
                  className="rounded-full bg-[#1b7d5d] py-3 text-center text-white"
                >
                  Try it free
                </Link>
              </>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-[#eadfd2] bg-[#fffaf2] px-5 py-10 sm:px-8">
      <div className="container flex flex-col gap-6 text-sm text-[#81766c] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <BrandLogo />
          <p className="mt-3 text-xs">Natural voices for every story worth hearing.</p>
          <p className="mt-1 text-xs text-[#a09488]">© 2026 DetheAi. All rights reserved.</p>
        </div>
        <div className="flex flex-wrap items-center gap-5 text-xs font-semibold">
          <Link href="/#studio" className="hover:text-[#1b7d5d]">
            Text to Speech
          </Link>
          <Link href="/#voices" className="hover:text-[#1b7d5d]">
            Voices
          </Link>
          <Link href="/video-to-text" className="hover:text-[#1b7d5d]">
            Video to Text
          </Link>
          <Link href="/pricing" className="hover:text-[#1b7d5d]">
            Pricing
          </Link>
          <Link href="/intro" className="hover:text-[#1b7d5d]">
            Intro animation
          </Link>
          <Link href="/login" className="hover:text-[#1b7d5d]">
            Sign in
          </Link>
        </div>
      </div>
    </footer>
  );
}
