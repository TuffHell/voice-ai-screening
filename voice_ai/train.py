"""
Retraining script — fixes the class-imbalance problems identified in the
original model by applying class-weighted loss, stratified splits, and
label smoothing.

Expected data directory layout:
    data_dir/
        aphasia/      *.wav  (or .flac / .mp3)
        control/      *.wav
        dysarthria/   *.wav
        ua_speech/    *.wav

Usage:
    python -m voice_ai.train --data_dir ./data --output_dir ./model_output
"""

import argparse
import json
import os
import pickle
import warnings

import numpy as np
from pathlib import Path
from sklearn.model_selection import StratifiedShuffleSplit
from sklearn.preprocessing import StandardScaler
from sklearn.utils.class_weight import compute_class_weight
from sklearn.metrics import classification_report, confusion_matrix

warnings.filterwarnings('ignore')

from voice_ai import LABELS, N_FEATURES, SAMPLE_RATE
from voice_ai.features import extract_model_features, load_and_preprocess

# ─── Model architecture ───────────────────────────────────────────────────────

def build_model(input_dim: int = N_FEATURES, n_classes: int = 4) -> 'tf.keras.Model':
    import tensorflow as tf

    inp = tf.keras.Input(shape=(input_dim,))
    x   = tf.keras.layers.Dropout(0.20)(inp)

    x   = tf.keras.layers.Dense(256, kernel_regularizer=tf.keras.regularizers.l2(1e-4))(x)
    x   = tf.keras.layers.BatchNormalization()(x)
    x   = tf.keras.layers.Activation('relu')(x)
    x   = tf.keras.layers.Dropout(0.30)(x)

    x   = tf.keras.layers.Dense(128, kernel_regularizer=tf.keras.regularizers.l2(1e-4))(x)
    x   = tf.keras.layers.BatchNormalization()(x)
    x   = tf.keras.layers.Activation('relu')(x)
    x   = tf.keras.layers.Dropout(0.30)(x)

    x   = tf.keras.layers.Dense(64, kernel_regularizer=tf.keras.regularizers.l2(1e-4))(x)
    x   = tf.keras.layers.BatchNormalization()(x)
    x   = tf.keras.layers.Activation('relu')(x)
    x   = tf.keras.layers.Dropout(0.20)(x)

    out = tf.keras.layers.Dense(n_classes, activation='softmax')(x)

    model = tf.keras.Model(inp, out)
    return model


# ─── Data loading ─────────────────────────────────────────────────────────────

def load_dataset(
    data_dir: str,
    max_per_class: int = None,
    sr: int = SAMPLE_RATE,
    verbose: bool = True,
):
    """
    Walk data_dir/<label>/*.{wav,flac,mp3} and extract 32-dim feature vectors.
    Returns (X: float32 array, y: int32 array).
    """
    X, y = [], []
    label_to_idx = {lbl: i for i, lbl in enumerate(LABELS)}

    for label in LABELS:
        class_dir = Path(data_dir) / label
        if not class_dir.exists():
            if verbose:
                print(f'  [WARN] Missing class directory: {class_dir}')
            continue

        files = (
            list(class_dir.glob('**/*.wav'))
            + list(class_dir.glob('**/*.flac'))
            + list(class_dir.glob('**/*.mp3'))
        )
        if max_per_class:
            files = files[:max_per_class]

        if verbose:
            print(f'  {label:<12} {len(files):>6} files', end='', flush=True)

        ok = 0
        for fpath in files:
            try:
                audio    = load_and_preprocess(str(fpath), sr=sr)
                features = extract_model_features(audio, sr=sr)
                X.append(features)
                y.append(label_to_idx[label])
                ok += 1
            except Exception:
                pass

        if verbose:
            print(f'  →  {ok} extracted')

    return np.array(X, dtype=np.float32), np.array(y, dtype=np.int32)


# ─── Training ─────────────────────────────────────────────────────────────────

