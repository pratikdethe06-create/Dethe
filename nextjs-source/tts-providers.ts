// Server-side fallback TTS engines. The premium engine lives in premium-tts.ts.

import { edgeSynthesize } from "@/lib/edge-tts";

export interface TTSResult {
  audio: Buffer;
  mimeType: string;
  engine: "premium" | "edge" | "google";
}

export function chunkText(text: string, max = 180): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const sentences = normalized.match(/[^.!?।॥\n]+[.!?।॥\n]*|.+/g) ?? [normalized];
  const chunks: string[] = [];
  let current = "";
  const pushCurrent = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };
  for (const raw of sentences) {
    const part = raw.trim();
    if (!part) continue;
    if (part.length > max) {
      pushCurrent();
      // Split over-long sentences on word boundaries.
      const words = part.split(" ");
      let piece = "";
      for (const w of words) {
        if ((piece + " " + w).trim().length > max) {
          if (piece.trim()) chunks.push(piece.trim());
          piece = w.length > max ? w.slice(0, max) : w;
        } else {
          piece = (piece + " " + w).trim();
        }
      }
      if (piece.trim()) chunks.push(piece.trim());
      continue;
    }
    if ((current + " " + part).trim().length > max) pushCurrent();
    current = (current + " " + part).trim();
  }
  pushCurrent();
  return chunks;
}

/** Neural voices (no API key). */
export async function synthEdge(opts: {
  text: string;
  voice: string;
  locale: string;
  ratePct?: number;
  pitchHz?: number;
  volumePct?: number;
}): Promise<TTSResult> {
  const chunks = chunkText(opts.text, 1800);
  if (chunks.length === 0) throw new Error("Empty script");
  const parts: Buffer[] = [];
  for (const chunk of chunks) {
    const buf = await edgeSynthesize({ ...opts, text: chunk });
    if (buf.length > 200) parts.push(buf);
  }
  if (parts.length === 0) throw new Error("Neural TTS returned no audio");
  return { audio: Buffer.concat(parts), mimeType: "audio/mpeg", engine: "edge" };
}

/** Standard voice fallback (no API key). */
export async function synthGoogle(opts: {
  text: string;
  languageCode: string;
}): Promise<TTSResult> {
  const chunks = chunkText(opts.text, 180).slice(0, 10);
  const parts: Buffer[] = [];
  for (const chunk of chunks) {
    try {
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=${opts.languageCode}&client=tw-ob`;
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
          Referer: "https://translate.google.com/",
        },
        signal: AbortSignal.timeout(12000),
      });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 1000) parts.push(buf);
      }
    } catch {
      /* try next chunk */
    }
  }
  if (parts.length === 0) throw new Error("Standard TTS is unreachable right now");
  return { audio: Buffer.concat(parts), mimeType: "audio/mpeg", engine: "google" };
}
