"use client";
/**
 * Cinematic ambient background.
 *
 * One canvas. Six soft radial-gradient orbs orbit on independent Lissajous
 * paths, drawn each frame with "screen" compositing for a fluid layered look.
 * No CSS filters, no DOM animation, no mix-blend-mode on the page itself —
 * the GPU paints exactly one transparent canvas per frame.
 *
 * Scales gracefully on 4K displays via devicePixelRatio.
 */
import { useEffect, useRef } from "react";

interface Orb {
  cx: number; cy: number;        // base center (px)
  ax: number; ay: number;        // amplitude (px)
  fx: number; fy: number;        // frequencies (Hz-ish)
  phase: number;                 // phase offset
  r: number;                     // radius
  rgb: string;
  alpha: number;
}

export default function AmbientBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = window.innerWidth, H = window.innerHeight;
    let orbs: Orb[] = [];

    const seedOrbs = () => {
      orbs = [
        { cx: W * 0.18, cy: H * 0.22, ax: 220, ay: 140, fx: 0.025, fy: 0.018, phase: 0,    r: 540, rgb: "74,130,255",  alpha: 0.28 },
        { cx: W * 0.82, cy: H * 0.32, ax: 200, ay: 180, fx: 0.020, fy: 0.029, phase: 1.1,  r: 480, rgb: "46,99,235",   alpha: 0.22 },
        { cx: W * 0.30, cy: H * 0.78, ax: 260, ay: 150, fx: 0.018, fy: 0.024, phase: 2.4,  r: 520, rgb: "143,186,255", alpha: 0.18 },
        { cx: W * 0.72, cy: H * 0.80, ax: 180, ay: 220, fx: 0.022, fy: 0.020, phase: 3.6,  r: 460, rgb: "212,175,106", alpha: 0.14 },
        { cx: W * 0.50, cy: H * 0.50, ax: 320, ay: 180, fx: 0.014, fy: 0.022, phase: 4.7,  r: 700, rgb: "30,74,201",   alpha: 0.20 },
        { cx: W * 0.40, cy: H * 0.10, ax: 200, ay: 120, fx: 0.030, fy: 0.017, phase: 5.9,  r: 360, rgb: "240,217,166", alpha: 0.12 },
      ];
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width  = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      canvas.style.width  = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seedOrbs();
    };
    resize();
    window.addEventListener("resize", resize);

    // Subtle pointer-position parallax — adds reactivity without per-frame mouse work
    let px = 0, py = 0, tx = 0, ty = 0;
    const onMove = (e: PointerEvent) => {
      tx = (e.clientX / W - 0.5) * 40;
      ty = (e.clientY / H - 0.5) * 30;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    let raf = 0;
    const start = performance.now();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const tick = () => {
      const t = (performance.now() - start) / 1000;
      px += (tx - px) * 0.04;
      py += (ty - py) * 0.04;

      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "screen";

      for (const o of orbs) {
        const x = o.cx + Math.sin(t * o.fx * Math.PI * 2 + o.phase) * o.ax + px;
        const y = o.cy + Math.cos(t * o.fy * Math.PI * 2 + o.phase) * o.ay + py;
        const g = ctx.createRadialGradient(x, y, 0, x, y, o.r);
        g.addColorStop(0,    `rgba(${o.rgb},${o.alpha})`);
        g.addColorStop(0.5,  `rgba(${o.rgb},${o.alpha * 0.45})`);
        g.addColorStop(1,    `rgba(${o.rgb},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, o.r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!reduced) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="fixed inset-0 -z-[1] pointer-events-none"
      style={{ width: "100vw", height: "100vh" }}
    />
  );
}
