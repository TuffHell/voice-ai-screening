export type TraceStep = { step: string; ms: number; detail: string };

export type IndicatorBlock = {
  jitter_pct: number;
  shimmer_pct: number;
  hnr_db: number;
  cpp_db: number;
  f0_mean_hz: number;
  f0_range_hz: number;
  speech_rate_est: number;
  voiced_frac: number;
  n_pause_500ms: number;
  n_pause_1s: number;
  articulation_rate: number;
  wpm: number;
  transcript: string;
};

export type AnalysisResponse = {
  label: string;
  confidence: number;
  confidence_level: "high" | "moderate" | "uncertain";
  recommendation: string;
  probabilities: Record<string, number>;
  indicators: IndicatorBlock;
  trace: TraceStep[];
  duration_sec: number;
  waveform: number[];
  waveform_t: number[];
};

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:7860";

export async function analyseAudio(blob: Blob, filename = "recording.wav"): Promise<AnalysisResponse> {
  const form = new FormData();
  form.append("audio", blob, filename);
  const res = await fetch(`${API_URL}/api/analyse`, { method: "POST", body: form });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Analysis failed (${res.status}): ${text}`);
  }
  return (await res.json()) as AnalysisResponse;
}
