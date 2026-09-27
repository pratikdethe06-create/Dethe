// DetheAi premium natural voice engine (server-side only).
// The upstream provider is configured via env and never exposed to the browser.

import { chunkText } from "@/lib/tts-providers";

export class PremiumAuthError extends Error {}

const ENDPOINT = "https://api.sarvam.ai/text-to-speech";
const MODEL = "bulbul:v3";
const MAX_INPUT_CHARS = 480; // provider limit is 500 per input
const MAX_INPUTS_PER_CALL = 3;

/** Real speaker ids grouped by gender (all support every Indic language). */
export const PREMIUM_SPEAKERS = {
  female: [
    "priya",
    "ritu",
    "neha",
    "pooja",
    "simran",
    "kavya",
    "ishita",
    "shreya",
    "roopa",
    "tanya",
    "shruti",
    "suhani",
    "kavitha",
    "rupali",
  ],
  male: [
    "shubh",
    "aditya",
    "rahul",
    "rohan",
    "amit",
    "dev",
    "ratan",
    "varun",
    "manan",
    "sumit",
    "kabir",
    "aayan",
    "ashutosh",
    "advait",
    "anand",
    "tarun",
    "sunny",
    "mani",
    "gokul",
    "vijay",
    "mohit",
    "rehan",
    "soham",
  ],
} as const;

export const PREMIUM_SPEAKER_SET: Set<string> = new Set([
  ...PREMIUM_SPEAKERS.female,
  ...PREMIUM_SPEAKERS.male,
]);

export function premiumSpeakerFor(gender: "Female" | "Male", index: number): string {
  const pool = gender === "Female" ? PREMIUM_SPEAKERS.female : PREMIUM_SPEAKERS.male;
  return pool[Math.abs(index) % pool.length];
}

export function premiumConfigured(): boolean {
  return Boolean(process.env.PREMIUM_TTS_KEY || process.env.SARVAM_API_KEY);
}

function apiKey(): string {
  return process.env.PREMIUM_TTS_KEY || process.env.SARVAM_API_KEY || "";
}

function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export interface PremiumSynthOptions {
  text: string;
  speaker: string;
  /** BCP-47 code, e.g. hi-IN, od-IN */
  languageCode: string;
  /** 0.5 – 2.0 */
  pace?: number;
  /** 0.01 – 2.0, expressiveness */
  temperature?: number;
}

export async function synthPremium(opts: PremiumSynthOptions): Promise<Buffer> {
  const key = apiKey();
  if (!key) throw new Error("Premium TTS key is not configured");

  const speaker = PREMIUM_SPEAKER_SET.has(opts.speaker) ? opts.speaker : "shubh";
  const chunks = chunkText(opts.text, MAX_INPUT_CHARS);
  if (chunks.length === 0) throw new Error("Empty script");

  const parts: Buffer[] = [];
  for (let i = 0; i < chunks.length; i += MAX_INPUTS_PER_CALL) {
    const inputs = chunks.slice(i, i + MAX_INPUTS_PER_CALL);
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "api-subscription-key": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs,
        target_language_code: opts.languageCode,
        speaker,
        model: MODEL,
        pace: clamp(opts.pace ?? 1, 0.5, 2),
        temperature: clamp(opts.temperature ?? 0.6, 0.01, 2),
        speech_sample_rate: 24000,
        output_audio_codec: "mp3",
      }),
      signal: AbortSignal.timeout(45000),
    });

    if (res.status === 401 || res.status === 403) {
      throw new PremiumAuthError(`Premium TTS rejected the key (HTTP ${res.status})`);
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Premium TTS error (HTTP ${res.status}) ${detail.slice(0, 200)}`);
    }

    const data = (await res.json()) as { audios?: string[] };
    for (const b64 of data.audios ?? []) {
      if (typeof b64 === "string" && b64.length > 100) {
        parts.push(Buffer.from(b64, "base64"));
      }
    }
  }

  if (parts.length === 0) throw new Error("Premium TTS returned no audio");
  return Buffer.concat(parts);
}
