"use client";
import { motion } from "framer-motion";
import { ArrowDown } from "lucide-react";

export default function Hero() {
  return (
    <section className="relative min-h-[88vh] flex items-center pt-32 pb-24 px-6 sm:px-12 max-w-7xl mx-auto">
      {/* Slow-drift orbs */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -top-20 -left-32 w-[520px] h-[520px] rounded-full
                   bg-ice-500/20 blur-[120px]"
        animate={{ x: [0, 40, -20, 0], y: [0, -20, 30, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute top-40 right-0 w-[420px] h-[420px] rounded-full
                   bg-gold/15 blur-[120px]"
        animate={{ x: [0, -30, 20, 0], y: [0, 30, -10, 0] }}
        transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative z-10 max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="eyebrow">
            <span className="w-1.5 h-1.5 rounded-full bg-ice-400 animate-pulse-soft" />
            Clinical Voice Intelligence
          </span>
        </motion.div>

        <motion.h1
          className="display text-5xl sm:text-6xl lg:text-7xl mt-7 mb-6 gradient-title"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.85, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
        >
          Precise screening<br />
          for <em className="gradient-accent not-italic">disordered speech</em>.
        </motion.h1>

        <motion.p
          className="text-lg sm:text-xl text-ice-100/70 max-w-xl leading-relaxed"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.85, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
        >
          A research-grade acoustic engine for the early identification of
          dysarthria, aphasia, and healthy phonation — built on a frozen deep
          speech encoder, calibrated probabilities, and Praat-grade indicators.
        </motion.p>

        <motion.div
          className="mt-10 flex flex-wrap items-center gap-4"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.85, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <a href="#analyse" className="btn-primary">
            Begin analysis
            <ArrowDown className="w-4 h-4" />
          </a>
          <a href="#how-it-works" className="btn-ghost">
            How it works
          </a>
        </motion.div>

        <motion.div
          className="mt-14 flex flex-wrap gap-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.5 }}
        >
          <span className="stat-pill"><span className="text-ice-300 font-mono">96.21%</span> test accuracy</span>
          <span className="stat-pill"><span className="text-ice-300 font-mono">11</span> held-out speakers</span>
          <span className="stat-pill"><span className="text-ice-300 font-mono">ECE 0.089</span> calibration</span>
          <span className="stat-pill">HuBERT · Whisper · Praat</span>
        </motion.div>
      </div>
    </section>
  );
}
