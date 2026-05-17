# Voice AI — Clinical Speech Disorder Screening

Wav2Vec2-based clinical screening tool for **control / dysarthria / aphasia** speech classification.

Intended to assist speech-language pathologists in early identification. Findings should be reviewed alongside professional assessment for diagnostic decisions.

## Live demo

[Streamlit Community Cloud](https://share.streamlit.io) deploys directly from this repo — point it at `streamlit_app.py` on `main`.

## Local run

```bash
pip install -r requirements.txt
streamlit run streamlit_app.py
```

The pretrained model is bundled under `model_v2/` (~1.6 MB). Real demo audio samples for the Demonstrations tab live under `assets/samples/` (~1 MB total).

## Pipeline (clinical ML best-practice)

| Stage | Component |
|-------|-----------|
| Preprocessing (train & inference, matched) | Silero VAD + 80–8000 Hz bandpass + −23 LUFS loudness normalisation |
| Backbone | `facebook/wav2vec2-base-960h` (frozen), 1536-dim mean+std pooling |
| Augmentation (train) | random gain ±4 dB, additive Gaussian noise SNR 25–40 dB, time-shift ±50 ms |
| Loss | Focal loss (γ = 2.0) with per-class α weights + label smoothing 0.05 |
| Calibration | Per-class isotonic regression on validation set |
| Splitter | Per-class speaker-disjoint (≥1 speaker per class guaranteed in test) |
| Acoustic indicators | Praat cycle-by-cycle jitter/shimmer/HNR via `parselmouth`; pyin F0 |
| Inference | Test-time augmentation (3× perturbed views averaged) + reasoning trace |

## Reproduce training

Raw audio is **not** in the repo. Fetch from open sources:

```bash
# 1. TORGO (control + dysarthria) — University of Toronto, ~9.6 GB
mkdir TORGO_raw && cd TORGO_raw
for f in F FC M MC; do
  curl -L "http://www.cs.toronto.edu/~complingweb/data/TORGO/$f.tar.bz2" -o "$f.tar.bz2"
  tar -xjf "$f.tar.bz2"
done
cd .. && python -m voice_ai_v2.data.download --source torgo --raw_dir ./TORGO_raw --target ./data

# 2. UASpeech severity_high + severity_low (extra dysarthric speakers) — Hugging Face
python -c "from huggingface_hub import snapshot_download
snapshot_download('ngdiana/uaspeech_severity_high', repo_type='dataset', local_dir='./UASpeech_hf2')
snapshot_download('ngdiana/uaspeech_severity_low',  repo_type='dataset', local_dir='./UASpeech_low')"
# Extract audio from parquets into data/dysarthria/ (see scripts/extract_uaspeech.py).

# 3. APROCSA (real aphasia chunks) — public Google Drive
mkdir APROCSA_raw && cd APROCSA_raw && \
  gdown --folder "https://drive.google.com/drive/folders/1uBesCLdBgghTS1TLs51hsb13qt6q78WX" -O .
cd .. && cp -r APROCSA_raw/aprocsa_clean_audio data/aphasia/1554

# 4. LibriTTS dev.clean (control speaker diversity) — Hugging Face
python -c "from huggingface_hub import hf_hub_download
for i in range(4):
    hf_hub_download(repo_id='mythicinfinity/libritts_r', repo_type='dataset',
                    filename=f'data/dev.clean/dev.clean-{i:05d}-of-00004.parquet',
                    local_dir='./LibriTTS_dev')"
# Extract into data/control/.

# 5. Train
python -m voice_ai_v2.train --data_dir ./data --output_dir ./model_v2 \
       --epochs 120 --max_per_speaker 25 --lr 1.5e-4
```

## Data sources

- **TORGO** — University of Toronto, free direct download (control + dysarthria, 15 speakers).
- **UASpeech (severity_high + severity_low)** — public mirror at [ngdiana/uaspeech_severity_high](https://huggingface.co/datasets/ngdiana/uaspeech_severity_high) and [_low](https://huggingface.co/datasets/ngdiana/uaspeech_severity_low) on Hugging Face (12 dysarthric speakers).
- **APROCSA (aphasia)** — public Google Drive mirror, 47 chunks from speaker 1554.
- **LibriTTS-R (dev.clean)** — diverse healthy controls, [mythicinfinity/libritts_r](https://huggingface.co/datasets/mythicinfinity/libritts_r) on HF (25+ speakers).
- Synthetic aphasia placeholders from `voice_ai_v2/data/generate_demo.py` supplement the single real APROCSA speaker for speaker-disjoint splitting.

## Why this approach is clinically meaningful

1. **Train/inference preprocessing matched exactly** — eliminates the dominant failure mode where mic audio falls outside the training distribution.
2. **Speaker-disjoint test split** with per-class guarantees prevents within-speaker leakage.
3. **Praat cycle-by-cycle indicators** are the clinical gold standard (Boersma & Weenink), not frame-energy proxies.
4. **Focal loss** concentrates learning on hard minority-class examples.
5. **TTA at inference** stabilises predictions against mic/room variation.
6. **Per-class isotonic calibration** produces probability estimates that match observed frequencies (low ECE).
7. **Reasoning trace** in the UI shows the exact intermediate values at every step — fully auditable for clinical workflows.
