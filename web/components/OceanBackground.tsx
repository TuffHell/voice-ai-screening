"use client";
/**
 * Vanta.js WAVES — animated 3D ocean surface.
 *
 * Renders a real undulating wave field in Three.js with mouse-tracked
 * camera tilt. Used by countless premium agency sites for "flowing nature"
 * backdrops. We pair it with a separate fluid-style cursor layer so the
 * pointer also paints ripples on top of the waves.
 *
 * The waves run autonomously — they never freeze, they don't depend on
 * cursor input. The ocean is just *there*, slowly rolling, while the
 * cursor adds its own layer of interactivity on top.
 */
import { useEffect, useRef } from "react";

export default function OceanBackground() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !containerRef.current) return;

    let effect: { destroy?: () => void } | null = null;

    (async () => {
      try {
        const THREE = await import("three");
        // Vanta is published as a UMD bundle that expects window.THREE
        (window as unknown as { THREE: typeof THREE }).THREE = THREE;
        const VANTA = await import("vanta/dist/vanta.waves.min");

        if (!containerRef.current) return;
        // Vanta's default export is the factory function
        const create = (VANTA.default ?? VANTA) as unknown as (opts: Record<string, unknown>) => { destroy?: () => void };

        effect = create({
          el: containerRef.current,
          THREE,
          mouseControls:  true,
          touchControls:  true,
          gyroControls:   false,
          minHeight:      200,
          minWidth:       200,
          scale:          1.0,
          scaleMobile:    1.0,
          color:          0x0a1f44,   // deep navy — operating-room sea
          shininess:      55,         // reflective highlights on wave crests
          waveHeight:     18,         // amplitude
          waveSpeed:      0.6,
          zoom:           0.92,
        });
      } catch (err) {
        console.error("[OceanBackground] failed to initialise Vanta:", err);
      }
    })();

    return () => { effect?.destroy?.(); };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="fixed inset-0 pointer-events-none"
      style={{
        width:  "100vw",
        height: "100vh",
        zIndex: 0,
      }}
    />
  );
}
