"""
Train classifier head on Wav2Vec2 embeddings — speaker-disjoint splits,
balanced sampling, isotonic calibration.

Expected data layout:
    data_dir/
        aphasia/SPEAKER_ID/*.wav
        control/SPEAKER_ID/*.wav
        dysarthria/SPEAKER_ID/*.wav
        ua_speech/SPEAKER_ID/*.wav

If your data isn't speaker-organised, put one folder per speaker under each
class. Files directly under class folders are treated as separate speakers
(less rigorous — flagged with a warning).

Usage:
    python -m voice_ai_v2.train --data_dir ./data --output_dir ./model_v2
"""

import argparse
import json
import os
import pickle
import warnings
from pathlib import Path
from collections import defaultdict, Counter

import numpy as np
import torch
import torch.nn as nn
from sklearn.model_selection import GroupShuffleSplit, StratifiedGroupKFold
from sklearn.preprocessing import StandardScaler
from sklearn.utils.class_weight import compute_class_weight
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import classification_report, confusion_matrix

warnings.filterwarnings('ignore')

from voice_ai_v2 import LABELS, SAMPLE_RATE, DEFAULT_BACKBONE
from voice_ai_v2.preprocessing import preprocess
from voice_ai_v2.embeddings import SpeechEmbedder


# ─── Classifier head ──────────────────────────────────────────────────────────

