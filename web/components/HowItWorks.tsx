"use client";
import { motion } from "framer-motion";
import { Activity, Brain, Sparkles, Stethoscope } from "lucide-react";

const steps = [
  {
    icon: Activity,
    label: "01 · Acoustic Preprocessing",
    title: "Train-matched signal pipeline",
    body: "Silero VAD removes silence, 80–8000 Hz Butterworth bandpass restores the speech band, EBU R128 normalises loudness to −23 LUFS — the exact pipeline the model saw during training.",
  },
  {
    icon: Brain,
    label: "02 · Deep Speech Encoder",
    title: "Frozen HuBERT-base, 1 536-dim embedding",
    body: "Facebook’s self-supervised speech transformer produces a mean-and-standard-deviation pooled embedding. Frozen weights, calibrated head — robust, fast, fully auditable.",
  },
  {
    icon: Stethoscope,
    label: "03 · Praat-Grade Indicators",
    title: "Six clinically-validated measurements",
    body: "Cycle-by-cycle jitter, shimmer, HNR, cepstral peak prominence, fundamental frequency, syllable rate — the gold-standard set used by speech-language pathologists.",
  },
  {
    icon: Sparkles,
    label: "04 · Calibrated Probabilities",
    title: "Isotonic regression + multi-window voting",
    body: "Per-class probability calibration on a held-out validation set produces outputs that match observed frequencies. ECE 0.089 — interpretable, defensible.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="relative px-6 sm:px-12 max-w-7xl mx-auto py-24">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        <span className="eyebrow">Architecture</span>
        <h2 className="display text-4xl sm:text-5xl mt-6 mb-4 gradient-title">
          Four stages, fully auditable.
        </h2>
        <p className="text-ice-100/65 max-w-2xl text-lg leading-relaxed">
          Every analysis exposes the exact intermediate values at every step.
          No black box, no marketing fluff. Designed for clinical workflows
          where each decision needs to be defended.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-14">
        {steps.map((s, i) => (
          <motion.div
            key={s.label}
            className="glass p-8 group relative overflow-hidden"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.65, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-gold/[0.06] to-transparent opacity-0
                            group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
            <div className="relative">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-gold/12 border border-gold/25
                                 flex items-center justify-center text-gold-soft">
                  <s.icon className="w-5 h-5" />
                </span>
                <span className="text-xs font-mono tracking-widest text-gold/80 uppercase">
                  {s.label}
                </span>
              </div>
              <h3 className="display text-2xl mt-5 mb-3 text-ice-50">
                {s.title}
              </h3>
              <p className="text-ice-100/65 leading-relaxed">{s.body}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
