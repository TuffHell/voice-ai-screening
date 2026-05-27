"use client";
/**
 * Cursor-following blob trail — five colour-tuned orbs each with their own
 * spring stiffness, producing the soft layered trail you see on unseen.co.
 *
 * Pure Framer Motion springs (no canvas) so it stays GPU-accelerated and
 * respects prefers-reduced-motion.
 */
import { useEffect } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

const BLOBS: Array<{ size: number; tint: string; stiffness: number; damping: number; mix: string }> = [
  { size: 540, tint: "rgba(74, 130, 255, 0.18)", stiffness: 35,  damping: 24, mix: "screen" },
  { size: 360, tint: "rgba(212, 175, 106, 0.10)", stiffness: 55,  damping: 22, mix: "screen" },
  { size: 260, tint: "rgba(143, 186, 255, 0.16)", stiffness: 85,  damping: 20, mix: "screen" },
  { size: 160, tint: "rgba(240, 217, 166, 0.12)", stiffness: 130, damping: 18, mix: "screen" },
  { size:  72, tint: "rgba(255, 255, 255, 0.20)", stiffness: 220, damping: 16, mix: "overlay" },
];

export default function CursorBubbles() {
  const x = useMotionValue(-9999);
  const y = useMotionValue(-9999);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onMove = (e: PointerEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
    };
    const onLeave = () => {
      x.set(-9999);
      y.set(-9999);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, [x, y]);

  return (
    <div
      aria-hidden
      className="fixed inset-0 z-[1] pointer-events-none overflow-hidden
                 motion-reduce:hidden"
    >
      {BLOBS.map((b, i) => (
        <Bubble key={i} {...b} x={x} y={y} />
      ))}
    </div>
  );
}

function Bubble({
  size, tint, stiffness, damping, mix, x, y,
}: {
  size: number; tint: string; stiffness: number; damping: number; mix: string;
  x: ReturnType<typeof useMotionValue<number>>;
  y: ReturnType<typeof useMotionValue<number>>;
}) {
  const sx = useSpring(x, { stiffness, damping, mass: 1 });
  const sy = useSpring(y, { stiffness, damping, mass: 1 });
  return (
    <motion.div
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        x: sx,
        y: sy,
        translateX: `${-size / 2}px`,
        translateY: `${-size / 2}px`,
        width: size,
        height: size,
        borderRadius: "50%",
        background: `radial-gradient(circle at center, ${tint} 0%, transparent 65%)`,
        filter: "blur(8px)",
        mixBlendMode: mix as "screen" | "overlay",
        willChange: "transform",
      }}
    />
  );
}
