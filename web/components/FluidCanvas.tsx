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

          // Soft aurora — never overexposed.
          densityDissipation:  1.1,
          velocityDissipation: 0.4,
          pressure: 0.85,
          pressureIterations: 18,
          curl: 28,
          splatRadius: 0.14,             // ↓ smaller splash per stroke
          splatForce: 4200,
          shading: true,

          colorful: false,
          colorPalette: palette,
          colorUpdateSpeed: 5,
          backgroundColor: "#02050d",
          transparent: false,
          brightness: 0.45,              // ↓ further — no hot spots
          inverted: false,

          bloom: true,
          bloomIterations: 5,
          bloomResolution: 256,
          bloomIntensity: 0.22,          // ↓ much softer glow
          bloomThreshold: 0.7,           // ↑ only the very brightest tips bloom
          bloomSoftKnee: 0.65,

          sunrays: false,
          sunraysResolution: 196,
          sunraysWeight: 0.5,

          hover: false,
        });

        sim.start();

        // Seed splats placed on an explicit grid so colour is spread evenly
        // across the viewport on first paint — never clustered into one
        // overexposed hotspot. (The library's `multipleSplats(n)` uses random
        // positions which were stacking up at the bottom and blowing out.)
        const W = window.innerWidth;
        const H = window.innerHeight;
        const seedAt = (px: number, py: number, color: string) => {
          // Gentle outward push so the splat doesn't just sit as a static spot
          const dx = (Math.random() - 0.5) * 12;
          const dy = (Math.random() - 0.5) * 12;
          try { sim.splatAtLocation(px * W, py * H, dx, dy, color); } catch { /* ignore */ }
        };
        // 3 × 3 grid biased toward upper screen (where the eye lands first)
        const gridX = [0.18, 0.50, 0.82];
        const gridY = [0.22, 0.50, 0.78];
        gridX.forEach((x, ix) => gridY.forEach((y, iy) => {
          seedAt(x, y, palette[(ix * 3 + iy) % palette.length]);
        }));

        // ─── Autonomous drift ───────────────────────────────────────────
        // One soft splat every ~3 s at a fresh random viewport position so
        // the field keeps evolving even when the cursor is idle. Never two
        // in the same place because random covers the whole viewport.
        const autoSplat = window.setInterval(() => {
          const x = (0.1 + Math.random() * 0.8) * window.innerWidth;
          const y = (0.1 + Math.random() * 0.8) * window.innerHeight;
          const dx = (Math.random() - 0.5) * 10;
          const dy = (Math.random() - 0.5) * 10;
          const c = palette[Math.floor(Math.random() * palette.length)];
          try { sim.splatAtLocation(x, y, dx, dy, c); } catch { /* ignore */ }
        }, 3000);

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
