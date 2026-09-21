import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { db } from "@/db";
import { transcripts } from "@/db/schema";
import { getUserFromRequest } from "@/lib/auth";
import {
  MAX_VIDEO_BYTES,
  TranscribeAuthError,
  countWords,
  downloadToTemp,
  normalizeLanguageCode,
  transcribeMedia,
  transcriptionConfigured,
} from "@/lib/transcribe";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ALLOWED_EXT = /\.(mp4|mov|m4v|mkv|webm|avi|mpe?g|3gp|wmv|flv|ogv|mp3|wav|m4a|aac|ogg|flac|opus|aiff?)$/i;

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { message: "Please sign in to convert video to text.", code: "AUTH_REQUIRED" },
      { status: 401 }
    );
  }
  if (!transcriptionConfigured()) {
    return NextResponse.json(
      { message: "The speech engine isn't configured on this server yet." },
      { status: 503 }
    );
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "dethe-video-"));
  try {
    let inputFile: string;
    let sourceName = "video";
    let sourceType: "upload" | "url" = "upload";
    let languageCode = "unknown";
    let mode: "transcribe" | "translate" = "transcribe";

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      languageCode = normalizeLanguageCode(String(form.get("language") ?? "unknown"));
      mode = form.get("mode") === "translate" ? "translate" : "transcribe";
      if (!(file instanceof File) || file.size === 0) {
        return NextResponse.json({ message: "Choose a video file to convert." }, { status: 400 });
      }
      if (file.size > MAX_VIDEO_BYTES) {
        return NextResponse.json({ message: "Please upload a video up to 200 MB." }, { status: 400 });
      }
      if (!ALLOWED_EXT.test(file.name) && !file.type.startsWith("video/") && !file.type.startsWith("audio/")) {
        return NextResponse.json(
          { message: "Unsupported file. Use MP4, MOV, MKV, WebM, AVI or an audio file." },
          { status: 400 }
        );
      }
      sourceName = file.name;
      inputFile = path.join(workDir, `upload-${Date.now()}${path.extname(file.name) || ".bin"}`);
      await fs.writeFile(inputFile, Buffer.from(await file.arrayBuffer()));
    } else {
      const body = await req.json().catch(() => ({}));
      const url = String(body?.url ?? "").trim();
      languageCode = normalizeLanguageCode(String(body?.language ?? "unknown"));
      mode = body?.mode === "translate" ? "translate" : "transcribe";
      if (!url) return NextResponse.json({ message: "Paste a direct video link." }, { status: 400 });
      sourceType = "url";
      const dl = await downloadToTemp(url, workDir);
      inputFile = dl.file;
      sourceName = dl.name;
    }

    const result = await transcribeMedia({ inputFile, languageCode, mode });
    if (!result.text) {
      return NextResponse.json(
        { message: "We couldn't detect any speech in this video. Try a clip with clearer audio." },
        { status: 422 }
      );
    }

    const title = sourceName.replace(/\.[a-z0-9]+$/i, "").slice(0, 120) || "Untitled video";
    const wordCount = countWords(result.text);
    const [row] = await db
      .insert(transcripts)
      .values({
        userId: user.id,
        title,
        sourceType,
        sourceName: sourceName.slice(0, 200),
        languageCode: result.languageCode,
        mode,
        durationSec: result.durationSec,
        text: result.text,
        segmentsJson: JSON.stringify(result.segments),
        wordCount,
      })
      .returning();

    return NextResponse.json({
      transcript: {
        id: row.id,
        title: row.title,
        sourceName: row.sourceName,
        sourceType: row.sourceType,
        languageCode: row.languageCode,
        mode: row.mode,
        durationSec: row.durationSec,
        text: row.text,
        segments: result.segments,
        wordCount,
        createdAt: row.createdAt.toISOString(),
      },
    });
  } catch (err) {
    if (err instanceof TranscribeAuthError) {
      console.error("[transcribe] auth:", err.message);
      return NextResponse.json(
        { message: "The speech engine is temporarily unavailable. Please try again later." },
        { status: 503 }
      );
    }
    const message = err instanceof Error ? err.message : "Could not transcribe this video.";
    console.error("[transcribe] failed:", message);
    const status = /larger than|up to \d+ minutes|valid video URL|isn't allowed|Streaming sites|download the video|No audio track|http\(s\)/i.test(message)
      ? 400
      : 500;
    return NextResponse.json(
      { message: status === 400 ? message : "Could not transcribe this video. Please try another file." },
      { status }
    );
  } finally {
    fs.rm(workDir, { recursive: true, force: true }).catch(() => null);
  }
}
