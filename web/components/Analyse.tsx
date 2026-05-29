"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Mic, Upload, Square, RotateCcw, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { analyseAudio, type AnalysisResponse } from "@/lib/api";
import { pushHistory } from "@/lib/history";

type Status = "idle" | "recording" | "analysing" | "done" | "error";

const labelDisplay: Record<string, string> = {
  control: "Control",
  dysarthria: "Dysarthria",
  aphasia: "Aphasia",
  ua_speech: "Atypical Speech",
};

export default function Analyse() {
  const [status, setStatus] = useState<Status>("idle");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);

  const reset = () => {
    setAudioBlob(null);
    setAudioUrl(null);
    setResult(null);
    setError(null);
    setStatus("idle");
    setElapsed(0);
  };

  const startRecording = async () => {
    reset();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      mr.ondataavailable = (e) => chunks.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      recorderRef.current = mr;
      setStatus("recording");
      setElapsed(0);
      timerRef.current = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Microphone unavailable");
      setStatus("error");
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setStatus("idle");
  };

  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  const onUpload = (file: File) => {
    reset();
    setAudioBlob(file);
    setAudioUrl(URL.createObjectURL(file));
  };

  const submit = async () => {
    if (!audioBlob) return;
    setStatus("analysing");
    setError(null);
    try {
      const r = await analyseAudio(audioBlob);
      setResult(r);
      pushHistory(r);
      setStatus("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Analysis failed");
      setStatus("error");
    }
  };

  return (
    <section id="analyse" className="relative px-6 sm:px-12 max-w-5xl mx-auto py-24">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <span className="eyebrow">Live Analysis</span>
        <h2 className="display text-4xl sm:text-5xl mt-6 mb-4 gradient-title">
          Upload or record a voice sample.
        </h2>
        <p className="text-ice-100/65 max-w-2xl text-lg leading-relaxed mb-12">
          Ten to thirty seconds of natural speech is ideal. The model adaptively
          decides which deeper analysis paths to run based on what it hears.
        </p>
      </motion.div>

      <div className="glass-strong p-8 sm:p-12">
        {/* Recorder / uploader */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <button
            onClick={status === "recording" ? stopRecording : startRecording}
            className={`group relative overflow-hidden rounded-2xl p-8 border transition-all duration-300
                        ${status === "recording"
                          ? "border-red-400/60 bg-red-500/10"
                          : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-gold/40"}`}
          >
            <div className="flex flex-col items-center text-center">
              <span className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4
                                ${status === "recording" ? "bg-red-500/20 text-red-200" : "bg-gold/15 text-gold-soft"}`}>
                {status === "recording" ? <Square className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </span>
              <div className="font-display text-xl text-ice-50">
                {status === "recording" ? `Recording · ${elapsed}s` : "Record from microphone"}
              </div>
              <div className="text-sm text-ice-100/55 mt-2">
                {status === "recording" ? "Click to stop" : "Tap once · we’ll handle the rest"}
              </div>
            </div>
            {status === "recording" && (
              <motion.div
                aria-hidden
                className="absolute bottom-0 left-0 h-0.5 bg-red-400"
                initial={{ width: 0 }}
                animate={{ width: "100%" }}
                transition={{ duration: 30, ease: "linear" }}
              />
            )}
          </button>

          <label className="relative rounded-2xl p-8 border border-white/10 bg-white/[0.03]
                            hover:bg-white/[0.06] hover:border-gold/40 transition-all duration-300
                            cursor-pointer flex flex-col items-center text-center">
            <span className="w-14 h-14 rounded-2xl bg-gold/15 text-gold-soft flex items-center justify-center mb-4">
              <Upload className="w-6 h-6" />
            </span>
            <div className="font-display text-xl text-ice-50">Upload audio file</div>
            <div className="text-sm text-ice-100/55 mt-2">WAV, MP3, FLAC, M4A · max 25 MB</div>
            <input
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
            />
          </label>
        </div>

        {/* Preview + analyse */}
        <AnimatePresence>
          {audioUrl && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="mt-8 overflow-hidden"
            >
              <div className="glass p-5">
                <audio
                  src={audioUrl}
                  controls
                  className="w-full"
                  style={{ filter: "invert(0.92) hue-rotate(170deg) saturate(0.85)", borderRadius: 8 }}
                />
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  className="btn-primary"
                  onClick={submit}
                  disabled={status === "analysing"}
                >
                  {status === "analysing" ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Analysing…</>
                  ) : (
                    <>Run analysis</>
                  )}
                </button>
                <button className="btn-ghost" onClick={reset}>
                  <RotateCcw className="w-4 h-4" /> Reset
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-6 p-4 rounded-xl bg-red-500/10 border border-red-400/30 text-red-100 flex items-center gap-3"
            >
              <AlertCircle className="w-4 h-4" /> {error}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Result */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="mt-10"
          >
            <ResultBlock r={result} />
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function ResultBlock({ r }: { r: AnalysisResponse }) {
  const confColor =
    r.confidence_level === "high"   ? "from-gold/25 to-gold/5 border-gold/40" :
    r.confidence_level === "moderate" ? "from-gold/15 to-gold/5 border-gold/25" :
    "from-white/[0.05] to-transparent border-white/15";
  return (
    <div className="space-y-8">
      <div className={`glass-strong p-10 bg-gradient-to-br ${confColor}`}>
        <div className="flex items-center gap-3 mb-4">
          <CheckCircle2 className="w-5 h-5 text-ice-300" />
          <span className="text-xs uppercase tracking-[0.16em] font-semibold text-ice-300">
            Final Decision · {r.confidence_level} confidence
          </span>
        </div>
        <div className="display text-5xl gradient-title mb-2">
          {labelDisplay[r.label] ?? r.label}
        </div>
        <div className="font-mono text-2xl text-ice-200">{(r.confidence * 100).toFixed(1)}%</div>
        <p className="text-ice-100/70 mt-4 max-w-2xl leading-relaxed">{r.recommendation}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Object.entries(r.probabilities).map(([k, v]) => (
          <div key={k} className="glass p-5">
            <div className="text-xs uppercase tracking-wider text-ice-300/80">{labelDisplay[k] ?? k}</div>
            <div className="font-display text-3xl text-ice-50 mt-2 mb-3">{(v * 100).toFixed(0)}<span className="text-ice-100/40 text-xl">%</span></div>
            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-gold-deep to-gold-soft"
                initial={{ width: 0 }}
                animate={{ width: `${v * 100}%` }}
                transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Indicators */}
      <div className="glass p-8">
        <div className="section-heading">Acoustic indicators</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: "Jitter", v: r.indicators.jitter_pct.toFixed(2), unit: "%" },
            { label: "Shimmer", v: r.indicators.shimmer_pct.toFixed(2), unit: "%" },
            { label: "HNR", v: r.indicators.hnr_db.toFixed(1), unit: "dB" },
            { label: "CPP", v: r.indicators.cpp_db.toFixed(1), unit: "dB" },
            { label: "F0 mean", v: r.indicators.f0_mean_hz.toFixed(0), unit: "Hz" },
            { label: "Speech rate", v: r.indicators.speech_rate_est.toFixed(1), unit: "syl/s" },
          ].map((m) => (
            <div key={m.label} className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
              <div className="text-[10px] uppercase tracking-wider text-ice-300/80">{m.label}</div>
              <div className="font-display text-2xl text-ice-50 mt-1 leading-none">
                {m.v}<span className="text-xs text-ice-100/50 ml-1">{m.unit}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Reasoning trace */}
      <div className="glass p-8">
        <div className="section-heading">AI reasoning trace</div>
        <ol className="space-y-3">
          {r.trace.map((t, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-start gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]"
            >
              <span className="font-mono text-xs text-ice-300/80 mt-1 w-6 shrink-0">{String(i + 1).padStart(2, "0")}</span>
              <div className="flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="font-medium text-ice-50">{t.step}</div>
                  <div className="font-mono text-[11px] text-ice-100/40">{t.ms > 0 ? `${t.ms.toFixed(0)} ms` : "—"}</div>
                </div>
                <div className="text-sm text-ice-100/65 mt-1 leading-relaxed">{t.detail}</div>
              </div>
            </motion.li>
          ))}
        </ol>
      </div>
    </div>
  );
}
