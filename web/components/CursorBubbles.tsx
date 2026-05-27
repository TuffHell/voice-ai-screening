"use client";
/**
 * GPU-friendly cursor trail.
 *
 * One <canvas>, one requestAnimationFrame loop, all blobs rendered in a
 * single paint per frame using radial gradient fills + "lighter" compositing.
 *
 * Replaces the previous Framer Motion + CSS-blur + mix-blend-mode approach
 * which forced 5 separate composited layers, each with an animated 8px CSS
 * blur — that combination pegs the GPU on most laptops.
 */
import { useEffect, useRef } from "react";

interface Blob {
  /** target — set by pointer */
  tx: number;
  ty: number;
  /** current — eased toward target */
  cx: number;
  cy: number;
  /** smoothing factor (0..1; higher = faster catch-up) */
  ease: number;
  /** radius in CSS px */
  r: number;
  /** rgba colour */
  rgb: string;
  /** opacity multiplier */
  alpha: number;
}

// Light cursor trail — 3 blobs read as a layered trail without the GPU cost
// of 5. Half the radii of the previous version means each frame paints
// roughly 1/4 the pixels.
const BLOBS: Omit<Blob, "tx" | "ty" | "cx" | "cy">[] = [
  { ease: 0.12, r: 140, rgb: "74,130,255",  alpha: 0.18 },
  { ease: 0.22, r:  72, rgb: "143,186,255", alpha: 0.18 },
  { ease: 0.42, r:  28, rgb: "240,247,255", alpha: 0.30 },
];

export default function CursorBubbles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const blobs: Blob[] = BLOBS.map((b) => ({
      ...b, tx: -9999, ty: -9999, cx: -9999, cy: -9999,
    }));

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width  = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width  = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const onMove = (e: PointerEvent) => {
      for (const b of blobs) { b.tx = e.clientX; b.ty = e.clientY; }
    };
    const onLeave = () => {
      for (const b of blobs) { b.tx = -9999; b.ty = -9999; }
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave);

    let raf = 0;
    const tick = () => {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      ctx.globalCompositeOperation = "lighter";
      for (const b of blobs) {
        // Ease current → target
        b.cx += (b.tx - b.cx) * b.ease;
        b.cy += (b.ty - b.cy) * b.ease;
        const g = ctx.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, b.r);
        g.addColorStop(0,    `rgba(${b.rgb},${b.alpha})`);
        g.addColorStop(0.55, `rgba(${b.rgb},${b.alpha * 0.4})`);
        g.addColorStop(1,    `rgba(${b.rgb},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(b.cx, b.cy, b.r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
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
      ref={canvasRef}
      aria-hidden
      className="fixed inset-0 z-[1] pointer-events-none motion-reduce:hidden"
      style={{ width: "100vw", height: "100vh" }}
    />
  );
}
