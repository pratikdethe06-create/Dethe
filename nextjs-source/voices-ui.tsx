"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Heart,
  Loader2,
  Pause,
  Play,
  Search,
  Sparkles,
  Square,
  Volume2,
  X,
} from "lucide-react";
import {
  LANGUAGES,
  LANGUAGE_COUNT,
  STYLES,
  VOICES,
  VOICE_COUNT,
  initialsOf,
  previewLine,
  type VoiceProfile,
} from "@/lib/voices";

const FAVORITES_KEY = "vaani-voice-favorites-v1";
const RECENT_KEY = "vaani-recent-voices-v1";

export function readFavorites(): string[] {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function readRecentVoices(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function rememberVoice(id: string) {
  try {
    const list = [id, ...readRecentVoices().filter((v) => v !== id)].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable */
  }
}

export function WaveBars({ active, className = "" }: { active: boolean; className?: string }) {
  const bars = [15, 26, 19, 32, 22, 36, 18, 28, 16, 31, 21, 35, 18, 27, 14, 25, 31, 18];
  return (
    <div className={`flex h-9 flex-1 items-center gap-1 overflow-hidden ${className}`}>
      {bars.map((h, i) => (
        <span
          key={i}
          className={`w-[3px] shrink-0 rounded-full bg-current ${active ? "wave-bar" : "opacity-70"}`}
          style={{ height: active ? undefined : h, animationDelay: `${i * 70}ms` }}
        />
      ))}
    </div>
  );
}

function MiniBars({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex h-4 items-end gap-[2px] ${className}`}>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="mini-bar w-[3px] rounded-full bg-current"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </span>
  );
}

export function VoiceAvatar({
  profile,
  size = "md",
  light = false,
}: {
  profile: VoiceProfile;
  size?: "sm" | "md" | "lg";
  light?: boolean;
}) {
  const dims = size === "lg" ? "size-14 text-base" : size === "sm" ? "size-9 text-xs" : "size-12 text-sm";
  const bg = light
    ? `linear-gradient(140deg, hsl(${profile.hue} 60% 30%), hsl(${(profile.hue + 40) % 360} 55% 45%))`
    : `linear-gradient(140deg, hsl(${profile.hue} 45% 88%), hsl(${(profile.hue + 40) % 360} 55% 78%))`;
  const color = light ? "#ffffff" : `hsl(${profile.hue} 45% 26%)`;
  return (
    <span
      className={`relative grid shrink-0 place-items-center rounded-full font-extrabold shadow-[inset_0_1px_0_rgba(255,255,255,.6)] ${dims}`}
      style={{ background: bg, color }}
    >
      {initialsOf(profile.name)}
      <span
        className={`absolute -bottom-0.5 -right-0.5 grid size-5 place-items-center rounded-full border-2 text-[9px] font-black ${
          light ? "border-[#12192e] bg-[#252149] text-[#b5adff]" : "border-white bg-[#1b7d5d] text-white"
        }`}
        aria-hidden
      >
        {profile.gender === "Female" ? "F" : "M"}
      </span>
    </span>
  );
}

export interface VoiceCardProps {
  profile: VoiceProfile;
  selected: boolean;
  favorite: boolean;
  previewing: boolean;
  playing?: boolean;
  onSelect: () => void;
  onPreview: () => void;
  onFavorite: () => void;
  dark?: boolean;
}

export function VoiceCard({
  profile,
  selected,
  favorite,
  previewing,
  playing = false,
  onSelect,
  onPreview,
  onFavorite,
  dark = false,
}: VoiceCardProps) {
  if (dark) {
    return (
      <div
        className={`voice-card rounded-2xl border p-4 transition ${
          selected
            ? "border-[#897bff]/60 bg-[#1b2240]"
            : "border-white/[.08] bg-[#12192e] hover:border-white/20"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <VoiceAvatar profile={profile} light />
          <button
            onClick={onFavorite}
            aria-label="Toggle favorite"
            className={`grid size-9 place-items-center rounded-full hover:bg-white/10 ${
              favorite ? "text-[#e58aa5]" : "text-[#59637f]"
            }`}
          >
            <Heart className={`size-4 ${favorite ? "fill-current" : ""}`} />
          </button>
        </div>
        <p className="mt-3 truncate text-sm font-extrabold text-white">
          {profile.native} · {profile.name}
        </p>
        <p className="mt-0.5 text-[11px] font-semibold text-[#8993b0]">
          {profile.language} · {profile.gender} · {profile.ageGroup}
        </p>
        <div className="mt-2">
          <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-bold text-[#c3c8dc]">
            {profile.style}
          </span>
        </div>
        <p className="mt-3 min-h-[34px] text-xs leading-5 text-[#9da7c1]">{profile.description}</p>
        <div className="mt-3 flex gap-2">
          <button
            onClick={onPreview}
            disabled={previewing}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition ${
              playing
                ? "bg-[#897bff] text-white"
                : "bg-white/10 text-white hover:bg-white/15"
            } disabled:opacity-70`}
          >
            {previewing ? (
              <>
                <Loader2 className="size-3.5 animate-spin" /> Loading
              </>
            ) : playing ? (
              <>
                <Pause className="size-3.5 fill-current" /> Playing <MiniBars className="ml-1" />
              </>
            ) : (
              <>
                <Play className="size-3.5 fill-current" /> Listen
              </>
            )}
          </button>
          <button
            onClick={onSelect}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold ${
              selected ? "bg-[#897bff]/20 text-[#b5adff]" : "bg-[#897bff] text-white hover:bg-[#776cf0]"
            }`}
          >
            {selected ? (
              <>
                <Check className="size-3.5" /> Selected
              </>
            ) : (
              "Use voice"
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`voice-card relative rounded-[22px] border p-4 transition ${
        selected
          ? "border-[#1b7d5d] bg-[#f4fbf6] shadow-[0_12px_30px_rgba(27,125,93,.12)]"
          : "border-[#eadfd2] bg-white hover:border-[#9fd0b7]"
      } ${playing ? "ring-4 ring-[#dcefe4]" : ""}`}
    >
      {selected && (
        <span className="absolute right-4 top-4 flex items-center gap-1 rounded-full bg-[#1b7d5d] px-2 py-0.5 text-[10px] font-extrabold text-white">
          <Check className="size-3" /> In use
        </span>
      )}
      <div className="flex items-start justify-between gap-3">
        <VoiceAvatar profile={profile} />
        {!selected && (
          <button
            onClick={onFavorite}
            aria-label="Toggle favorite"
            className={`grid size-9 place-items-center rounded-full transition hover:bg-[#f5efe8] ${
              favorite ? "text-[#b95e42]" : "text-[#c5bcb2]"
            }`}
          >
            <Heart className={`size-4 ${favorite ? "fill-current" : ""}`} />
          </button>
        )}
      </div>
      <p className="mt-3 truncate text-[15px] font-extrabold text-[#2f3e36]">
        {profile.native} · {profile.name}
      </p>
      <p className="mt-0.5 text-[11px] font-semibold text-[#8f8378]">
        {profile.language} · {profile.gender} · {profile.ageGroup}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className="rounded-full bg-[#f5efe8] px-2 py-1 text-[10px] font-bold text-[#786d63]">
          {profile.style}
        </span>
        {profile.neuralVoice && (
          <span className="flex items-center gap-1 rounded-full bg-[#eef7f1] px-2 py-1 text-[10px] font-bold text-[#1b7d5d]">
            <Sparkles className="size-3" /> Natural
          </span>
        )}
      </div>
      <p className="mt-3 min-h-[34px] text-xs leading-5 text-[#81766c]">{profile.description}</p>
      <div className="mt-3 flex gap-2">
        <button
          onClick={onPreview}
          disabled={previewing}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs font-bold transition ${
            playing
              ? "border-[#1b7d5d] bg-[#1b7d5d] text-white"
              : "border-[#d8e8de] bg-[#eef7f1] text-[#1b7d5d] hover:bg-[#dcefe4]"
          } disabled:opacity-70`}
        >
          {previewing ? (
            <>
              <Loader2 className="size-3.5 animate-spin" /> Loading
            </>
          ) : playing ? (
            <>
              <Pause className="size-3.5 fill-current" /> Playing <MiniBars className="ml-1" />
            </>
          ) : (
            <>
              <Play className="size-3.5 fill-current" /> Listen
            </>
          )}
        </button>
        <button
          onClick={onSelect}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition ${
            selected
              ? "bg-[#dcefe4] text-[#1b7d5d]"
              : "bg-[#1b7d5d] text-white shadow-[0_6px_14px_rgba(27,125,93,.22)] hover:bg-[#146a4f]"
          }`}
        >
          {selected ? (
            <>
              <Check className="size-3.5" /> Selected
            </>
          ) : (
            "Use voice"
          )}
        </button>
      </div>
    </div>
  );
}

export function VoiceLibraryModal({
  open,
  onClose,
  selectedId,
  previewingId,
  playingId,
  isPlaying,
  onSelect,
  onPreview,
  onStopPreview,
  loggedIn = true,
}: {
  open: boolean;
  onClose: () => void;
  selectedId: string;
  previewingId: string | null;
  playingId: string | null;
  isPlaying: boolean;
  onSelect: (voice: VoiceProfile) => void;
  onPreview: (voice: VoiceProfile, customText?: string) => void;
  onStopPreview: () => void;
  loggedIn?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("All languages");
  const [gender, setGender] = useState("All genders");
  const [style, setStyle] = useState("All styles");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [visible, setVisible] = useState(30);
  const [customLine, setCustomLine] = useState("");

  useEffect(() => {
    if (open) {
      setFavorites(readFavorites());
      setVisible(30);
      document.body.style.overflow = "hidden";
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") onClose();
      };
      window.addEventListener("keydown", onKey);
      return () => {
        document.body.style.overflow = "";
        window.removeEventListener("keydown", onKey);
      };
    }
  }, [open, onClose]);

  useEffect(() => {
    setVisible(30);
  }, [query, language, gender, style, favoritesOnly]);

  const recent = useMemo(() => {
    if (!open) return [];
    return readRecentVoices()
      .map((id) => VOICES.find((v) => v.id === id))
      .filter((v): v is VoiceProfile => Boolean(v));
  }, [open, selectedId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return VOICES.filter((v) => {
      if (language !== "All languages" && v.language !== language) return false;
      if (gender !== "All genders" && v.gender !== gender) return false;
      if (style !== "All styles" && v.style !== style) return false;
      if (favoritesOnly && !favorites.includes(v.id)) return false;
      if (
        q &&
        ![v.name, v.language, v.native, v.style, v.description]
          .join(" ")
          .toLowerCase()
          .includes(q)
      )
        return false;
      return true;
    });
  }, [query, language, gender, style, favoritesOnly, favorites]);

  const playingVoice = useMemo(
    () => (playingId ? VOICES.find((v) => v.id === playingId) ?? null : null),
    [playingId]
  );

  if (!open) return null;

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id];
      try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      } catch {
        /* noop */
      }
      return next;
    });
  };

  const preview = (v: VoiceProfile) => {
    if (playingId === v.id && isPlaying) {
      onStopPreview();
      return;
    }
    onPreview(v, customLine.trim() || undefined);
  };

  const chipLanguages = ["All languages", ...LANGUAGES.map((l) => l.name)];

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-[#17231f]/55 backdrop-blur-sm" onClick={onClose} />
      <div className="modal-pop relative flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-[30px] border border-[#eadfd2] bg-[#fffaf2] shadow-[0_30px_90px_rgba(23,35,31,.35)] sm:rounded-[30px]">
        {/* Header */}
        <div className="modal-header relative border-b border-[#eadfd2] px-5 pb-5 pt-5 sm:px-7 sm:pt-6">
          <div className="absolute -right-10 -top-16 size-48 rounded-full bg-[#cfe7d7]/60 blur-3xl" />
          <div className="absolute -left-10 top-10 size-32 rounded-full bg-[#f5d7b7]/50 blur-3xl" />
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[.18em] text-[#1b7d5d]">
                <Sparkles className="size-3.5" /> Voice profiles
              </p>
              <p className="display mt-1.5 text-[26px] font-extrabold leading-[1.05] text-[#17231f] sm:text-3xl">
                Find the voice that sounds like you.
              </p>
              <p className="mt-2 text-xs font-semibold text-[#8f8378] sm:text-sm">
                {VOICE_COUNT} voices · {LANGUAGE_COUNT} Indian languages · Tap{" "}
                <span className="inline-flex items-center gap-1 rounded-full bg-[#eef7f1] px-2 py-0.5 text-[#1b7d5d]">
                  <Play className="size-3 fill-current" /> Listen
                </span>{" "}
                to hear any voice instantly.
                {!loggedIn && (
                  <span className="ml-1.5 inline-flex items-center rounded-full bg-[#fff0e5] px-2 py-0.5 text-[11px] font-bold text-[#a14f35]">
                    Sign in to listen
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close voice library"
              className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-[#6f675e] shadow-sm hover:text-[#1b7d5d]"
            >
              <X className="size-5" />
            </button>
          </div>

          {/* Try your own line */}
          <div className="relative mt-4 flex items-center gap-2 rounded-2xl border border-[#d8e8de] bg-white p-1.5 pl-3 shadow-sm">
            <Volume2 className="size-4 shrink-0 text-[#1b7d5d]" />
            <input
              value={customLine}
              onChange={(e) => setCustomLine(e.target.value.slice(0, 160))}
              placeholder="Type a line to hear it in any voice… (optional)"
              className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-[#a09488]"
            />
            {customLine ? (
              <button
                onClick={() => setCustomLine("")}
                className="rounded-xl px-3 py-2 text-[11px] font-bold text-[#8f8378] hover:text-[#b95e42]"
              >
                Clear
              </button>
            ) : (
              <span className="hidden rounded-xl bg-[#f5efe8] px-3 py-2 text-[11px] font-bold text-[#8f8378] sm:block">
                Uses a native sample line
              </span>
            )}
          </div>

          {/* Language chips */}
          <div className="hide-scroll -mx-5 mt-4 flex gap-2 overflow-x-auto px-5 sm:-mx-7 sm:px-7">
            {chipLanguages.map((name) => {
              const lang = LANGUAGES.find((l) => l.name === name);
              const active = language === name;
              return (
                <button
                  key={name}
                  onClick={() => setLanguage(name)}
                  className={`shrink-0 rounded-full border px-3.5 py-2 text-xs font-bold transition ${
                    active
                      ? "border-[#1b7d5d] bg-[#1b7d5d] text-white shadow-[0_6px_14px_rgba(27,125,93,.25)]"
                      : "border-[#e8ded2] bg-white text-[#5f574f] hover:border-[#9fd0b7] hover:text-[#1b7d5d]"
                  }`}
                >
                  {lang ? (
                    <>
                      <span className="mr-1.5">{lang.native}</span>
                      <span className={active ? "text-white/80" : "text-[#a09488]"}>{lang.name}</span>
                    </>
                  ) : (
                    "All languages"
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Filters */}
        <div className="border-b border-[#eadfd2] bg-[#fffdf8] px-5 py-4 sm:px-7">
          <div className="grid gap-2.5 sm:grid-cols-[1fr_auto_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-3 size-4 text-[#9a8d80]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search voice, language, style…"
                className="w-full rounded-xl border border-[#e8ded2] bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-[#74b596] focus:ring-4 focus:ring-[#dcefe4]"
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:contents">
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="rounded-xl border border-[#e8ded2] bg-white px-3 py-2.5 text-sm font-semibold outline-none"
              >
                <option>All genders</option>
                <option>Female</option>
                <option>Male</option>
              </select>
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                className="rounded-xl border border-[#e8ded2] bg-white px-3 py-2.5 text-sm font-semibold outline-none"
              >
                <option>All styles</option>
                {STYLES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-[#8f8378]">
            <span>
              Showing {Math.min(visible, filtered.length)} of {filtered.length} voices
              {favorites.length > 0 &&
                ` · ${favorites.length} favorite${favorites.length > 1 ? "s" : ""}`}
            </span>
            <div className="flex items-center gap-2">
              {recent.length > 0 && (
                <div className="hide-scroll flex max-w-[52vw] items-center gap-1.5 overflow-x-auto sm:max-w-none">
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-[.12em] text-[#a09488]">
                    Recent
                  </span>
                  {recent.slice(0, 4).map((v) => (
                    <button
                      key={v.id}
                      onClick={() => onSelect(v)}
                      className={`shrink-0 rounded-full px-2.5 py-1.5 text-[11px] font-bold ${
                        v.id === selectedId
                          ? "bg-[#1b7d5d] text-white"
                          : "bg-white text-[#5f574f] hover:text-[#1b7d5d]"
                      }`}
                    >
                      {v.firstName}
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => setFavoritesOnly((v) => !v)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 font-bold ${
                  favoritesOnly ? "bg-[#1b7d5d] text-white" : "bg-white text-[#6f675e]"
                }`}
              >
                <Heart className={`size-3.5 ${favoritesOnly ? "fill-current" : ""}`} /> Favorites
              </button>
            </div>
          </div>
        </div>

        {/* Grid */}
        <div className="thin-scroll flex-1 overflow-y-auto p-5 pb-28 sm:p-7 sm:pb-28">
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#d8cec2] p-12 text-center text-sm font-semibold text-[#8f8378]">
              No voices match those filters.
            </div>
          ) : (
            <>
              <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.slice(0, visible).map((v) => (
                  <VoiceCard
                    key={v.id}
                    profile={v}
                    selected={v.id === selectedId}
                    favorite={favorites.includes(v.id)}
                    previewing={previewingId === v.id}
                    playing={playingId === v.id && isPlaying}
                    onSelect={() => onSelect(v)}
                    onPreview={() => preview(v)}
                    onFavorite={() => toggleFavorite(v.id)}
                  />
                ))}
              </div>
              {visible < filtered.length && (
                <button
                  onClick={() => setVisible((n) => n + 30)}
                  className="mx-auto mt-6 block rounded-full border border-[#d8cec2] bg-white px-6 py-3 text-sm font-bold text-[#5f574f] hover:border-[#1b7d5d] hover:text-[#1b7d5d]"
                >
                  Show more voices ({filtered.length - visible} left)
                </button>
              )}
            </>
          )}
        </div>

        {/* Now playing dock */}
        {playingVoice && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-4 sm:p-5">
            <div className="pointer-events-auto mx-auto flex max-w-2xl items-center gap-3 rounded-2xl border border-[#d8e8de] bg-white/95 p-3 shadow-[0_18px_50px_rgba(23,35,31,.22)] backdrop-blur">
              <VoiceAvatar profile={playingVoice} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-extrabold text-[#254b3a]">
                  {playingVoice.native} · {playingVoice.name}
                </p>
                <p className="truncate text-[11px] font-semibold text-[#789183]">
                  {isPlaying ? "Now playing" : "Paused"} · {playingVoice.style}
                </p>
              </div>
              <WaveBars active={isPlaying} className="hidden max-w-[140px] text-[#1b7d5d] sm:flex" />
              <button
                onClick={() => (isPlaying ? onStopPreview() : onPreview(playingVoice, customLine.trim() || undefined))}
                aria-label={isPlaying ? "Stop preview" : "Replay preview"}
                className="grid size-10 shrink-0 place-items-center rounded-full bg-[#f4efe8] text-[#6b625a] hover:text-[#1b7d5d]"
              >
                {isPlaying ? <Square className="size-3.5 fill-current" /> : <Play className="ml-0.5 size-4 fill-current" />}
              </button>
              <button
                onClick={() => onSelect(playingVoice)}
                className="shrink-0 rounded-full bg-[#1b7d5d] px-4 py-2.5 text-xs font-bold text-white shadow-[0_6px_14px_rgba(27,125,93,.25)]"
              >
                {selectedId === playingVoice.id ? "Selected ✓" : "Use this voice"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export { previewLine };
