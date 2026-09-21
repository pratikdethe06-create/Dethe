"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Captions,
  Copy,
  CreditCard,
  Download,
  FolderKanban,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Mic,
  Pause,
  Play,
  Search,
  Settings,
  Sparkles,
  Square,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { BrandLogo } from "@/components/brand";
import { SubscriptionPanel } from "@/components/SubscriptionPanel";
import { StaticHostingNotice } from "@/components/static-notice";
import { BACKEND_AVAILABLE } from "@/lib/api-base";

import { Toaster, it } from "@/components/toast";
import {
  VoiceCard,
  WaveBars,
  readFavorites,
  rememberVoice,
} from "@/components/voices-ui";
import {
  audioUrlFromBase64,
  downloadUrl,
  speakWithBrowser,
  stopBrowserSpeech,
} from "@/lib/client-audio";
import type { BillingSummary, SafeUser } from "@/lib/auth";
import { countWords, creditsForWords } from "@/lib/credits";
import type { VoiceProject } from "@/db/schema";
import {
  LANGUAGES,
  MAX_CHARACTERS,
  STYLES,
  VOICES,
  getVoiceById,
  type VoiceProfile,
} from "@/lib/voices";
import { apiFetch } from "@/lib/api-base";

type ProjectDTO = Omit<VoiceProject, "createdAt"> & { createdAt: string };
type Tab = "dashboard" | "projects" | "voices";

const DEFAULT_SCRIPT = "नमस्ते! अपनी कहानी को एक ऐसी आवाज़ दें जो सुनने वाले के दिल तक पहुँचे।";

