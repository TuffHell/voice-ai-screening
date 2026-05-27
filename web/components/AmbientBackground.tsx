"use client";
/**
 * Layered ambient orbs that drift on independent paths, plus a slow noise pan.
 * Sits behind everything; never intercepts pointer events.
 */
import { motion } from "framer-motion";

const ORBS = [
  { size: 720, top: "-20%", left: "-15%", from: "rgba(74,130,255,0.22)", dur: 32, dx: 80, dy: 60 },
  { size: 560, top: "30%",  left: "75%",  from: "rgba(46,99,235,0.16)",  dur: 38, dx: -90, dy: 40 },
  { size: 480, top: "65%",  left: "5%",   from: "rgba(212,175,106,0.10)", dur: 44, dx: 60, dy: -50 },
  { size: 380, top: "80%",  left: "60%",  from: "rgba(143,186,255,0.13)", dur: 28, dx: -50, dy: -70 },
  { size: 300, top: "5%",   left: "50%",  from: "rgba(240,217,166,0.08)", dur: 36, dx: 40, dy: 80 },
];

export default function AmbientBackground() {
  return (
    <div aria-hidden className="fixed inset-0 -z-[1] pointer-events-none overflow-hidden">
      {ORBS.map((o, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            top: o.top,
            left: o.left,
            width: o.size,
            height: o.size,
            background: `radial-gradient(circle at center, ${o.from} 0%, transparent 65%)`,
            filter: "blur(40px)",
            willChange: "transform",
          }}
          animate={{
            x: [0, o.dx, -o.dx / 2, 0],
            y: [0, o.dy, -o.dy / 2, 0],
            scale: [1, 1.06, 0.96, 1],
          }}
          transition={{ duration: o.dur, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
      {/* Faint twinkling stars for atmosphere */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "radial-gradient(1px 1px at 13% 12%, white, transparent 50%)," +
            "radial-gradient(1px 1px at 38% 70%, white, transparent 50%)," +
            "radial-gradient(1px 1px at 67% 22%, white, transparent 50%)," +
            "radial-gradient(1px 1px at 84% 88%, white, transparent 50%)," +
            "radial-gradient(1px 1px at 22% 55%, white, transparent 50%)," +
            "radial-gradient(1.5px 1.5px at 92% 41%, white, transparent 50%)",
        }}
      />
    </div>
  );
}
