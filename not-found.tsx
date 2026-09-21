import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BrandLogo } from "@/components/brand";

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center bg-[#fffaf2] px-5 text-[#17231f]">
      <div className="w-full max-w-md text-center">
        <div className="flex justify-center">
          <BrandLogo />
        </div>
        <p className="mt-8 text-xs font-extrabold uppercase tracking-[.18em] text-[#1b7d5d]">404</p>
        <h1 className="display mt-3 text-4xl font-extrabold tracking-[-.04em]">Page not found</h1>
        <p className="mt-3 text-sm leading-6 text-[#776f66]">
          The page you’re looking for doesn’t exist or has moved.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center rounded-full bg-[#1b7d5d] px-6 py-3 text-sm font-bold text-white"
        >
          <ArrowLeft className="mr-2 size-4" /> Back to DetheAI
        </Link>
      </div>
    </div>
  );
}
