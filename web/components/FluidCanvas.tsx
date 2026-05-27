"use client";
/**
 * GPU fluid simulation background — Pavel Dobryakov's Navier-Stokes solver
 * via webgl-fluid-enhanced, with two important customisations:
 *
 *   1.  Aurora-inspired palette (emerald + deep blue + violet + gold) —
 *       reads as "flowing nature" instead of clinical loop.
 *   2.  Pointer events are listened at the WINDOW level and forwarded as
 *       manual splats. This makes the cursor effect work everywhere on
 *       the page, not just over the canvas — UI cards on top no longer
 *       absorb the events.
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

        // Aurora / deep-ocean palette — flowing nature colours
        const palette = [
          "#10b981",   // emerald
          "#34d399",   // mint
          "#22d3ee",   // cyan
          "#3b82f6",   // azure
          "#8b5cf6",   // violet
          "#ec4899",   // soft magenta (rare, peeks through)
          "#f0d9a6",   // dawn gold (rare)
        ];

        sim.setConfig({
          simResolution: 160,
          dyeResolution: 1024,
          captureResolution: 512,

          // Trails linger like aurora curtains, but pointer pushes are gentle.
          densityDissipation:  1.25,
          velocityDissipation: 0.4,
          pressure: 0.82,
          pressureIterations: 18,
          curl: 30,                    // vorticity — that auroral curl
          splatRadius: 0.18,           // smaller splash per stroke
          splatForce: 5500,            // gentler push
          shading: true,

          colorful: false,
          colorPalette: palette,
          colorUpdateSpeed: 5,
          backgroundColor: "#000000",
          transparent: true,           // ★ key: layer over the ocean below
          brightness: 0.7,
          inverted: false,

          bloom: true,
          bloomIterations: 8,
          bloomResolution: 256,
          bloomIntensity: 0.62,
          bloomThreshold: 0.5,
          bloomSoftKnee: 0.7,

          sunrays: false,
          sunraysResolution: 196,
          sunraysWeight: 0.5,

          // Disable hover-only mode — we feed pointer events manually
          hover: false,
        });

        sim.start();
        sim.multipleSplats(9);   // seed the field with initial colour

        // ─── Window-level pointer handler ─────────────────────────────────
        // The library's internal pointer listener only fires on its own
        // container. UI cards above (z-index 10) intercept events first, so
        // the cursor would only push fluid in the empty edges. By listening
        // on `window` and calling `splatAtLocation` manually, the cursor
        // pushes velocity everywhere on the page — including over content.
        let lastX = 0, lastY = 0, hasLast = false;
        let paletteIdx = 0;

        const pickColor = (): string => {
          // Cycle through the palette so different gestures get different tints
          paletteIdx = (paletteIdx + 1) % palette.length;
          return palette[paletteIdx];
        };

        // Velocity scaling — keeps the splat soft and graceful (was 5 which
        // produced the "exploding" look the user reported).
        const VEL_SCALE = 1.6;
        // Clamp per-frame velocity so a very fast flick doesn't fire a giant splat
        const MAX_VEL = 35;
        const clamp = (v: number): number => Math.max(-MAX_VEL, Math.min(MAX_VEL, v));

        const onMove = (e: PointerEvent) => {
          const x = e.clientX;
          const y = e.clientY;
          if (hasLast) {
            const dx = clamp((x - lastX) * VEL_SCALE);
            const dy = clamp((y - lastY) * VEL_SCALE);
            if (dx !== 0 || dy !== 0) {
              try {
                sim.splatAtLocation(x, y, dx, dy, pickColor());
              } catch {
                /* one-off splat errors are harmless */
              }
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
              try { sim.splatAtLocation(x, y, dx, dy, pickColor()); } catch {}
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
        zIndex: 1,                     // above the ocean, below content
      }}
    />
  );
}
