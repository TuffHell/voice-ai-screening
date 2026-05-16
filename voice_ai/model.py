"""
Model loading, temperature-scaled inference, and session aggregation.

Key fix applied here: temperature scaling (T=2.0 default) softens the
original model's extreme overconfidence without requiring retraining.
All predictions are passed through _temperature_scale() before returning.
"""

import os
import json
import pickle
import warnings
import numpy as np
from dataclasses import dataclass, field
from typing import List, Optional, Dict

from voice_ai import N_FEATURES

warnings.filterwarnings('ignore')
os.environ.setdefault('TF_CPP_MIN_LOG_LEVEL', '3')

_BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

LABELS = ['aphasia', 'control', 'dysarthria', 'ua_speech']

CONDITION_DISPLAY = {
    'aphasia':    'Aphasia',
    'control':    'Control (Normal)',
    'dysarthria': 'Dysarthria',
    'ua_speech':  'Unintelligible / Atypical Speech',
}

# Confidence thresholds
_HIGH = 0.75
_MOD  = 0.55


@dataclass
class Prediction:
    label: str
    confidence: float
    probabilities: Dict[str, float]
    confidence_level: str   # 'high' | 'moderate' | 'uncertain'
    recommendation: str
    n_windows: int = 1


@dataclass
class SessionBuffer:
    probs: List[np.ndarray] = field(default_factory=list)

    def add(self, p: np.ndarray):
        self.probs.append(p)

    def clear(self):
        self.probs.clear()

    def __len__(self):
        return len(self.probs)


def _softmax(x: np.ndarray) -> np.ndarray:
    e = np.exp(x - x.max())
    return e / e.sum()


def _temperature_scale_logits(logits: np.ndarray, T: float) -> np.ndarray:
    """
    Apply temperature scaling to true pre-softmax logits.
    T > 1 flattens the distribution; T < 1 sharpens it.
    We use T = 2.0 by default to soften the original model's extreme overconfidence.
    """
    return _softmax(logits / T)


def _make_prediction(probs: np.ndarray, n_windows: int) -> Prediction:
    idx = int(np.argmax(probs))
    conf = float(probs[idx])

    if conf >= _HIGH:
        level = 'high'
        rec = (
            f'Acoustic features are consistent with {CONDITION_DISPLAY[LABELS[idx]]}. '
            'Refer to a speech-language pathologist (SLP) for formal clinical assessment.'
        )
    elif conf >= _MOD:
        level = 'moderate'
        rec = (
            'Borderline result. Recommend extending the recording session and '
            'retesting. SLP review is advised.'
        )
    else:
        level = 'uncertain'
        rec = (
            'Model confidence is insufficient for a reliable screening result. '
            'A full clinical evaluation by an SLP or neurologist is required.'
        )

    return Prediction(
        label=LABELS[idx],
        confidence=round(conf, 4),
        probabilities={l: round(float(p), 4) for l, p in zip(LABELS, probs)},
        confidence_level=level,
        recommendation=rec,
        n_windows=n_windows,
    )


class VoiceModel:
    """
    Wrapper around the Keras model with:
      • Temperature scaling  (reduces overconfidence)
      • Session buffering    (aggregate over multiple windows/passes)
      • Simple Python API    (predict_audio, predict_features, aggregate)
    """

    def __init__(
        self,
        model_path:  Optional[str] = None,
        scaler_path: Optional[str] = None,
        temperature: float = 2.0,
    ):
        import tensorflow as tf
        self._tf = tf

        model_path  = model_path  or os.path.join(_BASE, 'voice_model.h5')
        scaler_path = scaler_path or os.path.join(_BASE, 'feature_scaler.pkl')

        with warnings.catch_warnings():
            warnings.simplefilter('ignore')
            self.model = tf.keras.models.load_model(model_path)
            with open(scaler_path, 'rb') as f:
                self.scaler = pickle.load(f)

        self.temperature = temperature
        self._session = SessionBuffer()

        # Build a logits model: same architecture but returns the pre-softmax
        # dense outputs so that temperature scaling works on true logits.
        self._logits_model = self._make_logits_model()

    # ── Logits model ─────────────────────────────────────────────────────────

    def _make_logits_model(self):
        """
        Build an intermediate model that returns the pre-softmax hidden state
        (output of the second-to-last layer, i.e., the Dropout before the
        final Dense).  We then multiply by the Dense weights manually so that
        temperature scaling operates on true logits, not probabilities.

        Sequential models need at least one forward pass before model.inputs
        is populated — we do a single dummy call to guarantee this.
        """
        import tensorflow as tf
        try:
            # Warm up the graph so model.inputs is available
            dummy = np.zeros((1, N_FEATURES), dtype=np.float32)
            self.model.predict(dummy, verbose=0)

            pre_dense = tf.keras.Model(
                inputs=self.model.inputs,
                outputs=self.model.layers[-2].output,   # Dropout before final Dense
            )
            return pre_dense
        except Exception:
            return None

    def _raw_logits(self, scaled_features: np.ndarray) -> np.ndarray:
        """
        Return pre-softmax logits for a (1, N_FEATURES) scaled input.
        Multiplies the pre-Dense hidden state by the final Dense weights
        without applying softmax.
        """
        if self._logits_model is not None:
            h = self._logits_model.predict(scaled_features, verbose=0)[0]  # (hidden_dim,)
            W, b = self.model.layers[-1].get_weights()                      # (hidden, 4), (4,)
            return h @ W + b
        # Fallback: log-probability approximation (less accurate but always works)
        raw = self.model.predict(scaled_features, verbose=0)[0]
        return np.log(np.clip(raw, 1e-4, 1.0))

    # ── Core inference ───────────────────────────────────────────────────────

    def predict_features(self, features: np.ndarray) -> Prediction:
        """Predict from a 32-dim feature vector (already in raw, unscaled space)."""
        if features.ndim == 1:
            features = features.reshape(1, -1)
        scaled = self.scaler.transform(features)
        logits = self._raw_logits(scaled)
        probs  = _temperature_scale_logits(logits, self.temperature)
        self._session.add(probs)
        return _make_prediction(probs, n_windows=len(self._session))

    def predict_audio(self, audio: np.ndarray, sr: int = 16000) -> Prediction:
        """Extract features from raw audio and run inference."""
        from voice_ai.features import extract_model_features
        return self.predict_features(extract_model_features(audio, sr))

    def predict_file(self, path: str) -> Prediction:
        """Load an audio file and run inference."""
        from voice_ai.features import load_and_preprocess
        audio = load_and_preprocess(path)
        return self.predict_audio(audio)

    # ── Session management ───────────────────────────────────────────────────

    def aggregate(self) -> Optional[Prediction]:
        """
        Average probabilities across all buffered windows and return a single
        consolidated prediction.  More windows → more robust result.
        """
        if not self._session.probs:
            return None
        mean_p = np.mean(self._session.probs, axis=0)
        mean_p /= mean_p.sum()
        return _make_prediction(mean_p, n_windows=len(self._session))

    def clear_session(self):
        self._session.clear()

    @property
    def window_count(self) -> int:
        return len(self._session)

    # ── Metadata ─────────────────────────────────────────────────────────────

    def metadata(self) -> dict:
        meta_path = os.path.join(_BASE, 'model_metadata.json')
        if os.path.exists(meta_path):
            with open(meta_path) as f:
                return json.load(f)
        return {}
