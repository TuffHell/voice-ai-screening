"use client";
/**
 * Cinematic photographic backdrop — a real botanical-conservatory lab.
 *
 * No 3D, no WebGL: a high-res real photograph with a slow Ken-Burns zoom
 * (gives it the gentle life of a video), subtle scroll parallax (the image
 * drifts slower than the content for depth), a green-tinted readability
 * gradient, and a fine film grain. Reliable, smooth, genuinely realistic —
 * because it is a real photo, not modelled geometry.
 */
import { useScroll, useTransform, motion } from "framer-motion";

export default function LabBackground() {
  const { scrollYProgress } = useScroll();
  // Background drifts up slightly slower than the page → parallax depth.
  const y = useTransform(scrollYProgress, [0, 1], ["0%", "14%"]);
  // Overlay deepens a touch as you scroll, keeping lower sections readable.
  const overlay = useTransform(scrollYProgress, [0, 0.4], [0.55, 0.78]);

  return (
    <div aria-hidden className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
      {/* Parallax layer */}
      <motion.div style={{ y }} className="absolute inset-0 -bottom-[14%]">
        {/* Ken-Burns slow zoom layer (separate element so transforms don't clash) */}
        <div
          className="absolute inset-0 animate-kenburns"
          style={{
            backgroundImage: "url(/lab-bg.jpg)",
            backgroundSize: "cover",
            backgroundPosition: "center 30%",
          }}
        />
      </motion.div>

      {/* Readability gradient — green-tinted, stronger left + top + bottom */}
      <motion.div
        className="absolute inset-0"
        style={{
          opacity: overlay,
          background:
            "linear-gradient(90deg, rgba(3,12,9,0.92) 0%, rgba(3,12,9,0.55) 38%, rgba(3,12,9,0.12) 70%, rgba(3,12,9,0.02) 100%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(3,12,9,0.55) 0%, transparent 22%, transparent 52%, rgba(3,12,9,0.70) 100%)",
        }}
      />

      {/* Fine film grain for a cinematic surface */}
      <div
        className="absolute inset-0 opacity-[0.06] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg viewBox='0 0 220 220' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")",
        }}
      />
    </div>
  );
}
