import type { Metadata } from "next";
import Link from "next/link";
import { Poppins } from "next/font/google";
import { ArrowLeft, ArrowRight, FolderOpen, MousePointer2, Sparkles } from "lucide-react";
import { BrandLogo } from "@/components/brand";
import ScrollIntro from "@/components/ScrollIntro";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: "DetheAi · Intro animation",
  description: "Scroll-driven brand reveal for DetheAi.",
};

export default function IntroPage() {
  return (
    <div className={`${poppins.variable} min-h-screen bg-[#f6f9fb] text-[#17231f]`}>
      <header className="absolute inset-x-0 top-0 z-20 hidden md:block">
        <div className="container flex h-[74px] items-center justify-between" />
      </header>

      <ScrollIntro fontFamily={poppins.style.fontFamily} />

      {/* after the animation */}
      <section className="relative border-t border-[#dbe7ee] bg-[#fffaf2] px-5 py-20 sm:px-8">
        <div className="container grid items-start gap-10 lg:grid-cols-[1.1fr_.9fr]">
          <div>
            <BrandLogo />
            <p className="mt-8 inline-flex items-center gap-2 rounded-full border border-[#d8e8de] bg-[#eef7f1] px-3.5 py-2 text-[12px] font-bold text-[#1b7d5d]">
              <MousePointer2 className="size-3.5" /> Scroll-driven brand reveal
            </p>
            <h1 className="display mt-5 max-w-xl text-4xl font-extrabold leading-[1.02] tracking-[-.05em] sm:text-5xl">
              Every scroll is a frame.
              <br />
              <span className="text-[#1b7d5d]">Every frame is a voice.</span>
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-[#776f66]">
              The waveform above breathes into the DetheAi wordmark as you scroll — the same
              sequence as the exported animation frames, scrubbed frame by frame instead of on a
              timer.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/#studio"
                className="rounded-full bg-[#1b7d5d] px-6 py-3.5 text-center text-sm font-bold text-white shadow-[0_9px_22px_rgba(27,125,93,.2)]"
              >
                Open the voice studio <ArrowRight className="ml-2 inline size-4" />
              </Link>
              <Link
                href="/"
                className="rounded-full border border-[#d8cec2] px-6 py-3.5 text-center text-sm font-bold text-[#5f574f] hover:border-[#1b7d5d] hover:text-[#1b7d5d]"
              >
                <ArrowLeft className="mr-2 inline size-4" /> Back to DetheAi
              </Link>
            </div>
          </div>

          <div className="rounded-[28px] border border-[#eadfd2] bg-[#fffdf8] p-6 shadow-[0_24px_70px_rgba(64,50,34,.08)] sm:p-8">
            <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[.18em] text-[#1b7d5d]">
              <FolderOpen className="size-4" /> Use your exported frames
            </p>
            <h2 className="display mt-3 text-2xl font-extrabold tracking-[-.04em]">
              Drop the frames folder in, refresh — done.
            </h2>
            <ol className="mt-5 space-y-3 text-sm leading-6 text-[#5f574f]">
              <li className="flex gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#dcefe4] text-[11px] font-extrabold text-[#1b7d5d]">
                  1
                </span>
                Copy all frame images into{" "}
                <code className="rounded-md bg-[#f5efe8] px-1.5 py-0.5 font-mono text-[12px] text-[#403831]">
                  public/frames/
                </code>
              </li>
              <li className="flex gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#dcefe4] text-[11px] font-extrabold text-[#1b7d5d]">
                  2
                </span>
                Any names work — frame_0001.jpg … frame_0240.jpg (png / jpg / webp). They are
                sorted naturally.
              </li>
              <li className="flex gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#dcefe4] text-[11px] font-extrabold text-[#1b7d5d]">
                  3
                </span>
                Reload <span className="font-bold">/intro</span>. The page detects the frames and
                scrubs through the originals as you scroll.
              </li>
            </ol>
            <p className="mt-6 flex items-start gap-2 rounded-2xl border border-[#dcefe4] bg-[#f4fbf6] px-4 py-3 text-xs leading-5 text-[#39755b]">
              <Sparkles className="mt-0.5 size-3.5 shrink-0" />
              Until then, the page plays a live recreation of the sequence — waveform, particles,
              wordmark and logo mark — rendered smoothly at any scroll position.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
