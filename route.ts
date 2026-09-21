import { NextResponse } from "next/server";
import { emailConfigured } from "@/lib/mailer";

export const dynamic = "force-dynamic";

/** Feature flags only — never returns secret values. */
export async function GET() {
  return NextResponse.json({
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    email: emailConfigured(),
  });
}
