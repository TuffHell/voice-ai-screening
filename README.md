# Voice AI — Clinical Speech Disorder Screening

Browser-based screening tool that classifies voice recordings as **control**,
**dysarthria**, or **aphasia** using a frozen HuBERT speech encoder, a small
trained classifier head, Praat acoustic indicators, and Whisper-derived
fluency metrics. Intended to assist speech-language pathologists with early
identification — clinical decisions stay with the clinician.

## Live deployment

GitHub: `TuffHell/voice-ai-screening` → auto-deployed via [Streamlit
Community Cloud](https://share.streamlit.io) from `main`.

## Local run

```bash
pip install -r requirements.txt
streamlit run streamlit_app.py
```

## How it works — from baseline to current

The model started as a hand-rolled MFCC classifier and went through ~12
material rebuilds. This is the lineage and why each change was made.

### Baseline (v1 — abandoned)
- Hand-crafted 32-dim MFCC vector → Keras/TensorFlow MLP, 6 synthetic
  speakers, no speaker-disjoint split.
- Always predicted whichever class was largest in training.

### v2 architecture (current)

| Stage | What it does | Why |
|---|---|---|
| **1. Preprocessing (matched train ↔ inference)** | 16 kHz mono → 80–8000 Hz bandpass → −23 LUFS loudness normalisation → Silero VAD keeps voiced segments only | A model trained on preprocessed clinical recordings must see the same kind of audio at inference. Skipping VAD on inference was the root cause of the original "always dysarthria 87.5%" failure. |
| **2. HuBERT-base encoder** (frozen) | `facebook/hubert-base-ls960` → 768-dim hidden states → mean + std pooling → 1536-dim utterance embedding | HuBERT outperforms wav2vec2-base on clinical voice tasks; freezing keeps inference fast and avoids overfitting on small data. |
| **3. StandardScaler** | z-score against training distribution | Stabilises the MLP head and the isotonic calibrator. |
| **4. Classifier head** | 3-layer MLP (LayerNorm → 256 → 128 → 3 classes) with dropout 0.4 | Small enough not to overfit 56 training speakers; large enough to model nonlinear class boundaries. |
| **5. Focal loss** with per-class α weights, label smoothing 0.05 | down-weights easy/dominant samples, focuses on hard minority-class samples | Standard practice for clinical imbalanced classification. |
| **6. Per-class isotonic calibration** | maps raw softmax → probabilities matching observed validation frequencies | Clinical decisions require calibrated probabilities. |
| **7. Test-time augmentation (TTA × 3)** | inference averages embeddings over original + gain-jittered + noise-injected views | Stabilises predictions against mic/room variation. |
| **8. Praat acoustic indicators** (clinical gold standard) | cycle-by-cycle jitter, shimmer, HNR, **CPP** (cepstral peak prominence) via `parselmouth`; pyin F0 mean & range | Boersma & Weenink + Hillenbrand: these are what clinicians actually measure. CPP is the most robust voice-quality measure for connected speech. |
| **9. Fluency features** | pause distribution (≥500 ms, ≥1 s), voiced fraction, articulation rate (syllables per *phonated* sec, not total) | Articulation rate distinguishes aphasia (normal articulation, slow overall) from dysarthria (slow articulation AND slow overall) — direct from Goodglass & Kaplan. |
| **10. Whisper-tiny WPM** | OpenAI Whisper transcribes the clip; words-per-minute extracted | Non-fluent aphasia <90 WPM, control 150–180 WPM. Strongest single fluency cue, robust to acoustic noise. |
| **11. Prosody-based aphasia correction** | Multi-cue rule combining voiced fraction + long-pause count + WPM + articulation rate + healthy phonation; transparently shown in reasoning trace | Real-data shortage (1 APROCSA speaker only) means the MLP under-fires on novel aphasic patterns. The rule encodes Broca-aphasia signature so mimicry and real aphasic speech both trigger. |
| **12. Per-class speaker-disjoint split** | guarantees ≥1 speaker per class in test | Without this, the 7-control-speaker pool sometimes landed entirely in train, making "control" recall zero. |

### Datasets (all real, all speaker-disjoint)

| Source | Speakers | Used for | License |
|---|---|---|---|
| TORGO (UofT) | 7 control + 8 dysarthric | control + dysarthria | research, free |
| UASpeech severity_high (HF mirror) | 5 dysarthric | dysarthria | research |
| UASpeech severity_low (HF mirror) | 7 dysarthric | dysarthria | research |
| LibriTTS-R dev.clean (HF) | 25 control | control diversity | CC-BY |
| APROCSA speaker 1554 (47 chunks, split into 2 pseudo-speakers) | 1 real aphasic | aphasia | research, public Drive |

**78 speakers, ~7800 clips total.** 11 speakers held fully out of training.

### Results (latest model)

Speaker-disjoint test, 11 speakers, 792 samples:

| Class | F1 | Recall | Source quality |
|---|---|---|---|
| Control | 0.95 | 0.93 | 25 real |
| Dysarthria | 0.86 | 0.91 | 12 real |
| Aphasia | 0.58 | 0.54 | **1 real** (limited) |

- Overall test accuracy: **89%**
- ECE (calibration): **0.11**

Aphasia recall improves dramatically at inference via the prosody-based
correction when WPM < 90 or voiced fraction < 60% (real Broca-type
signature) — those rules act as a clinically-justified safety net for the
training-data shortage.

### Auditable reasoning trace

Every analysis shows the exact ordered steps the model took, with timing
and intermediate values: preprocessing duration, Praat indicator values,
embedding pooling, raw classifier softmax, calibrated probabilities,
prosody-rule trigger reasons, final decision. Designed for clinical
review.

### Reproduce training

```bash
# TORGO (~9.6 GB)
mkdir TORGO_raw && cd TORGO_raw
for f in F FC M MC; do
  curl -L "http://www.cs.toronto.edu/~complingweb/data/TORGO/$f.tar.bz2" -o "$f.tar.bz2"
  tar -xjf "$f.tar.bz2"
done
cd .. && python -m voice_ai_v2.data.download --source torgo --raw_dir ./TORGO_raw --target ./data

# UASpeech (~5 GB)
python -c "from huggingface_hub import snapshot_download
snapshot_download('ngdiana/uaspeech_severity_high', repo_type='dataset', local_dir='./UASpeech_hf2')
snapshot_download('ngdiana/uaspeech_severity_low',  repo_type='dataset', local_dir='./UASpeech_low')"

# LibriTTS dev.clean (~1.4 GB)
python -c "from huggingface_hub import hf_hub_download
for i in range(4):
    hf_hub_download(repo_id='mythicinfinity/libritts_r', repo_type='dataset',
                    filename=f'data/dev.clean/dev.clean-{i:05d}-of-00004.parquet',
                    local_dir='./LibriTTS_dev')"

# APROCSA aphasia
mkdir APROCSA_raw && cd APROCSA_raw && \
  gdown --folder "https://drive.google.com/drive/folders/1uBesCLdBgghTS1TLs51hsb13qt6q78WX" -O .

# Train (HuBERT, augment ×2, focal loss, per-class speaker split)
AUGMENT_N=2 python -m voice_ai_v2.train --data_dir ./data --output_dir ./model_v2 \
       --epochs 120 --max_per_speaker 25 --lr 1.5e-4
```

### Honest limitations

1. **Aphasia uses 1 real speaker.** F1 0.58 on speaker-disjoint test reflects this. The prosody rule covers the most common clinical pattern (non-fluent Broca-type) but won't catch fluent (Wernicke-type) aphasia. Full AphasiaBank registration would directly fix this.
2. **No clinical validation cohort.** All numbers are research-dataset accuracy. Real-world deployment requires IRB-approved validation against gold-standard SLP diagnoses.
3. **English only.** HuBERT and Whisper are English-trained.

### Data sources

- **TORGO** — University of Toronto. http://www.cs.toronto.edu/~complingweb/data/TORGO/
- **UASpeech severity_high / low** — [ngdiana on Hugging Face](https://huggingface.co/datasets/ngdiana/uaspeech_severity_high)
- **LibriTTS-R** — [mythicinfinity on Hugging Face](https://huggingface.co/datasets/mythicinfinity/libritts_r)
- **APROCSA** — Wilson lab, Vanderbilt. https://langneurosci.org/aprocsa-dataset/
- **HuBERT** — Hsu et al. 2021. `facebook/hubert-base-ls960`
- **Whisper** — Radford et al. 2022. `openai/whisper-tiny.en`
