// DetheAi credit rules — shared by the browser (display) and the server (enforcement).
//
//   1–100 words   = 5 credits
//   101–200 words = 10 credits
//   201–300 words = 15 credits   … every started 100-word block costs 5 credits
//
//   Free plan: 10,000 credits / month  →  up to 200,000 words / month.
//   Credits are deducted only after a successful generation and reset monthly.

export const CREDITS_PER_BLOCK = 5;
export const WORDS_PER_BLOCK = 100;
export const FREE_MONTHLY_CREDITS = 10_000;
export const WORDS_PER_CREDIT = WORDS_PER_BLOCK / CREDITS_PER_BLOCK; // 20

export const PLAN_CREDITS: Record<string, number> = {
  Free: 10_000,
  Pro: 50_000,
  Business: 200_000,
};

/** Counts words the same way everywhere (whitespace-separated tokens, any script). */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Credits for a script: 5 per started 100-word block (always rounds up). */
export function creditsForWords(words: number): number {
  if (words <= 0) return 0;
  return Math.ceil(words / WORDS_PER_BLOCK) * CREDITS_PER_BLOCK;
}

export function creditsForText(text: string): number {
  return creditsForWords(countWords(text));
}

/** How many words a credit balance still covers (e.g. 10,000 credits → 200,000 words). */
export function wordsForCredits(credits: number): number {
  return Math.max(0, Math.floor(credits / CREDITS_PER_BLOCK) * WORDS_PER_BLOCK);
}

/** Start of the *next* monthly reset for a given cycle start. */
export function nextResetDate(cycleStart: Date): Date {
  const d = new Date(cycleStart);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

/** True when a full month has passed since the cycle started. */
export function cycleExpired(cycleStart: Date, now = new Date()): boolean {
  return now.getTime() >= nextResetDate(cycleStart).getTime();
}

/** Aligns a cycle start to the most recent monthly boundary (handles several missed months). */
export function currentCycleStart(cycleStart: Date, now = new Date()): Date {
  let start = new Date(cycleStart);
  while (cycleExpired(start, now)) start = nextResetDate(start);
  return start;
}
