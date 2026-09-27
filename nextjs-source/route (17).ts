import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { voiceProjects } from "@/db/schema";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ message: "Please login" }, { status: 401 });
  }
  const rows = await db
    .select()
    .from(voiceProjects)
    .where(eq(voiceProjects.userId, user.id))
    .orderBy(desc(voiceProjects.createdAt))
    .limit(50);
  return NextResponse.json({ projects: rows });
}

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ message: "Please login" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const text = String(body?.text ?? "").trim();
  if (!text) {
    return NextResponse.json({ message: "Add a script before generating." }, { status: 400 });
  }
  const [row] = await db
    .insert(voiceProjects)
    .values({
      userId: user.id,
      text: text.slice(0, 4000),
      language: String(body?.language ?? "Hindi").slice(0, 40),
      voiceId: String(body?.voiceId ?? "hindi-01").slice(0, 40),
      voiceName: String(body?.voiceName ?? "").slice(0, 80),
      style: String(body?.style ?? "").slice(0, 80),
      audioBase64: String(body?.audioBase64 ?? ""),
      mimeType: String(body?.mimeType ?? "audio/mpeg").slice(0, 40),
      filename: String(body?.filename ?? "dethe-voiceover.mp3").slice(0, 120),
      charCount: Number(body?.charCount ?? text.length) || 0,
    })
    .returning();
  const { audioBase64: _omitted, ...rest } = row;
  void _omitted;
  return NextResponse.json({ project: rest });
}
