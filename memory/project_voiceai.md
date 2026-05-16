---
name: voice_ai_project
description: Voice AI project — dysarthria/aphasia detection tool, problems found and fixes built
type: project
---

Project is a clinical speech disorder screening tool detecting dysarthria, aphasia, ua_speech, control.

Original model problems found:
- 88.5% of training data is ua_speech class → aphasia predicted at ~0.02% probability
- "Control" class had no identified data source in metadata
- Reported accuracy (98.4%) is misleading — majority-class bias
- Model used undocumented feature extraction pipeline
- Extreme overconfidence (100% softmax on all inputs)

Fixes built (May 2026):
- `/Users/jasper/Downloads/voice ai/app.py` — main CLI (record/analyse/train/check)
- `voice_ai/features.py` — 32-feature extraction + 6 clinical indicators (jitter, shimmer, HNR, F0, speech rate)
- `voice_ai/model.py` — temperature scaling (T=2.0) on true logits, session aggregation
- `voice_ai/realtime.py` — microphone capture (fixed-duration + streaming sliding window)
- `voice_ai/clinical.py` — rich terminal + plain text + PDF clinical reports
- `voice_ai/train.py` — retraining with class weights, stratified splits, label smoothing

Feature layout reverse-engineered from scaler: [MFCC means 0-12, ZCR, spectral centroid, rolloff 85%, MFCC stds 0-12, RMS, spectral bandwidth, rolloff 25%]

**Why:** Existing model cannot detect aphasia (0.7% of training data). Must retrain.
**How to apply:** Recommend user run `python app.py train --data_dir ./data` after preparing data dirs aphasia/control/dysarthria/ua_speech.
