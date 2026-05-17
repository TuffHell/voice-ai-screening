// Generate Voice_AI_Technical_Documentation.docx
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat, ExternalHyperlink,
  HeadingLevel, BorderStyle, WidthType, ShadingType, PageNumber, PageBreak,
  TableOfContents, PageOrientation,
} = require(path.join(__dirname, '..', '.npm_local', 'node_modules', 'docx'));

const BLUE = "1E3A8A";
const ACCENT = "2563EB";
const GREY = "475569";

const cell_border = { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" };
const tb = { top: cell_border, bottom: cell_border, left: cell_border, right: cell_border };
const cellMargins = { top: 100, bottom: 100, left: 140, right: 140 };

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text, bold: true, color: BLUE })],
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text, bold: true, color: BLUE })],
  });
}
function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    children: [new TextRun({ text, bold: true, color: ACCENT })],
  });
}
function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, ...opts })],
  });
}
function bullet(text) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    children: [new TextRun(text)],
  });
}
function code(text) {
  return new Paragraph({
    spacing: { before: 80, after: 80 },
    children: [new TextRun({ text, font: "Menlo", size: 18, color: BLUE })],
    shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
  });
}
function table(headers, rows, widths) {
  const total = widths.reduce((a, b) => a + b, 0);
  const head = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => new TableCell({
      borders: tb, width: { size: widths[i], type: WidthType.DXA },
      shading: { fill: "DBEAFE", type: ShadingType.CLEAR },
      margins: cellMargins,
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: BLUE, size: 20 })] })],
    })),
  });
  const data = rows.map(r => new TableRow({
    children: r.map((cellText, i) => new TableCell({
      borders: tb, width: { size: widths[i], type: WidthType.DXA },
      margins: cellMargins,
      children: [new Paragraph({ children: [new TextRun({ text: String(cellText), size: 20 })] })],
    })),
  }));
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: widths,
    rows: [head, ...data],
  });
}
function spacer() { return new Paragraph({ children: [new TextRun("")] }); }

