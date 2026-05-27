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

          // Transparent overlay — fluid is *only* a cursor interaction layer
          // on top of the always-on CSS aurora behind. Subtle by design.
          densityDissipation:  1.4,      // trails fade quickly so they never stack
          velocityDissipation: 0.5,
          pressure: 0.82,
          pressureIterations: 16,
          curl: 25,
          splatRadius: 0.12,
          splatForce: 3500,
          shading: true,

          colorful: false,
          colorPalette: palette,
          colorUpdateSpeed: 5,
          backgroundColor: "#000000",
          transparent: true,             // ★ key: see CSS aurora behind
          brightness: 0.45,
          inverted: false,

          bloom: false,                  // no bloom — keeps the layer subtle
          bloomIterations: 5,
          bloomResolution: 256,
          bloomIntensity: 0.1,
          bloomThreshold: 0.8,
          bloomSoftKnee: 0.65,

          sunrays: false,
          sunraysResolution: 196,
          sunraysWeight: 0.5,

          hover: false,
        });

        sim.start();
        // No seed splats. No auto-splats. The fluid layer is now ONLY a
        // cursor interaction layer — the always-on CSS aurora behind is
        // what the visitor sees as the "background". This eliminates every
        // blowout / hotspot / cluster issue.

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
