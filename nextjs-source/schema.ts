import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const users = pgTable("vaani_users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  /** Null for accounts created with Google sign-in only. */
  passwordHash: text("password_hash"),
  googleId: text("google_id").unique(),
  avatarUrl: text("avatar_url"),
  plan: text("plan").notNull().default("Free"),
  creditsLimit: integer("credits_limit").notNull().default(10000),
  creditsUsed: integer("credits_used").notNull().default(0),
  /** Start of the current monthly credit cycle; credits reset one month after this. */
  creditsCycleStart: timestamp("credits_cycle_start", { withTimezone: true }).defaultNow().notNull(),
  /** Payment-gateway customer id (Razorpay), created on first checkout. */
  paymentCustomerId: text("payment_customer_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

/**
 * One row per gateway subscription. The user's effective plan is always derived
 * from the row whose status is active/authenticated and whose period hasn't ended.
 */
export const subscriptions = pgTable("vaani_subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("razorpay"),
  providerSubscriptionId: text("provider_subscription_id").notNull().unique(),
  providerPlanId: text("provider_plan_id").notNull(),
  providerCustomerId: text("provider_customer_id"),
  plan: text("plan").notNull(), // Pro | Business
  billingCycle: text("billing_cycle").notNull(), // monthly | yearly
  amountPaise: integer("amount_paise").notNull(),
  currency: text("currency").notNull().default("INR"),
  /** created | authenticated | active | pending | halted | cancelled | completed | expired | paused */
  status: text("status").notNull().default("created"),
  /** Set when the first payment was verified (checkout signature or webhook). */
  startedAt: timestamp("started_at", { withTimezone: true }),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  /** When the gateway will next charge the customer. */
  nextChargeAt: timestamp("next_charge_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  /** True when cancellation was requested but access continues until currentPeriodEnd. */
  cancelAtPeriodEnd: integer("cancel_at_period_end").notNull().default(0),
  lastPaymentId: text("last_payment_id"),
  lastPaymentAt: timestamp("last_payment_at", { withTimezone: true }),
  lastPaymentStatus: text("last_payment_status"),
  paidCount: integer("paid_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Every gateway payment we verified (checkout or webhook), for receipts & audit. */
export const payments = pgTable("vaani_payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  subscriptionId: uuid("subscription_id").references(() => subscriptions.id, { onDelete: "set null" }),
  provider: text("provider").notNull().default("razorpay"),
  providerPaymentId: text("provider_payment_id").notNull().unique(),
  providerSubscriptionId: text("provider_subscription_id"),
  amountPaise: integer("amount_paise").notNull(),
  currency: text("currency").notNull().default("INR"),
  status: text("status").notNull(), // captured | failed | refunded | authorized
  method: text("method"),
  description: text("description").notNull().default(""),
  source: text("source").notNull().default("webhook"), // webhook | checkout
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Raw webhook deliveries — deduped by event id so retries are idempotent. */
export const webhookEvents = pgTable("vaani_webhook_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  provider: text("provider").notNull().default("razorpay"),
  providerEventId: text("provider_event_id").notNull().unique(),
  eventType: text("event_type").notNull(),
  payload: text("payload").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const creditLedger = pgTable("vaani_credit_ledger", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Negative = spent, positive = granted/reset */
  delta: integer("delta").notNull(),
  balanceAfter: integer("balance_after").notNull(),
  reason: text("reason").notNull(), // generate | preview | monthly_reset | signup
  words: integer("words").notNull().default(0),
  meta: text("meta").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const passwordResetTokens = pgTable("vaani_password_resets", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const voiceProjects = pgTable("vaani_voice_projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  language: text("language").notNull().default("Hindi"),
  voiceId: text("voice_id").notNull().default("hindi-01"),
  voiceName: text("voice_name").notNull().default(""),
  style: text("style").notNull().default(""),
  audioBase64: text("audio_base64").notNull().default(""),
  mimeType: text("mime_type").notNull().default("audio/mpeg"),
  filename: text("filename").notNull().default("dethe-voiceover.mp3"),
  charCount: integer("char_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const transcripts = pgTable("vaani_transcripts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Untitled video"),
  sourceType: text("source_type").notNull().default("upload"), // upload | url
  sourceName: text("source_name").notNull().default(""),
  languageCode: text("language_code").notNull().default("unknown"),
  mode: text("mode").notNull().default("transcribe"), // transcribe | translate
  durationSec: integer("duration_sec").notNull().default(0),
  text: text("text").notNull().default(""),
  /** JSON array of { start, end, text } segments */
  segmentsJson: text("segments_json").notNull().default("[]"),
  wordCount: integer("word_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type VoiceProject = typeof voiceProjects.$inferSelect;
export type Transcript = typeof transcripts.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Payment = typeof payments.$inferSelect;
