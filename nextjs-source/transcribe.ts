// DetheAi video → text engine (server-side only).
// 1. ffmpeg extracts mono 16 kHz audio from any video/audio file
// 2. audio is split into ≤ 28 s segments (provider limit is 30 s per request)
// 3. each segment is transcribed; timestamps are offset back to the full timeline

import { execFile } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import ffmpegPath from "ffmpeg-static";

const execFileAsync = promisify(execFile);

export class TranscribeAuthError extends Error {}

export const SEGMENT_SECONDS = 28;
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200 MB upload
export const MAX_DURATION_SECONDS = 30 * 60; // 30 minutes

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscribeResult {
  text: string;
  segments: TranscriptSegment[];
  languageCode: string;
  durationSec: number;
}

export const STT_LANGUAGES: { code: string; label: string }[] = [
  { code: "unknown", label: "Auto-detect" },
  { code: "hi-IN", label: "Hindi" },
  { code: "en-IN", label: "English" },
  { code: "od-IN", label: "Odia" },
  { code: "ta-IN", label: "Tamil" },
  { code: "te-IN", label: "Telugu" },
  { code: "mr-IN", label: "Marathi" },
  { code: "bn-IN", label: "Bengali" },
  { code: "gu-IN", label: "Gujarati" },
  { code: "pa-IN", label: "Punjabi" },
  { code: "kn-IN", label: "Kannada" },
  { code: "ml-IN", label: "Malayalam" },
];

const LANGUAGE_CODES = new Set(STT_LANGUAGES.map((l) => l.code));

export function normalizeLanguageCode(code: string): string {
  return LANGUAGE_CODES.has(code) ? code : "unknown";
}

function ffmpegBin(): string {
  const bin = (ffmpegPath as unknown as string | null) || process.env.FFMPEG_PATH || "ffmpeg";
  return bin;
}

function apiKey(): string {
  return process.env.PREMIUM_TTS_KEY || process.env.SARVAM_API_KEY || "";
}

export function transcriptionConfigured(): boolean {
  return Boolean(apiKey());
}

/** Reads media duration (seconds) from ffmpeg's stderr banner. */
export async function probeDuration(file: string): Promise<number> {
  try {
    await execFileAsync(ffmpegBin(), ["-hide_banner", "-i", file], { maxBuffer: 4 * 1024 * 1024 });
  } catch (err) {
    const stderr = String((err as { stderr?: string }).stderr ?? "");
    const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  }
  return 0;
}

/** Extracts mono 16 kHz WAV segments from a video/audio file. Returns ordered file paths. */
export async function extractAudioSegments(inputFile: string, workDir: string): Promise<string[]> {
  const pattern = path.join(workDir, "seg_%04d.wav");
  await execFileAsync(
    ffmpegBin(),
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      inputFile,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "pcm_s16le",
      "-f",
      "segment",
      "-segment_time",
      String(SEGMENT_SECONDS),
      "-reset_timestamps",
      "1",
      pattern,
    ],
    { maxBuffer: 8 * 1024 * 1024, timeout: 10 * 60 * 1000 }
  );
  const files = (await fs.readdir(workDir))
    .filter((f) => /^seg_\d+\.wav$/.test(f))
    .sort()
    .map((f) => path.join(workDir, f));
  if (files.length === 0) throw new Error("No audio track found in this video.");
  return files;
}

interface ProviderResponse {
  transcript?: string;
  language_code?: string | null;
  timestamps?: {
    words?: string[];
    start_time_seconds?: number[];
    end_time_seconds?: number[];
  } | null;
}

