import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { DM_Sans, Manrope } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-dm-sans",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-manrope",
  display: "swap",
});

function resolveSiteUrl(): URL | null {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL || "").trim();
  if (!raw) return null;
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
}
const siteUrl = resolveSiteUrl();

export const metadata: Metadata = {
  ...(siteUrl ? { metadataBase: siteUrl } : {}),
  title: "DetheAI · Natural Indian voices",
  description: "DetheAI — natural AI voices for every Indian language.",
};

export const viewport: Viewport = {
  themeColor: "#fffaf2",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`${dmSans.variable} ${manrope.variable} bg-[#fffaf2] text-[#17231f] antialiased`}>
        {children}
      </body>
    </html>
  );
}
