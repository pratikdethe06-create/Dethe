import { ImageResponse } from "next/og";

// Pre-rendered at build time (required for `output: "export"`).
export const dynamic = "force-static";
import { MarkSvg } from "@/lib/brand-og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
        }}
      >
        <MarkSvg size={164} />
      </div>
    ),
    size
  );
}
