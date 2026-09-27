import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { voiceProjects } from "@/db/schema";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ message: "Please login" }, { status: 401 });
  }
  const { id } = await params;
  await db
    .delete(voiceProjects)
    .where(and(eq(voiceProjects.id, id), eq(voiceProjects.userId, user.id)));
  return NextResponse.json({ ok: true });
}
