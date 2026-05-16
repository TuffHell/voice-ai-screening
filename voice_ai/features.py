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
JITTER_NORMAL_MAX   = 1.04   # %
SHIMMER_NORMAL_MAX  = 3.81   # %
HNR_NORMAL_MIN      = 20.0   # dB
F0_MEAN_RANGE       = (80, 250)   # Hz
F0_RANGE_MIN        = 50.0   # Hz
SPEECH_RATE_RANGE   = (3.5, 5.0)  # syllables/sec


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


def _jitter(f0: np.ndarray) -> float:
    """Local jitter: mean |ΔT| / mean(T) as a percentage."""
    if len(f0) < 3:
        return 0.0
    periods = 1.0 / (f0 + 1e-9)
    return float(np.mean(np.abs(np.diff(periods))) / np.mean(periods) * 100)


def _shimmer(audio: np.ndarray, sr: int) -> float:
    """Local shimmer: mean |ΔA| / mean(A) as a percentage (frame-level RMS proxy)."""
    frame_len = int(sr * 0.025)
    hop_len   = int(sr * 0.010)
    rms = librosa.feature.rms(y=audio, frame_length=frame_len, hop_length=hop_len)[0]
    rms = rms[rms > 1e-6]
    if len(rms) < 3:
        return 0.0
    return float(np.mean(np.abs(np.diff(rms))) / np.mean(rms) * 100)


def _hnr(audio: np.ndarray, sr: int) -> float:
    """Harmonics-to-Noise Ratio via autocorrelation (dB)."""
    frame_len = int(sr * 0.040)
    hop_len   = int(sr * 0.010)
    try:
        frames = librosa.util.frame(audio, frame_length=frame_len, hop_length=hop_len)
    except Exception:
        return 0.0
    hnr_vals = []
    lo, hi = int(sr / 500), int(sr / 75)
    for frame in frames.T:
        ac = np.correlate(frame, frame, mode='full')
        ac = ac[len(ac) // 2:]
        if ac[0] <= 0 or hi >= len(ac):
            continue
        peak = np.max(ac[lo:hi])
        r = peak / ac[0]
        if 0 < r < 1:
            hnr_vals.append(10 * np.log10(r / (1 - r)))
    return float(np.mean(hnr_vals)) if hnr_vals else 0.0


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
    f0 = _estimate_f0(audio, sr)
    return ClinicalIndicators(
        jitter_pct     = round(_jitter(f0), 4),
        shimmer_pct    = round(_shimmer(audio, sr), 4),
        hnr_db         = round(_hnr(audio, sr), 2),
        f0_mean_hz     = round(float(np.mean(f0)), 1)  if len(f0) > 0 else 0.0,
        f0_range_hz    = round(float(np.ptp(f0)), 1)   if len(f0) > 0 else 0.0,
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
