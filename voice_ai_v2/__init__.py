"""
Voice AI v2 — Wav2Vec2-based clinical speech pathology screening.

Replaces hand-crafted MFCC features with learned speech embeddings from
pretrained Wav2Vec2 (or HuBERT/Whisper). Trains a lightweight classifier
head with speaker-disjoint splits and balanced sampling.
"""

LABELS = ['aphasia', 'control', 'dysarthria', 'ua_speech']
SAMPLE_RATE = 16000
EMBEDDING_DIM = 768   # wav2vec2-base / hubert-base
DEFAULT_BACKBONE = 'facebook/wav2vec2-base-960h'
