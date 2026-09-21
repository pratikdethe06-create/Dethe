import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const IMAGE_RE = /\.(png|jpe?g|webp|avif|gif)$/i;

/** Lists image frames placed in /public/frames, sorted naturally (frame_2 < frame_10). */
export async function GET() {
  try {
    const dir = path.join(process.cwd(), "public", "frames");
    const entries = await fs.readdir(dir);
    const frames = entries
      .filter((f) => IMAGE_RE.test(f))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
      .map((f) => `/frames/${encodeURIComponent(f)}`);
    return Response.json({ frames });
  } catch {
    return Response.json({ frames: [] });
  }
}