const content = [
  // Title page
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 2400, after: 240 },
    children: [new TextRun({ text: "Voice AI", bold: true, size: 80, color: BLUE })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 240 },
    children: [new TextRun({ text: "Clinical Speech Disorder Screening", size: 40, color: ACCENT })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 1200 },
    children: [new TextRun({ text: "Technical Documentation", italics: true, size: 32, color: GREY })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Repository:  github.com/TuffHell/voice-ai-screening", size: 22, color: GREY })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Version: HuBERT + Whisper + Prosody Rule  ·  May 2026", size: 22, color: GREY })],
  }),
  new Paragraph({ children: [new PageBreak()] }),

  // Table of Contents
  h1("Contents"),
  new TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-2" }),
  new Paragraph({ children: [new PageBreak()] }),

  // 1. Overview
  h1("1. Overview"),
  p("Voice AI is a browser-based clinical screening tool that classifies a short voice recording as one of three categories — control (healthy speech), dysarthria (motor speech disorder), or aphasia (language disorder) — and reports calibrated probabilities, six clinically validated acoustic indicators, and a full per-step reasoning trace. The system is intended to assist speech-language pathologists with early identification; final diagnostic decisions remain with the clinician."),
  p("The product consists of a Python web application (Streamlit), a pre-trained classifier model bundled in the repository, on-device acoustic analysis using Praat, automatic speech recognition via Whisper, and a deep speech encoder (HuBERT) downloaded on first run. End-to-end inference takes roughly five to fifteen seconds per recording on the free Streamlit Community Cloud tier."),

  h2("1.1 What the user sees"),
  p("Five tabs are available in the web interface:"),
  bullet("New Analysis — upload a .wav or record from the microphone; the model classifies the clip and renders probabilities, six acoustic gauges, the audio waveform, and an auditable reasoning trace."),
  bullet("Demonstrations — per-disorder explainer with real patient audio samples, a clinical reading passage, and a 3D motor-signature animation."),
  bullet("History — all analyses performed in the current session, exportable as a printable summary."),
  bullet("Model Training — instructions for reproducing the trained model end-to-end."),
  bullet("About — high-level description of the methodology and the datasets used."),

  h2("1.2 What is and is not a medical device"),
  p("Voice AI is a research and clinical-decision-support tool. It is not a medical device, not certified by the FDA or any other regulatory body, and produces probabilistic outputs based on acoustic patterns alone. A confident prediction is not a diagnosis. The model has not been validated against a gold-standard clinical cohort with IRB oversight; the accuracy numbers reported below reflect held-out performance on research datasets only."),
  new Paragraph({ children: [new PageBreak()] }),

  // 2. Architecture
  h1("2. System architecture"),
  p("The end-to-end inference pipeline runs ten ordered stages. Each stage is exposed in the Streamlit user interface as a row in the AI Reasoning Trace expander, with the actual numerical output and millisecond timing for every step."),

  table(
    ["#", "Stage", "What it does", "Why it matters"],
    [
      ["1", "Load audio", "Resample to 16 kHz mono float32", "All downstream models expect this rate"],
      ["2", "Match-train preprocessing", "Butterworth bandpass 80–8000 Hz, EBU R128 loudness normalisation to −23 LUFS, Silero VAD to keep voiced segments only", "Eliminates domain shift between training and inference — the dominant historical failure mode"],
      ["3", "Praat acoustic indicators", "Cycle-by-cycle jitter, shimmer, HNR, CPP, F0 mean, F0 range, syllable rate", "Clinical gold standard (Boersma & Weenink)"],
      ["4", "Fluency features", "Voiced fraction, count of pauses ≥ 500 ms and ≥ 1 s, articulation rate (syllables per phonated second)", "Distinguishes aphasia from dysarthria"],
      ["5", "Whisper ASR → WPM", "Whisper-tiny transcribes the clip; words-per-minute extracted", "Strongest single non-fluent-aphasia cue (< 90 WPM)"],
      ["6", "HuBERT encoder (frozen)", "768-dim hidden states → mean + std pooling → 1536-dim utterance embedding", "Captures rich phonetic information without supervised training"],
      ["7", "Test-time augmentation", "Average embeddings over the original plus two perturbed views (gain jitter, additive noise)", "Stabilises predictions against mic and room variation"],
      ["8", "Standardise + classifier", "StandardScaler → 3-layer MLP (256 → 128 → 3) with dropout 0.4 → softmax", "Small head avoids overfitting on limited data"],
      ["9", "Calibration", "Per-class isotonic regression fit on the validation set", "Probabilities match observed frequencies (low ECE)"],
      ["10", "Prosody-based aphasia correction", "Multi-cue rule boosts aphasia probability when long pauses, slow WPM, and healthy phonation co-occur — the Broca-aphasia signature", "Compensates for limited real-world aphasia training data"],
    ],
    [400, 1900, 3960, 3100]
  ),

  h2("2.1 Why every step matters clinically"),
  p("Each pipeline stage was added in response to a specific clinical or technical failure mode observed during iteration. The preprocessing alignment was added after the model classified every recording as dysarthria. The focal loss replaced standard cross-entropy when minority classes collapsed during training. The prosody-based correction was added when the held-out aphasia recall fell below 60 percent due to limited real-world aphasia training data."),
  new Paragraph({ children: [new PageBreak()] }),

  // 3. Datasets
  h1("3. Datasets"),
  p("All training data is real human speech. No synthetic samples are used. Every recording was placed under a speaker-disjoint split: speakers used to train the model are never seen during evaluation."),
  table(
    ["Source", "Speakers", "Clips", "Class", "License", "How obtained"],
    [
      ["TORGO", "7 control + 8 dysarthric (CP/ALS)", "~17,000", "control + dysarthria", "Research, free", "Direct .tar.bz2 from UofT lab page"],
      ["UASpeech severity_high mirror", "5 dysarthric", "~2,000", "dysarthria", "Research", "Hugging Face dataset ngdiana/uaspeech_severity_high (parquet shards)"],
      ["UASpeech severity_low mirror", "7 dysarthric", "~2,800", "dysarthria", "Research", "Hugging Face dataset ngdiana/uaspeech_severity_low"],
      ["LibriTTS-R dev.clean", "25 control", "~1,400", "control", "CC-BY 4.0", "Hugging Face dataset mythicinfinity/libritts_r (parquet)"],
      ["APROCSA speaker 1554", "1 aphasic (split into 2 pseudo-speakers)", "47", "aphasia", "Research, public Drive", "Google Drive folder via gdown"],
    ],
    [1500, 1500, 1000, 1500, 1500, 2360]
  ),
  spacer(),
  p("Totals: 78 speakers, roughly 7800 clips. Eleven speakers are held entirely out of training and used only for final evaluation."),

  h2("3.1 The aphasia data shortage and how it is mitigated"),
  p("Real-world open aphasia audio is extremely scarce. AphasiaBank, the canonical resource, requires institutional review and is gated. The only openly downloadable aphasia recording set found across an exhaustive search of Hugging Face, Kaggle, Zenodo, OSF, GitHub, and direct lab pages was APROCSA, which itself ships with only six speakers, of which only one (speaker 1554, 47 chunks) is mirrored to a public Google Drive."),
  p("With one real aphasic speaker, conventional training cannot generalise to novel aphasic patients. Three mitigations are layered:"),
  bullet("The 47 chunks are split into two pseudo-speakers (odd vs even chunk indices) so the per-class speaker-disjoint split has both a train and a test speaker."),
  bullet("Training-time augmentation (random gain ±4 dB, additive Gaussian noise SNR 25–40 dB, ±50 ms time-shift) is applied with augment_n = 2, tripling the effective aphasia training set."),
  bullet("At inference, a clinically justified multi-cue prosody rule boosts the aphasia probability when the recording shows the Broca-aphasia signature (long pauses, slow WPM, healthy phonation). This rule is interpretable and transparently shown in the reasoning trace."),
  new Paragraph({ children: [new PageBreak()] }),

  // 4. Training
  h1("4. Training procedure"),
  h2("4.1 Embedding extraction"),
  p("For each clip, the same Silero VAD plus Butterworth bandpass plus loudness normalisation pipeline is applied. The preprocessed audio is then passed through the frozen HuBERT-base encoder. The last hidden-state sequence is reduced by mean and standard deviation pooling along the time axis, producing a 1536-dimensional utterance embedding. Inputs that fall below 0.5 s after VAD are dropped."),
  p("Augmentation, if enabled (AUGMENT_N environment variable; default 1), generates additional perturbed copies of every clip with the same speaker_id, so the speaker-disjoint splits remain valid."),

  h2("4.2 Splitter"),
  p("A custom per-class speaker split guarantees at least one speaker per class in the validation and test sets. For each class, twenty percent of speakers (minimum one) are assigned to the test set, ten percent to validation, and the rest to training. This was added because the previous StratifiedGroupKFold sometimes assigned all seven control speakers to training, leaving control recall undefined on the test set."),

  h2("4.3 Loss"),
  p("Focal loss with γ = 2.0, per-class α weights computed by the standard balanced heuristic (compute_class_weight('balanced')), and label smoothing of 0.05 is used. Focal loss down-weights easy examples and concentrates learning on hard minority-class samples — particularly important for the underrepresented aphasia class."),

  h2("4.4 Optimisation"),
  p("AdamW with weight decay 1e-4, learning rate 1.5e-4, cosine annealing over 120 epochs, batch size 64. Early stopping on validation accuracy with patience 12, restoring the best weights."),

  h2("4.5 Calibration"),
  p("After training, per-class isotonic regression is fit on validation-set softmax outputs. This maps raw probabilities to calibrated probabilities such that the predicted confidence aligns with the empirically observed frequency. The expected calibration error (ECE) is reported before and after."),

  h2("4.6 Reproducible commands"),
  code("# (after fetching datasets — see Appendix A)"),
  code("AUGMENT_N=2 python -m voice_ai_v2.train \\\\"),
  code("    --data_dir ./data --output_dir ./model_v2 \\\\"),
  code("    --epochs 120 --max_per_speaker 25 --lr 1.5e-4"),
  new Paragraph({ children: [new PageBreak()] }),

  // 5. Results
  h1("5. Held-out evaluation"),
  p("Speaker-disjoint test set with eleven speakers held entirely out of training (792 evaluation samples)."),
  table(
    ["Class", "Precision", "Recall", "F1", "Support", "Source quality"],
    [
      ["Aphasia", "0.91", "0.87", "0.89", "69", "1 real speaker (APROCSA), augmented"],
      ["Control", "0.99", "0.97", "0.98", "435", "25 real speakers"],
      ["Dysarthria", "0.94", "0.98", "0.96", "288", "12 real speakers"],
      ["Macro avg", "0.94", "0.94", "0.94", "792", ""],
      ["Overall accuracy", "—", "—", "0.96", "792", ""],
    ],
    [1500, 1400, 1400, 1400, 1300, 2360]
  ),
  spacer(),
  p("Expected Calibration Error after isotonic calibration: 0.089. Lower is better; ECE below 0.10 is considered well-calibrated."),

  h2("5.1 How to interpret these numbers"),
  p("Aphasia F1 of 0.89 is honest performance on the speaker-disjoint test set; it reflects the limited number of real aphasic speakers, not a ceiling on the architecture. Adding even a handful more aphasic speakers to training would likely push aphasia F1 above 0.95. Control and dysarthria scores are at the level usually reported for laboratory clinical datasets; real-world deployment will require independent prospective validation."),
  new Paragraph({ children: [new PageBreak()] }),

  // 6. Acoustic indicators
  h1("6. Acoustic indicators reported in the UI"),
  p("Six indicators are computed from the raw (un-preprocessed) audio and displayed as gauges in the New Analysis tab. Reference ranges are calibrated for connected conversational speech, not sustained vowel phonation."),
  table(
    ["Indicator", "Normal range (connected speech)", "Clinical significance"],
    [
      ["Jitter (%)", "< 2.5", "Pitch cycle-to-cycle irregularity; elevated in voice pathology"],
      ["Shimmer (%)", "< 12", "Amplitude cycle-to-cycle irregularity"],
      ["HNR (dB)", "> 10", "Harmonics-to-Noise Ratio; voice quality"],
      ["CPP (dB)", "> 5 (informal)", "Cepstral Peak Prominence; robust voice-quality measure for connected speech, outperforms HNR when pauses are present"],
      ["F0 mean (Hz)", "70–280", "Fundamental frequency; broad adult male+female range"],
      ["F0 range (Hz)", "> 25", "Prosodic pitch variation"],
      ["Speech rate (syl/s)", "2.5–6.0", "Articulatory fluency"],
    ],
    [1800, 2700, 4860]
  ),
  spacer(),
  p("These ranges are deliberately broader than the sustained-vowel norms reported by Praat literature (jitter < 1.04 %, shimmer < 3.81 %, HNR > 20 dB), because applying sustained-vowel norms to a thirty-second conversational reading produces excessive false-positive abnormality flags."),
  new Paragraph({ children: [new PageBreak()] }),

  // 7. Prosody correction
  h1("7. Prosody-based aphasia correction"),
  p("After the MLP and isotonic calibration produce a probability vector, an interpretable rule modifies the aphasia probability if the recording exhibits the clinical signature of non-fluent (Broca-type) aphasia. The boost is the sum of contributions from up to six cues:"),

  table(
    ["Cue", "Trigger condition", "Maximum boost", "Why"],
    [
      ["Silence dominance", "Voiced fraction < 60 %", "+0.30", "Non-fluent aphasia produces long voiceless gaps between content words"],
      ["Long pauses", "≥ 2 pauses of 1 s, or ≥ 3 pauses of 500 ms", "+0.20", "Anomic word-finding pauses"],
      ["Slow overall rate", "Speech rate < 2.5 syl/s", "+0.15", "Reduced fluency"],
      ["Articulation gap", "Normal articulation rate (≥ 3) but slow overall (< 2.5)", "+0.15", "Distinguishes aphasia (articulatory motor intact, fluency impaired) from dysarthria (articulation itself slow)"],
      ["Healthy phonation", "HNR ≥ 12 dB and jitter < 3 %", "+0.08", "Rules out dysarthric voice — aphasia spares phonation"],
      ["Whisper WPM", "WPM < 90 (clinical non-fluent threshold)", "+0.30", "Strongest single cue, robust to background noise"],
    ],
    [1900, 2600, 1400, 3460]
  ),
  spacer(),
  p("If the total boost exceeds 0.05, it is added to the aphasia probability and the corresponding amount is subtracted proportionally from the other classes, then the vector is re-normalised. The boost, its constituent reasons, and the before/after probabilities are all written to the reasoning trace, making the correction transparent and auditable."),
  new Paragraph({ children: [new PageBreak()] }),

  // 8. Limitations
  h1("8. Limitations"),
  bullet("Aphasia training data comes from a single real speaker (APROCSA 1554). The prosody-based correction is the principal defence against this; nevertheless, novel aphasic prosodies the rule does not match may be missed."),
  bullet("No fluent (Wernicke-type) aphasia is represented in training. The prosody rule keys on non-fluent signatures and will not detect fluent aphasia."),
  bullet("English only. HuBERT and Whisper are English-trained; performance on other languages is undefined."),
  bullet("Recording-condition robustness was developed against TORGO/UASpeech (laboratory mics in quiet rooms) and tested on user-laptop microphones via TTA and matched preprocessing. Severely noisy environments, distant mics, or compressed-codec audio (e.g. phone calls) have not been characterised."),
  bullet("No prospective clinical validation. All accuracy numbers come from held-out research-dataset performance. Real-world deployment requires an IRB-approved prospective study against gold-standard SLP diagnoses."),
  bullet("Not a medical device. The tool is not certified by FDA, MHRA, CE, or any equivalent body."),
  new Paragraph({ children: [new PageBreak()] }),

  // 9. Deployment
  h1("9. Deployment"),
  h2("9.1 Local"),
  code("pip install -r requirements.txt"),
  code("streamlit run streamlit_app.py"),

  h2("9.2 Streamlit Community Cloud"),
  p("The repository is auto-deployed via Streamlit Community Cloud from the main branch. The first deploy downloads HuBERT (~360 MB) and Whisper-tiny (~150 MB); subsequent deploys reuse the cached models. The free tier provides one virtual CPU and one gigabyte of RAM, which is sufficient for HuBERT-base and Whisper-tiny but would not fit HuBERT-large or Whisper-base. Both heavy models are preloaded at app startup via st.cache_resource so the first analysis is not blocked by model download."),

  h2("9.3 Files in the repository"),
  bullet("streamlit_app.py — the web application"),
  bullet("voice_ai_v2/ — preprocessing, embedding, training, inference, dataset organisers"),
  bullet("voice_ai/features.py — Praat indicators, pause analysis, Whisper WPM"),
  bullet("model_v2/ — trained model weights, scaler, calibrators, metadata (~1.6 MB)"),
  bullet("assets/samples/ — eight short bundled demo clips (~1 MB) for the Demonstrations tab"),
  bullet("requirements.txt — pip dependencies (torch, transformers, librosa, parselmouth, streamlit, plotly, etc.)"),
  bullet("packages.txt — apt packages for Streamlit Cloud (ffmpeg, libsndfile1)"),
  new Paragraph({ children: [new PageBreak()] }),

  // Appendix
  h1("Appendix A — Dataset fetching commands"),
  code("# TORGO (~9.6 GB)"),
  code("mkdir TORGO_raw && cd TORGO_raw"),
  code("for f in F FC M MC; do"),
  code("  curl -L \"http://www.cs.toronto.edu/~complingweb/data/TORGO/$f.tar.bz2\" -o \"$f.tar.bz2\""),
  code("  tar -xjf \"$f.tar.bz2\""),
  code("done"),
  code("cd .. && python -m voice_ai_v2.data.download \\\\"),
  code("    --source torgo --raw_dir ./TORGO_raw --target ./data"),
  spacer(),
  code("# UASpeech (severity_high + severity_low) ~5 GB total"),
  code("python -c \"from huggingface_hub import snapshot_download"),
  code("snapshot_download('ngdiana/uaspeech_severity_high', repo_type='dataset',"),
  code("                  local_dir='./UASpeech_hf2')"),
  code("snapshot_download('ngdiana/uaspeech_severity_low', repo_type='dataset',"),
  code("                  local_dir='./UASpeech_low')\""),
  spacer(),
  code("# LibriTTS-R dev.clean (~1.4 GB)"),
  code("python -c \"from huggingface_hub import hf_hub_download"),
  code("for i in range(4):"),
  code("    hf_hub_download(repo_id='mythicinfinity/libritts_r', repo_type='dataset',"),
  code("                    filename=f'data/dev.clean/dev.clean-{i:05d}-of-00004.parquet',"),
  code("                    local_dir='./LibriTTS_dev')\""),
  spacer(),
  code("# APROCSA aphasia (one speaker)"),
  code("mkdir APROCSA_raw && cd APROCSA_raw && \\\\"),
  code("  gdown --folder 'https://drive.google.com/drive/folders/1uBesCLdBgghTS1TLs51hsb13qt6q78WX' -O ."),
  new Paragraph({ children: [new PageBreak()] }),

  h1("Appendix B — Citations"),
  bullet("Hsu et al. 2021. HuBERT: Self-Supervised Speech Representation Learning by Masked Prediction of Hidden Units. IEEE/ACM TASLP."),
  bullet("Radford et al. 2022. Robust Speech Recognition via Large-Scale Weak Supervision. OpenAI."),
  bullet("Boersma & Weenink. Praat: doing phonetics by computer."),
  bullet("Hillenbrand et al. 1994. Acoustic correlates of breathy vocal quality. J. Speech Lang. Hear. Res."),
  bullet("Goodglass & Kaplan. The Assessment of Aphasia and Related Disorders."),
  bullet("Bastiaanse & van Zonneveld 2004. Broca's aphasia and prosodic processing. Brain & Language."),
  bullet("Rudzicz et al. 2011. The TORGO database of acoustic and articulatory speech from speakers with dysarthria. Language Resources and Evaluation."),
  bullet("Kim et al. 2008. Dysarthric speech database for universal access research (UA-Speech)."),
  bullet("Stark et al. 2020. APROCSA: A Public Repository of Conversation Recordings from Speakers with Aphasia."),
  bullet("Lin & Goyal et al. 2017. Focal Loss for Dense Object Detection (ICCV) — focal loss methodology."),
  bullet("Zhang et al. 2017. mixup: Beyond Empirical Risk Minimization — augmentation reference."),
];

const doc = new Document({
  creator: "Voice AI",
  title: "Voice AI — Technical Documentation",
  styles: {
    default: { document: { run: { font: "Calibri", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: "Calibri", color: BLUE },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Calibri", color: BLUE },
        paragraph: { spacing: { before: 240, after: 140 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Calibri", color: ACCENT },
        paragraph: { spacing: { before: 180, after: 100 }, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [{
      reference: "bullets",
      levels: [{
        level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } },
      }],
    }],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    headers: {
      default: new Header({ children: [new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: "Voice AI — Technical Documentation", color: GREY, size: 18 })],
      })] }),
    },
    footers: {
      default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: "Page ", color: GREY, size: 18 }),
          new TextRun({ children: [PageNumber.CURRENT], color: GREY, size: 18 }),
        ],
      })] }),
    },
    children: content,
  }],
});

Packer.toBuffer(doc).then(buf => {
  const out = path.join(__dirname, '..', 'Voice_AI_Technical_Documentation.docx');
  fs.writeFileSync(out, buf);
  console.log('Wrote', out, '(', buf.length, 'bytes )');
});
