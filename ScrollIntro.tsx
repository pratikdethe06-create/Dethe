"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Film, Play, Sparkles } from "lucide-react";
import { IS_STATIC_BUILD, apiFetch } from "@/lib/api-base";

/* ------------------------------------------------------------------ */
/*  Timeline helpers                                                   */
/* ------------------------------------------------------------------ */

const DESIGN_W = 1280;
const DESIGN_H = 720;
const SCROLL_LENGTH_VH = 480;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v: number) => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};
/** Eased 0→1 while t travels from a to b. */
const seg = (t: number, a: number, b: number) => smooth((t - a) / (b - a));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const gauss = (u: number, c: number, w: number) => Math.exp(-((u - c) * (u - c)) / (w * w));

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Particle {
  x: number;
  y: number;
  r: number;
  a: number;
  square: boolean;
  vx: number;
  vy: number;
  tw: number;
  tint: number;
}

function makeParticles(count: number): Particle[] {
  const rnd = mulberry32(20260911);
  const list: Particle[] = [];
  for (let i = 0; i < count; i++) {
    list.push({
      x: rnd(),
      y: rnd(),
      r: 1 + rnd() * rnd() * 4.2,
      a: 0.18 + rnd() * 0.55,
      square: rnd() < 0.45,
      vx: (rnd() - 0.5) * 0.08,
      vy: -0.02 - rnd() * 0.07,
      tw: rnd() * Math.PI * 2,
      tint: rnd(),
    });
  }
  return list;
}

function fitScale(w: number, h: number) {
  const cover = Math.max(w / DESIGN_W, h / DESIGN_H);
  const keepCenterVisible = w / 640; // the wordmark region must always fit
  return Math.min(cover, keepCenterVisible);
}

/* ------------------------------------------------------------------ */
/*  Procedural recreation of the frame sequence                        */
/* ------------------------------------------------------------------ */

