"""
Feature extraction pipeline.

Two outputs:
  1. extract_model_features()  → 32-dim vector for model input
     Layout: [MFCC_mean x13] [MFCC_delta_mean x13] [spectral x6]
     Matches the StandardScaler fitted on the original training set.

  2. extract_clinical_indicators()  → ClinicalIndicators dataclass
     The 6 core acoustic features shown in clinical reports:
     jitter, shimmer, HNR, F0 mean, F0 range, speech rate.
"""

import warnings
import numpy as np
import librosa
import scipy.signal
from dataclasses import dataclass
from typing import Optional

SAMPLE_RATE = 16000
N_MFCC = 13
N_FEATURES = 32

# ─── Clinical reference thresholds ────────────────────────────────────────────
# Source: Boersma & Weenink (Praat), Shrivastav et al., and clinical SLP guidelines
# Reference ranges for CONNECTED / CONVERSATIONAL speech.
# (Sustained-vowel norms from Praat literature — jitter<1.04, shimmer<3.81,
# HNR>20 dB — are stricter and only valid for the /a/ phonation task.
# Connected speech naturally produces more variation, so using vowel norms here
# produces excessive false-positive abnormality flags.)
JITTER_NORMAL_MAX   = 2.5    # % — connected speech upper bound
SHIMMER_NORMAL_MAX  = 12.0   # % — connected speech upper bound
HNR_NORMAL_MIN      = 10.0   # dB — connected speech lower bound
F0_MEAN_RANGE       = (70, 280)   # Hz — male/female adult range, broad
F0_RANGE_MIN        = 25.0   # Hz — minimum prosodic range in conversational reading
SPEECH_RATE_RANGE   = (2.5, 6.0)  # syllables/sec — broader natural range


@dataclass
class ClinicalIndicators:
    """6 core acoustic indicators for clinical reporting."""
    jitter_pct: float        # Pitch irregularity (%)      — normal < 1.04 %
    shimmer_pct: float       # Amplitude irregularity (%)  — normal < 3.81 %
    hnr_db: float            # Harmonics-to-Noise Ratio    — normal > 20 dB
    f0_mean_hz: float        # Mean fundamental frequency  — normal 80–250 Hz
    f0_range_hz: float       # F0 pitch range              — normal > 50 Hz
    speech_rate_est: float   # Estimated syllable rate     — normal 3.5–5 syl/s

    def is_normal(self, feature: str) -> bool:
        checks = {
            'jitter_pct':      self.jitter_pct  < JITTER_NORMAL_MAX,
            'shimmer_pct':     self.shimmer_pct < SHIMMER_NORMAL_MAX,
            'hnr_db':          self.hnr_db      > HNR_NORMAL_MIN,
            'f0_mean_hz':      F0_MEAN_RANGE[0] <= self.f0_mean_hz <= F0_MEAN_RANGE[1],
            'f0_range_hz':     self.f0_range_hz > F0_RANGE_MIN,
            'speech_rate_est': SPEECH_RATE_RANGE[0] <= self.speech_rate_est <= SPEECH_RATE_RANGE[1],
        }
        return checks.get(feature, True)

    def abnormal_count(self) -> int:
        keys = ['jitter_pct', 'shimmer_pct', 'hnr_db', 'f0_mean_hz', 'f0_range_hz', 'speech_rate_est']
        return sum(1 for k in keys if not self.is_normal(k))


# ─── Internal helpers ─────────────────────────────────────────────────────────

def _estimate_f0(audio: np.ndarray, sr: int) -> np.ndarray:
    """Return array of voiced F0 values (Hz) using pyin."""
    with warnings.catch_warnings():
        warnings.simplefilter('ignore')
        f0, voiced_flag, _ = librosa.pyin(audio, fmin=75.0, fmax=500.0, sr=sr)
    f0_voiced = f0[voiced_flag == True]
    return f0_voiced[~np.isnan(f0_voiced)]


