"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Captions,
  Check,
  Download,
  Languages,
  Loader2,
  LockKeyhole,
  Mic,
  Pause,
  Play,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  Type,
  Volume2,
} from "lucide-react";
import { Footer, Header } from "@/components/chrome";
import { StaticHostingNotice } from "@/components/static-notice";

import { AuthGateModal, useSession, type GateReason } from "@/components/auth-gate";
import { BillingToggle, PlanPrice } from "@/components/billing-toggle";
import { it } from "@/components/toast";
import {
  VoiceCard,
  VoiceLibraryModal,
  WaveBars,
  readFavorites,
  rememberVoice,
} from "@/components/voices-ui";
import { audioUrlFromBase64, downloadUrl, stopBrowserSpeech } from "@/lib/client-audio";
import { countWords, creditsForWords } from "@/lib/credits";
import {
  LANGUAGES,
  LANGUAGE_COUNT,
  MAX_CHARACTERS,
  PLANS,
  STYLES,
  VOICE_COUNT,
  getVoiceById,
  previewLine,
  type BillingCycle,
  type VoiceProfile,
} from "@/lib/voices";
import { apiFetch } from "@/lib/api-base";

const HISTORY_KEY = "vaani-voice-history-v1";
const FAVORITES_KEY = "vaani-voice-favorites-v1";
const DRAFT_KEY = "vaani-studio-draft-v1";

export interface RecentItem {
  id: string;
  text: string;
  language: string;
  voiceName: string;
  style: string;
  createdAt: number;
  audioBase64?: string;
  mimeType?: string;
  filename?: string;
}

