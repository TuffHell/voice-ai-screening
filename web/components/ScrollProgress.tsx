"use client";
import { motion, useScroll, useSpring } from "framer-motion";

/**
 * Thin gold scroll-progress bar fixed at the very top of the viewport.
 */
export default function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    restDelta: 0.001,
  });
  return (
    <motion.div
      aria-hidden
      style={{ scaleX }}
      className="fixed top-0 left-0 right-0 h-[2px] origin-left z-[60]
                 bg-gradient-to-r from-gold-deep via-gold to-gold-soft
                 shadow-[0_0_12px_rgba(201,168,106,0.6)]"
    />
  );
}
