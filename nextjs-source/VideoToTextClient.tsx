"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Captions,
  Check,
  ChevronDown,
  Clock3,
  Copy,
  Download,
  FileText,
  FileVideo,
  Languages,
  Link2,
  Loader2,
  LockKeyhole,
  Sparkles,
  Trash2,
  Type,
  UploadCloud,
  X,
} from "lucide-react";
import { Footer, Header } from "@/components/chrome";
import { StaticHostingNotice } from "@/components/static-notice";

import { AuthGateModal, useSession } from "@/components/auth-gate";
import { Toaster, it } from "@/components/toast";
import { apiFetch, apiUrl } from "@/lib/api-base";

/* ------------------------------------------------------------------ */

interface Segment {
  start: number;
  end: number;
  text: string;
}

interface TranscriptDTO {
  id: string;
  title: string;
  sourceName: string;
  sourceType: string;
  languageCode: string;
  mode: string;
  durationSec: number;
  text: string;
  segments: Segment[];
  wordCount: number;
  createdAt: string;
}

const LANGUAGES = [
  { code: "unknown", label: "Auto-detect" },
  { code: "hi-IN", label: "Hindi · हिंदी" },
  { code: "en-IN", label: "English" },
  { code: "od-IN", label: "Odia · ଓଡ଼ିଆ" },
  { code: "ta-IN", label: "Tamil · தமிழ்" },
  { code: "te-IN", label: "Telugu · తెలుగు" },
  { code: "mr-IN", label: "Marathi · मराठी" },
  { code: "bn-IN", label: "Bengali · বাংলা" },
  { code: "gu-IN", label: "Gujarati · ગુજરાતી" },
  { code: "pa-IN", label: "Punjabi · ਪੰਜਾਬੀ" },
  { code: "kn-IN", label: "Kannada · ಕನ್ನಡ" },
  { code: "ml-IN", label: "Malayalam · മലയാളം" },
];

const LANG_NAME: Record<string, string> = Object.fromEntries(
  LANGUAGES.map((l) => [l.code, l.label.split(" · ")[0]])
);

const MAX_MB = 200;