function drawProcedural(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  particles: Particle[],
  fontFamily: string
) {
  const hasFilter = "filter" in ctx;
  const s = fitScale(w, h);
  const ox = (w - DESIGN_W * s) / 2;
  const oy = (h - DESIGN_H * s) / 2;
  const X = (x: number) => ox + x * s;
  const Y = (y: number) => oy + y * s;
  const cy = Y(371);

  /* background */
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#f8fbfd");
  bg.addColorStop(1, "#f1f5f8");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(X(640), cy, 10, X(640), cy, Math.max(w, h) * 0.6);
  glow.addColorStop(0, "rgba(255,255,255,0.9)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  /* floor shadow */
  ctx.save();
  ctx.translate(X(640), Y(626));
  ctx.scale(1, 0.085);
  const sh = ctx.createRadialGradient(0, 0, 0, 0, 0, 330 * s);
  sh.addColorStop(0, "rgba(110,120,135,0.22)");
  sh.addColorStop(1, "rgba(110,120,135,0)");
  ctx.fillStyle = sh;
  ctx.beginPath();
  ctx.arc(0, 0, 330 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  /* particles (back layer) */
  const drawParticles = (front: boolean) => {
    const fade = 1 - 0.35 * seg(t, 0.55, 1);
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if ((i % 3 === 0) !== front) continue;
      const px = ((p.x + p.vx * t) % 1 + 1) % 1 * w;
      const py = ((p.y + p.vy * t) % 1 + 1) % 1 * h;
      const twinkle = 0.6 + 0.4 * Math.sin(p.tw + t * 7);
      const alpha = p.a * twinkle * fade;
      const size = p.r * Math.max(0.8, s) * (front ? 1.15 : 1);
      const rgb = p.tint < 0.5 ? "94,207,192" : p.tint < 0.8 ? "128,216,204" : "70,180,190";
      ctx.fillStyle = `rgba(${rgb},${alpha.toFixed(3)})`;
      if (p.square) ctx.fillRect(px, py, size, size);
      else {
        ctx.beginPath();
        ctx.arc(px, py, size * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };
  drawParticles(false);

  /* horizontal signal line */
  const lineAlpha = 1 - seg(t, 0.55, 0.9);
  if (lineAlpha > 0) {
    const lg = ctx.createLinearGradient(0, 0, w, 0);
    lg.addColorStop(0, `rgba(90,150,215,0)`);
    lg.addColorStop(0.12, `rgba(74,143,214,${(0.9 * lineAlpha).toFixed(3)})`);
    lg.addColorStop(0.88, `rgba(74,143,214,${(0.9 * lineAlpha).toFixed(3)})`);
    lg.addColorStop(1, `rgba(90,150,215,0)`);
    ctx.strokeStyle = lg;
    ctx.lineWidth = Math.max(1, 1.5 * s);
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(w, cy);
    ctx.stroke();
  }

  /* envelopes */
  const drift = 0.045 * t;
  const E = (u: number) =>
    0.19 * gauss(u, 0.35 + drift, 0.062) +
    0.14 * gauss(u, 0.56 + drift, 0.05) +
    0.075 * gauss(u, 0.78 + drift, 0.045) +
    0.05 * gauss(u, 0.19 + drift, 0.05) +
    0.035 * gauss(u, 0.68 + drift, 0.03);
  const E2 = (u: number) =>
    0.22 * gauss(u, 0.37 + drift, 0.11) +
    0.16 * gauss(u, 0.6 + drift, 0.09) +
    0.1 * gauss(u, 0.8 + drift, 0.08) +
    0.08 * gauss(u, 0.17 + drift, 0.08);
  const ampLines = 1 - seg(t, 0, 0.6);
  const ampBlob = 1 - seg(t, 0.15, 0.93);
  const blobAlpha = 1 - seg(t, 0.7, 0.98);
  const x0 = X(0);
  const x1 = X(DESIGN_W);
  const span = x1 - x0;
  const STEPS = 240;

  /* soft cyan lens shapes */
  if (ampBlob > 0.001 && blobAlpha > 0.001) {
    ctx.save();
    if (hasFilter) ctx.filter = `blur(${(7 * s).toFixed(1)}px)`;
    ctx.fillStyle = `rgba(125,222,228,${(0.28 * blobAlpha).toFixed(3)})`;
    ctx.beginPath();
    for (let i = 0; i <= STEPS; i++) {
      const u = i / STEPS;
      const px = x0 + u * span;
      const py = cy - E2(u) * DESIGN_H * s * ampBlob;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    for (let i = STEPS; i >= 0; i--) {
      const u = i / STEPS;
      ctx.lineTo(x0 + u * span, cy + E2(u) * DESIGN_H * s * ampBlob);
    }
    ctx.closePath();
    ctx.fill();

    /* flowing S ribbon */
    ctx.strokeStyle = `rgba(140,225,232,${(0.22 * blobAlpha).toFixed(3)})`;
    ctx.lineWidth = 42 * s;
    ctx.lineCap = "round";
    if (hasFilter) ctx.filter = `blur(${(10 * s).toFixed(1)}px)`;
    ctx.beginPath();
    for (let i = 0; i <= STEPS; i++) {
      const u = i / STEPS;
      const env = gauss(u, 0.5, 0.32);
      const py = cy + Math.sin(Math.PI * 2 * u * 1.3 + 0.9 + t * 1.2) * 0.11 * DESIGN_H * s * ampBlob * env;
      const px = x0 + u * span;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  }

  /* dark blue line bundle */
  if (ampLines > 0.002) {
    const N = 24;
    ctx.lineWidth = Math.max(0.8, 1.15 * s);
    ctx.lineJoin = "round";
    for (let k = 0; k < N; k++) {
      const si = -1 + (2 * k) / (N - 1);
      const outer = Math.abs(si);
      const alpha = (0.42 + 0.5 * outer) * Math.min(1, ampLines * 3);
      const r = Math.round(lerp(70, 30, outer));
      const g = Math.round(lerp(130, 85, outer));
      const b = Math.round(lerp(200, 160, outer));
      ctx.strokeStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
      ctx.beginPath();
      for (let i = 0; i <= STEPS; i++) {
        const u = i / STEPS;
        const px = x0 + u * span;
        const py = cy + si * ampLines * E(u) * DESIGN_H * s;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }

  /* wordmark */
  const textAlpha = 0.32 + 0.68 * seg(t, 0, 0.45);
  const blurPx = 3.2 * (1 - seg(t, 0.05, 0.5)) * s;
  const mix = seg(t, 0.08, 0.5);
  const aiAlpha = seg(t, 0.1, 0.32);
  const fontSize = 104 * s * (0.97 + 0.03 * seg(t, 0, 0.5));
  ctx.save();
  ctx.font = `600 ${fontSize}px ${fontFamily}`;
  ctx.textBaseline = "alphabetic";
  const wBrand = ctx.measureText("Dethe").width;
  const wSpace = ctx.measureText(" ").width;
  const wAI = ctx.measureText("Ai").width;
  const total = wBrand + wSpace + wAI;
  const startX = X(640) - total / 2;
  const baseY = Y(412);

  const grad = ctx.createLinearGradient(startX, 0, startX + total, 0);
  const c = (a: [number, number, number], b: [number, number, number]) =>
    `rgb(${Math.round(lerp(a[0], b[0], mix))},${Math.round(lerp(a[1], b[1], mix))},${Math.round(lerp(a[2], b[2], mix))})`;
  const grey: [number, number, number] = [124, 136, 152];
  grad.addColorStop(0, c(grey, [11, 31, 77]));
  grad.addColorStop(0.55, c(grey, [11, 31, 77]));
  grad.addColorStop(0.62, c(grey, [15, 47, 214]));
  grad.addColorStop(1, c(grey, [28, 140, 255]));

  if (hasFilter && blurPx > 0.15) ctx.filter = `blur(${blurPx.toFixed(2)}px)`;
  if (mix > 0.4) {
    ctx.shadowColor = `rgba(110,200,220,${(0.35 * (mix - 0.4)).toFixed(3)})`;
    ctx.shadowBlur = 22 * s;
  }
  ctx.fillStyle = grad;
  ctx.globalAlpha = textAlpha;
  ctx.fillText("Dethe", startX, baseY);
  ctx.globalAlpha = textAlpha * aiAlpha;
  ctx.fillText("Ai", startX + wBrand + wSpace, baseY);
  ctx.restore();

  /* brand mark (blue D with face + sound bars) to the left of the wordmark */
  const m = seg(t, 0.2, 0.38);
  if (m > 0.001) {
    ctx.save();
    const markSize = fontSize * 1.08;
    const gap = fontSize * 0.22;
    const mx = startX - gap - markSize;
    const my = baseY - fontSize * 0.86;
    ctx.translate(mx + markSize / 2, my + markSize / 2);
    const sc = (0.75 + 0.25 * m) * (markSize / 100);
    ctx.scale(sc, sc);
    ctx.translate(-50, -50);
    ctx.globalAlpha = m;

    const body = ctx.createLinearGradient(6, 8, 88, 92);
    body.addColorStop(0, "#0f2fd6");
    body.addColorStop(0.55, "#1258ea");
    body.addColorStop(1, "#1c8cff");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(14, 12);
    ctx.lineTo(46, 12);
    ctx.bezierCurveTo(72, 12, 91, 28, 91, 50);
    ctx.bezierCurveTo(91, 72, 72, 88, 46, 88);
    ctx.lineTo(24, 88);
    ctx.bezierCurveTo(18, 88, 14, 84, 14, 78);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(27, 26);
    ctx.lineTo(40, 26);
    ctx.bezierCurveTo(56, 26, 68, 31, 76, 38);
    ctx.bezierCurveTo(80.5, 41.5, 82.5, 45.5, 82.5, 50);
    ctx.bezierCurveTo(82.5, 54.5, 80.5, 58.5, 76, 62);
    ctx.bezierCurveTo(68, 69, 56, 74, 40, 74);
    ctx.lineTo(31.5, 74);
    ctx.bezierCurveTo(27.5, 74, 26, 71.5, 27, 68.5);
    ctx.bezierCurveTo(29.5, 64, 32.5, 61, 31.5, 57.5);
    ctx.bezierCurveTo(30.8, 55.3, 29, 54.2, 29.2, 52.4);
    ctx.bezierCurveTo(29.4, 51, 30.6, 50.6, 30.4, 49.4);
    ctx.bezierCurveTo(30.2, 48.2, 29.4, 48, 29.6, 46.8);
    ctx.bezierCurveTo(29.8, 45.6, 31, 45.3, 30.8, 44);
    ctx.bezierCurveTo(30.4, 41, 27.4, 39.6, 26.2, 36);
    ctx.bezierCurveTo(25, 32.2, 25.6, 28.6, 27, 26);
    ctx.closePath();
    ctx.fill();

    const bars = ctx.createLinearGradient(42, 30, 72, 70);
    bars.addColorStop(0, "#0e3fe0");
    bars.addColorStop(1, "#1a86ff");
    ctx.fillStyle = bars;
    const barSpec: [number, number, number, number][] = [
      [41.5, 43.5, 4.4, 13],
      [48.5, 35, 4.4, 30],
      [55.5, 40, 4.4, 20],
      [62.5, 44.5, 4.4, 11],
      [69.3, 47.6, 4.4, 4.8],
    ];
    for (const [bx, by, bw, bh] of barSpec) {
      const r = bw / 2;
      ctx.beginPath();
      ctx.moveTo(bx + r, by);
      ctx.lineTo(bx + bw - r, by);
      ctx.arc(bx + bw - r, by + r, r, -Math.PI / 2, 0);
      ctx.lineTo(bx + bw, by + bh - r);
      ctx.arc(bx + bw - r, by + bh - r, r, 0, Math.PI / 2);
      ctx.lineTo(bx + r, by + bh);
      ctx.arc(bx + r, by + bh - r, r, Math.PI / 2, Math.PI);
      ctx.lineTo(bx, by + r);
      ctx.arc(bx + r, by + r, r, Math.PI, (3 * Math.PI) / 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  drawParticles(true);
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

type Mode = "detecting" | "frames" | "procedural";

export default function ScrollIntro({ fontFamily }: { fontFamily: string }) {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const progressRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const imagesRef = useRef<(HTMLImageElement | null)[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const modeRef = useRef<Mode>("detecting");
  const fontReadyRef = useRef(false);

  const [mode, setMode] = useState<Mode>("detecting");
  const [frameCount, setFrameCount] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const [progressUi, setProgressUi] = useState(0);
  const [autoPlaying, setAutoPlaying] = useState(false);

  if (particlesRef.current.length === 0) particlesRef.current = makeParticles(150);

  const render = useCallback(() => {
    rafRef.current = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const t = progressRef.current;

    if (modeRef.current === "frames" && imagesRef.current.length > 0) {
      const frames = imagesRef.current;
      let idx = Math.min(frames.length - 1, Math.floor(t * frames.length));
      // Use the nearest already-loaded frame at or before the target.
      while (idx > 0 && !(frames[idx] && frames[idx]!.complete && frames[idx]!.naturalWidth > 0)) idx--;
      const img = frames[idx];
      ctx.fillStyle = "#f6f9fb";
      ctx.fillRect(0, 0, w, h);
      if (img && img.complete && img.naturalWidth > 0) {
        const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
        const dw = img.naturalWidth * scale;
        const dh = img.naturalHeight * scale;
        ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      }
      return;
    }

    drawProcedural(ctx, w, h, t, particlesRef.current, fontFamily);
  }, [fontFamily]);

  const requestRender = useCallback(() => {
    if (rafRef.current === null) rafRef.current = requestAnimationFrame(render);
  }, [render]);

  /* scroll → progress */
  useEffect(() => {
    let uiTick = 0;
    const onScroll = () => {
      const section = sectionRef.current;
      if (!section) return;
      const rect = section.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const p = total > 0 ? clamp01(-rect.top / total) : 0;
      progressRef.current = p;
      requestRender();
      const now = performance.now();
      if (now - uiTick > 80) {
        uiTick = now;
        setProgressUi(p);
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [requestRender]);

  /* font readiness (procedural mode) */
  useEffect(() => {
    let cancelled = false;
    const ready = () => {
      if (cancelled) return;
      fontReadyRef.current = true;
      requestRender();
    };
    if (typeof document !== "undefined" && "fonts" in document) {
      document.fonts
        .load(`600 100px ${fontFamily}`)
        .then(ready)
        .catch(ready);
      document.fonts.ready.then(ready).catch(ready);
    } else {
      ready();
    }
    return () => {
      cancelled = true;
    };
  }, [fontFamily, requestRender]);

  /* detect + preload frames */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Static hosting has no /api/frames endpoint → look for an optional manifest
        // (public/frames/frames.json = ["frame_0001.jpg", …]) and otherwise fall back.
        let urls: string[] = [];
        if (IS_STATIC_BUILD) {
          const res = await fetch("/frames/frames.json", { cache: "no-store" }).catch(() => null);
          if (res && res.ok) {
            const list = (await res.json().catch(() => [])) as string[];
            urls = Array.isArray(list) ? list.map((f) => `/frames/${encodeURIComponent(f)}`) : [];
          }
        } else {
          const res = await apiFetch("/api/frames", { cache: "no-store" });
          const data = (await res.json()) as { frames?: string[] };
          urls = data.frames ?? [];
        }
        if (cancelled) return;
        if (urls.length < 2) {
          modeRef.current = "procedural";
          setMode("procedural");
          requestRender();
          return;
        }
        setFrameCount(urls.length);
        imagesRef.current = new Array(urls.length).fill(null);
        let done = 0;
        let cursor = 0;
        const CONCURRENCY = 6;
        const loadOne = (i: number) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            img.decoding = "async";
            img.onload = () => {
              imagesRef.current[i] = img;
              done++;
              setLoaded(done);
              if (done === 1) {
                modeRef.current = "frames";
                setMode("frames");
              }
              requestRender();
              resolve();
            };
            img.onerror = () => {
              done++;
              setLoaded(done);
              resolve();
            };
            img.src = urls[i];
          });
        const worker = async () => {
          while (!cancelled && cursor < urls.length) {
            const i = cursor++;
            await loadOne(i);
          }
        };
        await Promise.all(Array.from({ length: CONCURRENCY }, worker));
        if (!cancelled && done === 0) {
          modeRef.current = "procedural";
          setMode("procedural");
          requestRender();
        }
      } catch {
        if (!cancelled) {
          modeRef.current = "procedural";
          setMode("procedural");
          requestRender();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [requestRender]);

  /* auto-play: scroll the section over a few seconds */
  const autoPlay = useCallback(() => {
    const section = sectionRef.current;
    if (!section || autoPlaying) return;
    const top = section.getBoundingClientRect().top + window.scrollY;
    const total = section.offsetHeight - window.innerHeight;
    const startY = window.scrollY;
    const startP = clamp01((startY - top) / total);
    const fromP = startP > 0.97 ? 0 : startP;
    const duration = 7000 * (1 - fromP) + 400;
    const t0 = performance.now();
    setAutoPlaying(true);
    const step = (now: number) => {
      const k = clamp01((now - t0) / duration);
      const eased = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const p = lerp(fromP, 1, eased);
      window.scrollTo(0, top + p * total);
      if (k < 1) requestAnimationFrame(step);
      else setAutoPlaying(false);
    };
    window.scrollTo(0, top + fromP * total);
    requestAnimationFrame(step);
  }, [autoPlaying]);

  const pct = Math.round(progressUi * 100);
  const frameIdx = frameCount > 0 ? Math.min(frameCount, Math.floor(progressUi * frameCount) + 1) : 0;

  return (
    <section
      ref={sectionRef}
      className="relative"
      style={{ height: `${SCROLL_LENGTH_VH}vh` }}
      aria-label="DetheAi intro animation"
    >
      <div className="sticky top-0 h-[100svh] w-full overflow-hidden bg-[#f6f9fb]">
        <canvas ref={canvasRef} className="block h-full w-full" />

        {/* status chip */}
        <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 rounded-full border border-[#dbe7ee] bg-white/85 px-3 py-1.5 text-[11px] font-bold text-[#3b5a75] shadow-sm backdrop-blur sm:left-6 sm:top-6">
          {mode === "frames" ? (
            <>
              <Film className="size-3.5 text-[#2f7bc4]" />
              Original frames · {frameIdx}/{frameCount}
              {loaded < frameCount && (
                <span className="text-[#8aa0b5]">· loading {Math.round((loaded / frameCount) * 100)}%</span>
              )}
            </>
          ) : mode === "procedural" ? (
            <>
              <Sparkles className="size-3.5 text-[#2f7bc4]" />
              Live recreation · {pct}%
            </>
          ) : (
            <>
              <Sparkles className="size-3.5 text-[#2f7bc4]" />
              Preparing…
            </>
          )}
        </div>

        {/* play button */}
        <button
          onClick={autoPlay}
          disabled={autoPlaying}
          className="absolute right-4 top-4 flex items-center gap-2 rounded-full bg-[#1f4f95] px-4 py-2 text-[12px] font-bold text-white shadow-[0_8px_20px_rgba(31,79,149,.25)] transition hover:-translate-y-0.5 disabled:opacity-60 sm:right-6 sm:top-6"
        >
          <Play className="size-3.5 fill-current" /> {autoPlaying ? "Playing…" : "Auto-play"}
        </button>

        {/* scroll hint */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-8 flex flex-col items-center gap-1 text-[11px] font-bold uppercase tracking-[.22em] text-[#5f7a93] transition-opacity duration-500"
          style={{ opacity: progressUi < 0.03 ? 1 : 0 }}
        >
          <span>Scroll to play</span>
          <ChevronDown className="size-4 animate-bounce" />
        </div>

        {/* progress bar */}
        <div className="absolute inset-x-0 bottom-0 h-1 bg-[#dbe7ee]/60">
          <div
            className="h-full bg-gradient-to-r from-[#1f4f95] via-[#2f7bc4] to-[#5ecfc0]"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </section>
  );
}