def train(
    data_dir:     str,
    output_dir:   str,
    epochs:       int = 120,
    batch_size:   int = 256,
    max_per_class: int = None,
    verbose:      bool = True,
) -> tuple:
    import tensorflow as tf
    os.makedirs(output_dir, exist_ok=True)

    print('\n── Loading dataset ─────────────────────────────────────────────')
    X, y = load_dataset(data_dir, max_per_class=max_per_class, verbose=verbose)
    if len(X) == 0:
        raise ValueError(f'No audio files found in {data_dir}')
    print(f'\n  Total: {len(X)} samples across {len(np.unique(y))} classes')

    # ── Stratified 70/15/15 split ──────────────────────────────────────────
    sss = StratifiedShuffleSplit(n_splits=1, test_size=0.30, random_state=42)
    train_idx, tmp_idx = next(sss.split(X, y))

    sss2 = StratifiedShuffleSplit(n_splits=1, test_size=0.50, random_state=42)
    val_rel, test_rel = next(sss2.split(X[tmp_idx], y[tmp_idx]))
    val_idx, test_idx = tmp_idx[val_rel], tmp_idx[test_rel]

    X_tr, y_tr = X[train_idx], y[train_idx]
    X_va, y_va = X[val_idx],   y[val_idx]
    X_te, y_te = X[test_idx],  y[test_idx]

    # ── Fit scaler on train only ───────────────────────────────────────────
    scaler = StandardScaler()
    X_tr_s = scaler.fit_transform(X_tr)
    X_va_s = scaler.transform(X_va)
    X_te_s = scaler.transform(X_te)

    # ── Class weights (balanced inverse frequency) ─────────────────────────
    cw_arr = compute_class_weight('balanced', classes=np.unique(y_tr), y=y_tr)
    cw     = {int(i): float(w) for i, w in enumerate(cw_arr)}
    if verbose:
        print('\n── Class weights ───────────────────────────────────────────────')
        for i, w in cw.items():
            print(f'  {LABELS[i]:<14} weight = {w:.3f}')

    # ── Build & compile ────────────────────────────────────────────────────
    model = build_model()
    # Label smoothing improves calibration on imbalanced data
    loss_fn = tf.keras.losses.SparseCategoricalCrossentropy(label_smoothing=0.05)
    model.compile(
        optimizer=tf.keras.optimizers.Adam(1e-3),
        loss=loss_fn,
        metrics=['accuracy'],
    )

    callbacks = [
        tf.keras.callbacks.EarlyStopping(
            monitor='val_loss', patience=12,
            restore_best_weights=True, verbose=0,
        ),
        tf.keras.callbacks.ReduceLROnPlateau(
            monitor='val_loss', factor=0.5, patience=5, min_lr=1e-5, verbose=0,
        ),
        tf.keras.callbacks.ModelCheckpoint(
            os.path.join(output_dir, 'best_model.h5'),
            save_best_only=True, monitor='val_loss', verbose=0,
        ),
    ]

    print('\n── Training ────────────────────────────────────────────────────')
    history = model.fit(
        X_tr_s, y_tr,
        validation_data=(X_va_s, y_va),
        epochs=epochs,
        batch_size=batch_size,
        class_weight=cw,
        callbacks=callbacks,
        verbose=1 if verbose else 0,
    )

    # ── Per-class evaluation ───────────────────────────────────────────────
    print('\n── Test Set Evaluation ─────────────────────────────────────────')
    y_pred = np.argmax(model.predict(X_te_s, verbose=0), axis=1)
    print(classification_report(y_te, y_pred, target_names=LABELS, digits=4))

    cm = confusion_matrix(y_te, y_pred)
    print('Confusion matrix (rows=true, cols=predicted):')
    header = ''.join(f'{l[:8]:>10}' for l in LABELS)
    print(f'{"":12}{header}')
    for i, row in enumerate(cm):
        print(f'{LABELS[i]:<12}' + ''.join(f'{v:>10}' for v in row))

    # ── Save ──────────────────────────────────────────────────────────────
    model_path  = os.path.join(output_dir, 'voice_model.h5')
    scaler_path = os.path.join(output_dir, 'feature_scaler.pkl')
    model.save(model_path)
    with open(scaler_path, 'wb') as f:
        pickle.dump(scaler, f)

    test_loss, test_acc = model.evaluate(X_te_s, y_te, verbose=0)

    metadata = {
        'model_architecture': 'Dense NN — BatchNorm + Dropout + L2, Class-weighted',
        'input_features':     'MFCCs (13 mean) + MFCC Deltas (13 mean) + Spectral (6)',
        'feature_dimension':  N_FEATURES,
        'num_classes':        len(LABELS),
        'class_labels':       LABELS,
        'training_accuracy':  float(max(history.history['accuracy'])),
        'val_accuracy':       float(max(history.history.get('val_accuracy', [0]))),
        'test_accuracy':      float(test_acc),
        'test_loss':          float(test_loss),
        'sample_rate':        SAMPLE_RATE,
        'total_samples':      int(len(X)),
        'class_weights':      {LABELS[k]: float(v) for k, v in cw.items()},
        'improvements': [
            'Balanced class weights (fixes aphasia near-zero prediction)',
            'Label smoothing 0.05 (calibration)',
            'L2 regularisation on all dense layers',
            'Stratified 70/15/15 train/val/test split',
            'Per-class F1 / precision / recall evaluated',
        ],
    }
    with open(os.path.join(output_dir, 'model_metadata.json'), 'w') as f:
        json.dump(metadata, f, indent=2)

    print(f'\nModel   → {model_path}')
    print(f'Scaler  → {scaler_path}')
    return model, scaler


# ─── CLI entry point ─────────────────────────────────────────────────────────

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Retrain Voice AI with class-weighted loss')
    parser.add_argument('--data_dir',      required=True,           help='Root data directory')
    parser.add_argument('--output_dir',    default='model_output',  help='Where to save artifacts')
    parser.add_argument('--epochs',        type=int, default=120)
    parser.add_argument('--batch_size',    type=int, default=256)
    parser.add_argument('--max_per_class', type=int, default=None,  help='Cap samples per class')
    args = parser.parse_args()
    train(args.data_dir, args.output_dir, args.epochs, args.batch_size, args.max_per_class)
