"""
Inference wrapper for the v2 model.
"""

import json
import pickle
import warnings
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional, List, Dict

import numpy as np
import torch

warnings.filterwarnings('ignore')

from voice_ai_v2 import LABELS, SAMPLE_RATE
from voice_ai_v2.preprocessing import preprocess
from voice_ai_v2.embeddings import SpeechEmbedder
from voice_ai_v2.train import ClassifierHead, _softmax_np, _apply_calibrators


@dataclass
class Prediction:
    label: str
    confidence: float
    probabilities: Dict[str, float]
    confidence_level: str
    recommendation: str
    n_windows: int = 1


CONDITION_DISPLAY = {
    'aphasia':    'Aphasia',
    'control':    'Control (Normal)',
    'dysarthria': 'Dysarthria',
    'ua_speech':  'Unintelligible / Atypical Speech',
}

_HIGH = 0.75
_MOD  = 0.55


def _make_prediction(probs: np.ndarray, n_windows: int = 1) -> Prediction:
    idx = int(np.argmax(probs)); conf = float(probs[idx])
    if conf >= _HIGH:
        level, rec = 'high', f'Acoustic features are consistent with {CONDITION_DISPLAY[LABELS[idx]]}. Refer to SLP for confirmation.'
    elif conf >= _MOD:
        level, rec = 'moderate', 'Borderline result. Extend recording and retest. SLP review advised.'
    else:
        level, rec = 'uncertain', 'Insufficient confidence. Full clinical evaluation required.'
    return Prediction(
        label=LABELS[idx], confidence=round(conf, 4),
        probabilities={l: round(float(p), 4) for l, p in zip(LABELS, probs)},
        confidence_level=level, recommendation=rec, n_windows=n_windows,
    )


class VoiceModelV2:
    """Wav2Vec2-based speech disorder classifier with calibrated probabilities."""

    def __init__(self, model_dir: str, device: Optional[str] = None):
        self.dir = Path(model_dir)
        with open(self.dir / 'metadata.json') as f:
            self.metadata = json.load(f)

        self.device = device or ('cuda' if torch.cuda.is_available() else
                                  'mps'  if torch.backends.mps.is_available() else 'cpu')

        self.embedder = SpeechEmbedder(
            backbone=self.metadata['backbone'],
            device=self.device,
            pooling=self.metadata.get('pooling', 'mean_std'),
        )

        self.head = ClassifierHead(
            input_dim=self.metadata['embedding_dim'],
            n_classes=self.metadata['n_classes'],
        ).to(self.device)
        self.head.load_state_dict(torch.load(self.dir / 'classifier_head.pt',
                                              map_location=self.device))
        self.head.eval()

        with open(self.dir / 'scaler.pkl', 'rb') as f:
            self.scaler = pickle.load(f)
        with open(self.dir / 'calibrators.pkl', 'rb') as f:
            self.calibrators = pickle.load(f)

        self._session: List[np.ndarray] = []

    @torch.no_grad()
    def predict_audio(self, audio: np.ndarray, sr: int = SAMPLE_RATE) -> Prediction:
        emb = self.embedder.embed(audio, sr=sr)
        emb_s = self.scaler.transform(emb.reshape(1, -1))
        logits = self.head(torch.tensor(emb_s, dtype=torch.float32, device=self.device)).cpu().numpy()
        probs = _softmax_np(logits)
        probs_cal = _apply_calibrators(probs, self.calibrators)[0]
        self._session.append(probs_cal)
        return _make_prediction(probs_cal, n_windows=len(self._session))

    def predict_file(self, path: str, denoise: bool = False) -> Prediction:
        audio = preprocess(path, apply_vad=True, apply_denoise=denoise)
        return self.predict_audio(audio)

    def aggregate(self) -> Optional[Prediction]:
        if not self._session:
            return None
        mean = np.mean(self._session, axis=0)
        mean = mean / mean.sum()
        return _make_prediction(mean, n_windows=len(self._session))

    def clear_session(self):
        self._session.clear()