function loadHistory(): RecentItem[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export default function HomeClient() {
  const { user, billing, loading: sessionLoading, refresh: refreshSession } = useSession();

  const [text, setText] = useState("");
  const [language, setLanguage] = useState("Hindi");
  const [style, setStyle] = useState(STYLES[0]);
  const [selectedId, setSelectedId] = useState("hindi-01");
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [lastFilename, setLastFilename] = useState("dethe-voiceover.mp3");
  const [playing, setPlaying] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [playingPreviewId, setPlayingPreviewId] = useState<string | null>(null);
  const [quality, setQuality] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [gate, setGate] = useState<{ open: boolean; reason: GateReason }>({
    open: false,
    reason: "generate",
  });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previewCache = useRef(new Map<string, string>());
  const cachedUrls = useRef(new Set<string>());

  const selected = useMemo(() => getVoiceById(selectedId), [selectedId]);
  const remaining = MAX_CHARACTERS - text.length;

  /* restore local state + any draft saved before a sign-in redirect */
  useEffect(() => {
    setRecent(loadHistory());
    setFavorites(readFavorites());
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as Partial<{
          text: string;
          language: string;
          selectedId: string;
          style: string;
        }>;
        if (typeof d.text === "string") setText(d.text);
        if (typeof d.language === "string") setLanguage(d.language);
        if (typeof d.selectedId === "string") setSelectedId(d.selectedId);
        if (typeof d.style === "string") setStyle(d.style);
        sessionStorage.removeItem(DRAFT_KEY);
      }
    } catch {
      /* ignore */
    }
    return () => {
      stopBrowserSpeech();
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(recent.slice(0, 12)));
    } catch {
      /* quota exceeded — keep in memory only */
    }
  }, [recent]);

  const scrollToStudio = useCallback(() => {
    document.getElementById("studio")?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const stopAll = useCallback(() => {
    stopBrowserSpeech();
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
    setPlaying(false);
  }, []);

  /** Ask a guest to sign in; keep their draft so nothing is lost. */
  const openGate = useCallback(
    (reason: GateReason) => {
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ text, language, selectedId, style }));
      } catch {
        /* ignore */
      }
      stopAll();
      setShowLibrary(false);
      setGate({ open: true, reason });
    },
    [text, language, selectedId, style, stopAll]
  );

  const playUrl = useCallback((url: string, previewId: string | null) => {
    stopBrowserSpeech();
    setAudioUrl((prev) => {
      if (prev && prev !== url && !cachedUrls.current.has(prev)) URL.revokeObjectURL(prev);
      return url;
    });
    setPlayingPreviewId(previewId);
    requestAnimationFrame(() => {
      const el = audioRef.current;
      if (!el) return;
      el.currentTime = 0;
      el.play().catch(() => setPlaying(false));
    });
  }, []);

  const selectVoice = useCallback((v: VoiceProfile) => {
    setSelectedId(v.id);
    setLanguage(v.language);
    rememberVoice(v.id);
    setShowLibrary(false);
    it.success(`${v.name} selected — ready in the studio.`);
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id];
      try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      } catch {
        /* noop */
      }
      return next;
    });
  }, []);

  const generate = useCallback(async () => {
    if (!user) {
      openGate("generate");
      return;
    }
    const script = text.trim();
    if (!script) {
      it.error("Write something first — your voice is waiting.");
      return;
    }
    const cost = creditsForWords(countWords(script));
    if (billing && cost > billing.creditsRemaining) {
      it.error(
        `This script needs ${cost} credits but you have ${billing.creditsRemaining} left. Credits reset on ${new Date(
          billing.resetsAt
        ).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}.`
      );
      return;
    }
    stopAll();
    setGenerating(true);
    try {
      const res = await apiFetch("/api/voice/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: script,
          language: selected.language,
          voiceId: selected.id,
          voice: selected.providerVoice,
          style,
        }),
      });
      if (res.status === 401) {
        refreshSession();
        openGate("generate");
        return;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "Could not generate audio. Please try again.");

      if (data.audioBase64) {
        const url = audioUrlFromBase64(data.audioBase64, data.mimeType || "audio/mpeg");
        setLastFilename(data.filename || "dethe-voiceover.mp3");
        setQuality(data.quality ?? null);
        playUrl(url, null);
        const item: RecentItem = {
          id: `${Date.now()}`,
          text: script,
          language: selected.language,
          voiceName: selected.name,
          style,
          createdAt: Date.now(),
          audioBase64: data.audioBase64.length < 700000 ? data.audioBase64 : undefined,
          mimeType: data.mimeType || "audio/mpeg",
          filename: data.filename || "dethe-voiceover.mp3",
        };
        setRecent((prev) => [item, ...prev].slice(0, 12));
        apiFetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: script,
            language: selected.language,
            voiceId: selected.id,
            voiceName: selected.name,
            style,
            audioBase64: data.audioBase64.length < 2500000 ? data.audioBase64 : "",
            mimeType: data.mimeType || "audio/mpeg",
            filename: data.filename || "dethe-voiceover.mp3",
            charCount: script.length,
          }),
        }).catch(() => null);
        it.success(
          `Voiceover ready · ${selected.name} · ${data.creditsCharged ?? 0} credits used · ${(data.creditsRemaining ?? 0).toLocaleString()} left`
        );
      } else {
        it.error("Our voice servers are busy right now. Please try again in a moment.");
      }
      refreshSession();
    } catch (e) {
      it.error(e instanceof Error ? e.message : "Could not generate audio. Please try again.");
    } finally {
      setGenerating(false);
    }
  }, [user, billing, text, selected, style, stopAll, playUrl, openGate, refreshSession]);

  const previewVoice = useCallback(
    async (v: VoiceProfile, customText?: string) => {
      if (!user) {
        openGate("listen");
        return;
      }
      if (previewingId) return;
      stopAll();
      const line = (customText && customText.trim()) || previewLine(v);
      const cacheKey = `${v.id}::${line}`;
      const cached = previewCache.current.get(cacheKey);
      if (cached) {
        playUrl(cached, v.id);
        return;
      }
      setPreviewingId(v.id);
      try {
        const res = await apiFetch("/api/voice/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: line,
            language: v.language,
            voiceId: v.id,
            voice: v.providerVoice,
            style: v.style,
            purpose: "preview",
          }),
        });
        if (res.status === 401) {
          refreshSession();
          openGate("listen");
          return;
        }
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.message || "Could not preview this voice. Please try again.");
        if (data.audioBase64) {
          const url = audioUrlFromBase64(data.audioBase64, data.mimeType || "audio/mpeg");
          previewCache.current.set(cacheKey, url);
          cachedUrls.current.add(url);
          playUrl(url, v.id);
          refreshSession();
        } else {
          it.error("Our voice servers are busy right now. Please try again in a moment.");
        }
      } catch (e) {
        it.error(e instanceof Error ? e.message : "Could not preview this voice. Please try again.");
      } finally {
        setPreviewingId(null);
      }
    },
    [user, previewingId, stopAll, playUrl, openGate, refreshSession]
  );

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el || !audioUrl) return;
    if (el.paused) {
      stopBrowserSpeech();
      el.play().catch(() => null);
    } else {
      el.pause();
    }
  }, [audioUrl]);

  const replayRecent = useCallback(
    (item: RecentItem) => {
      stopAll();
      if (item.audioBase64) {
        playUrl(audioUrlFromBase64(item.audioBase64, item.mimeType || "audio/mpeg"), null);
      } else {
        setText(item.text);
        scrollToStudio();
        it.info("Saved audio expired — press Generate to recreate it.");
      }
    },
    [stopAll, playUrl, scrollToStudio]
  );

  const downloadRecent = useCallback((item: RecentItem) => {
    if (!item.audioBase64) {
      it.error("No audio saved for this voiceover yet.");
      return;
    }
    downloadUrl(
      audioUrlFromBase64(item.audioBase64, item.mimeType || "audio/mpeg"),
      item.filename || "dethe-voiceover.mp3"
    );
  }, []);

  const previewVoices = useMemo(
    () => ["hindi-01", "hindi-02", "english-01", "tamil-01"].map((id) => getVoiceById(id)),
    []
  );

  const stats = [
    { value: String(VOICE_COUNT), label: "Voice profiles", icon: Mic },
    { value: String(LANGUAGE_COUNT), label: "Indian languages", icon: Languages },
    { value: "4,000", label: "Characters per generation", icon: Type },
    { value: "100%", label: "Server-side API keys", icon: ShieldCheck },
  ];

  const studioAudioIsPreview = playingPreviewId !== null;
  const isGuest = !sessionLoading && !user;

  return (
    <div id="top" className="min-h-screen overflow-hidden">
      <Header onOpenLibrary={() => setShowLibrary(true)} />

      <main>
        {/* HERO */}
        <section className="grain relative px-5 pb-20 pt-14 sm:px-8 lg:pb-28 lg:pt-20">
          <div className="container grid items-center gap-12 lg:grid-cols-[1.02fr_.98fr] lg:gap-20">
            <div className="relative z-10 max-w-[620px]">
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#d8e8de] bg-[#eef7f1] px-3.5 py-2 text-[12px] font-bold text-[#1b7d5d]">
                🇮🇳 Built for India · Loved everywhere
              </div>
              <h1 className="display max-w-[640px] text-[52px] font-extrabold leading-[.99] text-[#17231f] sm:text-[68px] lg:text-[78px]">
                Give your words
                <br />
                <span className="text-[#1b7d5d]">a human voice.</span>
              </h1>
              <p className="mt-7 max-w-[530px] text-[17px] leading-8 text-[#776f66]">
                Create realistic, human-sounding voiceovers across {LANGUAGE_COUNT} Indian
                languages — including Odia — with a focused studio and a growing library of voice
                profiles.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={scrollToStudio}
                  className="rounded-full bg-[#1b7d5d] px-6 py-3.5 text-sm font-bold text-white shadow-[0_9px_22px_rgba(27,125,93,.2)]"
                >
                  {user ? "Open your Voice Studio" : "Create your first voiceover"}{" "}
                  <ArrowRight className="ml-2 inline size-4" />
                </button>
                <button
                  onClick={() => setShowLibrary(true)}
                  className="rounded-full border border-[#d8cec2] px-6 py-3.5 text-sm font-bold text-[#5f574f] hover:border-[#1b7d5d] hover:text-[#1b7d5d]"
                >
                  <Play className="mr-2 inline size-3.5 fill-current" /> Listen to voices
                </button>
              </div>
              <div className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-3 text-[12px] font-semibold text-[#8c8176]">
                {[
                  `${VOICE_COUNT} voice profiles`,
                  `${LANGUAGE_COUNT} languages`,
                  "4,000 characters",
                ].map((t) => (
                  <span key={t} className="flex items-center gap-2">
                    <Check className="size-4 text-[#1b7d5d]" /> {t}
                  </span>
                ))}
              </div>
            </div>

            {/* STUDIO CARD */}
            <div className="relative lg:pt-4" id="studio">
              <div className="absolute -right-6 -top-2 size-32 rounded-full bg-[#f5d7b7]/60 blur-2xl" />
              <div className="absolute -bottom-10 -left-8 size-40 rounded-full bg-[#cfe7d7]/70 blur-3xl" />
              <div className="studio-shadow relative rounded-[28px] border border-[#eadfd2] bg-[#fffdf8] p-3.5 sm:p-5">
                <div className="rounded-[21px] bg-[#f7f2ea] p-5 sm:p-6">
                  <div className="mb-5 flex items-center justify-between">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#9a8d80]">
                        Quick voice studio
                      </p>
                      <p className="display mt-1 text-[20px] font-bold">Make it sound like you.</p>
                    </div>
                    <span className="grid size-10 place-items-center rounded-xl bg-white text-[#1b7d5d] shadow-sm">
                      <Volume2 className="size-5" />
                    </span>
                  </div>

                  <StaticHostingNotice feature="studio" className="mb-4" />
                  <textarea
                    value={text}
                    maxLength={MAX_CHARACTERS}
                    onChange={(e) => setText(e.target.value)}
                    className="min-h-[146px] w-full resize-none rounded-2xl border border-[#e8ded2] bg-[#fffdf8] p-4 text-[15px] leading-7 text-[#413a35] shadow-sm outline-none focus:border-[#74b596] focus:ring-4 focus:ring-[#dcefe4]"
                    placeholder="Type or paste your script here…"
                  />
                  <div className="mt-2 flex justify-between px-1 text-[11px] font-medium text-[#9a8d80]">
                    <span>{remaining} characters remaining</span>
                    <span>
                      {text.length} / {MAX_CHARACTERS}
                    </span>
                  </div>

                  {user && billing && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border border-[#dcefe4] bg-[#f4fbf6] px-3 py-2 text-[11px] font-bold text-[#39755b]">
                      <span>
                        {billing.creditsRemaining.toLocaleString()} credits left ·{" "}
                        <span className="font-semibold text-[#5a8a72]">
                          ≈ {billing.wordsRemaining.toLocaleString()} words
                        </span>
                      </span>
                      <span className="font-semibold text-[#5a8a72]">
                        {countWords(text) > 0
                          ? `This script: ${countWords(text).toLocaleString()} words · ${creditsForWords(countWords(text))} credits`
                          : "5 credits per 100 words"}
                      </span>
                    </div>
                  )}

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <label className="text-[11px] font-bold uppercase tracking-[.13em] text-[#8b7e72]">
                      Language
                      <select
                        value={language}
                        onChange={(e) => {
                          const next = e.target.value;
                          setLanguage(next);
                          const first = getVoiceById(`${next.toLowerCase()}-01`);
                          if (first && first.language === next) setSelectedId(first.id);
                        }}
                        className="mt-2 w-full rounded-xl border border-[#e8ded2] bg-white px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-[#413a35] outline-none focus:border-[#74b596]"
                      >
                        {LANGUAGES.map((l) => (
                          <option key={l.name}>{l.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-[11px] font-bold uppercase tracking-[.13em] text-[#8b7e72]">
                      Style
                      <select
                        value={style}
                        onChange={(e) => setStyle(e.target.value)}
                        className="mt-2 w-full rounded-xl border border-[#e8ded2] bg-white px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-[#413a35] outline-none focus:border-[#74b596]"
                      >
                        {STYLES.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="mt-5 flex items-center justify-between gap-2 rounded-2xl border border-[#deebe3] bg-[#f4fbf6] px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#d8eddf] text-[#1b7d5d]">
                        <Mic className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-[#254b3a]">
                          {selected.native} · {selected.name}
                        </p>
                        <p className="truncate text-[11px] text-[#789183]">
                          {selected.style} · {selected.gender}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() =>
                          playingPreviewId === selected.id && playing
                            ? stopAll()
                            : previewVoice(selected)
                        }
                        disabled={previewingId === selected.id}
                        aria-label="Listen to selected voice"
                        className="grid size-8 place-items-center rounded-full bg-white text-[#1b7d5d] shadow-sm hover:bg-[#dcefe4] disabled:opacity-60"
                      >
                        {previewingId === selected.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : playingPreviewId === selected.id && playing ? (
                          <Pause className="size-3.5 fill-current" />
                        ) : (
                          <Play className="ml-0.5 size-3.5 fill-current" />
                        )}
                      </button>
                      <button
                        onClick={() => setShowLibrary(true)}
                        className="px-2 text-[11px] font-bold text-[#1b7d5d] hover:underline"
                      >
                        Change voice
                      </button>
                    </div>
                  </div>

                  {audioUrl && !studioAudioIsPreview && (
                    <div className="mt-4 flex items-center gap-3 rounded-2xl border border-[#e1d7ca] bg-white px-4 py-3">
                      <button
                        onClick={togglePlay}
                        className="grid size-9 shrink-0 place-items-center rounded-full bg-[#1b7d5d] text-white"
                        aria-label={playing ? "Pause voiceover" : "Play voiceover"}
                      >
                        {playing ? (
                          <Pause className="size-4 fill-current" />
                        ) : (
                          <Play className="ml-0.5 size-4 fill-current" />
                        )}
                      </button>
                      <button
                        onClick={stopAll}
                        className="grid size-9 shrink-0 place-items-center rounded-full bg-[#f4efe8] text-[#6b625a] hover:text-[#1b7d5d]"
                        aria-label="Stop voiceover"
                      >
                        <Square className="size-3.5 fill-current" />
                      </button>
                      <WaveBars active={playing} className="text-[#1b7d5d]" />
                      <a
                        href={audioUrl}
                        download={lastFilename}
                        className="ml-auto grid size-9 shrink-0 place-items-center rounded-full bg-[#f4efe8] text-[#6b625a] hover:bg-[#e8f4ee] hover:text-[#1b7d5d]"
                        aria-label="Download voiceover"
                      >
                        <Download className="size-4" />
                      </a>
                    </div>
                  )}

                  <button
                    onClick={generate}
                    disabled={generating || (Boolean(user) && !text.trim())}
                    className="mt-5 flex w-full items-center justify-center rounded-xl bg-[#1b7d5d] py-3.5 text-sm font-bold text-white shadow-[0_7px_16px_rgba(27,125,93,.18)] hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {generating ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" /> Creating your voice…
                      </>
                    ) : isGuest ? (
                      <>
                        <LockKeyhole className="mr-2 size-4" /> Sign in to generate
                      </>
                    ) : (
                      <>
                        Generate voiceover <ArrowRight className="ml-2 inline size-4" />
                      </>
                    )}
                  </button>
                  {isGuest && (
                    <p className="mt-3 text-center text-[11px] font-semibold text-[#8f8378]">
                      Free account required to generate & download ·{" "}
                      <Link
                        href="/login?mode=signup&next=%2F%23studio"
                        className="text-[#1b7d5d] hover:underline"
                      >
                        Create one in seconds
                      </Link>
                    </p>
                  )}
                </div>
                <div className="flex items-center justify-center gap-2 py-3 text-[11px] font-semibold text-[#9a8d80]">
                  <span className="size-1.5 rounded-full bg-[#54a67e]" />
                  {quality === "standard"
                    ? "Standard voice · Audio stays yours"
                    : "DetheAi natural voices · Audio stays yours"}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* STATS */}
        <section className="border-y border-[#eadfd2] bg-[#f7f1e8]/70 px-5 py-14 sm:px-8">
          <div className="container grid gap-5 md:grid-cols-4">
            {stats.map(({ value, label, icon: Icon }) => (
              <div key={label} className="rounded-2xl bg-[#fffdf8]/70 p-5">
                <Icon className="size-5 text-[#1b7d5d]" />
                <p className="display mt-3 text-3xl font-extrabold text-[#1b7d5d]">{value}</p>
                <p className="mt-1 text-xs font-semibold text-[#81766c]">{label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* VIDEO TO TEXT FEATURE */}
        <section className="px-5 pt-16 sm:px-8">
          <div className="container">
            <div className="relative overflow-hidden rounded-[28px] border border-[#eadfd2] bg-[#fffdf8] p-6 sm:p-10">
              <div className="absolute -right-10 -top-10 size-48 rounded-full bg-[#cfe7d7]/60 blur-3xl" />
              <div className="relative grid items-center gap-8 lg:grid-cols-[1.1fr_.9fr]">
                <div>
                  <span className="inline-flex items-center gap-2 rounded-full border border-[#d8e8de] bg-[#eef7f1] px-3 py-1.5 text-[11px] font-bold text-[#1b7d5d]">
                    <Captions className="size-3.5" /> New · Video to Text
                  </span>
                  <h2 className="display mt-4 text-3xl font-extrabold tracking-[-.04em] sm:text-4xl">
                    Turn any video into clean, accurate text.
                  </h2>
                  <p className="mt-3 max-w-xl text-base leading-7 text-[#81766c]">
                    Upload a lecture, reel or interview and DetheAi writes it out in Hindi, Odia,
                    English and 8 more languages — with timestamps, SRT subtitles and one-click copy.
                  </p>
                  <Link
                    href="/video-to-text"
                    className="mt-6 inline-flex items-center rounded-full bg-[#1b7d5d] px-6 py-3.5 text-sm font-bold text-white shadow-[0_9px_22px_rgba(27,125,93,.2)]"
                  >
                    Try Video to Text <ArrowRight className="ml-2 size-4" />
                  </Link>
                </div>
                <div className="rounded-2xl border border-[#e8ded2] bg-[#f7f2ea] p-4">
                  {[
                    ["0:00", "नमस्ते! आज हम सीखेंगे कि वीडियो से टेक्स्ट कैसे बनाते हैं।"],
                    ["0:06", "बस अपना वीडियो अपलोड करें और भाषा चुनें।"],
                    ["0:11", "कुछ ही सेकंड में साफ़ ट्रांसक्रिप्ट तैयार।"],
                  ].map(([t, line]) => (
                    <div key={t} className="flex gap-3 rounded-xl px-3 py-2.5 odd:bg-white/70">
                      <span className="mt-0.5 shrink-0 rounded-md bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-[#1b7d5d] shadow-sm">
                        {t}
                      </span>
                      <span className="text-sm leading-6 text-[#403831]">{line}</span>
                    </div>
                  ))}
                  <p className="mt-3 flex items-center gap-2 text-[11px] font-bold text-[#8f8378]">
                    <Check className="size-3.5 text-[#1b7d5d]" /> Auto language detect · SRT / VTT / TXT
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* VOICE LIBRARY PREVIEW */}
        <section id="voices" className="px-5 py-16 sm:px-8 lg:py-20">
          <div className="container">
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
              <div>
                <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[.18em] text-[#1b7d5d]">
                  <Sparkles className="size-3.5" /> Voice library
                </p>
                <h2 className="display mt-3 text-4xl font-extrabold tracking-[-.04em]">
                  A voice for every story.
                </h2>
                <p className="mt-3 max-w-xl text-base leading-7 text-[#81766c]">
                  Browse 50 profiles per language, tap <strong>Listen</strong> to hear any voice,
                  then select one for your next voiceover.
                </p>
              </div>
              <button
                onClick={() => setShowLibrary(true)}
                className="shrink-0 rounded-full bg-[#1b7d5d] px-5 py-3 text-sm font-bold text-white"
              >
                Explore all {VOICE_COUNT} voices <ArrowRight className="ml-1 inline size-4" />
              </button>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {previewVoices.map((v) => (
                <VoiceCard
                  key={v.id}
                  profile={v}
                  selected={selectedId === v.id}
                  favorite={favorites.includes(v.id)}
                  previewing={previewingId === v.id}
                  playing={playingPreviewId === v.id && playing}
                  onSelect={() => selectVoice(v)}
                  onPreview={() =>
                    playingPreviewId === v.id && playing ? stopAll() : previewVoice(v)
                  }
                  onFavorite={() => toggleFavorite(v.id)}
                />
              ))}
            </div>
          </div>
        </section>

        {/* RECENT */}
        {recent.length > 0 && (
          <section className="border-t border-[#eadfd2] bg-[#fffdf8] px-5 py-12 sm:px-8">
            <div className="container">
              <div className="flex items-center justify-between">
                <h2 className="display mt-2 text-3xl font-extrabold">Your recent voiceovers</h2>
                <span className="text-xs font-semibold text-[#9a8d80]">{recent.length} saved</span>
              </div>
              <div className="mt-6 grid gap-3">
                {recent.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 rounded-2xl border border-[#eadfd2] bg-[#f7f2ea] p-3"
                  >
                    <button
                      onClick={() => replayRecent(item)}
                      className="grid size-10 shrink-0 place-items-center rounded-full bg-[#dcefe4] text-[#1b7d5d]"
                      aria-label="Replay saved voiceover"
                    >
                      <Play className="size-4 fill-current" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-[#403831]">{item.text}</p>
                      <p className="mt-1 text-[11px] font-semibold text-[#8f8378]">
                        {item.voiceName} · {item.language} ·{" "}
                        {new Date(item.createdAt).toLocaleString([], {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                    </div>
                    <button
                      onClick={() => downloadRecent(item)}
                      className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-[#6b625a] hover:text-[#1b7d5d]"
                      aria-label="Download saved voiceover"
                    >
                      <Download className="size-4" />
                    </button>
                    <button
                      onClick={() => setRecent((prev) => prev.filter((r) => r.id !== item.id))}
                      className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-[#a08f82] hover:text-[#b95e42]"
                      aria-label="Remove saved voiceover"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-[#9a8d80]">
                Saved only in this browser. Clearing site data removes local files.
              </p>
            </div>
          </section>
        )}

        {/* PRICING TEASER */}
        <section id="pricing" className="bg-[#f7f1e8]/70 px-5 py-16 sm:px-8">
          <div className="container text-center">
            <p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#1b7d5d]">
              Simple pricing
            </p>
            <h2 className="display mt-3 text-4xl font-extrabold">Start free. Grow when you’re ready.</h2>
            <p className="mx-auto mt-3 max-w-xl text-base leading-7 text-[#81766c]">
              Use the studio to explore voices, then add plans when your workflow grows.
            </p>
            <BillingToggle value={billingCycle} onChange={setBillingCycle} className="mt-8" />
            <div className="mx-auto mt-8 grid max-w-5xl gap-4 text-left md:grid-cols-3">
              {PLANS.map((plan) => (
                <div key={plan.title} className="rounded-3xl border border-[#eadfd2] bg-[#fffdf8] p-6">
                  <p className="text-sm font-extrabold text-[#1b7d5d]">{plan.title}</p>
                  <PlanPrice plan={plan} cycle={billingCycle} />
                  <p className="mt-2 text-sm text-[#81766c]">{plan.copy}</p>
                  <ul className="mt-6 space-y-3 text-sm font-semibold text-[#5f574f]">
                    {plan.items.map((feat) => (
                      <li key={feat} className="flex items-center gap-2">
                        <Check className="size-4 text-[#1b7d5d]" /> {feat}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={user ? "/#studio" : "/login?mode=signup"}
                    className="mt-7 block w-full rounded-xl bg-[#1b7d5d] py-3 text-center text-sm font-bold text-white"
                  >
                    Get started
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />

      <audio
        ref={audioRef}
        src={audioUrl ?? undefined}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        className="hidden"
      />

      <VoiceLibraryModal
        open={showLibrary}
        onClose={() => setShowLibrary(false)}
        selectedId={selectedId}
        previewingId={previewingId}
        playingId={playingPreviewId}
        isPlaying={playing}
        loggedIn={Boolean(user)}
        onSelect={selectVoice}
        onPreview={previewVoice}
        onStopPreview={stopAll}
      />

      <AuthGateModal
        open={gate.open}
        reason={gate.reason}
        next="/#studio"
        onClose={() => setGate((g) => ({ ...g, open: false }))}
      />
    </div>
  );
}
