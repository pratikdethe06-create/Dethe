import { NextRequest, NextResponse } from "next/server";
import { billingOf, chargeCredits, getUserWithFreshCredits } from "@/lib/auth";
import { countWords, creditsForWords, wordsForCredits } from "@/lib/credits";
import { planFeatures } from "@/lib/plans";
import { VOICES, getVoiceById, languageOf } from "@/lib/voices";
import {
  PREMIUM_SPEAKER_SET,
  PremiumAuthError,
  premiumConfigured,
  synthPremium,
} from "@/lib/premium-tts";
import { synthEdge, synthGoogle, type TTSResult } from "@/lib/tts-providers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// If the premium key is rejected, pause it briefly instead of failing every request.
let premiumPausedUntil = 0;

export async function POST(req: NextRequest) {
  // Voice generation is for signed-in members only (credits roll over monthly here).
  const user = await getUserWithFreshCredits(req);
  if (!user) {
    return NextResponse.json(
      { message: "Please sign in to generate voice.", code: "AUTH_REQUIRED" },
      { status: 401 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const text = String(body?.text ?? "").trim();
  const language = String(body?.language ?? "Hindi");
  const profileId = String(body?.voiceId ?? "");
  const requestedSpeaker = String(body?.voice ?? "");
  const purpose = body?.purpose === "preview" ? "preview" : "generate";
  const speed = Number(body?.speed ?? 1) || 1; // 0.5 – 2
  const pitchAdj = Number(body?.pitch ?? 0) || 0; // -10 – 10

  if (!text) {
    return NextResponse.json(
      { message: "Write something first — your voice is waiting." },
      { status: 400 }
    );
  }
  // Hard safety cap for every plan, then the plan's own per-generation limit.
  if (text.length > 20000) {
    return NextResponse.json({ message: "This script exceeds the 20,000 character safety limit." }, { status: 400 });
  }
  const planLimit = planFeatures(user.plan).maxCharacters;
  if (planLimit !== null && text.length > planLimit) {
    return NextResponse.json(
      {
        message: `Your ${user.plan} plan allows up to ${planLimit.toLocaleString()} characters per generation (this script has ${text.length.toLocaleString()}). Upgrade for longer scripts.`,
        code: "PLAN_LIMIT",
        maxCharacters: planLimit,
      },
      { status: 402 }
    );
  }

  // ---- credit check (server-side, based on actual word count) ----
  const words = countWords(text);
  const cost = creditsForWords(words);
  const billing = billingOf(user);
  if (cost > billing.creditsRemaining) {
    const resetDate = new Date(billing.resetsAt).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
    });
    return NextResponse.json(
      {
        message:
          billing.creditsRemaining === 0
            ? `You've used all ${billing.creditsLimit.toLocaleString()} credits for this month. They reset on ${resetDate}.`
            : `This script (${words.toLocaleString()} words) needs ${cost} credits, but you have ${billing.creditsRemaining} left — about ${wordsForCredits(billing.creditsRemaining).toLocaleString()} words. Credits reset on ${resetDate}.`,
        code: "NO_CREDITS",
        creditsRequired: cost,
        creditsRemaining: billing.creditsRemaining,
        words,
      },
      { status: 402 }
    );
  }

  // Resolve the voice profile (falls back to the first voice of the language).
  const profile = VOICES.some((v) => v.id === profileId)
    ? getVoiceById(profileId)
    : getVoiceById(`${language.toLowerCase()}-01`);
  const lang = languageOf(profile.language);
  const speaker = PREMIUM_SPEAKER_SET.has(requestedSpeaker)
    ? requestedSpeaker
    : profile.providerVoice;

  /** Deducts credits ONLY here — i.e. after audio was successfully produced. */
  const finish = async (out: TTSResult) => {
    const charge = await chargeCredits(user.id, cost, words, purpose, `${profile.name} · ${lang.name}`);
    if (!charge.ok) {
      // Balance changed between the check and the charge (e.g. parallel request).
      const fresh = billingOf((await getUserWithFreshCredits(req)) ?? user);
      return NextResponse.json(
        {
          message: `Not enough credits left for this script (needs ${cost}, you have ${fresh.creditsRemaining}).`,
          code: "NO_CREDITS",
          creditsRequired: cost,
          creditsRemaining: fresh.creditsRemaining,
          words,
        },
        { status: 402 }
      );
    }
    return NextResponse.json({
      audioBase64: out.audio.toString("base64"),
      mimeType: out.mimeType,
      filename: `dethe-${profile.firstName.toLowerCase()}-${Date.now()}.mp3`,
      charCount: text.length,
      words,
      creditsCharged: cost,
      creditsRemaining: charge.creditsRemaining,
      creditsUsed: charge.creditsUsed,
      creditsLimit: user.creditsLimit,
      quality: out.engine === "google" ? "standard" : "natural",
      voice: profile.name,
    });
  };

  // 1) DetheAi premium natural voices.
  if (premiumConfigured() && Date.now() > premiumPausedUntil) {
    try {
      const pace = Math.min(2, Math.max(0.5, speed * (1 + profile.prosody.rate / 100)));
      const audio = await synthPremium({
        text,
        speaker,
        languageCode: lang.locale,
        pace,
        temperature: profile.prosody.temperature,
      });
      return await finish({ audio, mimeType: "audio/mpeg", engine: "premium" });
    } catch (err) {
      if (err instanceof PremiumAuthError) {
        premiumPausedUntil = Date.now() + 10 * 60 * 1000;
      }
      console.error("[voice] premium failed:", err instanceof Error ? err.message : err);
    }
  }

  // 2) Neural fallback (no key required).
  if (profile.neuralVoice) {
    try {
      const out = await synthEdge({
        text,
        voice: profile.neuralVoice,
        locale: lang.locale,
        ratePct: profile.prosody.rate + Math.round((speed - 1) * 100),
        pitchHz: profile.prosody.pitch + pitchAdj * 3,
        volumePct: profile.prosody.volume,
      });
      return await finish(out);
    } catch (err) {
      console.error("[voice] neural failed:", err instanceof Error ? err.message : err);
    }
  }

  // 3) Standard voice fallback.
  try {
    const out = await synthGoogle({ text, languageCode: lang.ttsCode });
    return await finish(out);
  } catch (err) {
    console.error("[voice] standard failed:", err instanceof Error ? err.message : err);
  }

  // 4) Nothing produced → no credits charged.
  return NextResponse.json(
    {
      message: "Our voice servers are busy right now. Nothing was charged — please try again in a moment.",
      code: "TTS_UNAVAILABLE",
    },
    { status: 503 }
  );
}