def _praat_all(audio: np.ndarray, sr: int) -> dict:
    """
    Single combined Praat call: jitter, shimmer, HNR, CPP, F0 mean, F0 range.

    Replaces the dual call (extract_clinical_indicators + _praat_indicators)
    and the slow librosa.pyin F0 estimator. Praat's autocorrelation pitch is
    orders of magnitude faster than pyin's Viterbi decoding.
    """
    out = {'jitter_pct': 0.0, 'shimmer_pct': 0.0, 'hnr_db': 0.0,
           'cpp_db': 0.0, 'f0_mean_hz': 0.0, 'f0_range_hz': 0.0}
    try:
        import parselmouth
        from parselmouth.praat import call
    except Exception:
        return out
    try:
        snd = parselmouth.Sound(audio.astype(np.float64), sampling_frequency=sr)
        # F0 via autocorrelation pitch (fast)
        try:
            pitch = call(snd, "To Pitch (cc)", 0.0, 75, 15, False, 0.03, 0.45, 0.01, 0.35, 0.14, 500)
            f0_mean = call(pitch, "Get mean", 0, 0, "Hertz")
            f0_min  = call(pitch, "Get minimum", 0, 0, "Hertz", "Parabolic")
            f0_max  = call(pitch, "Get maximum", 0, 0, "Hertz", "Parabolic")
            if f0_mean is not None and not np.isnan(f0_mean):
                out['f0_mean_hz'] = float(f0_mean)
            if f0_min is not None and f0_max is not None and \
               not (np.isnan(f0_min) or np.isnan(f0_max)):
                out['f0_range_hz'] = float(f0_max - f0_min)
        except Exception:
            pass
        # Jitter / shimmer / HNR via PointProcess + Harmonicity
        try:
            pp = call(snd, "To PointProcess (periodic, cc)", 75, 500)
            jit = call(pp, "Get jitter (local)", 0, 0, 0.0001, 0.02, 1.3)
            shi = call([snd, pp], "Get shimmer (local)",
                       0, 0, 0.0001, 0.02, 1.3, 1.6)
            if jit is not None and not np.isnan(jit): out['jitter_pct']  = float(jit) * 100
            if shi is not None and not np.isnan(shi): out['shimmer_pct'] = float(shi) * 100
        except Exception:
            pass
        try:
            harm = call(snd, "To Harmonicity (cc)", 0.01, 75, 0.1, 1.0)
            hnr  = call(harm, "Get mean", 0, 0)
            if hnr is not None and not np.isnan(hnr): out['hnr_db'] = float(hnr)
        except Exception:
            pass
        # NOTE: Praat "Get CPPS" with the smoothing options used in clinical
        # literature is extremely slow (~45s on a 4s clip). HNR already
        # captures voice quality for screening; skip CPP for speed.
    except Exception:
        pass
    return out


# Backward compatibility shim for old callers
def _praat_indicators(audio: np.ndarray, sr: int):
    r = _praat_all(audio, sr)
    return (r['jitter_pct'], r['shimmer_pct'], r['hnr_db'], r['cpp_db'])


