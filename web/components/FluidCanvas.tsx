"use client";
/**
 * Aurora fluid background — single visible layer, always alive.
 *
 * Lessons from previous iterations:
 *   • Transparent overlay + base layer = brittle stacking; ditch the layering.
 *   • Aggressive dissipation made trails disappear before you noticed them;
 *     keep colour on screen for ~6 seconds, not ~1.
 *   • If the visitor doesn't move the mouse, the page should still flow —
 *     so we periodically inject autonomous splats at random screen positions.
 *
 * Single canvas. Always visible. Bright. Reacts to the cursor on every
 * surface of the page (window-level pointer listener).
 */
import { useEffect, useRef } from "react";

export default function FluidCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!containerRef.current) return;

    let cleanup: (() => void) | undefined;

    (async () => {
      try {
        const mod = await import("webgl-fluid-enhanced");
        const WebGLFluidEnhanced =
          mod.default ??
          (mod as unknown as { WebGLFluidEnhanced: typeof mod.default }).WebGLFluidEnhanced;
        if (!containerRef.current) return;
        if (!WebGLFluidEnhanced) {
          console.error("[FluidCanvas] webgl-fluid-enhanced has no default export", mod);
          return;
        }

        const sim = new WebGLFluidEnhanced(containerRef.current);

        // Aurora / deep-ocean — saturated so the colour reads even on a 2K display.
        const palette = [
          "#10b981",   // emerald
          "#22d3ee",   // cyan
          "#3b82f6",   // azure
          "#8b5cf6",   // violet
          "#ec4899",   // soft magenta
          "#f0d9a6",   // dawn gold
        ];

        sim.setConfig({
          simResolution: 160,
          dyeResolution: 1024,
          captureResolution: 512,

          // Trails persist a long time — the page is always covered in colour
          densityDissipation:  0.55,
          velocityDissipation: 0.25,
          pressure: 0.85,
          pressureIterations: 18,
          curl: 32,
          splatRadius: 0.2,
          splatForce: 6000,
          shading: true,

          colorful: false,
          colorPalette: palette,
          colorUpdateSpeed: 5,
          backgroundColor: "#02050d",
          transparent: false,            // OPAQUE — no layering tricks
          brightness: 0.85,
          inverted: false,

          bloom: true,
          bloomIterations: 8,
          bloomResolution: 256,
          bloomIntensity: 0.7,
          bloomThreshold: 0.45,
          bloomSoftKnee: 0.7,

          sunrays: false,
          sunraysResolution: 196,
          sunraysWeight: 0.5,

          hover: false,
        });

        sim.start();

        // Seed heavily so the field is full of colour the moment you land
        for (let i = 0; i < 4; i++) sim.multipleSplats(8);

        // ─── Autonomous splat drift ─────────────────────────────────────
        // Fire a soft random splat every ~1.5 s so the field keeps evolving
        // even when the visitor isn't moving the mouse. Without this, after
        // ~5 s the fluid settles and the page looks dead.
        const autoSplat = window.setInterval(() => {
          try { sim.multipleSplats(1); } catch { /* ignore */ }
        }, 1500);

        // ─── Window-level pointer handler — works everywhere ───────────
        let lastX = 0, lastY = 0, hasLast = false;
        let paletteIdx = 0;
        const VEL_SCALE = 1.6;
        const MAX_VEL = 35;
        const clamp = (v: number) => Math.max(-MAX_VEL, Math.min(MAX_VEL, v));
        const pickColor = () => {
          paletteIdx = (paletteIdx + 1) % palette.length;
          return palette[paletteIdx];
        };

        const onMove = (e: PointerEvent) => {
          const x = e.clientX;
          const y = e.clientY;
          if (hasLast) {
            const dx = clamp((x - lastX) * VEL_SCALE);
            const dy = clamp((y - lastY) * VEL_SCALE);
            if (dx !== 0 || dy !== 0) {
              try { sim.splatAtLocation(x, y, dx, dy, pickColor()); } catch { /* ignore */ }
            }
          }
          lastX = x; lastY = y; hasLast = true;
        };
        const onTouch = (e: TouchEvent) => {
          const t = e.touches[0];
          if (!t) return;
          const x = t.clientX, y = t.clientY;
          if (hasLast) {
            const dx = clamp((x - lastX) * VEL_SCALE);
            const dy = clamp((y - lastY) * VEL_SCALE);
            if (dx !== 0 || dy !== 0) {
              try { sim.splatAtLocation(x, y, dx, dy, pickColor()); } catch { /* ignore */ }
            }
          }
          lastX = x; lastY = y; hasLast = true;
        };

        window.addEventListener("pointermove", onMove, { passive: true });
        window.addEventListener("touchmove",   onTouch, { passive: true });

        cleanup = () => {
          window.clearInterval(autoSplat);
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("touchmove",   onTouch);
          sim.stop();
        };
      } catch (err) {
        console.error("[FluidCanvas] failed to initialise:", err);
      }
    })();

    return () => { cleanup?.(); };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="fixed inset-0 pointer-events-none"
      style={{
        width: "100vw",
        height: "100vh",
        zIndex: 0,
      }}
    />
  );
}
