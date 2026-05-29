"use client";
/**
 * Real conservatory-lab VIDEO backdrop.
 *
 * Genuine greenhouse footage (glass roof, hanging plants, a water channel,
 * ferns) loops behind the page — real motion, real light, fully realistic
 * because it is real footage. A poster frame paints instantly while the
 * video loads.
 *
 * Scroll choreography (more interesting, still calm):
 *   • the footage slowly pushes IN (scale) as you scroll — like walking
 *     deeper into the greenhouse,
 *   • it drifts up with parallax (slower than the content) for depth,
 *   • the readability overlay deepens so lower sections stay legible.
 * Plus a green-tinted gradient + fine film grain for a cinematic surface.
 */
import { useScroll, useTransform, motion } from "framer-motion";

export default function LabBackground() {
  const { scrollYProgress } = useScroll();
  const y       = useTransform(scrollYProgress, [0, 1], ["0%", "16%"]);
  const scale   = useTransform(scrollYProgress, [0, 1], [1.05, 1.28]);
  const overlay = useTransform(scrollYProgress, [0, 0.45], [0.5, 0.8]);

  return (
    <div aria-hidden className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
      {/* Parallax + scroll-zoom video layer */}
      <motion.div style={{ y, scale }} className="absolute inset-0 -bottom-[16%] origin-center">
        <video
          className="absolute inset-0 w-full h-full object-cover"
          src="/lab-conservatory.mp4"
          poster="/lab-poster.jpg"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
        />
      </motion.div>

      {/* Readability gradient — green-tinted, stronger left + top + bottom */}
      <motion.div
        className="absolute inset-0"
        style={{
          opacity: overlay,
          background:
            "linear-gradient(90deg, rgba(3,12,9,0.92) 0%, rgba(3,12,9,0.55) 38%, rgba(3,12,9,0.14) 70%, rgba(3,12,9,0.03) 100%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(3,12,9,0.58) 0%, transparent 24%, transparent 50%, rgba(3,12,9,0.72) 100%)",
        }}
      />

      {/* Fine film grain */}
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
