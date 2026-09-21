import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import type { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { creditLedger, users, type User } from "@/db/schema";
import {
  CREDITS_PER_BLOCK,
  WORDS_PER_BLOCK,
  currentCycleStart,
  cycleExpired,
  nextResetDate,
  wordsForCredits,
} from "@/lib/credits";
import { planFeatures } from "@/lib/plans";

export const SESSION_COOKIE = "vaani_session";
export const SESSION_DAYS = 7;
export const SESSION_DAYS_REMEMBER = 30;

const secretKey = new TextEncoder().encode(
  process.env.AUTH_SECRET || "vaani-dev-secret-change-in-production-please"
);

/* ---------------- passwords ---------------- */

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 11);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

/* ---------------- sessions ---------------- */

export async function createToken(
  payload: { userId: string; email: string },
  days: number = SESSION_DAYS
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${days}d`)
    .sign(secretKey);
}

export async function verifyToken(
  token: string
): Promise<{ userId: string; email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey);
    if (typeof payload.userId === "string" && typeof payload.email === "string") {
      return { userId: payload.userId, email: payload.email };
    }
    return null;
  } catch {
    return null;
  }
}

export async function getUserFromRequest(req: NextRequest): Promise<User | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;
  const rows = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
  return rows[0] ?? null;
}

/** Public origin of the current request (respects reverse proxies / APP_URL). */
export function getOrigin(req: NextRequest): string {
  const configured = process.env.APP_URL?.trim().replace(/\/$/, "");
  if (configured) return configured;
  const proto =
    req.headers.get("x-forwarded-proto")?.split(",")[0].trim() ||
    req.nextUrl.protocol.replace(":", "") ||
    "http";
  const host =
    req.headers.get("x-forwarded-host")?.split(",")[0].trim() ||
    req.headers.get("host") ||
    req.nextUrl.host;
  return `${proto}://${host}`;
}

export function setSessionCookie(
  res: NextResponse,
  req: NextRequest,
  token: string,
  days: number = SESSION_DAYS
) {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: getOrigin(req).startsWith("https://"),
    path: "/",
    maxAge: days * 24 * 60 * 60,
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/* ---------------- tokens & abuse protection ---------------- */

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "local"
  );
}

const buckets = new Map<string, { count: number; resetAt: number }>();

/** Simple in-memory limiter: `limit` hits per `windowMs` for a key. */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  if (buckets.size > 10000) {
    for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfterSec: 0 };
}

/* ---------------- public shapes ---------------- */

export interface SafeUser {
  id: string;
  name: string;
  email: string;
  plan: string;
  creditsLimit: number;
  creditsUsed: number;
  createdAt: string;
  avatarUrl: string | null;
  hasPassword: boolean;
  googleLinked: boolean;
}

export interface Entitlements {
  plan: string;
  maxCharacters: number | null;
  styleSelection: boolean;
  downloadAudio: boolean;
  highQualityAudio: boolean;
  apiAccess: boolean;
  teamSeats: number;
  voiceProfiles: number;
}

export function entitlementsOf(u: User): Entitlements {
  const f = planFeatures(u.plan);
  return {
    plan: u.plan,
    maxCharacters: f.maxCharacters,
    styleSelection: f.styleSelection,
    downloadAudio: f.downloadAudio,
    highQualityAudio: f.highQualityAudio,
    apiAccess: f.apiAccess,
    teamSeats: f.teamSeats,
    voiceProfiles: f.voiceProfiles,
  };
}

export function safeUser(u: User): SafeUser {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    plan: u.plan,
    creditsLimit: u.creditsLimit,
    creditsUsed: u.creditsUsed,
    createdAt: u.createdAt.toISOString(),
    avatarUrl: u.avatarUrl ?? null,
    hasPassword: Boolean(u.passwordHash),
    googleLinked: Boolean(u.googleId),
  };
}

export interface BillingSummary {
  planName: string;
  creditsLimit: number;
  creditsUsed: number;
  creditsRemaining: number;
  /** Words still coverable by the remaining credits (20 words per credit). */
  wordsRemaining: number;
  /** Credits charged per started 100-word block. */
  creditsPerBlock: number;
  wordsPerBlock: number;
  /** ISO date when credits reset to the plan allowance. */
  resetsAt: string;
  maxCharacters: number;
}

export function billingOf(u: User): BillingSummary {
  const remaining = Math.max(0, u.creditsLimit - u.creditsUsed);
  return {
    planName: u.plan,
    creditsLimit: u.creditsLimit,
    creditsUsed: u.creditsUsed,
    creditsRemaining: remaining,
    wordsRemaining: wordsForCredits(remaining),
    creditsPerBlock: CREDITS_PER_BLOCK,
    wordsPerBlock: WORDS_PER_BLOCK,
    resetsAt: nextResetDate(u.creditsCycleStart).toISOString(),
    maxCharacters: planFeatures(u.plan).maxCharacters ?? 4000,
  };
}

/**
 * Loads the user and rolls their credits over if a full month has passed.
 * Called on every authenticated request that touches credits.
 */
export async function getUserWithFreshCredits(req: NextRequest): Promise<User | null> {
  const user = await getUserFromRequest(req);
  if (!user) return null;
  if (!cycleExpired(user.creditsCycleStart)) return user;

  const newStart = currentCycleStart(user.creditsCycleStart);
  const [updated] = await db
    .update(users)
    .set({ creditsUsed: 0, creditsCycleStart: newStart })
    .where(eq(users.id, user.id))
    .returning();
  await db.insert(creditLedger).values({
    userId: user.id,
    delta: updated.creditsLimit,
    balanceAfter: updated.creditsLimit,
    reason: "monthly_reset",
    meta: `cycle ${newStart.toISOString().slice(0, 10)}`,
  });
  return updated;
}

/**
 * Atomically charges credits AFTER a successful generation.
 * Uses a conditional UPDATE so two concurrent requests can't overspend.
 */
export async function chargeCredits(
  userId: string,
  cost: number,
  words: number,
  reason: "generate" | "preview",
  meta = ""
): Promise<{ ok: true; creditsRemaining: number; creditsUsed: number } | { ok: false }> {
  const rows = await db
    .update(users)
    .set({ creditsUsed: sql`${users.creditsUsed} + ${cost}` })
    .where(and(eq(users.id, userId), sql`${users.creditsUsed} + ${cost} <= ${users.creditsLimit}`))
    .returning({ creditsUsed: users.creditsUsed, creditsLimit: users.creditsLimit });
  const row = rows[0];
  if (!row) return { ok: false };
  const remaining = Math.max(0, row.creditsLimit - row.creditsUsed);
  await db.insert(creditLedger).values({
    userId,
    delta: -cost,
    balanceAfter: remaining,
    reason,
    words,
    meta,
  });
  return { ok: true, creditsRemaining: remaining, creditsUsed: row.creditsUsed };
}
