"""
Wav2Vec2 / HuBERT / Whisper embedding extractor.

Uses HuggingFace transformers to extract 768-dim contextual speech embeddings
that capture far more clinical information than hand-crafted MFCCs.

The encoder is frozen during training — only a lightweight classifier head
is trained. This gives strong performance with limited data (a few hundred
samples per class is enough to converge).
"""

import warnings
import numpy as np
import torch
from typing import Optional

warnings.filterwarnings('ignore')

SAMPLE_RATE = 16000


class SpeechEmbedder:
    """
    Wraps a frozen pretrained speech model and returns utterance-level embeddings.

    Supported backbones:
      • facebook/wav2vec2-base-960h   (default, 95M params)
      • facebook/hubert-base-ls960    (often stronger for prosody)
      • microsoft/wavlm-base          (strong on disordered speech)
      • openai/whisper-tiny.en        (smaller, multilingual)
    """

    def __init__(
        self,
        backbone: str = 'facebook/wav2vec2-base-960h',
        device: Optional[str] = None,
        pooling: str = 'mean',     # 'mean' | 'mean_std' | 'attentive'
    ):
        self.backbone = backbone
        self.pooling = pooling
        self.device = device or ('cuda' if torch.cuda.is_available() else
                                  'mps'  if torch.backends.mps.is_available() else
                                  'cpu')

        # AutoFeatureExtractor works for both Wav2Vec2 and HuBERT (no tokenizer).
        from transformers import AutoFeatureExtractor, AutoModel
        self.processor = AutoFeatureExtractor.from_pretrained(backbone)
        self.model     = AutoModel.from_pretrained(backbone).to(self.device).eval()

        # Freeze all backbone params
        for p in self.model.parameters():
            p.requires_grad = False

        self.embedding_dim = self.model.config.hidden_size
        if pooling == 'mean_std':
            self.embedding_dim *= 2

    @torch.no_grad()
    def embed(self, audio: np.ndarray, sr: int = SAMPLE_RATE) -> np.ndarray:
        """
        Extract a single fixed-size embedding from a variable-length audio clip.

        Args:
            audio: 1-D float32 numpy array at 16 kHz
        Returns:
            (embedding_dim,) float32 numpy array
        """
        # Chunk to max ~30 s to stay within model context window
        max_len = 30 * sr
        if len(audio) > max_len:
            audio = audio[:max_len]

        inputs = self.processor(
            audio, sampling_rate=sr, return_tensors='pt', padding=True,
        ).to(self.device)

        outputs = self.model(**inputs, output_hidden_states=False)
        # last_hidden_state: (1, T, hidden_dim)
        h = outputs.last_hidden_state.squeeze(0).cpu().numpy()  # (T, D)

        if self.pooling == 'mean':
            emb = h.mean(axis=0)
        elif self.pooling == 'mean_std':
            emb = np.concatenate([h.mean(axis=0), h.std(axis=0)])
        else:
            emb = h.mean(axis=0)

        return emb.astype(np.float32)

    @torch.no_grad()
    def embed_batch(self, audios: list, sr: int = SAMPLE_RATE, batch_size: int = 8) -> np.ndarray:
        """Batched extraction for large datasets."""
        out = []
        for i in range(0, len(audios), batch_size):
            batch = audios[i:i + batch_size]
            inputs = self.processor(
                batch, sampling_rate=sr, return_tensors='pt', padding=True,
            ).to(self.device)
            h = self.model(**inputs).last_hidden_state  # (B, T, D)
            mask = inputs.get('attention_mask', None)

            if mask is not None:
                # Masked mean pooling
                m = mask.unsqueeze(-1).float()
                pooled = (h * m).sum(dim=1) / m.sum(dim=1).clamp(min=1)
            else:
                pooled = h.mean(dim=1)

            if self.pooling == 'mean_std':
                if mask is not None:
                    m = mask.unsqueeze(-1).float()
                    mu = pooled.unsqueeze(1)
                    var = ((h - mu) ** 2 * m).sum(dim=1) / m.sum(dim=1).clamp(min=1)
                    std = var.sqrt()
                else:
                    std = h.std(dim=1)
                pooled = torch.cat([pooled, std], dim=-1)

            out.append(pooled.cpu().numpy())
        return np.concatenate(out, axis=0).astype(np.float32)
