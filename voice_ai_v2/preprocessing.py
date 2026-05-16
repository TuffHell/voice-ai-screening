"""
Clinical-grade audio preprocessing.

Pipeline:
  1. Load + resample to 16 kHz mono
  2. Bandpass 80–8000 Hz (speech band)
  3. Loudness normalisation to -23 LUFS (broadcast standard)
  4. Silero VAD — keep only voiced segments
  5. Optional: spectral-subtraction denoise via noisereduce
"""

import warnings
import numpy as np
import torch
import torchaudio
from scipy.signal import butter, sosfiltfilt
from typing import Optional

SAMPLE_RATE = 16000
MIN_SPEECH_SEC = 0.5

_silero_model = None
_silero_utils = None


def _load_silero():
    """Load Silero VAD lazily — cached after first call."""
    global _silero_model, _silero_utils
    if _silero_model is None:
        with warnings.catch_warnings():
            warnings.simplefilter('ignore')
            _silero_model, _silero_utils = torch.hub.load(
                repo_or_dir='snakers4/silero-vad',
                model='silero_vad',
                trust_repo=True,
                verbose=False,
            )
    return _silero_model, _silero_utils


def _bandpass(audio: np.ndarray, sr: int = SAMPLE_RATE,
              lo: float = 80.0, hi: float = 8000.0) -> np.ndarray:
    """4th-order Butterworth bandpass for speech band."""
    nyq = sr / 2
    sos = butter(4, [lo / nyq, min(hi, nyq - 1) / nyq], btype='bandpass', output='sos')
    return sosfiltfilt(sos, audio).astype(np.float32)


def _loudness_normalise(audio: np.ndarray, sr: int = SAMPLE_RATE,
                        target_lufs: float = -23.0) -> np.ndarray:
    """Normalise to target LUFS (ITU-R BS.1770-4 / EBU R128)."""
    try:
        import pyloudnorm as pyln
        meter = pyln.Meter(sr)
        loudness = meter.integrated_loudness(audio)
        if loudness == float('-inf') or np.isnan(loudness):
            return audio
        return pyln.normalize.loudness(audio, loudness, target_lufs).astype(np.float32)
    except Exception:
        # Fallback: RMS normalisation to ~-23 dBFS
        rms = np.sqrt(np.mean(audio ** 2)) + 1e-9
        target_rms = 10 ** (target_lufs / 20)
        return (audio * (target_rms / rms)).astype(np.float32)


def _vad_keep_speech(audio: np.ndarray, sr: int = SAMPLE_RATE) -> np.ndarray:
    """Use Silero VAD to keep only voiced segments. Returns concatenated speech."""
    model, utils = _load_silero()
    get_speech_timestamps = utils[0]

    tensor = torch.from_numpy(audio).float()
    ts = get_speech_timestamps(tensor, model, sampling_rate=sr,
                                threshold=0.5, min_speech_duration_ms=250)
    if not ts:
        return audio   # fall back if VAD finds nothing
    return np.concatenate([audio[t['start']:t['end']] for t in ts]).astype(np.float32)


def preprocess(
    path_or_audio,
    sr: int = SAMPLE_RATE,
    apply_vad: bool = True,
    apply_denoise: bool = False,
    target_lufs: float = -23.0,
) -> np.ndarray:
    """
    Full clinical preprocessing pipeline.

    Args:
        path_or_audio: file path OR raw float32 numpy array (assumed at `sr`)
        apply_vad:     keep only speech segments using Silero VAD
        apply_denoise: spectral subtraction (slower; use only on noisy recordings)
        target_lufs:   loudness target (-23 LUFS = broadcast standard)
    """
    # Load — use librosa (which uses soundfile/audioread under the hood)
    if isinstance(path_or_audio, (str, bytes)):
        import librosa
        audio, _ = librosa.load(str(path_or_audio), sr=sr, mono=True)
        audio = audio.astype(np.float32)
    else:
        audio = np.asarray(path_or_audio, dtype=np.float32)

    if len(audio) < sr * MIN_SPEECH_SEC:
        audio = np.pad(audio, (0, int(sr * MIN_SPEECH_SEC) - len(audio)))

    # Bandpass
    audio = _bandpass(audio, sr)

    # Denoise (optional, costly)
    if apply_denoise:
        try:
            import noisereduce as nr
            audio = nr.reduce_noise(y=audio, sr=sr, stationary=False, prop_decrease=0.8)
        except Exception:
            pass

    # Loudness normalise
    audio = _loudness_normalise(audio, sr, target_lufs)

    # VAD
    if apply_vad:
        try:
            audio = _vad_keep_speech(audio, sr)
        except Exception:
            pass

    # Final clip safety
    peak = np.max(np.abs(audio))
    if peak > 1.0:
        audio = audio / peak * 0.95

    return audio.astype(np.float32)
