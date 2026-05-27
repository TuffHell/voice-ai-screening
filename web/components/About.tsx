"use client";
import { motion } from "framer-motion";

const facts = [
  ["78", "real-speaker dataset", "TORGO + UASpeech + LibriTTS + APROCSA"],
  ["11", "speakers held entirely out", "speaker-disjoint per-class test split"],
  ["96.21%", "speaker-disjoint test accuracy", "macro-F1 0.94"],
  ["0.089", "expected calibration error", "isotonic-calibrated outputs"],
];

export default function About() {
  return (
    <section id="about" className="relative px-6 sm:px-12 max-w-7xl mx-auto py-24">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        <span className="eyebrow">Honest by design</span>
        <h2 className="display text-4xl sm:text-5xl mt-6 mb-6 gradient-title max-w-3xl">
          A clinical-decision-support tool, not a diagnosis.
        </h2>
        <p className="text-ice-100/65 max-w-2xl text-lg leading-relaxed">
          Trained on speaker-disjoint real data. Every prediction comes with
          calibrated probabilities and a full reasoning trace, so a
          speech-language pathologist can review what the model heard before
          relying on it.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-14">
        {facts.map(([num, label, sub], i) => (
          <motion.div
            key={label}
            className="glass p-7"
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.6, delay: i * 0.07, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="font-display text-4xl text-ice-50 mb-2">{num}</div>
            <div className="text-sm font-medium text-ice-100">{label}</div>
            <div className="text-xs text-ice-100/55 mt-1.5">{sub}</div>
          </motion.div>
        ))}
      </div>

      <div className="mt-20 pt-10 border-t border-white/[0.08] text-xs text-ice-100/45 flex flex-wrap justify-between gap-4">
        <span>© 2026 Voice AI · Not a medical device</span>
        <span className="font-mono">HuBERT · Whisper · Praat · isotonic calibration</span>
      </div>
    </section>
  );
}
