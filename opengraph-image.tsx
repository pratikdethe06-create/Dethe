import { ImageResponse } from "next/og";

// Pre-rendered at build time (required for `output: "export"`).
export const dynamic = "force-static";
import { MarkSvg } from "@/lib/brand-og";

export const alt = "DetheAI — natural AI voices for every Indian language";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(160deg, #ffffff 0%, #f3f6fc 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <MarkSvg size={104} />
          <div style={{ display: "flex", fontSize: 60, fontWeight: 800, letterSpacing: -2.5 }}>
            <span style={{ color: "#0b1f4d" }}>Dethe</span>
            <span style={{ color: "#1258ea" }}>AI</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", fontSize: 84, fontWeight: 800, letterSpacing: -4, lineHeight: 1, color: "#0b1f4d" }}>
            Give your words
          </div>
          <div style={{ display: "flex", fontSize: 84, fontWeight: 800, letterSpacing: -4, lineHeight: 1, color: "#1258ea" }}>
            a human voice.
          </div>
          <div style={{ display: "flex", marginTop: 16, fontSize: 28, color: "#5b6785" }}>
            550 natural voices · 11 Indian languages · Video to Text
          </div>
        </div>
      </div>
    ),
    size
  );
}