async function transcribeSegment(
  file: string,
  languageCode: string,
  mode: "transcribe" | "translate"
): Promise<{ text: string; languageCode: string | null; words: { s: number; e: number; t: string }[] }> {
  const key = apiKey();
  if (!key) throw new Error("Speech engine key is not configured");
  const buf = await fs.readFile(file);
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buf)], { type: "audio/wav" }), path.basename(file));
  let endpoint: string;
  if (mode === "translate") {
    endpoint = "https://api.sarvam.ai/speech-to-text-translate";
    form.append("model", "saaras:v2.5");
  } else {
    endpoint = "https://api.sarvam.ai/speech-to-text";
    form.append("model", "saarika:v2.5");
    form.append("language_code", languageCode);
    form.append("with_timestamps", "true");
  }

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "api-subscription-key": key },
        body: form,
        signal: AbortSignal.timeout(90000),
      });
      if (res.status === 401 || res.status === 403) {
        throw new TranscribeAuthError(`Speech engine rejected the key (HTTP ${res.status})`);
      }
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`Speech engine busy (HTTP ${res.status})`);
        await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
        continue;
      }
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Speech engine error (HTTP ${res.status}) ${detail.slice(0, 200)}`);
      }
      const data = (await res.json()) as ProviderResponse;
      const words: { s: number; e: number; t: string }[] = [];
      const ts = data.timestamps;
      if (ts?.words && ts.start_time_seconds && ts.end_time_seconds) {
        ts.words.forEach((w, i) => {
          words.push({ s: ts.start_time_seconds![i] ?? 0, e: ts.end_time_seconds![i] ?? 0, t: w });
        });
      }
      return {
        text: (data.transcript ?? "").trim(),
        languageCode: data.language_code ?? null,
        words,
      };
    } catch (err) {
      if (err instanceof TranscribeAuthError) throw err;
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (attempt === 2) break;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw lastErr ?? new Error("Speech engine failed");
}

/** Splits a segment transcript into sentence-sized caption lines spread across its time range. */
function toCaptionLines(
  text: string,
  segStart: number,
  segEnd: number,
  words: { s: number; e: number; t: string }[]
): TranscriptSegment[] {
  if (!text) return [];
  // Provider word timestamps are often one chunk; when granular, use them directly.
  if (words.length > 3) {
    const lines: TranscriptSegment[] = [];
    let cur: { start: number; end: number; parts: string[] } | null = null;
    for (const w of words) {
      if (!cur) cur = { start: segStart + w.s, end: segStart + w.e, parts: [w.t] };
      else {
        cur.parts.push(w.t);
        cur.end = segStart + w.e;
      }
      const joined = cur.parts.join(" ");
      if (/[.!?।॥]$/.test(w.t) || joined.length > 90) {
        lines.push({ start: cur.start, end: cur.end, text: joined });
        cur = null;
      }
    }
    if (cur) lines.push({ start: cur.start, end: cur.end, text: cur.parts.join(" ") });
    return lines;
  }
  // Split on sentence ends; if a piece is still long (engine used commas only), split on commas /
  // Indic dandas, then on word boundaries so caption lines stay ≤ ~90 characters.
  const MAX_LINE = 90;
  const rough = text.match(/[^.!?।॥]+[.!?।॥]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
  const sentences: string[] = [];
  for (const piece of rough) {
    if (piece.length <= MAX_LINE) {
      sentences.push(piece);
      continue;
    }
    const clauses = piece.match(/[^,;،]+[,;،]*/g)?.map((c) => c.trim()).filter(Boolean) ?? [piece];
    let cur = "";
    for (const clause of clauses) {
      if (clause.length > MAX_LINE) {
        if (cur) sentences.push(cur);
        cur = "";
        let line = "";
        for (const w of clause.split(" ")) {
          if ((line + " " + w).trim().length > MAX_LINE && line) {
            sentences.push(line.trim());
            line = w;
          } else line = (line + " " + w).trim();
        }
        if (line) sentences.push(line.trim());
        continue;
      }
      if ((cur + " " + clause).trim().length > MAX_LINE && cur) {
        sentences.push(cur.trim());
        cur = clause;
      } else cur = (cur + " " + clause).trim();
    }
    if (cur) sentences.push(cur.trim());
  }
  const totalChars = sentences.reduce((n, s) => n + s.length, 0) || 1;
  const span = Math.max(0.5, segEnd - segStart);
  let cursor = segStart;
  return sentences.map((s) => {
    const dur = (s.length / totalChars) * span;
    const line = { start: cursor, end: Math.min(segEnd, cursor + dur), text: s };
    cursor += dur;
    return line;
  });
}

export async function transcribeMedia(opts: {
  inputFile: string;
  languageCode: string;
  mode: "transcribe" | "translate";
  onProgress?: (done: number, total: number) => void;
}): Promise<TranscribeResult> {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "dethe-stt-"));
  try {
    const durationSec = await probeDuration(opts.inputFile);
    if (durationSec > MAX_DURATION_SECONDS) {
      throw new Error(
        `This video is ${Math.round(durationSec / 60)} minutes long. Please use videos up to ${MAX_DURATION_SECONDS / 60} minutes.`
      );
    }
    const segments = await extractAudioSegments(opts.inputFile, workDir);
    const lines: TranscriptSegment[] = [];
    const texts: string[] = [];
    let detected: string | null = null;
    let langCode = normalizeLanguageCode(opts.languageCode);

    for (let i = 0; i < segments.length; i++) {
      const segStart = i * SEGMENT_SECONDS;
      const segDur = await probeDuration(segments[i]);
      const segEnd = segStart + (segDur || SEGMENT_SECONDS);
      const out = await transcribeSegment(segments[i], langCode, opts.mode);
      if (!detected && out.languageCode) {
        detected = out.languageCode;
        // Lock the detected language for the remaining chunks for consistency.
        if (langCode === "unknown" && LANGUAGE_CODES.has(out.languageCode)) langCode = out.languageCode;
      }
      if (out.text) {
        texts.push(out.text);
        lines.push(...toCaptionLines(out.text, segStart, segEnd, out.words));
      }
      opts.onProgress?.(i + 1, segments.length);
    }

    return {
      text: texts.join(" ").replace(/\s+/g, " ").trim(),
      segments: lines,
      languageCode: detected ?? (langCode === "unknown" ? "unknown" : langCode),
      durationSec: Math.round(durationSec),
    };
  } finally {
    fs.rm(workDir, { recursive: true, force: true }).catch(() => null);
  }
}

/* ---------------- export helpers ---------------- */

function srtTime(sec: number): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(r).padStart(3, "0")}`;
}