function DashboardSlider({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="text-[10px] font-bold uppercase tracking-[.13em] text-[#8b7e72]">
      {label}
      <span className="float-right text-[#8f8378]">{display}</span>
      <input
        className="dashboard-range mt-3 w-full"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<SafeUser | null>(null);
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [upgraded, setUpgraded] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("upgraded") === "1") {
      setUpgraded(true);
      window.history.replaceState({}, "", "/dashboard");
    }
  }, []);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [script, setScript] = useState(DEFAULT_SCRIPT);
  const [language, setLanguage] = useState("Hindi");
  const [voiceId, setVoiceId] = useState("hindi-01");
  const [style, setStyle] = useState(STYLES[0]);
  const [genderFilter, setGenderFilter] = useState("All genders");
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleVoices, setVisibleVoices] = useState(24);
  const [favorites, setFavorites] = useState<string[]>([]);

  const [speed, setSpeed] = useState(1);
  const [pitch, setPitch] = useState(0);
  const [emotion, setEmotion] = useState(64);
  const [playbackRate, setPlaybackRate] = useState(1);

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [nowPlaying, setNowPlaying] = useState<{
    text: string;
    voiceName: string;
    language: string;
  } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectDTO[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const selected = useMemo(() => getVoiceById(voiceId), [voiceId]);
  const usedPct = billing
    ? Math.min(100, Math.round((billing.creditsUsed / billing.creditsLimit) * 100))
    : 0;

  const refreshMe = useCallback(async () => {
    try {
      const res = await apiFetch("/api/auth/me");
      if (!res.ok) return false;
      const data = await res.json();
      setUser(data.user ?? null);
      setBilling(data.billing ?? null);
      return true;
    } catch {
      return false;
    }
  }, []);

  const refreshProjects = useCallback(async () => {
    try {
      const res = await apiFetch("/api/projects");
      if (!res.ok) return;
      const data = await res.json();
      setProjects(data.projects ?? []);
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    (async () => {
      const ok = await refreshMe();
      if (!ok) {
        router.replace("/login?error=auth_required&next=%2Fdashboard");
        return;
      }
      await refreshProjects();
      setFavorites(readFavorites());
      setLoading(false);
    })();
    return () => stopBrowserSpeech();
  }, [refreshMe, refreshProjects, router]);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackRate;
  }, [playbackRate, audioUrl]);

  const stopAll = useCallback(() => {
    stopBrowserSpeech();
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
    setPlaying(false);
  }, []);

  const playUrl = useCallback(
    (url: string, meta: { text: string; voiceName: string; language: string }) => {
      stopBrowserSpeech();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(url);
      setNowPlaying(meta);
      requestAnimationFrame(() => {
        if (audioRef.current) {
          audioRef.current.playbackRate = playbackRate;
          audioRef.current.play().catch(() => setPlaying(false));
        }
      });
    },
    [audioUrl, playbackRate]
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

  const generate = useCallback(async () => {
    const value = script.trim();
    if (!value) {
      it.error("Add a script before generating.");
      return;
    }
    const cost = creditsForWords(countWords(value));
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
          text: value,
          language: selected.language,
          voiceId: selected.id,
          voice: selected.providerVoice,
          style,
          speed,
          pitch,
          emotion,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "Could not generate speech.");

      const meta = { text: value, voiceName: selected.name, language: selected.language };
      if (data.audioBase64) {
        playUrl(audioUrlFromBase64(data.audioBase64, data.mimeType || "audio/mpeg"), meta);
      } else {
        await speakWithBrowser(value, selected.locale, { rate: speed });
        setNowPlaying(meta);
      }

      await apiFetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: value,
          language: selected.language,
          voiceId: selected.id,
          voiceName: selected.name,
          style,
          audioBase64: data.audioBase64 && data.audioBase64.length < 2500000 ? data.audioBase64 : "",
          mimeType: data.mimeType || "audio/mpeg",
          filename: data.filename || "dethe-voiceover.mp3",
          charCount: value.length,
        }),
      }).catch(() => null);

      await Promise.all([refreshMe(), refreshProjects()]);
      it.success(
        data.audioBase64
          ? `Speech generated · ${data.creditsCharged ?? 0} credits used · ${(data.creditsRemaining ?? 0).toLocaleString()} left`
          : "Played with browser voice."
      );
    } catch (e) {
      it.error(e instanceof Error ? e.message : "Could not generate speech.");
    } finally {
      setGenerating(false);
    }
  }, [script, billing, stopAll, selected, style, speed, pitch, emotion, playUrl, refreshMe, refreshProjects]);

  const previewVoice = useCallback(
    async (v: VoiceProfile) => {
      if (previewingId) return;
      stopAll();
      setPreviewingId(v.id);
      try {
        const previewText = `This is ${v.name}, a ${v.style.toLowerCase()} voice from DetheAi.`;
        const res = await apiFetch("/api/voice/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: previewText,
            language: v.language,
            voiceId: v.id,
            voice: v.providerVoice,
            style: v.style,
            purpose: "preview",
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.message || "Could not generate speech.");
        if (data.audioBase64) {
          playUrl(audioUrlFromBase64(data.audioBase64, data.mimeType || "audio/mpeg"), {
            text: `Preview · ${v.name}`,
            voiceName: v.name,
            language: v.language,
          });
          setTab("dashboard");
        } else {
          await speakWithBrowser(previewText, v.locale);
        }
        refreshMe();
        it.success(`${v.name} preview ready.`);
      } catch (e) {
        it.error(e instanceof Error ? e.message : "Could not generate speech.");
      } finally {
        setPreviewingId(null);
      }
    },
    [previewingId, stopAll, playUrl, refreshMe]
  );

  const selectVoice = useCallback((v: VoiceProfile) => {
    setVoiceId(v.id);
    setLanguage(v.language);
    rememberVoice(v.id);
    setTab("dashboard");
    it.success(`${v.name} selected.`);
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id];
      try {
        localStorage.setItem("vaani-voice-favorites-v1", JSON.stringify(next));
      } catch {
        /* noop */
      }
      return next;
    });
  }, []);

  const playProject = useCallback(
    (p: ProjectDTO) => {
      stopAll();
      if (p.audioBase64) {
        playUrl(audioUrlFromBase64(p.audioBase64, p.mimeType || "audio/mpeg"), {
          text: p.text,
          voiceName: p.voiceName,
          language: p.language,
        });
        setTab("dashboard");
      } else {
        setScript(p.text);
        setTab("dashboard");
        it.info("Audio expired for this project — press Generate to recreate it.");
      }
    },
    [stopAll, playUrl]
  );

  const deleteProject = useCallback(
    async (id: string) => {
      await apiFetch(`/api/projects/${id}`, { method: "DELETE" }).catch(() => null);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      it.success("Project removed.");
    },
    []
  );

  const copyScript = useCallback(async (value: string) => {
    try {
      await navigator.clipboard?.writeText(value);
      it.success("Project script copied.");
    } catch {
      it.error("Could not copy script.");
    }
  }, []);

  const signOut = useCallback(async () => {
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/";
  }, []);

  const filteredVoices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return VOICES.filter((v) => {
      if (language !== "All languages" && v.language !== language) return false;
      if (genderFilter !== "All genders" && v.gender !== genderFilter) return false;
      if (
        q &&
        ![v.name, v.language, v.style, v.description].join(" ").toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [language, genderFilter, searchQuery]);

  if (!BACKEND_AVAILABLE) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#fffaf2] px-5">
        <div className="w-full max-w-lg">
          <BrandLogo />
          <StaticHostingNotice feature="dashboard" className="mt-6" />
          <Link href="/" className="mt-6 inline-block text-sm font-bold text-[#1b7d5d] hover:underline">
            ← Back to DetheAI
          </Link>
        </div>
      </div>
    );
  }
  if (loading || !user) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#fffaf2] text-sm text-[#8f8378]">
        Loading your workspace…
      </div>
    );
  }

  const nav = [
    { key: "dashboard" as Tab, label: "Voice Studio", icon: LayoutDashboard },
    { key: "projects" as Tab, label: "My Projects", icon: FolderKanban },
    { key: "voices" as Tab, label: "Voice Library", icon: Mic },
  ];

  return (
    <div className="dashboard-shell min-h-screen bg-[#fffaf2] text-[#17231f]">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-[#17231f]/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[250px] flex-col border-r border-[#eadfd2] bg-[#fffdf8] p-5 transition-transform lg:static lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between">
          <BrandLogo href="/" compact />
          <button
            className="text-[#8f8378] lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            <X className="size-5" />
          </button>
        </div>

        <p className="mt-10 px-2 text-[10px] font-bold uppercase tracking-[.2em] text-[#9a8d80]">
          Workspace
        </p>
        <nav className="mt-3 space-y-1">
          {nav.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => {
                setTab(key);
                setSidebarOpen(false);
              }}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold ${
                tab === key
                  ? "bg-[#dcefe4] text-[#1b7d5d] shadow-[inset_3px_0_0_#1b7d5d]"
                  : "text-[#6b625a] hover:bg-[#f5efe8]"
              }`}
            >
              <Icon className="size-[18px]" /> {label}
            </button>
          ))}
        </nav>

        <p className="mt-8 px-2 text-[10px] font-bold uppercase tracking-[.2em] text-[#9a8d80]">
          Manage
        </p>
        <Link
          href="/video-to-text"
          className="mt-3 flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-[#6b625a] hover:bg-[#f5efe8]"
        >
          <Captions className="size-[18px] text-[#1b7d5d]" /> Video to Text
          <span className="ml-auto rounded-full bg-[#dcefe4] px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-[#1b7d5d]">
            New
          </span>
        </Link>
        <Link
          href="/pricing"
          className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-[#6b625a] hover:bg-[#f5efe8]"
        >
          <CreditCard className="size-[18px] text-[#1b7d5d]" /> Credits & Plans
        </Link>
        <button
          onClick={() => it.info("Workspace settings are coming next.")}
          className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-[#6b625a] hover:bg-[#f5efe8]"
        >
          <Settings className="size-[18px]" /> Settings
        </button>

        <div className="mt-auto rounded-2xl border border-[#dcefe4] bg-[#f4fbf6] p-4">
          <div className="flex items-center gap-2 text-xs font-bold text-[#2f3e36]">
            <Zap className="size-4 text-[#1b7d5d]" /> Monthly credits
          </div>
          <p className="mt-3 text-2xl font-extrabold">
            {billing?.creditsRemaining.toLocaleString() ?? "—"}
          </p>
          <p className="mt-1 text-[11px] text-[#8f8378]">
            {billing?.planName ?? "Free"} plan · {usedPct}% used
            {billing ? ` · ≈ ${billing.wordsRemaining.toLocaleString()} words left` : ""}
          </p>
          <div className="mt-3 h-1.5 rounded-full bg-[#f5efe8]">
            <div
              className="h-full rounded-full bg-[#1b7d5d]"
              style={{ width: `${usedPct}%` }}
            />
          </div>
          {billing && (
            <p className="mt-2 text-[11px] text-[#9a8d80]">
              Resets to {billing.creditsLimit.toLocaleString()} on{" "}
              {new Date(billing.resetsAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · 5 credits
              per 100 words
            </p>
          )}
          <Link
            href="/pricing"
            className="mt-4 block text-xs font-bold text-[#1b7d5d] hover:text-[#1b7d5d]"
          >
            {billing && billing.planName !== "Free" ? "Manage plan" : "Upgrade plan"} <ArrowRight className="ml-1 inline size-3" />
          </Link>
        </div>
      </aside>

      <div className="min-w-0 flex-1 lg:ml-0">
        <div className="flex items-center justify-between gap-3 border-b border-[#eadfd2] px-5 py-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              className="rounded-lg p-2 text-[#6b625a] hover:bg-[#f5efe8] lg:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold">Namaste, {user.name} 👋</p>
              <p className="truncate text-[11px] text-[#8f8378]">
                {billing?.planName ?? "Free"} plan · {billing?.creditsRemaining.toLocaleString() ?? 0}{" "}
                credits left{billing ? ` (≈ ${billing.wordsRemaining.toLocaleString()} words)` : ""}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/"
              className="hidden rounded-xl border border-[#e8ded2] px-4 py-2.5 text-xs font-bold text-[#5f574f] hover:bg-[#f5efe8] sm:block"
            >
              View site
            </Link>
            <button
              onClick={signOut}
              className="flex items-center gap-2 rounded-xl bg-[#f5efe8] px-4 py-2.5 text-xs font-bold text-[#5f574f] hover:bg-[#f5efe8]"
            >
              <LogOut className="size-3.5" /> Sign out
            </button>
          </div>
        </div>

        <main className="px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
          {tab === "dashboard" && (
            <div className="mb-6">
              <SubscriptionPanel highlight={upgraded} />
            </div>
          )}
          {tab === "dashboard" && (
            <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
              <section className="rounded-3xl border border-[#eadfd2] bg-[#fffdf8] p-5 sm:p-7">
                <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#9a8d80]">
                  Voice studio
                </p>
                <h2 className="display mt-2 text-2xl font-extrabold sm:text-3xl">
                  Create your voiceover.
                </h2>

                <textarea
                  value={script}
                  maxLength={MAX_CHARACTERS}
                  onChange={(e) => setScript(e.target.value)}
                  className="mt-5 min-h-[150px] w-full resize-none rounded-2xl border border-[#e8ded2] bg-white p-4 text-[15px] leading-7 text-[#17231f] outline-none placeholder:text-[#a09488] focus:border-[#74b596]"
                  placeholder="Type or paste your script here…"
                />
                <div className="mt-2 flex justify-between text-[11px] font-medium text-[#9a8d80]">
                  <span>{MAX_CHARACTERS - script.length} characters remaining</span>
                  <span>
                    {script.length} / {MAX_CHARACTERS}
                  </span>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <label className="text-[10px] font-bold uppercase tracking-[.13em] text-[#8b7e72]">
                    Language
                    <select
                      value={language}
                      onChange={(e) => {
                        const next = e.target.value;
                        if (next === "All languages") return;
                        setLanguage(next);
                        setVoiceId(`${next.toLowerCase()}-01`);
                      }}
                      className="mt-2 w-full rounded-xl border border-[#e8ded2] bg-white px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-[#17231f] outline-none"
                    >
                      {LANGUAGES.map((l) => (
                        <option key={l.name} className="bg-white">
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-[10px] font-bold uppercase tracking-[.13em] text-[#8b7e72]">
                    Style
                    <select
                      value={style}
                      onChange={(e) => setStyle(e.target.value)}
                      className="mt-2 w-full rounded-xl border border-[#e8ded2] bg-white px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-[#17231f] outline-none"
                    >
                      {STYLES.map((s) => (
                        <option key={s} className="bg-white">
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-[#deebe3] bg-[#f4fbf6] px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#dcefe4] text-[#1b7d5d]">
                      <Mic className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[#17231f]">
                        {selected.native} · {selected.name}
                      </p>
                      <p className="truncate text-[11px] text-[#8f8378]">
                        {selected.style} · {selected.gender}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setTab("voices")}
                    className="shrink-0 text-[11px] font-bold text-[#1b7d5d] hover:text-[#1b7d5d]"
                  >
                    Change voice
                  </button>
                </div>

                <div className="mt-6 grid gap-6 sm:grid-cols-2">
                  <DashboardSlider
                    label="Voice speed"
                    value={speed}
                    display={`${speed.toFixed(2)}×`}
                    min={0.5}
                    max={1.5}
                    step={0.05}
                    onChange={setSpeed}
                  />
                  <DashboardSlider
                    label="Pitch"
                    value={pitch}
                    display={pitch > 0 ? `+${pitch}` : `${pitch}`}
                    min={-10}
                    max={10}
                    step={1}
                    onChange={setPitch}
                  />
                  <DashboardSlider
                    label="Emotion"
                    value={emotion}
                    display={`${emotion}`}
                    min={0}
                    max={100}
                    step={1}
                    onChange={setEmotion}
                  />
                  <DashboardSlider
                    label="Playback speed"
                    value={playbackRate}
                    display={`${playbackRate.toFixed(2)}×`}
                    min={0.5}
                    max={2}
                    step={0.05}
                    onChange={setPlaybackRate}
                  />
                </div>

                <button
                  onClick={generate}
                  disabled={generating || !script.trim()}
                  className="mt-7 flex w-full items-center justify-center rounded-2xl bg-[#1b7d5d] py-4 text-sm font-bold text-white shadow-[0_10px_30px_rgba(27,125,93,.25)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {generating ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" /> Creating your voice…
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 size-4" /> Generate speech
                    </>
                  )}
                </button>
                <p className="mt-3 text-center text-[11px] text-[#9a8d80]">
                  {(() => {
                    const w = countWords(script);
                    const c = creditsForWords(w);
                    return w === 0
                      ? "5 credits per 100 words · Audio stays yours"
                      : `${w.toLocaleString()} ${w === 1 ? "word" : "words"} · uses ${c} credits · ${
                          billing ? `${Math.max(0, billing.creditsRemaining - c).toLocaleString()} left after` : "Audio stays yours"
                        }`;
                  })()}
                </p>
              </section>

              <div className="grid content-start gap-6">
                <section className="rounded-3xl border border-[#eadfd2] bg-[#fffdf8] p-5 sm:p-6">
                  <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#9a8d80]">
                    Now playing
                  </p>
                  {nowPlaying && audioUrl ? (
                    <>
                      <p className="mt-3 line-clamp-2 text-sm font-bold leading-6">
                        {nowPlaying.text}
                      </p>
                      <p className="mt-1 text-[11px] text-[#8f8378]">
                        {nowPlaying.voiceName} · {nowPlaying.language}
                      </p>
                      <div
                        className={`dashboard-wave mt-4 flex h-9 items-center gap-1 ${
                          playing ? "text-[#1b7d5d]" : "text-[#c5bcb2]"
                        }`}
                      >
                        {[15, 26, 19, 32, 22, 36, 18, 28, 16, 31, 21, 35, 18, 27, 14, 25, 31, 18].map(
                          (h, i) => (
                            <span
                              key={i}
                              className={playing ? "wave-bar" : ""}
                              style={{ height: playing ? undefined : h, animationDelay: `${i * 70}ms` }}
                            />
                          )
                        )}
                      </div>
                      <div className="mt-4 flex items-center gap-2">
                        <button
                          onClick={togglePlay}
                          aria-label={playing ? "Pause" : "Play"}
                          className="grid size-10 place-items-center rounded-full bg-[#1b7d5d] text-white"
                        >
                          {playing ? (
                            <Pause className="size-4 fill-current" />
                          ) : (
                            <Play className="ml-0.5 size-4 fill-current" />
                          )}
                        </button>
                        <button
                          onClick={stopAll}
                          aria-label="Stop"
                          className="grid size-10 place-items-center rounded-full bg-[#f5efe8] text-[#5f574f]"
                        >
                          <Square className="size-3.5 fill-current" />
                        </button>
                        <a
                          href={audioUrl}
                          download="dethe-voiceover.mp3"
                          aria-label="Download"
                          className="grid size-10 place-items-center rounded-full bg-[#f5efe8] text-[#5f574f] hover:text-[#1b7d5d]"
                        >
                          <Download className="size-4" />
                        </a>
                        <button
                          onClick={() => copyScript(nowPlaying.text)}
                          aria-label="Copy script"
                          className="grid size-10 place-items-center rounded-full bg-[#f5efe8] text-[#5f574f] hover:text-[#1b7d5d]"
                        >
                          <Copy className="size-4" />
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-dashed border-[#d8cec2] p-8 text-center">
                      <WaveBars active={false} className="mx-auto max-w-[180px] justify-center text-[#d8cec2]" />
                      <p className="mt-3 text-xs font-semibold text-[#9a8d80]">
                        Generate a voiceover and it will play here.
                      </p>
                    </div>
                  )}
                </section>

                <section className="rounded-3xl border border-[#eadfd2] bg-[#fffdf8] p-5 sm:p-6">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#9a8d80]">
                      Latest projects
                    </p>
                    <button
                      onClick={() => setTab("projects")}
                      className="text-[11px] font-bold text-[#1b7d5d] hover:text-[#1b7d5d]"
                    >
                      View all
                    </button>
                  </div>
                  {projects.length === 0 ? (
                    <p className="mt-4 text-xs leading-5 text-[#9a8d80]">
                      No projects yet — your generated voiceovers will appear here.
                    </p>
                  ) : (
                    <div className="mt-4 grid gap-2">
                      {projects.slice(0, 4).map((p) => (
                        <button
                          key={p.id}
                          onClick={() => playProject(p)}
                          className="truncate rounded-xl bg-[#f7f2ea] px-3 py-2.5 text-left text-xs font-semibold text-[#5f574f] hover:bg-[#f5efe8]"
                        >
                          {p.text}
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </div>
          )}

          {tab === "projects" && (
            <section>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#9a8d80]">
                    {projects.length} saved
                  </p>
                  <h2 className="display mt-1 text-2xl font-extrabold sm:text-3xl">My Projects</h2>
                </div>
                <button
                  onClick={() => setTab("dashboard")}
                  className="rounded-xl bg-[#1b7d5d] px-4 py-2.5 text-xs font-bold text-[#17231f]"
                >
                  + New voiceover
                </button>
              </div>

              {projects.length === 0 ? (
                <div className="mt-6 rounded-3xl border border-dashed border-[#d8cec2] p-12 text-center">
                  <FolderKanban className="mx-auto size-8 text-[#d8cec2]" />
                  <p className="mt-4 text-sm font-bold">No projects yet</p>
                  <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-[#9a8d80]">
                    Generate your first voiceover in the studio and it will be saved here
                    automatically.
                  </p>
                  <button
                    onClick={() => setTab("dashboard")}
                    className="mt-5 rounded-xl bg-[#f5efe8] px-5 py-2.5 text-xs font-bold hover:bg-[#dcefe4]"
                  >
                    Open Voice Studio
                  </button>
                </div>
              ) : (
                <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {projects.map((p) => (
                    <div
                      key={p.id}
                      className="rounded-2xl border border-[#eadfd2] bg-[#fffdf8] p-5"
                    >
                      <p className="line-clamp-3 min-h-[60px] text-sm font-semibold leading-6">
                        {p.text}
                      </p>
                      <p className="mt-2 text-[11px] text-[#8f8378]">
                        {p.voiceName || "Voice"} · {p.language} ·{" "}
                        {new Date(p.createdAt).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                      <div className="mt-4 flex items-center gap-2">
                        <button
                          onClick={() => playProject(p)}
                          aria-label="Play project"
                          className="grid size-9 place-items-center rounded-full bg-[#1b7d5d] text-white"
                        >
                          <Play className="ml-0.5 size-3.5 fill-current" />
                        </button>
                        {p.audioBase64 ? (
                          <button
                            onClick={() =>
                              downloadUrl(
                                audioUrlFromBase64(p.audioBase64, p.mimeType || "audio/mpeg"),
                                p.filename || "dethe-voiceover.mp3"
                              )
                            }
                            aria-label="Download project"
                            className="grid size-9 place-items-center rounded-full bg-[#f5efe8] text-[#5f574f] hover:text-[#1b7d5d]"
                          >
                            <Download className="size-4" />
                          </button>
                        ) : null}
                        <button
                          onClick={() => copyScript(p.text)}
                          aria-label="Copy script"
                          className="grid size-9 place-items-center rounded-full bg-[#f5efe8] text-[#5f574f] hover:text-[#1b7d5d]"
                        >
                          <Copy className="size-4" />
                        </button>
                        <button
                          onClick={() => deleteProject(p.id)}
                          aria-label="Delete project"
                          className="ml-auto grid size-9 place-items-center rounded-full bg-[#f5efe8] text-[#b95e42] hover:bg-[#dcefe4]"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {tab === "voices" && (
            <section>
              <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#9a8d80]">
                Voice library
              </p>
              <h2 className="display mt-1 text-2xl font-extrabold sm:text-3xl">
                Find the voice that sounds like you.
              </h2>
              <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto_auto]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-3 size-4 text-[#a09488]" />
                  <input
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setVisibleVoices(24);
                    }}
                    placeholder="Search voice, language, style…"
                    className="w-full rounded-xl border border-[#e8ded2] bg-white py-2.5 pl-9 pr-3 text-sm text-[#17231f] outline-none placeholder:text-[#a09488] focus:border-[#74b596]"
                  />
                </div>
                <select
                  value={language}
                  onChange={(e) => {
                    setLanguage(e.target.value);
                    setVisibleVoices(24);
                  }}
                  className="rounded-xl border border-[#e8ded2] bg-white px-3 py-2.5 text-sm font-semibold text-[#17231f] outline-none"
                >
                  <option className="bg-white">All languages</option>
                  {LANGUAGES.map((l) => (
                    <option key={l.name} className="bg-white">
                      {l.name}
                    </option>
                  ))}
                </select>
                <select
                  value={genderFilter}
                  onChange={(e) => {
                    setGenderFilter(e.target.value);
                    setVisibleVoices(24);
                  }}
                  className="rounded-xl border border-[#e8ded2] bg-white px-3 py-2.5 text-sm font-semibold text-[#17231f] outline-none"
                >
                  <option className="bg-white">All genders</option>
                  <option className="bg-white">Female</option>
                  <option className="bg-white">Male</option>
                </select>
              </div>
              <p className="mt-3 text-xs font-semibold text-[#9a8d80]">
                Showing {Math.min(visibleVoices, filteredVoices.length)} of{" "}
                {filteredVoices.length} voices
              </p>
              {filteredVoices.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-dashed border-[#d8cec2] p-12 text-center text-sm font-semibold text-[#9a8d80]">
                  No voices match those filters.
                </div>
              ) : (
                <>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {filteredVoices.slice(0, visibleVoices).map((v) => (
                      <VoiceCard
                        key={v.id}
                        profile={v}
                        selected={v.id === voiceId}
                        favorite={favorites.includes(v.id)}
                        previewing={previewingId === v.id}
                        onSelect={() => selectVoice(v)}
                        onPreview={() => previewVoice(v)}
                        onFavorite={() => toggleFavorite(v.id)}
                      />
                    ))}
                  </div>
                  {visibleVoices < filteredVoices.length && (
                    <button
                      onClick={() => setVisibleVoices((n) => n + 24)}
                      className="mx-auto mt-6 block rounded-full border border-[#d8cec2] px-6 py-3 text-sm font-bold text-[#5f574f] hover:border-[#1b7d5d]"
                    >
                      Show more voices
                    </button>
                  )}
                </>
              )}
            </section>
          )}
        </main>
      </div>

      <audio
        ref={audioRef}
        src={audioUrl ?? undefined}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        className="hidden"
      />
      <Toaster />
    </div>
  );
}