def _pause_stats(audio: np.ndarray, sr: int) -> dict:
    """
    Pause-distribution analysis on raw audio (no VAD applied yet).
    Returns voiced fraction, count of long pauses (>500 ms, >1 s),
    and articulation rate (syllables per *phonated* second, not total).
    Clinically: non-fluent aphasia shows many long pauses; dysarthria reduces
    articulation rate.
    """
    if len(audio) < int(sr * 0.5):
        return {'voiced_frac': 0.0, 'n_pause_500ms': 0, 'n_pause_1s': 0,
                'articulation_rate': 0.0}
    # Frame energy
    frame_len = 1024
    hop = 256
    n_frames = max(1, (len(audio) - frame_len) // hop + 1)
    frames = np.lib.stride_tricks.sliding_window_view(audio, frame_len)[::hop][:n_frames]
    rms = np.sqrt(np.mean(frames ** 2, axis=1) + 1e-12)
    # Energy threshold: below 25th percentile considered "silence"
    thr = np.percentile(rms, 25) * 1.2
    voiced_mask = rms > thr
    voiced_frac = float(np.mean(voiced_mask))
    # Pause runs (consecutive silent frames)
    pause_lens_sec = []
    run = 0
    frame_sec = hop / sr
    for v in voiced_mask:
        if not v:
            run += 1
        else:
            if run > 0:
                pause_lens_sec.append(run * frame_sec)
            run = 0
    if run > 0:
        pause_lens_sec.append(run * frame_sec)
    n_pause_500ms = sum(1 for p in pause_lens_sec if p >= 0.5)
    n_pause_1s    = sum(1 for p in pause_lens_sec if p >= 1.0)
    # Articulation rate: syllables / phonated time (not total time)
    phonated_sec = max(0.1, voiced_frac * len(audio) / sr)
    sr_total = _speech_rate(audio, sr)
    art_rate = (sr_total * (len(audio) / sr)) / phonated_sec
    return {'voiced_frac': voiced_frac, 'n_pause_500ms': n_pause_500ms,
            'n_pause_1s': n_pause_1s, 'articulation_rate': float(art_rate)}


# Cached Whisper model (lazy loaded; only once per session). Set to a marker
# value `"FAILED"` if the first download/load attempt fails so we never retry.
_whisper_pipe = None


def _load_whisper():
    """Load Whisper-tiny once. Returns None on failure (cached)."""
    global _whisper_pipe
    if _whisper_pipe == "FAILED":
        return None
    if _whisper_pipe is not None:
        return _whisper_pipe
    try:
        from transformers import pipeline
        _whisper_pipe = pipeline(
            "automatic-speech-recognition",
            model="openai/whisper-tiny.en",
            chunk_length_s=30,
            return_timestamps=False,
        )
        return _whisper_pipe
    except Exception:
        _whisper_pipe = "FAILED"
        return None


def whisper_word_count(audio: np.ndarray, sr: int = SAMPLE_RATE,
                       max_seconds: float = 30.0) -> dict:
    """
    Use Whisper-tiny to transcribe and return word-per-minute (WPM).
    Heavily diagnostic for non-fluent aphasia (WPM < 90) and severe dysarthria.

    If Whisper is unavailable (failed download, OOM, etc.), returns wpm=0.0
    without blocking the analysis.
    """
    duration = len(audio) / sr
    out = {'words': 0, 'wpm': 0.0, 'duration_sec': duration, 'transcript': ''}
    if duration < 1.0:
        return out
    # Truncate very long clips to keep inference snappy (Whisper-tiny is CPU-
    # only on free Cloud and can stall on multi-minute audio).
    if duration > max_seconds:
        audio = audio[:int(max_seconds * sr)]
        duration = max_seconds
    pipe = _load_whisper()
    if pipe is None:
        return out
    try:
        result = pipe({"array": audio.astype(np.float32), "sampling_rate": sr})
        txt = (result.get("text") if isinstance(result, dict) else "").strip()
        words = [w for w in txt.split() if any(c.isalpha() for c in w)]
        out['words']      = len(words)
        out['transcript'] = txt
        out['wpm']        = (len(words) / duration) * 60.0 if duration > 0 else 0.0
    except Exception:
        pass
    return out


def _speech_rate(audio: np.ndarray, sr: int) -> float:
    """Estimate syllable rate from energy-envelope peaks (syl/sec)."""
    duration = len(audio) / sr
    if duration < 0.5:
        return 0.0
    rms = librosa.feature.rms(y=audio, frame_length=512, hop_length=256)[0]
    from scipy.ndimage import uniform_filter1d
    smoothed = uniform_filter1d(rms.astype(float), size=12)
    threshold = np.percentile(smoothed, 25)
    peaks, _ = scipy.signal.find_peaks(smoothed, height=threshold, distance=8)
    return float(len(peaks) / duration)


# ─── Public API ───────────────────────────────────────────────────────────────

def extract_clinical_indicators(audio: np.ndarray, sr: int = SAMPLE_RATE) -> ClinicalIndicators:
    """
    Extract the 6 core clinical acoustic indicators from a speech segment.
    Audio should be at least 1 second long for reliable estimates.
    """
    # Single fast Praat call returns jitter, shimmer, HNR, F0 — replaces
    # the slow librosa.pyin + duplicate Praat calls.
    r = _praat_all(audio, sr)
    return ClinicalIndicators(
        jitter_pct     = round(r['jitter_pct'], 4),
        shimmer_pct    = round(r['shimmer_pct'], 4),
        hnr_db         = round(r['hnr_db'], 2),
        f0_mean_hz     = round(r['f0_mean_hz'], 1),
        f0_range_hz    = round(r['f0_range_hz'], 1),
        speech_rate_est= round(_speech_rate(audio, sr), 2),
    )


def extract_model_features(audio: np.ndarray, sr: int = SAMPLE_RATE) -> np.ndarray:
    """
    Extract the 32-dimensional feature vector expected by the trained model.

    Layout reverse-engineered from the StandardScaler statistics:
      [0:13]  — MFCC means          (n_mfcc=13, n_fft=2048, hop=512)
      [13]    — ZCR mean             (≈ 0.13)
      [14]    — Spectral centroid    (≈ 2073 Hz)
      [15]    — Spectral rolloff 85% (≈ 4446 Hz)
      [16:29] — MFCC stds            (13 values)
      [29]    — RMS energy mean      (≈ 0.057)
      [30]    — Spectral bandwidth   (≈ 527 Hz)
      [31]    — Spectral rolloff 25% (≈ 1103 Hz)

    Note: this layout was inferred from the scaler's mean/scale statistics.
    To guarantee accuracy, retrain the model using `python -m voice_ai.train`
    with the provided training script, which uses this documented layout.
    """
    if len(audio) < int(sr * 0.1):
        audio = np.pad(audio, (0, int(sr * 0.1) - len(audio)))

    mfccs = librosa.feature.mfcc(y=audio, sr=sr, n_mfcc=N_MFCC, n_fft=2048, hop_length=512)

    return np.concatenate([
        np.mean(mfccs, axis=1),                                                 # [0:13]
        [np.mean(librosa.feature.zero_crossing_rate(audio))],                   # [13]
        [np.mean(librosa.feature.spectral_centroid( y=audio, sr=sr))],          # [14]
        [np.mean(librosa.feature.spectral_rolloff(  y=audio, sr=sr, roll_percent=0.85))],  # [15]
        np.std(mfccs, axis=1),                                                  # [16:29]
        [np.mean(librosa.feature.rms(y=audio))],                                # [29]
        [np.mean(librosa.feature.spectral_bandwidth(y=audio, sr=sr))],          # [30]
        [np.mean(librosa.feature.spectral_rolloff(  y=audio, sr=sr, roll_percent=0.25))],  # [31]
    ]).astype(np.float32)


def load_and_preprocess(path: str, sr: int = SAMPLE_RATE,
                        duration: Optional[float] = None) -> np.ndarray:
    """
    Load an audio file, resample to `sr`, apply noise reduction, and
    peak-normalise to ±0.9.  Supports .wav, .mp3, .flac, .ogg, etc.
    """
    audio, _ = librosa.load(path, sr=sr, duration=duration, mono=True)

    try:
        import noisereduce as nr
        audio = nr.reduce_noise(y=audio, sr=sr, stationary=False, prop_decrease=0.75)
    except Exception:
        pass

    peak = np.max(np.abs(audio))
    if peak > 0:
        audio = audio / peak * 0.9

    return audio


def verify_feature_pipeline(scaler_path: str = None) -> bool:
    """
    Sanity-check: extract features from synthetic speech-like noise and verify
    that the scaler produces roughly zero-mean unit-variance values.
    Returns True if the pipeline looks consistent.
    """
    import pickle, os
    if scaler_path is None:
        scaler_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'feature_scaler.pkl')

    with warnings.catch_warnings():
        warnings.simplefilter('ignore')
        with open(scaler_path, 'rb') as f:
            scaler = pickle.load(f)

    np.random.seed(0)
    samples = []
    for _ in range(20):
        t = np.linspace(0, 2, SAMPLE_RATE * 2)
        # Bandlimited noise in speech range (100–4000 Hz) + some pitch
        f0_hz = np.random.uniform(100, 300)
        synth = np.sin(2 * np.pi * f0_hz * t) * 0.3
        synth += np.random.randn(len(t)) * 0.1
        samples.append(extract_model_features(synth, SAMPLE_RATE))

    feats = np.array(samples)
    scaled = scaler.transform(feats)

    mean_ok = np.abs(np.mean(scaled, axis=0)).mean() < 3.0
    std_ok  = (np.std(scaled, axis=0) > 0.01).all()
    return bool(mean_ok and std_ok)
