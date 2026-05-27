"use client";
/**
 * Session history (localStorage). Mirrors the Streamlit "History" tab —
 * shows each analysis with timestamp, label, confidence and top indicators.
 */
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, FileBarChart2 } from "lucide-react";
import { loadHistory, clearHistory, type HistoryEntry } from "@/lib/history";

const LABEL_DISPLAY: Record<string, string> = {
  control: "Control",
  dysarthria: "Dysarthria",
  aphasia: "Aphasia",
  ua_speech: "Atypical Speech",
};

export default function History() {
  const [items, setItems] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    setItems(loadHistory());
    const onChange = () => setItems(loadHistory());
    window.addEventListener("voiceai-history-changed", onChange);
    return () => window.removeEventListener("voiceai-history-changed", onChange);
  }, []);

  return (
    <section id="history" className="relative px-6 sm:px-12 max-w-7xl mx-auto py-24">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-end justify-between flex-wrap gap-4 mb-10"
      >
        <div>
          <span className="eyebrow">Session History</span>
          <h2 className="display text-4xl sm:text-5xl mt-6 mb-3 gradient-title">
            Every analysis from this device.
          </h2>
          <p className="text-ice-100/65 max-w-xl">
            Stored locally in your browser only — nothing leaves the device
            once the analysis is complete.
          </p>
        </div>
        {items.length > 0 && (
          <button onClick={() => clearHistory()} className="btn-ghost">
            <Trash2 className="w-4 h-4" /> Clear history
          </button>
        )}
      </motion.div>

      {items.length === 0 ? (
        <div className="glass p-10 text-center">
          <FileBarChart2 className="w-8 h-8 mx-auto mb-4 text-ice-300/60" />
          <p className="text-ice-100/55">
            No analyses yet — head back to{" "}
            <a href="#analyse" className="text-ice-300 hover:underline">Begin analysis</a>{" "}
            to record your first one.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <AnimatePresence initial={false}>
            {items.map((h, i) => (
              <motion.div
                key={h.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.4, delay: i * 0.03, ease: [0.16, 1, 0.3, 1] }}
                className="glass p-6"
              >
                <div className="flex items-baseline justify-between gap-4 mb-3">
                  <div>
                    <div className="font-display text-2xl text-ice-50">
                      {LABEL_DISPLAY[h.label] ?? h.label}
                    </div>
                    <div className="text-xs text-ice-100/50 mt-0.5 font-mono">
                      {new Date(h.at).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-xl text-ice-200">
                      {(h.confidence * 100).toFixed(0)}%
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-ice-100/50">
                      {h.level}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-5 gap-3 mt-4 pt-4 border-t border-white/[0.06]">
                  {[
                    ["Jitter",  h.top_indicators.jitter_pct.toFixed(2), "%"],
                    ["Shimmer", h.top_indicators.shimmer_pct.toFixed(2), "%"],
                    ["HNR",     h.top_indicators.hnr_db.toFixed(1), "dB"],
                    ["Rate",    h.top_indicators.speech_rate_est.toFixed(1), "syl/s"],
                    ["WPM",     h.top_indicators.wpm > 0 ? h.top_indicators.wpm.toFixed(0) : "—", ""],
                  ].map(([label, val, unit]) => (
                    <div key={label} className="text-center">
                      <div className="text-[10px] uppercase tracking-wider text-ice-100/40">{label}</div>
                      <div className="font-mono text-sm text-ice-100 mt-1">
                        {val}<span className="text-ice-100/40 ml-0.5 text-[10px]">{unit}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="text-[11px] text-ice-100/40 mt-3">
                  Recording length: {h.duration_sec.toFixed(1)}s
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
}
