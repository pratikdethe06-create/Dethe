import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Download, FileArchive, FolderUp, ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/components/brand";

export const metadata: Metadata = {
  title: "Download static build · DetheAI",
  robots: { index: false, follow: false },
};

const ZIP = "/detheai-static-cpanel.zip";

export default function DownloadPage() {
  return (
    <div className="min-h-screen bg-[#fffaf2] text-[#17231f]">
      <header className="border-b border-[#eadfd2]/70 px-5 py-4 sm:px-8 sm:py-5">
        <div className="container flex items-center justify-between">
          <BrandLogo />
          <Link href="/" className="flex items-center gap-2 text-sm font-bold text-[#6f675e] hover:text-[#1b7d5d]">
            <ArrowLeft className="size-4" /> Back to DetheAI
          </Link>
        </div>
      </header>

      <main className="grain grid min-h-[calc(100vh-74px)] place-items-center px-4 py-10 sm:px-8">
        <section className="w-full max-w-[560px] rounded-[28px] border border-[#eadfd2] bg-[#fffdf8] p-6 shadow-[0_24px_70px_rgba(64,50,34,.1)] sm:p-8">
          <p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#1b7d5d]">cPanel static build</p>
          <h1 className="display mt-2 text-3xl font-extrabold tracking-[-.04em]">Download the public_html package</h1>
          <p className="mt-3 text-sm leading-6 text-[#80766d]">
            Pure HTML / CSS / JavaScript export of DetheAI. Upload the contents to{" "}
            <code className="rounded-md bg-[#f5efe8] px-1.5 py-0.5 font-mono text-[12px]">public_html</code> on
            GoDaddy — no Node.js server needed.
          </p>

          <a
            href={ZIP}
            download="detheai-static-cpanel.zip"
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#1b7d5d] py-3.5 text-sm font-bold text-white shadow-[0_8px_18px_rgba(27,125,93,.22)] transition hover:-translate-y-0.5"
          >
            <Download className="size-4" /> Download detheai-static-cpanel.zip
          </a>
          <p className="mt-2 text-center text-[11px] font-semibold text-[#a09488]">
            ≈ 0.9 MB · 75 files · includes .htaccess + README-CPANEL.txt
          </p>

          <div className="mt-6 grid gap-3 text-sm text-[#5f574f]">
            {[
              [FileArchive, "cPanel → File Manager → public_html → Upload this zip."],
              [FolderUp, "Right-click the zip → Extract. Then delete the zip."],
              [ShieldCheck, "Turn on “Show hidden files” to confirm .htaccess is present, run AutoSSL."],
            ].map(([Icon, text], i) => {
              const I = Icon as typeof FileArchive;
              return (
                <div key={i} className="flex items-start gap-3 rounded-2xl bg-[#f7f2ea] px-4 py-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-[#1b7d5d] shadow-sm">
                    <I className="size-4" />
                  </span>
                  <p className="leading-6">{text as string}</p>
                </div>
              );
            })}
          </div>

          <p className="mt-6 rounded-2xl border border-[#f3d9cd] bg-[#fff5ef] px-4 py-3 text-[12px] leading-5 text-[#8a4a33]">
            Static hosting shows the full design but cannot run login, voices, credits, Video to Text,
            payments or Razorpay webhooks — those need the DetheAI server. See README-CPANEL.txt inside the
            zip for the two ways to connect a live backend.
          </p>
        </section>
      </main>
    </div>
  );
}
