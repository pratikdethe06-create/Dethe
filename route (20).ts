import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { transcripts } from "@/db/schema";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ message: "Please login" }, { status: 401 });

  const rows = await db
    .select({
      id: transcripts.id,
      title: transcripts.title,
      sourceName: transcripts.sourceName,
      sourceType: transcripts.sourceType,
      languageCode: transcripts.languageCode,
      mode: transcripts.mode,
      durationSec: transcripts.durationSec,
      text: transcripts.text,
      segmentsJson: transcripts.segmentsJson,
      wordCount: transcripts.wordCount,
      createdAt: transcripts.createdAt,
    })
    .from(transcripts)
    .where(eq(transcripts.userId, user.id))
    .orderBy(desc(transcripts.createdAt))
    .limit(50);

  return NextResponse.json({
    transcripts: rows.map((r) => ({
      ...r,
      segmentsJson: undefined,
      segments: safeParse(r.segmentsJson),
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

function safeParse(json: string) {
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
}
