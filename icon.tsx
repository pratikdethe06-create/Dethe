import { ImageResponse } from "next/og";

// Pre-rendered at build time (required for `output: "export"`).
export const dynamic = "force-static";
import { MarkSvg } from "@/lib/brand-og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 64,
          height: 64,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
        }}
      >
        <MarkSvg size={64} />
      </div>
    ),
    size
  );
}
