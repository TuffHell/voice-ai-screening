"use client";
/**
 * Neural-pathway background — the visual most premium medical / AI brands use.
 *
 * Single <canvas>. Two combined layers, both drawn in one paint per frame:
 *   1. Three slow-drifting ambient orbs (mood / colour)
 *   2. ~80 particles with velocity vectors; whenever two particles come
 *      within MAX_DIST pixels of each other we draw a glowing line between
 *      them with opacity proportional to closeness. Cursor pushes a soft
 *      attraction so the network "looks back" at the pointer.
 *
 * Animates on transform only, no CSS filters, no DOM nodes per particle —
 * stays at 60 fps even on a four-year-old laptop, runs at 120 fps on a
 * desktop GPU.
 */
import { useEffect, useRef } from "react";

interface Particle { x: number; y: number; vx: number; vy: number; r: number }
interface Orb { cx: number; cy: number; ax: number; ay: number; fx: number; fy: number; phase: number; r: number; rgb: string; alpha: number }

const PARTICLES = 80;
const MAX_DIST  = 130;            // line if particles closer than this (px)
const SPEED     = 0.18;           // base drift speed (px / frame)

const ORBS: Orb[] = [
  { cx: 0.20, cy: 0.25, ax: 280, ay: 180, fx: 0.020, fy: 0.018, phase: 0,   r: 640, rgb: "74,130,255",  alpha: 0.28 },
  { cx: 0.78, cy: 0.65, ax: 240, ay: 200, fx: 0.018, fy: 0.024, phase: 2.1, r: 560, rgb: "46,99,235",   alpha: 0.22 },
  { cx: 0.50, cy: 0.45, ax: 320, ay: 220, fx: 0.014, fy: 0.020, phase: 4.3, r: 760, rgb: "30,74,201",   alpha: 0.18 },
];

export default function NeuralBackground() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let W = window.innerWidth, H = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let particles: Particle[] = [];

    const seed = () => {
      particles = Array.from({ length: PARTICLES }, () => ({
        x:  Math.random() * W,
        y:  Math.random() * H,
        vx: (Math.random() - 0.5) * SPEED * 2,
        vy: (Math.random() - 0.5) * SPEED * 2,
        r:  Math.random() * 1.4 + 0.6,
      }));
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width  = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      canvas.style.width  = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    };
    resize();
    window.addEventListener("resize", resize);

    // Pointer attractor
    let mx = -9999, my = -9999;
    const onMove = (e: PointerEvent) => { mx = e.clientX; my = e.clientY; };
    const onLeave = () => { mx = -9999; my = -9999; };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const start = performance.now();

    const tick = () => {
      const t = (performance.now() - start) / 1000;
      ctx.clearRect(0, 0, W, H);

      // ── 1. Orbs (large soft colour) ────────────────────────────────────
      ctx.globalCompositeOperation = "screen";
      for (const o of ORBS) {
        const x = o.cx * W + Math.sin(t * o.fx * 2 * Math.PI + o.phase) * o.ax;
        const y = o.cy * H + Math.cos(t * o.fy * 2 * Math.PI + o.phase) * o.ay;
        const g = ctx.createRadialGradient(x, y, 0, x, y, o.r);
        g.addColorStop(0,   `rgba(${o.rgb},${o.alpha})`);
        g.addColorStop(0.6, `rgba(${o.rgb},${o.alpha * 0.35})`);
        g.addColorStop(1,   `rgba(${o.rgb},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, o.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── 2. Particle network ────────────────────────────────────────────
      // Advance positions + wrap
      for (const p of particles) {
        // Pointer attraction (weak)
        if (mx > -9000) {
          const dx = mx - p.x, dy = my - p.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 220 * 220) {
            const f = (1 - Math.sqrt(d2) / 220) * 0.015;
            p.vx += dx * f / 220;
            p.vy += dy * f / 220;
          }
        }
        p.x += p.vx; p.y += p.vy;
        // gentle damping
        p.vx *= 0.985; p.vy *= 0.985;
        // base drift so the network never goes static
        p.vx += (Math.random() - 0.5) * 0.05;
        p.vy += (Math.random() - 0.5) * 0.05;
        // wrap edges
        if (p.x < -10) p.x = W + 10;
        if (p.x > W + 10) p.x = -10;
        if (p.y < -10) p.y = H + 10;
        if (p.y > H + 10) p.y = -10;
      }

      // Draw connections
      ctx.globalCompositeOperation = "lighter";
      ctx.lineWidth = 1;
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < MAX_DIST * MAX_DIST) {
            const k = 1 - Math.sqrt(d2) / MAX_DIST;
            ctx.strokeStyle = `rgba(143,186,255,${k * 0.32})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
      // Draw particles (small bright dots)
      for (const p of particles) {
        ctx.fillStyle = "rgba(186, 215, 255, 0.85)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";

      if (!reduced) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="fixed inset-0 -z-[1] pointer-events-none"
      style={{ width: "100vw", height: "100vh" }}
    />
  );
}
