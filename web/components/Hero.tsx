"use client";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

const EASE = [0.16, 1, 0.3, 1] as const;

export default function Hero() {
  return (
    <section className="relative min-h-screen flex flex-col justify-center px-6 sm:px-12 lg:px-20 max-w-[1400px] mx-auto">
      {/* Eyebrow */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: EASE }}
        className="absolute top-28 left-6 sm:left-12 lg:left-20"
      >
        <span className="eyebrow">
          <span className="w-6 h-px bg-gold/60" />
          Biomedical voice intelligence · 2026
        </span>
      </motion.div>

      {/* Headline */}
      <div className="relative z-10 max-w-4xl mt-10">
        <motion.h1
          className="display text-[clamp(2.6rem,6.5vw,6rem)] mb-8"
          initial={{ opacity: 0, y: 24, filter: "blur(10px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 1.1, ease: EASE, delay: 0.1 }}
        >
          <span className="gradient-title">Precise screening</span><br />
          <span className="gradient-title">for disordered speech</span><br />
          <span className="gradient-accent italic">and quiet voices</span>
        </motion.h1>

        <motion.p
          className="text-ice-300 text-base sm:text-lg leading-relaxed max-w-md mb-10"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: EASE, delay: 0.32 }}
        >
          A research-grade acoustic engine for the early identification of
          dysarthria, aphasia and healthy phonation — built the way a
          clinician would reason about a voice.
        </motion.p>

        <motion.div
          className="flex flex-wrap items-center gap-4"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: EASE, delay: 0.44 }}
        >
          <a href="#analyse" className="btn-primary group">
            Begin a screening
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gold/15 group-hover:bg-gold/25 transition-colors">
              <ArrowRight className="w-3.5 h-3.5 text-gold-soft" />
            </span>
          </a>
          <a href="#how-it-works" className="btn-ghost">How it works</a>
        </motion.div>
      </div>

      {/* Bottom-left section index marker */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 0.7 }}
        className="absolute bottom-10 left-6 sm:left-12 lg:left-20 index-marker"
      >
        (01) — Screening
      </motion.div>

      {/* Bottom-right live status ticker (glass card) */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: EASE, delay: 0.6 }}
        className="absolute bottom-10 right-6 sm:right-12 lg:right-20 hidden md:block"
      >
        <div className="glass px-5 py-3.5 min-w-[290px]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-ice-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-soft" />
              Live · model status
            </span>
            <span className="font-mono text-[11px] text-gold">96.2%</span>
          </div>
          <div className="font-display italic text-ice-100 text-[15px]">
            HuBERT · Praat · calibrated
          </div>
        </div>
      </motion.div>

      {/* Scroll cue */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 0.9 }}
        className="absolute bottom-10 left-1/2 -translate-x-1/2 hidden lg:flex flex-col items-center gap-2"
      >
        <span className="text-[10px] uppercase tracking-[0.3em] text-ice-500">Scroll</span>
        <span className="relative w-px h-10 bg-white/10 overflow-hidden">
          <span className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-gold to-transparent animate-scroll-cue" />
        </span>
      </motion.div>
    </section>
  );
}