function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`
    : `${m}:${String(r).padStart(2, "0")}`;
}

function fmtBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/* ------------------------------------------------------------------ */

export default function VideoToTextClient() {
  const { user, loading: sessionLoading } = useSession();

  const [tab, setTab] = useState<"upload" | "url">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [language, setLanguage] = useState("unknown");
  const [mode, setMode] = useState<"transcribe" | "translate">("transcribe");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"idle" | "uploading" | "processing">("idle");
  const [uploadPct, setUploadPct] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<TranscriptDTO | null>(null);
  const [history, setHistory] = useState<TranscriptDTO[]>([]);
  const [gateOpen, setGateOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<"text" | "timeline">("text");
  const [activeSeg, setActiveSeg] = useState<number | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const loadHistory = useCallback(async () => {
    try {
      const res = await apiFetch("/api/transcripts", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setHistory(data.transcripts ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (user) loadHistory();
  }, [user, loadHistory]);

  useEffect(() => {
    if (!busy) return;
    setElapsed(0);
    const t0 = Date.now();
    const id = window.setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [busy]);

  /* video ↔ transcript sync */
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !result) return;
    const onTime = () => {
      const t = el.currentTime;
      const idx = result.segments.findIndex((s) => t >= s.start && t < s.end);
      setActiveSeg(idx >= 0 ? idx : null);
    };
    el.addEventListener("timeupdate", onTime);
    return () => el.removeEventListener("timeupdate", onTime);
  }, [result]);

  const pickFile = (f: File | null) => {
    if (!f) return;
    if (f.size > MAX_MB * 1024 * 1024) {
      it.error(`Please choose a video up to ${MAX_MB} MB.`);
      return;
    }
    if (!f.type.startsWith("video/") && !f.type.startsWith("audio/") && !/\.(mp4|mov|mkv|webm|avi|m4v|mp3|wav|m4a)$/i.test(f.name)) {
      it.error("Unsupported file. Use MP4, MOV, MKV, WebM, AVI or an audio file.");
      return;
    }
    setFile(f);
    setResult(null);
  };

  const requireAuth = () => {
    if (!user) {
      setGateOpen(true);
      return false;
    }
    return true;
  };

  const cancel = () => {
    xhrRef.current?.abort();
    xhrRef.current = null;
    setBusy(false);
    setPhase("idle");
    setUploadPct(0);
  };

  const convert = async () => {
    if (!requireAuth()) return;
    if (tab === "upload" && !file) {
      it.error("Choose a video file first.");
      inputRef.current?.click();
      return;
    }
    if (tab === "url" && !url.trim()) {
      it.error("Paste a direct video link first.");
      return;
    }
    setBusy(true);
    setResult(null);
    setUploadPct(0);
    setPhase(tab === "upload" ? "uploading" : "processing");

    try {
      const data = await new Promise<{ ok: boolean; status: number; body: unknown }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;
        xhr.open("POST", apiUrl("/api/transcribe"));
        xhr.withCredentials = true;
        xhr.responseType = "json";
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            setUploadPct(pct);
            if (pct >= 100) setPhase("processing");
          }
        };
        xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, body: xhr.response });
        xhr.onerror = () => reject(new Error("Network error — please check your connection and try again."));
        xhr.onabort = () => reject(new Error("__aborted__"));
        if (tab === "upload" && file) {
          const form = new FormData();
          form.append("file", file);
          form.append("language", language);
          form.append("mode", mode);
          xhr.send(form);
        } else {
          xhr.setRequestHeader("Content-Type", "application/json");
          xhr.send(JSON.stringify({ url: url.trim(), language, mode }));
        }
      });

      const body = (data.body ?? {}) as { message?: string; code?: string; transcript?: TranscriptDTO };
      if (data.status === 401) {
        setGateOpen(true);
        return;
      }
      if (!data.ok || !body.transcript) {
        throw new Error(body.message || "Could not transcribe this video. Please try another file.");
      }
      setResult(body.transcript);
      setView("text");
      setHistory((prev) => [body.transcript!, ...prev.filter((t) => t.id !== body.transcript!.id)]);
      it.success(`Done — ${body.transcript.wordCount.toLocaleString()} words in ${fmtTime(body.transcript.durationSec)} of video.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not transcribe this video.";
      if (message !== "__aborted__") it.error(message);
    } finally {
      xhrRef.current = null;
      setBusy(false);
      setPhase("idle");
    }
  };

  const copyText = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      it.error("Could not copy.");
    }
  };

  const remove = async (id: string) => {
    await apiFetch(`/api/transcripts/${id}`, { method: "DELETE" }).catch(() => null);
    setHistory((prev) => prev.filter((t) => t.id !== id));
    if (result?.id === id) setResult(null);
    it.success("Transcript deleted.");
  };

  const seekTo = (sec: number) => {
    const el = videoRef.current;
    if (!el) return;
    el.currentTime = sec;
    el.play().catch(() => null);
  };

  const isGuest = !sessionLoading && !user;

  return (
    <div className="min-h-screen">
      <Header />

      <main>
        {/* HERO */}
        <section className="grain relative px-5 pb-10 pt-12 sm:px-8 lg:pt-16">
          <div className="container">
            <div className="mx-auto max-w-3xl text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#d8e8de] bg-[#eef7f1] px-3.5 py-2 text-[12px] font-bold text-[#1b7d5d]">
                <Captions className="size-3.5" /> New · Video to Text
              </span>
              <h1 className="display mt-6 text-[44px] font-extrabold leading-[1.02] tracking-[-.05em] text-[#17231f] sm:text-6xl">
                Turn any video into
                <br />
                <span className="text-[#1b7d5d]">clean, accurate text.</span>
              </h1>
              <p className="mx-auto mt-5 max-w-xl text-[17px] leading-8 text-[#776f66]">
                Upload a video or drop a link. DetheAi listens and writes it out in Hindi, English,
                Odia and 8 more Indian languages — with timestamps, subtitles and one-click copy.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[12px] font-semibold text-[#8c8176]">
                {["11 Indian languages", "Auto language detect", "SRT · VTT · TXT export", "Translate to English"].map((t) => (
                  <span key={t} className="flex items-center gap-2">
                    <Check className="size-4 text-[#1b7d5d]" /> {t}
                  </span>
                ))}
              </div>
            </div>

            {/* CONVERTER */}
            <div className="relative mx-auto mt-10 max-w-4xl">
              <div className="absolute -left-10 top-10 size-40 rounded-full bg-[#cfe7d7]/70 blur-3xl" />
              <div className="absolute -right-8 -top-4 size-32 rounded-full bg-[#f5d7b7]/60 blur-2xl" />
              <div className="studio-shadow relative rounded-[28px] border border-[#eadfd2] bg-[#fffdf8] p-3.5 sm:p-5">
                <div className="rounded-[21px] bg-[#f7f2ea] p-5 sm:p-7">
                  <StaticHostingNotice feature="video" className="mb-5" />
                  {/* tabs */}
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#9a8d80]">
                        Video to text studio
                      </p>
                      <p className="display mt-1 text-[20px] font-bold">Let your video speak in text.</p>
                    </div>
                    <div className="grid grid-cols-2 rounded-2xl bg-white p-1 text-sm font-bold shadow-sm">
                      {(["upload", "url"] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() => setTab(t)}
                          disabled={busy}
                          className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 transition ${
                            tab === t ? "bg-[#1b7d5d] text-white shadow-sm" : "text-[#8f8378] hover:text-[#5f574f]"
                          }`}
                        >
                          {t === "upload" ? <UploadCloud className="size-4" /> : <Link2 className="size-4" />}
                          {t === "upload" ? "Upload video" : "Paste link"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* dropzone / url */}
                  {tab === "upload" ? (
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (!busy) setDragging(true);
                      }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragging(false);
                        if (!busy) pickFile(e.dataTransfer.files?.[0] ?? null);
                      }}
                      onClick={() => !busy && !file && inputRef.current?.click()}
                      className={`mt-5 rounded-2xl border-2 border-dashed transition ${
                        dragging
                          ? "border-[#1b7d5d] bg-[#eef7f1]"
                          : file
                            ? "border-[#d8e8de] bg-white"
                            : "cursor-pointer border-[#d8cec2] bg-[#fffdf8] hover:border-[#74b596] hover:bg-white"
                      }`}
                    >
                      <input
                        ref={inputRef}
                        type="file"
                        accept="video/*,audio/*,.mkv,.mov,.mp4,.webm,.avi,.m4v,.mp3,.wav,.m4a"
                        className="hidden"
                        onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                      />
                      {file ? (
                        <div className="grid gap-4 p-4 sm:grid-cols-[200px_1fr] sm:items-center">
                          <div className="overflow-hidden rounded-xl bg-[#17231f]">
                            {file.type.startsWith("video/") && previewUrl ? (
                              <video ref={videoRef} src={previewUrl} controls className="aspect-video w-full" preload="metadata" />
                            ) : (
                              <div className="grid aspect-video place-items-center text-[#dcefe4]">
                                <FileVideo className="size-8" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-extrabold text-[#2f3e36]">{file.name}</p>
                            <p className="mt-1 text-xs font-semibold text-[#8f8378]">
                              {fmtBytes(file.size)} · {file.type || "video"}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  inputRef.current?.click();
                                }}
                                disabled={busy}
                                className="rounded-full border border-[#d8cec2] bg-white px-4 py-2 text-xs font-bold text-[#5f574f] hover:border-[#1b7d5d] hover:text-[#1b7d5d]"
                              >
                                Choose another
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setFile(null);
                                  setResult(null);
                                }}
                                disabled={busy}
                                className="rounded-full px-3 py-2 text-xs font-bold text-[#a08f82] hover:text-[#b95e42]"
                              >
                                <X className="mr-1 inline size-3.5" /> Remove
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center px-6 py-12 text-center">
                          <span className="grid size-14 place-items-center rounded-2xl bg-[#dcefe4] text-[#1b7d5d] shadow-sm">
                            <UploadCloud className="size-6" />
                          </span>
                          <p className="mt-4 text-sm font-extrabold text-[#2f3e36]">
                            Drag & drop your video here, or <span className="text-[#1b7d5d] underline">browse</span>
                          </p>
                          <p className="mt-1.5 text-xs font-semibold text-[#8f8378]">
                            MP4, MOV, MKV, WebM, AVI · up to {MAX_MB} MB · up to 30 minutes
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-5">
                      <div className="relative">
                        <Link2 className="pointer-events-none absolute left-4 top-4 size-4 text-[#a09488]" />
                        <input
                          value={url}
                          onChange={(e) => setUrl(e.target.value)}
                          disabled={busy}
                          placeholder="https://example.com/lecture.mp4"
                          className="w-full rounded-2xl border border-[#e8ded2] bg-[#fffdf8] py-3.5 pl-11 pr-4 text-sm font-medium outline-none focus:border-[#74b596] focus:ring-4 focus:ring-[#dcefe4]"
                        />
                      </div>
                      <p className="mt-2 text-xs font-semibold text-[#9a8d80]">
                        Paste a direct link to a video or audio file (.mp4, .mp3…). For YouTube or
                        Instagram, download the clip first and upload it.
                      </p>
                    </div>
                  )}

                  {/* options */}
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <label className="text-[11px] font-bold uppercase tracking-[.13em] text-[#8b7e72]">
                      Spoken language
                      <div className="relative mt-2">
                        <Languages className="pointer-events-none absolute left-3 top-3 size-4 text-[#9a8d80]" />
                        <select
                          value={language}
                          onChange={(e) => setLanguage(e.target.value)}
                          disabled={busy}
                          className="w-full appearance-none rounded-xl border border-[#e8ded2] bg-white py-2.5 pl-10 pr-9 text-sm font-semibold normal-case tracking-normal text-[#413a35] outline-none focus:border-[#74b596]"
                        >
                          {LANGUAGES.map((l) => (
                            <option key={l.code} value={l.code}>
                              {l.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-3 size-4 text-[#9a8d80]" />
                      </div>
                    </label>
                    <div className="text-[11px] font-bold uppercase tracking-[.13em] text-[#8b7e72]">
                      Output
                      <div className="mt-2 grid grid-cols-2 rounded-xl border border-[#e8ded2] bg-white p-1 text-sm font-bold normal-case tracking-normal">
                        {(
                          [
                            ["transcribe", "Same language"],
                            ["translate", "English translation"],
                          ] as const
                        ).map(([m, label]) => (
                          <button
                            key={m}
                            onClick={() => setMode(m)}
                            disabled={busy}
                            className={`rounded-lg py-2 transition ${
                              mode === m ? "bg-[#dcefe4] text-[#1b7d5d]" : "text-[#8f8378] hover:text-[#5f574f]"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* progress */}
                  {busy && (
                    <div className="mt-5 rounded-2xl border border-[#dcefe4] bg-[#f4fbf6] px-4 py-3">
                      <div className="flex items-center justify-between text-xs font-bold text-[#39755b]">
                        <span className="flex items-center gap-2">
                          <Loader2 className="size-3.5 animate-spin" />
                          {phase === "uploading"
                            ? `Uploading video… ${uploadPct}%`
                            : "Listening carefully & writing your transcript…"}
                        </span>
                        <span className="flex items-center gap-3">
                          <span className="flex items-center gap-1 text-[#789183]">
                            <Clock3 className="size-3.5" /> {fmtTime(elapsed)}
                          </span>
                          <button onClick={cancel} className="text-[#b95e42] hover:underline">
                            Cancel
                          </button>
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#dcefe4]">
                        <div
                          className={`h-full rounded-full bg-[#1b7d5d] transition-all duration-500 ${
                            phase === "processing" ? "progress-indeterminate" : ""
                          }`}
                          style={phase === "uploading" ? { width: `${uploadPct}%` } : undefined}
                        />
                      </div>
                      {phase === "processing" && (
                        <p className="mt-2 text-[11px] font-semibold text-[#789183]">
                          Roughly 10–20 seconds per minute of video.
                        </p>
                      )}
                    </div>
                  )}

                  <button
                    onClick={convert}
                    disabled={busy || (Boolean(user) && tab === "upload" && !file) || (Boolean(user) && tab === "url" && !url.trim())}
                    className="mt-5 flex w-full items-center justify-center rounded-xl bg-[#1b7d5d] py-3.5 text-sm font-bold text-white shadow-[0_7px_16px_rgba(27,125,93,.18)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {busy ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" /> Converting…
                      </>
                    ) : isGuest ? (
                      <>
                        <LockKeyhole className="mr-2 size-4" /> Sign in to convert
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 size-4" /> Convert to text
                      </>
                    )}
                  </button>
                  {isGuest && (
                    <p className="mt-3 text-center text-[11px] font-semibold text-[#8f8378]">
                      Free account required ·{" "}
                      <Link href="/login?mode=signup&next=%2Fvideo-to-text" className="text-[#1b7d5d] hover:underline">
                        Create one in seconds
                      </Link>
                    </p>
                  )}
                </div>
                <div className="flex items-center justify-center gap-2 py-3 text-[11px] font-semibold text-[#9a8d80]">
                  <span className="size-1.5 rounded-full bg-[#54a67e]" /> Processed securely on DetheAi
                  servers · Your video is deleted right after conversion
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* RESULT */}
        {result && (
          <section className="px-5 pb-6 sm:px-8">
            <div className="container mx-auto max-w-4xl">
              <div className="fade-up rounded-[28px] border border-[#eadfd2] bg-[#fffdf8] p-5 shadow-[0_24px_70px_rgba(64,50,34,.08)] sm:p-7">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#1b7d5d]">
                      Transcript ready
                    </p>
                    <h2 className="display mt-1 truncate text-2xl font-extrabold tracking-[-.04em]">
                      {result.title}
                    </h2>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold">
                      <span className="rounded-full bg-[#eef7f1] px-2.5 py-1 text-[#1b7d5d]">
                        <Languages className="mr-1 inline size-3" />
                        {result.mode === "translate" ? "English (translated)" : LANG_NAME[result.languageCode] ?? "Detected"}
                      </span>
                      <span className="rounded-full bg-[#f5efe8] px-2.5 py-1 text-[#786d63]">
                        <Clock3 className="mr-1 inline size-3" /> {fmtTime(result.durationSec)}
                      </span>
                      <span className="rounded-full bg-[#f5efe8] px-2.5 py-1 text-[#786d63]">
                        <Type className="mr-1 inline size-3" /> {result.wordCount.toLocaleString()} words
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={copyText}
                      className="flex items-center gap-1.5 rounded-full border border-[#d8cec2] bg-white px-4 py-2 text-xs font-bold text-[#5f574f] hover:border-[#1b7d5d] hover:text-[#1b7d5d]"
                    >
                      {copied ? <Check className="size-3.5 text-[#1b7d5d]" /> : <Copy className="size-3.5" />}
                      {copied ? "Copied" : "Copy text"}
                    </button>
                    {(["txt", "srt", "vtt"] as const).map((f) => (
                      <a
                        key={f}
                        href={apiUrl(`/api/transcripts/${result.id}?format=${f}`)}
                        className="flex items-center gap-1.5 rounded-full bg-[#1b7d5d] px-4 py-2 text-xs font-bold text-white shadow-[0_6px_14px_rgba(27,125,93,.22)]"
                      >
                        <Download className="size-3.5" /> .{f.toUpperCase()}
                      </a>
                    ))}
                  </div>
                </div>

                <div className="mt-5 inline-grid grid-cols-2 rounded-xl bg-[#f5efe8] p-1 text-xs font-bold">
                  {(
                    [
                      ["text", "Full text", FileText],
                      ["timeline", "Timestamps", Captions],
                    ] as const
                  ).map(([v, label, Icon]) => (
                    <button
                      key={v}
                      onClick={() => setView(v)}
                      className={`flex items-center gap-1.5 rounded-lg px-4 py-2 transition ${
                        view === v ? "bg-white text-[#17231f] shadow-sm" : "text-[#8f8378]"
                      }`}
                    >
                      <Icon className="size-3.5" /> {label}
                    </button>
                  ))}
                </div>

                {view === "text" ? (
                  <textarea
                    readOnly
                    value={result.text}
                    className="thin-scroll mt-4 min-h-[260px] w-full resize-y rounded-2xl border border-[#e8ded2] bg-[#fffaf2] p-5 text-[15px] leading-8 text-[#403831] outline-none"
                  />
                ) : (
                  <div className="thin-scroll mt-4 max-h-[420px] space-y-1.5 overflow-y-auto rounded-2xl border border-[#e8ded2] bg-[#fffaf2] p-3">
                    {result.segments.length === 0 ? (
                      <p className="p-4 text-sm text-[#8f8378]">No timestamp data for this transcript.</p>
                    ) : (
                      result.segments.map((seg, i) => (
                        <button
                          key={`${seg.start}-${i}`}
                          onClick={() => seekTo(seg.start)}
                          className={`flex w-full gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                            activeSeg === i ? "bg-[#dcefe4]" : "hover:bg-white"
                          }`}
                        >
                          <span className="mt-0.5 shrink-0 rounded-md bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-[#1b7d5d] shadow-sm">
                            {fmtTime(seg.start)}
                          </span>
                          <span className="text-sm leading-6 text-[#403831]">{seg.text}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
                {view === "timeline" && file?.type.startsWith("video/") && (
                  <p className="mt-2 text-[11px] font-semibold text-[#9a8d80]">
                    Tip: tap any line to jump the video preview to that moment.
                  </p>
                )}
              </div>
            </div>
          </section>
        )}

        {/* HISTORY */}
        {user && history.length > 0 && (
          <section className="px-5 py-12 sm:px-8">
            <div className="container mx-auto max-w-4xl">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#1b7d5d]">
                    Your library
                  </p>
                  <h2 className="display mt-2 text-3xl font-extrabold">Recent transcripts</h2>
                </div>
                <span className="text-xs font-semibold text-[#9a8d80]">{history.length} saved</span>
              </div>
              <div className="mt-6 grid gap-3">
                {history.map((t) => (
                  <div
                    key={t.id}
                    className={`flex items-center gap-3 rounded-2xl border p-3 transition ${
                      result?.id === t.id ? "border-[#1b7d5d] bg-[#f4fbf6]" : "border-[#eadfd2] bg-[#fffdf8]"
                    }`}
                  >
                    <button
                      onClick={() => {
                        setResult(t);
                        setView("text");
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className="grid size-10 shrink-0 place-items-center rounded-full bg-[#dcefe4] text-[#1b7d5d]"
                      aria-label="Open transcript"
                    >
                      <FileText className="size-4" />
                    </button>
                    <button
                      onClick={() => {
                        setResult(t);
                        setView("text");
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-sm font-bold text-[#403831]">{t.title}</p>
                      <p className="mt-1 truncate text-[11px] font-semibold text-[#8f8378]">
                        {t.mode === "translate" ? "English (translated)" : LANG_NAME[t.languageCode] ?? "Detected"} ·{" "}
                        {fmtTime(t.durationSec)} · {t.wordCount.toLocaleString()} words ·{" "}
                        {new Date(t.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                      </p>
                    </button>
                    <a
                      href={apiUrl(`/api/transcripts/${t.id}?format=txt`)}
                      className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-[#6b625a] hover:text-[#1b7d5d]"
                      aria-label="Download transcript"
                    >
                      <Download className="size-4" />
                    </a>
                    <button
                      onClick={() => remove(t.id)}
                      className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-[#a08f82] hover:text-[#b95e42]"
                      aria-label="Delete transcript"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* HOW IT WORKS */}
        <section className="border-t border-[#eadfd2] bg-[#f7f1e8]/70 px-5 py-16 sm:px-8">
          <div className="container">
            <div className="text-center">
              <p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#1b7d5d]">
                How it works
              </p>
              <h2 className="display mt-3 text-4xl font-extrabold tracking-[-.04em]">
                Three steps. No typing.
              </h2>
            </div>
            <div className="mx-auto mt-9 grid max-w-5xl gap-4 md:grid-cols-3">
              {[
                {
                  icon: UploadCloud,
                  title: "Upload or paste a link",
                  copy: "Lectures, reels, interviews, podcasts — any video or audio file up to 30 minutes.",
                },
                {
                  icon: Languages,
                  title: "We listen in your language",
                  copy: "Auto-detects Hindi, Odia, Tamil, English and more — or translate everything into English.",
                },
                {
                  icon: Captions,
                  title: "Copy, download, subtitle",
                  copy: "Get clean text with timestamps. Export SRT/VTT captions or plain TXT in one tap.",
                },
              ].map(({ icon: Icon, title, copy }, i) => (
                <div key={title} className="rounded-3xl border border-[#eadfd2] bg-[#fffdf8] p-6">
                  <div className="flex items-center justify-between">
                    <span className="grid size-11 place-items-center rounded-2xl bg-[#dcefe4] text-[#1b7d5d]">
                      <Icon className="size-5" />
                    </span>
                    <span className="display text-3xl font-extrabold text-[#e1d7ca]">0{i + 1}</span>
                  </div>
                  <p className="mt-5 text-base font-extrabold text-[#2f3e36]">{title}</p>
                  <p className="mt-2 text-sm leading-6 text-[#81766c]">{copy}</p>
                </div>
              ))}
            </div>
            <div className="mx-auto mt-10 max-w-3xl rounded-[28px] bg-[#1b7d5d] p-8 text-center sm:p-10">
              <h3 className="display text-2xl font-extrabold text-white sm:text-3xl">
                Need the reverse? Turn text into a human voice.
              </h3>
              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#d8eddf]">
                Take your transcript to the Voice Studio and give it one of 550 natural voices.
              </p>
              <Link
                href={user ? "/#studio" : "/login?mode=signup"}
                className="mt-6 inline-block rounded-full bg-white px-6 py-3.5 text-sm font-bold text-[#1b7d5d]"
              >
                Open Voice Studio <ArrowRight className="ml-2 inline size-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
      <Toaster />
      <AuthGateModal open={gateOpen} reason="studio" next="/video-to-text" onClose={() => setGateOpen(false)} />
    </div>
  );
}
