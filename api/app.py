"""
Voice AI — FastAPI inference service for HuggingFace Spaces.

Exposes a single endpoint:
    POST /api/analyse  (multipart/form-data with `audio` file)

Returns the full analysis as JSON: prediction, probabilities, calibrated
indicators, reasoning trace, and the waveform thumbnail.
"""

from __future__ import annotations

import io
import os
import sys
import time
from pathlib import Path
from typing import Any

import librosa
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Make project importable
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from voice_ai.features import (
    extract_clinical_indicators,
    whisper_word_count,
    _pause_stats,
    _praat_indicators,
    _load_whisper,
)
from voice_ai_v2 import LABELS
from voice_ai_v2.model import VoiceModelV2, _make_prediction
from voice_ai_v2.preprocessing import preprocess as v2_preprocess
from voice_ai_v2.train import _softmax_np, _apply_calibrators


# ── App + CORS ────────────────────────────────────────────────────────────
# Only the live Vercel deployment, its preview branches, and local dev are
# allowed to call the API. Stops random sites from hot-linking the backend.
app = FastAPI(title="Voice AI", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://voice-ai-screening.vercel.app",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_origin_regex=r"https://voice-ai-screening-[\w\-]+\.vercel\.app",
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


# ── Model (loaded once at startup; cached for lifetime of process) ────────
_model: VoiceModelV2 | None = None


def get_model() -> VoiceModelV2:
    global _model
    if _model is None:
        model_dir = ROOT / "model_v2"
        _model = VoiceModelV2(model_dir=str(model_dir))
    return _model


@app.on_event("startup")
def _warm_up() -> None:
    get_model()
    # Whisper is loaded lazily on first analysis (faster cold-boot).


# ── API schema ────────────────────────────────────────────────────────────
class TraceStep(BaseModel):
    step: str
    ms: float
    detail: str


class IndicatorBlock(BaseModel):
    jitter_pct: float
    shimmer_pct: float
    hnr_db: float
    cpp_db: float
    f0_mean_hz: float
    f0_range_hz: float
    speech_rate_est: float
    voiced_frac: float
    n_pause_500ms: int
    n_pause_1s: int
    articulation_rate: float
    wpm: float
    transcript: str


class AnalysisResponse(BaseModel):
    label: str
    confidence: float
    confidence_level: str
    recommendation: str
    probabilities: dict[str, float]
    indicators: IndicatorBlock
    trace: list[TraceStep]
    duration_sec: float
    waveform: list[float]      # 500-point thumbnail
    waveform_t: list[float]    # corresponding times


# ── Helpers ────────────────────────────────────────────────────────────────
def _trace_step(trace: list[dict[str, Any]], step: str, t0: float, detail: str) -> None:
    trace.append({"step": step, "ms": (time.time() - t0) * 1000, "detail": detail})


def _analyse_bytes(audio_bytes: bytes, filename: str) -> AnalysisResponse:
    model = get_model()
    trace: list[dict[str, Any]] = []
    sr = 16_000

    # 1. Load + resample
    t0 = time.time()
    tmp_path = ROOT / "api" / f"_tmp_{os.getpid()}_{int(time.time() * 1000)}.wav"
    tmp_path.write_bytes(audio_bytes)
    try:
        raw, _ = librosa.load(str(tmp_path), sr=sr, mono=True)
        raw = raw.astype(np.float32)
        _trace_step(trace, "Load & resample", t0,
                    f"{len(raw) / sr:.2f}s @ 16 kHz mono")

        # 2. Match-train preprocessing
        t0 = time.time()
        proc = v2_preprocess(str(tmp_path), apply_vad=True, apply_denoise=False)
        if len(proc) < sr * 0.5:
            proc = v2_preprocess(str(tmp_path), apply_vad=False, apply_denoise=False)
            note = "VAD trimmed too aggressively — fell back to bandpass-only"
        else:
            note = f"{len(proc) / sr:.2f}s kept after VAD"
        _trace_step(trace, "Match-train preprocessing", t0,
                    f"{note}; −23 LUFS; 80–8000 Hz bandpass")
    finally:
        tmp_path.unlink(missing_ok=True)

    # 3. Praat indicators
    t0 = time.time()
    indicators = extract_clinical_indicators(raw, sr)
    cpp_res = _praat_indicators(raw, sr)
    cpp_db = float(cpp_res[3]) if cpp_res and len(cpp_res) > 3 and cpp_res[3] is not None else 0.0
    _trace_step(trace, "Praat acoustic indicators", t0,
                f"jitter={indicators.jitter_pct:.2f}% shimmer={indicators.shimmer_pct:.2f}% "
                f"HNR={indicators.hnr_db:.1f} dB CPP={cpp_db:.1f} dB F0={indicators.f0_mean_hz:.0f} Hz")

    # 4. Pause stats
    t0 = time.time()
    pstats = _pause_stats(raw, sr)
    _trace_step(trace, "Pause distribution", t0,
                f"voiced {pstats['voiced_frac']:.0%} · pauses ≥500ms: {pstats['n_pause_500ms']} · "
                f"≥1s: {pstats['n_pause_1s']} · articulation rate: {pstats['articulation_rate']:.2f}")

    # 5. Whisper (adaptive)
    t0 = time.time()
    duration_sec = len(raw) / sr
    aphasia_signal = (pstats["voiced_frac"] < 0.70
                      or pstats["n_pause_500ms"] >= 2
                      or pstats["n_pause_1s"] >= 1
                      or (0 < indicators.speech_rate_est < 3.5))
    voice_pathology_signal = ((indicators.hnr_db > 0 and indicators.hnr_db < 12)
                              or indicators.jitter_pct > 2.5
                              or indicators.shimmer_pct > 10)
    use_whisper = (duration_sec >= 4.0
                   and (aphasia_signal or duration_sec >= 8.0)
                   and not (voice_pathology_signal and duration_sec < 6.0))
    wpm_res = {"words": 0, "wpm": 0.0, "duration_sec": duration_sec, "transcript": ""}
    if use_whisper:
        try:
            if _load_whisper() is not None:
                wpm_res = whisper_word_count(raw, sr)
        except Exception:
            pass
    if wpm_res["wpm"] > 0:
        snippet = wpm_res["transcript"][:120]
        _trace_step(trace, "ASR → WPM", t0,
                    f"{wpm_res['words']} words / {wpm_res['duration_sec']:.1f}s "
                    f"= {wpm_res['wpm']:.0f} WPM. Heard: \"{snippet}\"")
    else:
        _trace_step(trace, "ASR → WPM", t0,
                    "auto-skipped (clip short or no aphasia signal)")

    # 6. Embedding (single pass)
    import torch
    t0 = time.time()
    proc_emb = proc[: int(sr * 10)]
    emb_main = model.embedder.embed(proc_emb, sr=sr)
    _trace_step(trace, "Deep speech embedding", t0,
                f"{emb_main.shape[0]}-dim from frozen HuBERT (analysed first {len(proc_emb)/sr:.1f}s)")

    # 7. Multi-window voting for clips ≥ 8 s
    window_probs: list[np.ndarray] = []
    window_winners: list[int] = []
    if len(proc) >= sr * 8:
        L = len(proc); w = int(sr * 5)
        windows = [
            proc[:w],
            proc[max(0, (L - w) // 2): max(0, (L - w) // 2) + w],
            proc[max(0, L - w):],
        ]
        t0 = time.time()
        for w_ in windows:
            wemb = model.embedder.embed(w_, sr=sr)
            wes = model.scaler.transform(wemb.reshape(1, -1))
            with torch.no_grad():
                wl = model.head(torch.tensor(
                    wes, dtype=torch.float32, device=model.device)).cpu().numpy()
            wp = _softmax_np(wl)[0]
            window_probs.append(wp)
            window_winners.append(int(wp.argmax()))
        win_summary = ", ".join(
            f"w{i+1}:{LABELS[w][:3]}({wp.max():.0%})"
            for i, (wp, w) in enumerate(zip(window_probs, window_winners))
        )
        _trace_step(trace, "Multi-window voting (3 × 5s)", t0, win_summary)

    # 8. Standardize + classify
    t0 = time.time()
    emb_s = model.scaler.transform(emb_main.reshape(1, -1))
    with torch.no_grad():
        logits = model.head(torch.tensor(
            emb_s, dtype=torch.float32, device=model.device)).cpu().numpy()
    raw_probs = _softmax_np(logits)
    _trace_step(trace, "Classifier head (MLP)", t0,
                f"softmax: {dict(zip(LABELS, [f'{p:.2f}' for p in raw_probs[0]]))}")

    # 9. Isotonic calibration
    t0 = time.time()
    probs_cal = _apply_calibrators(raw_probs, model.calibrators)[0]
    _trace_step(trace, "Isotonic calibration", t0,
                f"calibrated: {dict(zip(LABELS, [f'{p:.2f}' for p in probs_cal]))}")

    # 10. Multi-window averaging (no class-specific boost)
    if window_probs:
        all_probs = np.stack([probs_cal] + window_probs, axis=0)
        probs_cal = np.mean(all_probs, axis=0)
        probs_cal = probs_cal / probs_cal.sum()
        full_winner = int(probs_cal.argmax())
        n_agree = sum(1 for w in window_winners if w == full_winner)
        _trace_step(trace, "Window-probability averaging", 0,
                    f"{n_agree}/3 windows agree; final: "
                    f"{dict(zip(LABELS, [f'{p:.2f}' for p in probs_cal]))}")

    # 11. Final prediction
    pred = _make_prediction(probs_cal)
    trace.append({
        "step": "Final decision", "ms": 0,
        "detail": f"argmax → {pred.label} ({pred.confidence:.1%}, {pred.confidence_level})",
    })

    # Waveform thumbnail (500 points)
    step = max(1, len(raw) // 500)
    times = (np.arange(0, len(raw), step) / sr).tolist()
    waveform = raw[::step].astype(float).tolist()

    return AnalysisResponse(
        label=pred.label,
        confidence=float(pred.confidence),
        confidence_level=pred.confidence_level,
        recommendation=pred.recommendation,
        probabilities={k: float(v) for k, v in pred.probabilities.items()},
        indicators=IndicatorBlock(
            jitter_pct=indicators.jitter_pct,
            shimmer_pct=indicators.shimmer_pct,
            hnr_db=indicators.hnr_db,
            cpp_db=cpp_db,
            f0_mean_hz=indicators.f0_mean_hz,
            f0_range_hz=indicators.f0_range_hz,
            speech_rate_est=indicators.speech_rate_est,
            voiced_frac=float(pstats["voiced_frac"]),
            n_pause_500ms=int(pstats["n_pause_500ms"]),
            n_pause_1s=int(pstats["n_pause_1s"]),
            articulation_rate=float(pstats["articulation_rate"]),
            wpm=float(wpm_res["wpm"]),
            transcript=wpm_res["transcript"],
        ),
        trace=[TraceStep(**s) for s in trace],
        duration_sec=duration_sec,
        waveform=waveform[:500],
        waveform_t=times[:500],
    )


# ── Routes ────────────────────────────────────────────────────────────────
@app.get("/")
def root() -> dict[str, str]:
    return {
        "service": "Voice AI",
        "model": "HuBERT-base + Praat + adaptive Whisper",
        "endpoints": ["/api/health", "/api/analyse"],
    }


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "model_loaded": _model is not None,
        "labels": LABELS,
    }


@app.post("/api/analyse", response_model=AnalysisResponse)
async def analyse(audio: UploadFile = File(...)) -> AnalysisResponse:
    if not audio.filename:
        raise HTTPException(status_code=400, detail="missing audio file")
    data = await audio.read()
    if len(data) < 1024:
        raise HTTPException(status_code=400, detail="audio file too small")
    try:
        return _analyse_bytes(data, audio.filename)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"analysis failed: {exc}") from exc