export function toSRT(segments: TranscriptSegment[]): string {
  return segments
    .map((seg, i) => `${i + 1}\n${srtTime(seg.start)} --> ${srtTime(seg.end)}\n${seg.text}\n`)
    .join("\n");
}

export function toVTT(segments: TranscriptSegment[]): string {
  return (
    "WEBVTT\n\n" +
    segments
      .map((seg) => `${srtTime(seg.start).replace(",", ".")} --> ${srtTime(seg.end).replace(",", ".")}\n${seg.text}\n`)
      .join("\n")
  );
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Downloads a direct video/audio URL to a temp file (max size enforced). */
export async function downloadToTemp(url: string, dir: string): Promise<{ file: string; name: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Enter a valid video URL.");
  }
  if (!/^https?:$/.test(parsed.protocol)) throw new Error("Only http(s) links are supported.");
  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host.endsWith(".local")
  ) {
    throw new Error("That URL isn't allowed.");
  }
  if (/(^|\.)(youtube\.com|youtu\.be|instagram\.com|facebook\.com|tiktok\.com)$/.test(host)) {
    throw new Error(
      "Streaming sites like YouTube can't be fetched directly. Download the video and upload the file instead."
    );
  }
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(120000),
    headers: { "User-Agent": "DetheAi-VideoToText/1.0" },
  });
  if (!res.ok || !res.body) throw new Error(`Could not download the video (HTTP ${res.status}).`);
  const len = Number(res.headers.get("content-length") || 0);
  if (len > MAX_VIDEO_BYTES) throw new Error("This video is larger than 200 MB.");
  const name = decodeURIComponent(parsed.pathname.split("/").pop() || "video") || "video";
  const file = path.join(dir, `source-${Date.now()}`);
  const reader = res.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_VIDEO_BYTES) {
      reader.cancel().catch(() => null);
      throw new Error("This video is larger than 200 MB.");
    }
    chunks.push(Buffer.from(value));
  }
  await fs.writeFile(file, Buffer.concat(chunks));
  return { file, name };
}