class ClassifierHead(nn.Module):
    """Small MLP head on top of frozen Wav2Vec2 embeddings."""

    def __init__(self, input_dim: int, n_classes: int = 4, hidden: int = 256, dropout: float = 0.4):
        super().__init__()
        self.net = nn.Sequential(
            nn.LayerNorm(input_dim),
            nn.Dropout(dropout),
            nn.Linear(input_dim, hidden),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(hidden, hidden // 2),
            nn.GELU(),
            nn.Dropout(dropout / 2),
            nn.Linear(hidden // 2, n_classes),
        )

    def forward(self, x):
        return self.net(x)


# ─── Data loading ─────────────────────────────────────────────────────────────

def discover_speakers(data_dir: Path) -> list:
    """
    Walk data_dir/<label>/<speaker_or_file> and return list of
    (path, label_idx, speaker_id) tuples.
    """
    items = []
    label_idx = {l: i for i, l in enumerate(LABELS)}
    speakerless_warned = False

    for label in LABELS:
        class_dir = data_dir / label
        if not class_dir.exists():
            continue

        # Two layouts: data/class/speaker/*.wav  OR  data/class/*.wav
        speaker_dirs = [d for d in class_dir.iterdir() if d.is_dir()]
        if speaker_dirs:
            for spk_dir in speaker_dirs:
                spk_id = f'{label}/{spk_dir.name}'
                for f in spk_dir.rglob('*'):
                    if f.suffix.lower() in {'.wav', '.flac', '.mp3', '.ogg', '.m4a'}:
                        items.append((str(f), label_idx[label], spk_id))
        else:
            if not speakerless_warned:
                print('[WARN] No speaker subfolders found — using one-speaker-per-file '
                      '(less rigorous; cross-speaker generalisation cannot be measured).')
                speakerless_warned = True
            for f in class_dir.iterdir():
                if f.suffix.lower() in {'.wav', '.flac', '.mp3', '.ogg', '.m4a'}:
                    items.append((str(f), label_idx[label], f'{label}/{f.stem}'))

    return items


def _augment_waveform(audio: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """
    Light waveform augmentation for clinical robustness.
      - random gain (±4 dB)
      - additive Gaussian noise (SNR 25-40 dB)
      - random small time-shift (±50 ms)
    No pitch-shift: would distort jitter-relevant cues.
    """
    a = audio.copy()
    # Gain
    gain_db = rng.uniform(-4.0, 4.0)
    a *= 10 ** (gain_db / 20.0)
    # Noise
    snr_db = rng.uniform(25.0, 40.0)
    sig_p  = np.mean(a ** 2) + 1e-9
    noise_p = sig_p / (10 ** (snr_db / 10.0))
    a = a + rng.normal(0, np.sqrt(noise_p), len(a)).astype(np.float32)
    # Time-shift
    shift = int(rng.integers(-800, 800))
    if shift > 0:
        a = np.concatenate([np.zeros(shift, dtype=np.float32), a[:-shift]])
    elif shift < 0:
        a = np.concatenate([a[-shift:], np.zeros(-shift, dtype=np.float32)])
    return a.clip(-1, 1).astype(np.float32)


def extract_embeddings(items, embedder, denoise: bool = False,
                       augment_n: int = 0, seed: int = 42) -> tuple:
    """Run preprocessing + embedding on all items. Returns (X, y, speakers).

    If `augment_n > 0`, for each clip we additionally generate `augment_n`
    augmented versions (gain/noise/shift). All copies share the same speaker_id
    so speaker-disjoint splits remain valid.
    """
    X, y, spk = [], [], []
    n = len(items)
    rng = np.random.default_rng(seed)
    for i, (path, label, speaker) in enumerate(items):
        if (i + 1) % 20 == 0 or i == n - 1:
            print(f'  {i+1:>5} / {n}  ({(i+1)/n*100:.1f}%)', end='\r', flush=True)
        try:
            audio = preprocess(path, apply_vad=True, apply_denoise=denoise)
            if len(audio) < SAMPLE_RATE * 0.5:
                continue
            emb = embedder.embed(audio)
            X.append(emb); y.append(label); spk.append(speaker)
            for _ in range(augment_n):
                aug = _augment_waveform(audio, rng)
                X.append(embedder.embed(aug)); y.append(label); spk.append(speaker)
        except Exception as e:
            print(f'\n  [skip] {path}: {e}')
    print()
    return np.array(X), np.array(y), np.array(spk)


class FocalLoss(nn.Module):
    """Multi-class focal loss with optional per-class alpha weights.

    Down-weights easy/dominant examples and concentrates training on hard,
    minority-class samples. Standard in clinical imbalanced classification.
    """
    def __init__(self, alpha: torch.Tensor = None, gamma: float = 2.0,
                 label_smoothing: float = 0.05):
        super().__init__()
        self.alpha = alpha
        self.gamma = gamma
        self.ls    = label_smoothing

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        n_cls = logits.size(-1)
        log_probs = torch.log_softmax(logits, dim=-1)
        probs     = log_probs.exp()
        # one-hot with label smoothing
        with torch.no_grad():
            true = torch.zeros_like(log_probs).scatter_(1, targets.unsqueeze(1), 1.0)
            if self.ls > 0:
                true = true * (1 - self.ls) + self.ls / n_cls
        pt = (probs * true).sum(dim=-1).clamp_min(1e-7)
        focal = -((1 - pt) ** self.gamma) * (log_probs * true).sum(dim=-1)
        if self.alpha is not None:
            w = self.alpha[targets]
            focal = focal * w
        return focal.mean()


# ─── Training ─────────────────────────────────────────────────────────────────

def train(
    data_dir: str,
    output_dir: str,
    backbone: str = DEFAULT_BACKBONE,
    epochs: int = 80,
    batch_size: int = 64,
    lr: float = 3e-4,
    denoise: bool = False,
    max_per_speaker: int = None,
):
    out = Path(output_dir); out.mkdir(parents=True, exist_ok=True)
    device = 'cuda' if torch.cuda.is_available() else ('mps' if torch.backends.mps.is_available() else 'cpu')
    print(f'\nDevice: {device}    Backbone: {backbone}')

    # ── Discover data ─────────────────────────────────────────────────────
    print('\n── Discovering data ────────────────────────────────────────────')
    items = discover_speakers(Path(data_dir))
    if not items:
        raise ValueError(f'No audio files found in {data_dir}')
    class_counts = Counter(it[1] for it in items)
    spk_counts   = Counter(it[2] for it in items)
    print(f'  Total files     : {len(items)}')
    print(f'  Unique speakers : {len(spk_counts)}')
    for i, label in enumerate(LABELS):
        n_spk = len({it[2] for it in items if it[1] == i})
        print(f'  {label:<12} {class_counts.get(i, 0):>6} files   {n_spk:>4} speakers')

    # Optional per-speaker cap
    if max_per_speaker:
        spk_seen = defaultdict(int)
        filtered = []
        for path, label, spk in items:
            if spk_seen[spk] < max_per_speaker:
                filtered.append((path, label, spk))
                spk_seen[spk] += 1
        items = filtered
        print(f'  After per-speaker cap : {len(items)} files')

    # ── Embed everything ──────────────────────────────────────────────────
    print('\n── Extracting Wav2Vec2 embeddings ──────────────────────────────')
    embedder = SpeechEmbedder(backbone=backbone, device=device, pooling='mean_std')
    X, y, spk = extract_embeddings(items, embedder, denoise=denoise,
                                    augment_n=int(os.environ.get('AUGMENT_N', '1')))
    print(f'  Embeddings shape: {X.shape}')

    # ── Per-class speaker split: guarantee ≥1 speaker per class in test ───
    print('\n── Splitting (per-class speaker-disjoint) ──────────────────────')
    rng = np.random.default_rng(42)
    test_spk, val_spk = set(), set()
    for cls_idx in np.unique(y):
        cls_spk = sorted({spk[i] for i in range(len(spk)) if y[i] == cls_idx})
        rng.shuffle(cls_spk)
        n = len(cls_spk)
        n_test = max(1, n // 5)
        n_val  = max(1, n // 10) if n >= 4 else 0
        test_spk.update(cls_spk[:n_test])
        val_spk.update(cls_spk[n_test:n_test + n_val])
    train_idx = np.array([i for i, s in enumerate(spk) if s not in test_spk and s not in val_spk])
    val_idx   = np.array([i for i, s in enumerate(spk) if s in val_spk])
    test_idx  = np.array([i for i, s in enumerate(spk) if s in test_spk])

    X_tr, y_tr, s_tr = X[train_idx], y[train_idx], spk[train_idx]
    X_va, y_va       = X[val_idx],   y[val_idx]
    X_te, y_te, s_te = X[test_idx],  y[test_idx],  spk[test_idx]

    print(f'  Train : {len(X_tr)}  ({len(set(s_tr))} speakers)')
    print(f'  Val   : {len(X_va)}')
    print(f'  Test  : {len(X_te)}  ({len(set(s_te))} speakers, disjoint from train)')

    assert not (set(s_tr) & set(s_te)), 'Speaker leakage detected!'

    # ── Standardise ───────────────────────────────────────────────────────
    scaler = StandardScaler().fit(X_tr)
    X_tr_s = scaler.transform(X_tr)
    X_va_s = scaler.transform(X_va)
    X_te_s = scaler.transform(X_te)

    # ── Class weights ─────────────────────────────────────────────────────
    cw_arr = compute_class_weight('balanced', classes=np.unique(y_tr), y=y_tr)
    cw     = torch.tensor(cw_arr, dtype=torch.float32, device=device)
    print('\n  Class weights:', {LABELS[i]: round(float(w), 2) for i, w in enumerate(cw_arr)})

    # ── Build model ───────────────────────────────────────────────────────
    head = ClassifierHead(input_dim=X.shape[1], n_classes=len(LABELS)).to(device)
    optim = torch.optim.AdamW(head.parameters(), lr=lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(optim, T_max=epochs)
    loss_fn = FocalLoss(alpha=cw, gamma=2.0, label_smoothing=0.05)

    Xtr_t = torch.tensor(X_tr_s, dtype=torch.float32, device=device)
    ytr_t = torch.tensor(y_tr,   dtype=torch.long,    device=device)
    Xva_t = torch.tensor(X_va_s, dtype=torch.float32, device=device)
    yva_t = torch.tensor(y_va,   dtype=torch.long,    device=device)

    # ── Train ──────────────────────────────────────────────────────────────
    print(f'\n── Training head ({epochs} epochs) ─────────────────────────────')
    best_val = float('inf'); best_state = None; patience = 12; bad = 0
    n = len(Xtr_t)

    for epoch in range(1, epochs + 1):
        head.train()
        perm = torch.randperm(n, device=device)
        total_loss = 0
        for i in range(0, n, batch_size):
            idx = perm[i:i + batch_size]
            optim.zero_grad()
            logits = head(Xtr_t[idx])
            loss   = loss_fn(logits, ytr_t[idx])
            loss.backward()
            optim.step()
            total_loss += loss.item() * len(idx)
        sched.step()
        tr_loss = total_loss / n

        head.eval()
        with torch.no_grad():
            val_logits = head(Xva_t)
            val_loss   = loss_fn(val_logits, yva_t).item()
            val_acc    = (val_logits.argmax(-1) == yva_t).float().mean().item()

        if epoch % 5 == 0 or epoch == 1:
            print(f'  epoch {epoch:>3}  train_loss={tr_loss:.4f}  '
                  f'val_loss={val_loss:.4f}  val_acc={val_acc:.3f}')

        if val_loss < best_val:
            best_val = val_loss
            best_state = {k: v.detach().clone() for k, v in head.state_dict().items()}
            bad = 0
        else:
            bad += 1
            if bad >= patience:
                print(f'  Early stopping at epoch {epoch}')
                break

    head.load_state_dict(best_state)

    # ── Evaluate on held-out speakers ─────────────────────────────────────
    print('\n── Test set (speaker-disjoint) evaluation ──────────────────────')
    head.eval()
    Xte_t = torch.tensor(X_te_s, dtype=torch.float32, device=device)
    with torch.no_grad():
        test_logits = head(Xte_t).cpu().numpy()
    test_probs = _softmax_np(test_logits)
    y_pred = test_probs.argmax(axis=1)
    print(classification_report(y_te, y_pred, labels=list(range(len(LABELS))),
                                  target_names=LABELS, digits=4, zero_division=0))

    cm = confusion_matrix(y_te, y_pred, labels=list(range(len(LABELS))))
    print('Confusion matrix:')
    print('              ' + ''.join(f'{l[:8]:>10}' for l in LABELS))
    for i, row in enumerate(cm):
        print(f'  {LABELS[i]:<12}' + ''.join(f'{v:>10}' for v in row))

    # ── Calibration via isotonic regression (per-class) ───────────────────
    print('\n── Calibrating probabilities (isotonic regression on val set) ──')
    with torch.no_grad():
        val_probs = _softmax_np(head(Xva_t).cpu().numpy())
    calibrators = []
    for c in range(len(LABELS)):
        iso = IsotonicRegression(out_of_bounds='clip')
        iso.fit(val_probs[:, c], (y_va == c).astype(float))
        calibrators.append(iso)

    # Calibrated test ECE
    test_cal = _apply_calibrators(test_probs, calibrators)
    print(f'  ECE before: {_ece(test_probs, y_te):.4f}')
    print(f'  ECE after : {_ece(test_cal,   y_te):.4f}')

    # ── Save artefacts ─────────────────────────────────────────────────────
    torch.save(head.state_dict(), out / 'classifier_head.pt')
    with open(out / 'scaler.pkl', 'wb') as f:
        pickle.dump(scaler, f)
    with open(out / 'calibrators.pkl', 'wb') as f:
        pickle.dump(calibrators, f)

    test_loss, test_acc = float(test_logits.mean()), float((y_pred == y_te).mean())
    metadata = {
        'backbone': backbone,
        'embedding_dim': int(X.shape[1]),
        'pooling': 'mean_std',
        'class_labels': LABELS,
        'n_classes': len(LABELS),
        'total_samples': int(len(X)),
        'n_speakers': int(len(spk_counts)),
        'class_counts': {LABELS[k]: int(v) for k, v in class_counts.items()},
        'class_weights': {LABELS[i]: float(w) for i, w in enumerate(cw_arr)},
        'speaker_disjoint_splits': True,
        'isotonic_calibration': True,
        'test_accuracy': test_acc,
        'test_ece': float(_ece(test_cal, y_te)),
        'improvements_over_v1': [
            'Wav2Vec2 embeddings (768-dim contextual) replace 32 MFCC features',
            'Speaker-disjoint train/test split — no within-speaker leakage',
            'Balanced class weights + label smoothing',
            'Isotonic calibration for trustworthy probabilities',
            'Silero VAD + bandpass + LUFS normalisation preprocessing',
        ],
    }
    with open(out / 'metadata.json', 'w') as f:
        json.dump(metadata, f, indent=2)

    print(f'\n  Saved → {out}/')
    print(f'  Test accuracy : {test_acc*100:.2f}%')
    print(f'  Test ECE      : {metadata["test_ece"]:.4f}\n')


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _softmax_np(x):
    e = np.exp(x - x.max(axis=-1, keepdims=True))
    return e / e.sum(axis=-1, keepdims=True)

def _apply_calibrators(probs, calibrators):
    out = np.stack([cal.predict(probs[:, i]) for i, cal in enumerate(calibrators)], axis=1)
    out = np.clip(out, 1e-9, 1.0)
    return out / out.sum(axis=1, keepdims=True)

def _ece(probs, y, n_bins=10):
    """Expected Calibration Error."""
    conf = probs.max(axis=1); pred = probs.argmax(axis=1); correct = (pred == y).astype(float)
    bins = np.linspace(0, 1, n_bins + 1)
    ece = 0
    for i in range(n_bins):
        m = (conf > bins[i]) & (conf <= bins[i + 1])
        if m.sum() > 0:
            ece += (m.sum() / len(y)) * abs(correct[m].mean() - conf[m].mean())
    return ece


# ─── CLI ──────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--data_dir',   required=True)
    p.add_argument('--output_dir', default='model_v2')
    p.add_argument('--backbone',   default=DEFAULT_BACKBONE)
    p.add_argument('--epochs',     type=int, default=80)
    p.add_argument('--batch_size', type=int, default=64)
    p.add_argument('--lr',         type=float, default=3e-4)
    p.add_argument('--denoise',    action='store_true')
    p.add_argument('--max_per_speaker', type=int, default=None)
    args = p.parse_args()
    train(args.data_dir, args.output_dir, args.backbone, args.epochs,
          args.batch_size, args.lr, args.denoise, args.max_per_speaker)
