# Voice AI — Clinical Speech Disorder Screening

Wav2Vec2-based screening tool for control / dysarthria / aphasia / atypical-speech classification.

**Not a medical device.** Research / screening use only.

## Live demo

After deploying to [Streamlit Community Cloud](https://share.streamlit.io), point it at `streamlit_app.py` on the `main` branch.

## Local run

```bash
pip install -r requirements.txt
streamlit run streamlit_app.py
```

The pretrained model is bundled under `model_v2/` (~1.6 MB).

## Reproduce training

Raw audio is **not** in the repo (TORGO ~10 GB, UASpeech ~2.6 GB). Re-download:

```bash
# TORGO (control + dysarthria)
mkdir TORGO_raw && cd TORGO_raw
for f in F FC M MC; do
  curl -L "http://www.cs.toronto.edu/~complingweb/data/TORGO/$f.tar.bz2" -o "$f.tar.bz2"
  tar -xjf "$f.tar.bz2"
done
cd .. && python -m voice_ai_v2.data.download --source torgo --raw_dir ./TORGO_raw --target ./data

# UASpeech (real dysarthric audio) — from Hugging Face
python -c "from huggingface_hub import snapshot_download; \
  snapshot_download('ngdiana/uaspeech_severity_high', repo_type='dataset', \
                    local_dir='./UASpeech_hf2')"
# Then extract audio into ./data/dysarthria/ (see voice_ai_v2/data/)

# Synthetic placeholders for aphasia / ua_speech classes
python -m voice_ai_v2.data.generate_demo --target ./data_demo --n_speakers 25 --n_clips 6
cp -r data_demo/aphasia data_demo/ua_speech data/

# Train
python -m voice_ai_v2.train --data_dir ./data --output_dir ./model_v2 \
  --epochs 100 --max_per_speaker 25
```

## Results

Speaker-disjoint test split, all 4 classes represented:

| Class      | Source              | F1    | Recall |
|------------|---------------------|-------|--------|
| control    | TORGO (real)        | 0.79  | 0.81   |
| dysarthria | TORGO + UASpeech    | 0.91  | 0.85   |
| aphasia    | synthetic           | 0.98  | 0.97   |
| ua_speech  | synthetic           | 0.91  | 1.00   |

- Test accuracy: **90.55%**
- ECE (calibration): **0.098**

The synthetic-class numbers are not clinically meaningful. Real aphasia and atypical-speech datasets (AphasiaBank, full UA-Speech) are needed before those classes can be trusted in production.

## License & data sources

- TORGO: University of Toronto research licence (free, registration-free direct download)
- UASpeech: hosted on Hugging Face via [ngdiana/uaspeech_severity_high](https://huggingface.co/datasets/ngdiana/uaspeech_severity_high)
- Original UA-Speech: University of Illinois ([gated](https://isle.illinois.edu/sst/data/UASpeech/))
