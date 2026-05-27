"use client";
/**
 * Per-disorder explainer cards: real audio samples, animated motor signature,
 * and a clinical reading passage. Mirrors the Streamlit "Demonstrations" tab.
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { Volume2 } from "lucide-react";

type Disorder = "control" | "dysarthria" | "aphasia" | "atypical";

const DATA: Record<Disorder, {
  title: string;
  accent: string;
  description: string;
  passage: string;
  howToRead: string;
  gait: "steady" | "asymmetric" | "halting" | "tremor";
  sampleSlug: string;
}> = {
  control: {
    title: "Control — Healthy Speech",
    accent: "#6c9eff",
    description:
      "Smooth voicing, regular pitch contour, clean harmonic structure. Expected on connected reading: jitter < 2.5%, shimmer < 12%, HNR > 10 dB.",
    passage:
      "The rainbow is a division of white light into many beautiful colors. These take the shape of a long round arch, with its path high above, and its two ends apparently beyond the horizon.",
    howToRead: "Read in a relaxed, conversational pace. Even, sustained phonation.",
    gait: "steady",
    sampleSlug: "control",
  },
  dysarthria: {
    title: "Dysarthria — Motor Speech Disorder",
    accent: "#d4af6a",
    description:
      "Weak, slurred, or slow articulation from neuromuscular impairment (stroke, Parkinson's, ALS). Elevated jitter (>2.5%), shimmer (>10%), reduced HNR, narrowed pitch range.",
    passage:
      "Pa-ta-ka, pa-ta-ka, pa-ta-ka. The big black bug bit the big black bear. Methodist Episcopal. Aluminum linoleum.",
    howToRead:
      "Diadochokinetic (DDK) task. Try at maximum speed — uneven syllable timing or imprecise consonants resemble dysarthric speech.",
    gait: "asymmetric",
    sampleSlug: "dysarthria",
  },
  aphasia: {
    title: "Aphasia — Language Disorder",
    accent: "#a78bfa",
    description:
      "Difficulty producing or comprehending language, typically from left-hemisphere stroke. Halting speech, word-finding pauses, telegraphic phrases. Long voiceless gaps in acoustic envelope.",
    passage: "Cookie… the boy… falling. Stool. Mother… washing. Water… over.",
    howToRead:
      "Read with long unnatural pauses between content words. Omit function words (the, is, and). Mimics Broca-type non-fluent aphasia.",
    gait: "halting",
    sampleSlug: "aphasia",
  },
  atypical: {
    title: "Atypical Speech — Severe Intelligibility Loss",
    accent: "#ec4899",
    description:
      "Severely reduced intelligibility from cerebral palsy or advanced neuromotor disease. Highly irregular voicing, prolonged segments, very low HNR, extreme jitter/shimmer.",
    passage: "Aaaaa… uuuu… eee… (sustained vowels with intentional tremor)",
    howToRead:
      "Hold a vowel /a/ for 3 seconds with audible tremor and amplitude irregularity. Mimics UA-Speech atypical phonation.",
    gait: "tremor",
    sampleSlug: "ua_speech",
  },
};

export default function Demonstrations() {
  const [tab, setTab] = useState<Disorder>("control");
  const d = DATA[tab];
  return (
    <section id="demos" className="relative px-6 sm:px-12 max-w-7xl mx-auto py-24">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        <span className="eyebrow">Demonstrations</span>
        <h2 className="display text-4xl sm:text-5xl mt-6 mb-4 gradient-title">
          What each disorder sounds like.
        </h2>
        <p className="text-ice-100/65 max-w-2xl text-lg leading-relaxed">
          Listen to real patient samples, watch the motor signature, and read
          a clinical passage that produces a confident detection when mimicked.
        </p>
      </motion.div>

      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-2 mt-10 mb-8">
        {(Object.keys(DATA) as Disorder[]).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-full text-sm font-medium border transition-all
                        ${tab === k
                          ? "bg-ice-500/15 border-ice-400/40 text-ice-100"
                          : "bg-white/[0.03] border-white/[0.08] text-ice-100/55 hover:text-ice-100/85 hover:border-white/15"}`}
          >
            {DATA[k].title.split(" — ")[0]}
          </button>
        ))}
      </div>

      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="glass-strong p-8 sm:p-12"
      >
        <div
          className="rounded-2xl border-l-4 px-5 py-4 mb-8 bg-white/[0.03]"
          style={{ borderColor: d.accent }}
        >
          <h3 className="display text-2xl mb-2 text-ice-50">{d.title}</h3>
          <p className="text-ice-100/65 leading-relaxed">{d.description}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Audio samples */}
          <div>
            <div className="section-heading">Real patient samples</div>
            <div className="space-y-3 mt-2">
              {[1, 2].map((i) => (
                <div key={i} className="glass p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Volume2 className="w-4 h-4 text-ice-300" />
                    <span className="text-xs uppercase tracking-wider text-ice-300/80">
                      Sample {i}
                    </span>
                  </div>
                  <audio
                    src={`/samples/${d.sampleSlug}_${i}.wav`}
                    controls
                    className="w-full"
                    style={{ filter: "invert(0.92) hue-rotate(170deg) saturate(0.85)", borderRadius: 8 }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Motor signature */}
          <div>
            <div className="section-heading">Motor signature</div>
            <div className="glass p-6 mt-2 flex items-center justify-center min-h-[260px]">
              <MotorSignature gait={d.gait} accent={d.accent} />
            </div>
            <p className="text-xs text-ice-100/55 mt-3 italic">
              {{
                steady:     "Steady symmetric gait — control baseline",
                asymmetric: "Reduced stride, asymmetric arm swing — Parkinsonian-type",
                halting:    "Halting, intermittent freezing — Broca-aphasic analogue",
                tremor:     "High-frequency tremor — atypical neuromotor",
              }[d.gait]}
            </p>
          </div>
        </div>

        {/* Reading passage */}
        <div className="mt-8">
          <div className="section-heading">Clinical reading passage</div>
          <blockquote
            className="font-display italic text-lg sm:text-xl leading-relaxed mt-2
                       p-6 rounded-2xl bg-white/[0.03] border-l-4"
            style={{ borderColor: d.accent }}
          >
            “{d.passage}”
          </blockquote>
          <p className="text-sm text-ice-100/65 mt-3">
            <span className="text-ice-300 font-medium">How to read:</span> {d.howToRead}
          </p>
        </div>
      </motion.div>
    </section>
  );
}

/* ─── 2D motor signature — stickman that walks/halts/tremors ─── */
function MotorSignature({
  gait, accent,
}: { gait: "steady" | "asymmetric" | "halting" | "tremor"; accent: string }) {
  // Loop durations (s) tuned per disorder
  const dur = { steady: 1.8, asymmetric: 2.2, halting: 2.6, tremor: 1.4 }[gait];
  // Side-to-side amplitude for the body, plus arm/leg phase offsets
  const sway = { steady: 4, asymmetric: 9, halting: 6, tremor: 14 }[gait];

  return (
    <svg viewBox="0 0 200 240" width="190" height="220" aria-hidden>
      <motion.g
        animate={{
          x: gait === "halting" ? [0, 0, 6, 6, 12] : [0, sway, -sway, 0],
          y: gait === "tremor" ? [0, -2, 2, -2, 0] : [0, -3, 0],
        }}
        transition={{
          duration: dur,
          repeat: Infinity,
          ease: gait === "halting" ? "linear" : "easeInOut",
          times: gait === "halting" ? [0, 0.25, 0.30, 0.7, 1] : undefined,
        }}
      >
        {/* Head */}
        <motion.circle
          cx="100" cy="46" r="18"
          fill="none" stroke={accent} strokeWidth="3"
          animate={gait === "tremor" ? { cx: [100, 101, 99, 100], cy: [46, 47, 45, 46] } : {}}
          transition={{ duration: 0.15, repeat: Infinity, ease: "linear" }}
        />
        {/* Body */}
        <line x1="100" y1="64" x2="100" y2="140" stroke={accent} strokeWidth="3" />
        {/* Arms */}
        <motion.line
          x1="100" y1="80" x2="62" y2="120"
          stroke={accent} strokeWidth="3"
          animate={{ x2: gait === "asymmetric" ? [62, 70, 62] : [62, 72, 62] }}
          transition={{ duration: dur, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.line
          x1="100" y1="80" x2="138" y2="120"
          stroke={accent} strokeWidth="3"
          animate={{ x2: gait === "asymmetric" ? [138, 134, 138] : [138, 128, 138] }}
          transition={{ duration: dur, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* Legs */}
        <motion.line
          x1="100" y1="140" x2="78" y2="200"
          stroke={accent} strokeWidth="3"
          animate={{ x2: [78, 84, 78], y2: [200, 195, 200] }}
          transition={{ duration: dur, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.line
          x1="100" y1="140" x2="122" y2="200"
          stroke={accent} strokeWidth="3"
          animate={{ x2: [122, 116, 122], y2: [200, 195, 200] }}
          transition={{ duration: dur, repeat: Infinity, ease: "easeInOut", delay: dur / 2 }}
        />
      </motion.g>
      {/* Ground line */}
      <line x1="20" y1="220" x2="180" y2="220" stroke={accent} strokeOpacity="0.3" strokeWidth="1" />
    </svg>
  );
}
