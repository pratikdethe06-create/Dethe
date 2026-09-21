import type { NextConfig } from "next";

const isStatic = process.env.STATIC_EXPORT === "1";

/**
 * Two build modes from one codebase:
 *  • default         → full-stack Next.js (API routes, DB, payments) for Node/Vercel hosting
 *  • STATIC_EXPORT=1 → pure HTML/CSS/JS in ./out for cPanel / any static host
 *    (run `npm run build:static`; it sets aside src/app/api during the build and the browser
 *    talks to NEXT_PUBLIC_API_BASE instead of same-origin API routes).
 */
const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_STATIC_EXPORT: isStatic ? "1" : "0",
  },
  ...(isStatic
    ? {
        output: "export",
        trailingSlash: true, // /pricing/ → /pricing/index.html works on Apache without rewrites
        images: { unoptimized: true },
      }
    : {
        serverExternalPackages: ["ws", "ffmpeg-static"],
        outputFileTracingIncludes: {
          "/api/transcribe": ["./node_modules/ffmpeg-static/ffmpeg"],
        },
        experimental: {
          serverActions: { bodySizeLimit: "200mb" },
        },
      }),
};

export default nextConfig;
