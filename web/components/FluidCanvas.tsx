"use client";
/**
 * GPU fluid simulation background — the same technique used on unseen.co.
 *
 * This is Pavel Dobryakov's WebGL Navier-Stokes fluid solver (MIT) running
 * 8 framebuffer passes per frame entirely as fragment shaders:
 *
 *     advection → divergence → pressure (Jacobi × N) → gradient subtract →
 *     vorticity confinement → splat (pointer force) → display → bloom
 *
 * The pointer pushes velocity AND colour into the field, so cursor motion
 * isn't *followed* by something visual — the cursor IS the visual. Move
 * fast and you get a splash; move slow and you get a gentle ripple. The
 * simulation runs on the GPU at native refresh rate, no JS loop bottleneck.
 *
 * Tuned for a clinical aesthetic: cold-blue + soft-gold palette, deep ink
 * background, moderate dissipation (motion lingers but doesn't dominate),
 * bloom on for the cinematic finish.
 */
import { useEffect, useRef } from "react";

export default function FluidCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!containerRef.current) return;

    // Dynamic import to keep the simulation code out of the main bundle until
    // the page has rendered — the dependency is ~30 KB of WebGL + GLSL.
    let cleanup: (() => void) | undefined;

    (async () => {
      const { default: WebGLFluidEnhanced } = await import("webgl-fluid-enhanced");
      if (!containerRef.current) return;
      const sim = new WebGLFluidEnhanced(containerRef.current);

      sim.setConfig({
        // Resolution / quality
        simResolution: 160,            // velocity field — keep moderate
        dyeResolution: 1024,           // dye field — higher = crisper colour
        captureResolution: 512,

        // Fluid behaviour
        densityDissipation:  1.6,      // how fast colour fades
        velocityDissipation: 0.55,     // how fast motion fades (lower = more flow)
        pressure: 0.78,
        pressureIterations: 18,
        curl: 26,                      // vorticity confinement strength
        splatRadius: 0.22,             // size of cursor push
        splatForce: 7200,              // strength of cursor push
        shading: true,                 // soft normal-based shading

        // Colour
        colorful: false,
        colorPalette: [
          "#4a82ff",   // ice blue
          "#2e63eb",   // primary blue
          "#1e4ac9",   // deep blue
          "#8fbaff",   // soft sky
          "#d4af6a",   // warm gold
          "#f0d9a6",   // light gold
        ],
        colorUpdateSpeed: 6,
        backgroundColor: "#040711",    // deep ink
        transparent: false,
        brightness: 0.6,
        inverted: false,

        // Bloom — the cinematic finish
        bloom: true,
        bloomIterations: 8,
        bloomResolution: 256,
        bloomIntensity: 0.55,
        bloomThreshold: 0.55,
        bloomSoftKnee: 0.7,

        // No volumetric sunrays — they wash out the clinical palette
        sunrays: false,
        sunraysResolution: 196,
        sunraysWeight: 0.5,

        // Light hover-only splats so the field has subtle life even when idle
        hover: true,
      });

      sim.start();

      // Seed with a few gentle splats on first load so there's already a
      // softly-glowing field when the visitor lands.
      sim.multipleSplats(7);

      cleanup = () => sim.stop();
    })();

    return () => { cleanup?.(); };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="fixed inset-0 -z-[1]"
      style={{ width: "100vw", height: "100vh" }}
    />
  );
}
