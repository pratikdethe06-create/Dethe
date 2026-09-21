import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { transcripts } from "@/db/schema";
import { getUserFromRequest } from "@/lib/auth";
import { toSRT, toVTT, type TranscriptSegment } from "@/lib/transcribe";

export const dynamic = "force-dynamic";

async function ownedTranscript(req: NextRequest, id: string) {
  const user = await getUserFromRequest(req);
  if (!user) return { user: null, row: null };
  const row = (
    await db
      .select()
      .from(transcripts)
      .where(and(eq(transcripts.id, id), eq(transcripts.userId, user.id)))
      .limit(1)
  )[0];
  return { user, row: row ?? null };
}

/** GET ?format=txt|srt|vtt → downloadable file; no format → JSON */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, row } = await ownedTranscript(req, id);
  if (!user) return NextResponse.json({ message: "Please login" }, { status: 401 });
  if (!row) return NextResponse.json({ message: "Not found" }, { status: 404 });

  let segments: TranscriptSegment[] = [];
  try {
    segments = JSON.parse(row.segmentsJson);
  } catch {
    segments = [];
  }
  const format = req.nextUrl.searchParams.get("format");
  const safeName = row.title.replace(/[^\w\u0900-\u0DFF\- ]+/g, "").trim().slice(0, 60) || "transcript";

  if (format === "srt" || format === "vtt" || format === "txt") {
    const body =
      format === "srt" ? toSRT(segments) : format === "vtt" ? toVTT(segments) : row.text + "\n";
    const mime =
      format === "srt" ? "application/x-subrip" : format === "vtt" ? "text/vtt" : "text/plain";
    return new NextResponse(body, {
      headers: {
        "Content-Type": `${mime}; charset=utf-8`,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${safeName}.${format}`)}`,
      },
    });
  }

  return NextResponse.json({
    transcript: { ...row, segmentsJson: undefined, segments, createdAt: row.createdAt.toISOString() },
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await ownedTranscript(req, id);
  if (!user) return NextResponse.json({ message: "Please login" }, { status: 401 });
  await db.delete(transcripts).where(and(eq(transcripts.id, id), eq(transcripts.userId, user.id)));
  return NextResponse.json({ ok: true });
}
