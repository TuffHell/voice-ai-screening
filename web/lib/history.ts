/**
 * Tiny localStorage-backed history of analyses for the current browser.
 * Keeps the last 50 entries.
 */
import type { AnalysisResponse } from "./api";

export interface HistoryEntry {
  id: string;
  at: number;
  label: string;
  confidence: number;
  level: AnalysisResponse["confidence_level"];
  duration_sec: number;
  top_indicators: {
    jitter_pct: number;
    shimmer_pct: number;
    hnr_db: number;
    speech_rate_est: number;
    wpm: number;
  };
}

const KEY = "voiceai.history.v1";
const MAX = 50;

export function loadHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as HistoryEntry[];
  } catch {
    return [];
  }
}

export function pushHistory(r: AnalysisResponse): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  const next: HistoryEntry = {
    id: crypto.randomUUID(),
    at: Date.now(),
    label: r.label,
    confidence: r.confidence,
    level: r.confidence_level,
    duration_sec: r.duration_sec,
    top_indicators: {
      jitter_pct: r.indicators.jitter_pct,
      shimmer_pct: r.indicators.shimmer_pct,
      hnr_db: r.indicators.hnr_db,
      speech_rate_est: r.indicators.speech_rate_est,
      wpm: r.indicators.wpm,
    },
  };
  const prev = loadHistory();
  const updated = [next, ...prev].slice(0, MAX);
  window.localStorage.setItem(KEY, JSON.stringify(updated));
  window.dispatchEvent(new CustomEvent("voiceai-history-changed"));
  return updated;
}

export function clearHistory(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent("voiceai-history-changed"));
}
