"""
Voice AI — Clinical Speech Disorder Screening
Streamlit web application.

Run: streamlit run streamlit_app.py
"""

import os
import io
import sys
import warnings
import tempfile
import datetime
from pathlib import Path
from typing import Optional

import numpy as np
import streamlit as st
import plotly.graph_objects as go
import plotly.express as px

warnings.filterwarnings("ignore")
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
sys.path.insert(0, str(Path(__file__).parent))

# ─── Page configuration ──────────────────────────────────────────────────────
st.set_page_config(
    page_title="Voice AI — Speech Disorder Screening",
    page_icon="assets/favicon.png" if Path("assets/favicon.png").exists() else "🏥",
    layout="wide",
    initial_sidebar_state="expanded",
    menu_items={
        "About": "Voice AI — Clinical speech screening tool.",
    },
)

# ─── Custom CSS ───────────────────────────────────────────────────────────────
st.markdown("""
<style>
/* ───────────────────────────────────────────────────────────────────────────
 * Voice AI — Premium Clinical Interface
 * ─────────────────────────────────────────────────────────────────────────── */
@import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');

:root {
  --ink-900: #050810;
  --ink-800: #080d18;
  --ink-700: #0c1322;
  --ink-600: #111b30;
  --ink-500: #16223d;
  --ink-400: #1d2b4a;
  --line:    rgba(148, 163, 184, 0.10);
  --line-2:  rgba(148, 163, 184, 0.18);

  --ice-50:  #f1f7ff;
  --ice-100: #dbeaff;
  --ice-200: #b9d5ff;
  --ice-300: #8fbaff;
  --ice-400: #6c9eff;
  --ice-500: #4a82ff;
  --ice-600: #2e63eb;
  --ice-700: #1e4ac9;

  --gold:    #d4af6a;
  --gold-soft: #f0d9a6;

  --text-1:  #f1f5fb;
  --text-2:  #c7d3e6;
  --text-3:  #8b9bb8;
  --text-4:  #5d6c87;

  --shadow-soft: 0 1px 2px rgba(0,0,0,0.18), 0 8px 24px rgba(2,8,23,0.4);
  --shadow-lift: 0 1px 2px rgba(0,0,0,0.22), 0 20px 60px rgba(2,8,23,0.55);

  --ease-soft: cubic-bezier(0.22, 0.61, 0.36, 1);
  --ease-out:  cubic-bezier(0.16, 1, 0.3, 1);
}

* { box-sizing: border-box; }

html, body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    color: var(--text-1);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    letter-spacing: -0.005em;
}

/* ── Aurora-mesh background (applied directly, no pseudo-elements that
 *    could intercept Streamlit's stacking context) ─────────────────────── */
.stApp {
    background:
      radial-gradient(1200px 800px at 12% 10%, rgba(74,130,255,0.18), transparent 60%),
      radial-gradient(1000px 700px at 88% 90%, rgba(46,99,235,0.14), transparent 55%),
      radial-gradient(900px 700px at 60% 40%, rgba(212,175,106,0.08), transparent 50%),
      linear-gradient(180deg, var(--ink-900) 0%, var(--ink-800) 60%, var(--ink-700) 100%);
    background-attachment: fixed;
    background-size: 200% 200%, 200% 200%, 200% 200%, 100% 100%;
    color: var(--text-1);
    animation: aurora-pan 30s ease-in-out infinite alternate;
}
@keyframes aurora-pan {
    0%   { background-position: 0% 0%,   100% 100%, 50% 50%, 0 0; }
    50%  { background-position: 12% 8%,  88% 92%,   58% 42%, 0 0; }
    100% { background-position: 4% 14%,  96% 86%,   45% 55%, 0 0; }
}

/* ── Main column rhythm ───────────────────────────────────────────────── */
.main .block-container {
    padding-top: 2.4rem; padding-bottom: 4rem; max-width: 1180px;
}

/* ── Typography ───────────────────────────────────────────────────────── */
.stApp .main, .stApp .main * { color: var(--text-2); }
.stApp .main h1 {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 500; letter-spacing: -0.02em;
    color: var(--text-1) !important;
    font-feature-settings: 'ss01', 'ss02';
}
.stApp .main h2, .stApp .main h3, .stApp .main h4, .stApp .main h5 {
    color: var(--text-1) !important; font-weight: 600; letter-spacing: -0.01em;
}
.stApp .main p, .stApp .main span, .stApp .main div, .stApp .main label { color: var(--text-2); }
.stApp .main label { color: var(--text-1) !important; font-weight: 500; }
.stApp .main code {
    background: var(--ink-600); color: var(--ice-200);
    padding: 0.12em 0.5em; border-radius: 6px;
    border: 1px solid var(--line);
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.86em;
}
.stApp .main a { color: var(--ice-400); text-decoration: none; border-bottom: 1px solid rgba(108,158,255,0.3); transition: border-color 0.2s; }
.stApp .main a:hover { border-bottom-color: var(--ice-400); }
.stApp .main hr { border: 0; border-top: 1px solid var(--line); margin: 2rem 0; }

/* Headings get a subtle gradient stroke */
.stApp .main h1::after, .stApp .main h2::after {
    content: ""; display: block; width: 56px; height: 1px; margin-top: 0.7rem;
    background: linear-gradient(90deg, var(--ice-400), transparent);
}

/* ── Inputs ───────────────────────────────────────────────────────────── */
.stApp .main .stTextInput input,
.stApp .main .stSelectbox div[data-baseweb="select"] > div,
.stApp .main .stNumberInput input,
.stApp .main .stTextArea textarea {
    background: rgba(12, 19, 34, 0.72) !important;
    backdrop-filter: blur(12px);
    color: var(--text-1) !important;
    border: 1px solid var(--line-2) !important;
    border-radius: 10px !important;
    transition: border-color 0.25s var(--ease-out), box-shadow 0.25s var(--ease-out);
}
.stApp .main .stTextInput input:focus,
.stApp .main .stNumberInput input:focus,
.stApp .main .stTextArea textarea:focus {
    border-color: var(--ice-500) !important;
    box-shadow: 0 0 0 4px rgba(74,130,255,0.12) !important;
}

/* File uploader as a refined drop zone */
.stApp .main [data-testid="stFileUploaderDropzone"] {
    background: linear-gradient(180deg, rgba(17, 27, 48, 0.6), rgba(12, 19, 34, 0.8));
    backdrop-filter: blur(12px);
    border: 1px dashed rgba(148, 163, 184, 0.25);
    border-radius: 14px;
    transition: all 0.3s var(--ease-out);
}
.stApp .main [data-testid="stFileUploaderDropzone"]:hover {
    border-color: var(--ice-400);
    box-shadow: 0 0 0 4px rgba(74,130,255,0.08), var(--shadow-soft);
    transform: translateY(-1px);
}

/* Radio buttons */
.stApp .main .stRadio div[role="radiogroup"] { gap: 1.2rem; }
.stApp .main .stRadio label p { color: var(--text-1) !important; }

/* ── Tables — frosted-glass rows ──────────────────────────────────────── */
.stApp .main table { color: var(--text-2); border-collapse: separate; border-spacing: 0; }
.stApp .main thead th {
    background: rgba(22, 34, 61, 0.7) !important; color: var(--ice-200) !important;
    text-transform: uppercase; letter-spacing: 0.06em; font-size: 0.72rem; font-weight: 600;
    border-bottom: 1px solid var(--line) !important;
}
.stApp .main tbody tr { background: rgba(12, 19, 34, 0.35); transition: background 0.2s; }
.stApp .main tbody tr:hover { background: rgba(22, 34, 61, 0.55); }
.stApp .main tbody td { border-bottom: 1px solid var(--line) !important; padding: 0.7rem 1rem !important; }

/* ── Audio player ─────────────────────────────────────────────────────── */
.stApp .main audio {
    filter: invert(0.92) hue-rotate(170deg) saturate(0.85);
    border-radius: 10px; width: 100%;
}

/* ── Sidebar — glassmorphic, almost black ─────────────────────────────── */
section[data-testid="stSidebar"] {
    background: linear-gradient(180deg, rgba(5,8,16,0.92), rgba(8,13,24,0.88));
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-right: 1px solid var(--line);
}
section[data-testid="stSidebar"] * { color: var(--text-2) !important; }
section[data-testid="stSidebar"] .stMarkdown h3 {
    color: var(--ice-300) !important;
    font-size: 0.7rem; font-weight: 700;
    letter-spacing: 0.14em; text-transform: uppercase;
    margin-top: 1.6rem; margin-bottom: 0.5rem;
}

/* ── Premium glass cards ──────────────────────────────────────────────── */
.glass-card {
    background: linear-gradient(180deg, rgba(22, 34, 61, 0.55), rgba(12, 19, 34, 0.7));
    backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
    border: 1px solid var(--line-2);
    border-radius: 18px;
    padding: 1.6rem 1.8rem;
    box-shadow: var(--shadow-soft);
    transition: transform 0.45s var(--ease-out), box-shadow 0.45s var(--ease-out), border-color 0.3s;
}
.glass-card:hover {
    transform: translateY(-2px);
    border-color: rgba(108, 158, 255, 0.28);
    box-shadow: var(--shadow-lift);
}

/* Result cards — premium with subtle inner light */
.result-card-high, .result-card-moderate, .result-card-uncertain {
    position: relative; overflow: hidden;
    border-radius: 18px; padding: 1.8rem 2.2rem;
    backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
    animation: card-reveal 0.7s var(--ease-out) both;
}
.result-card-high {
    background:
      radial-gradient(800px 200px at 0% 0%, rgba(74,130,255,0.18), transparent 60%),
      linear-gradient(180deg, rgba(22, 34, 61, 0.7), rgba(12, 19, 34, 0.85));
    border: 1px solid rgba(108, 158, 255, 0.35);
    box-shadow: 0 0 0 1px rgba(108,158,255,0.08) inset, var(--shadow-lift);
}
.result-card-moderate {
    background:
      radial-gradient(700px 180px at 0% 0%, rgba(212,175,106,0.10), transparent 60%),
      linear-gradient(180deg, rgba(22, 34, 61, 0.55), rgba(12, 19, 34, 0.8));
    border: 1px solid rgba(212, 175, 106, 0.22);
    box-shadow: var(--shadow-soft);
}
.result-card-uncertain {
    background: linear-gradient(180deg, rgba(17, 27, 48, 0.5), rgba(12, 19, 34, 0.8));
    border: 1px dashed rgba(148, 163, 184, 0.28);
    box-shadow: var(--shadow-soft);
}
.result-card-high *, .result-card-moderate *, .result-card-uncertain * { color: var(--text-1) !important; }
@keyframes card-reveal {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
}

/* ── Metric cards — bespoke gauge frames ──────────────────────────────── */
.metric-card {
    background: linear-gradient(180deg, rgba(22, 34, 61, 0.45), rgba(12, 19, 34, 0.65));
    backdrop-filter: blur(12px);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 1rem 1.1rem; text-align: center;
    transition: transform 0.35s var(--ease-out), border-color 0.3s, box-shadow 0.35s;
    position: relative; overflow: hidden;
}
.metric-card::before {
    content: ""; position: absolute; left: 0; top: 0; height: 100%; width: 3px;
    background: linear-gradient(180deg, var(--ice-400), transparent);
    opacity: 0.65;
}
.metric-card:hover {
    transform: translateY(-2px); border-color: rgba(108, 158, 255, 0.3);
    box-shadow: 0 12px 30px rgba(2,8,23,0.45);
}
.metric-label {
    font-size: 0.68rem; color: var(--ice-300); font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.12em;
}
.metric-value {
    font-family: 'Fraunces', serif; font-size: 1.75rem; font-weight: 500;
    color: var(--text-1); margin: 0.3rem 0; letter-spacing: -0.02em;
    font-feature-settings: 'tnum';
}
.metric-range { font-size: 0.7rem; color: var(--text-3); }
.metric-normal   { color: var(--ice-300) !important; }
.metric-abnormal { color: var(--gold-soft) !important; }
.metric-card.abnormal::before { background: linear-gradient(180deg, var(--gold), transparent); }

/* ── Section headings ─────────────────────────────────────────────────── */
.section-heading {
    font-family: 'Inter', sans-serif;
    font-size: 0.72rem; font-weight: 600;
    letter-spacing: 0.14em; text-transform: uppercase;
    color: var(--ice-300);
    padding-bottom: 0.55rem;
    margin: 1.8rem 0 1rem 0;
    position: relative;
    display: inline-block;
}
.section-heading::after {
    content: ""; position: absolute; left: 0; right: 0; bottom: 0;
    height: 1px;
    background: linear-gradient(90deg, var(--ice-400) 0%, var(--line) 70%, transparent 100%);
}

/* ── Confidence badges ────────────────────────────────────────────────── */
.badge-high, .badge-moderate, .badge-uncertain {
    padding: 4px 14px; border-radius: 999px;
    font-size: 0.72rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;
    display: inline-flex; align-items: center; gap: 6px;
}
.badge-high      { background: linear-gradient(135deg, var(--ice-600), var(--ice-500)); color: #fff;
                   box-shadow: 0 0 0 1px rgba(108,158,255,0.4), 0 4px 14px rgba(46,99,235,0.35); }
.badge-moderate  { background: linear-gradient(135deg, rgba(212,175,106,0.7), rgba(212,175,106,0.4));
                   color: #1a1505; box-shadow: 0 0 0 1px rgba(212,175,106,0.3); }
.badge-uncertain { background: rgba(93,108,135,0.18); color: var(--text-2);
                   box-shadow: inset 0 0 0 1px var(--line-2); }

/* ── Tabs — refined ──────────────────────────────────────────────────── */
.stTabs [data-baseweb="tab-list"] {
    gap: 4px;
    border-bottom: 1px solid var(--line);
    background: transparent;
    padding: 0 0.2rem;
}
.stTabs [data-baseweb="tab"] {
    font-size: 0.86rem; font-weight: 500; color: var(--text-3) !important;
    background: transparent !important;
    padding: 0.6rem 1.1rem !important;
    border-radius: 10px 10px 0 0 !important;
    transition: color 0.25s var(--ease-out), background 0.25s, transform 0.25s;
}
.stTabs [data-baseweb="tab"]:hover {
    color: var(--text-1) !important;
    background: rgba(22,34,61,0.4) !important;
}
.stTabs [aria-selected="true"] {
    color: var(--ice-300) !important;
    background: rgba(22,34,61,0.55) !important;
    box-shadow: inset 0 -2px 0 var(--ice-500);
}
.stTabs [aria-selected="true"]::after {
    content: ""; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px;
    background: linear-gradient(90deg, var(--ice-500), var(--ice-400));
    box-shadow: 0 0 12px rgba(74,130,255,0.5);
}

/* ── Buttons — premium, with light sweep ─────────────────────────────── */
.stButton > button {
    font-family: 'Inter', sans-serif;
    font-weight: 600; font-size: 0.92rem; letter-spacing: 0.01em;
    border-radius: 12px;
    padding: 0.7rem 1.5rem;
    background: linear-gradient(135deg, var(--ice-600), var(--ice-500));
    color: #fff !important;
    border: 1px solid rgba(108,158,255,0.35);
    box-shadow:
      0 0 0 1px rgba(108,158,255,0.18) inset,
      0 10px 30px -10px rgba(46,99,235,0.6),
      0 2px 6px rgba(2,8,23,0.4);
    position: relative; overflow: hidden;
    transition: transform 0.3s var(--ease-out), box-shadow 0.3s, filter 0.3s;
}
.stButton > button::before {
    content: ""; position: absolute; inset: -100% -100%;
    background: linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.22) 50%, transparent 65%);
    transform: translateX(-150%); transition: transform 0.85s var(--ease-out);
}
.stButton > button:hover {
    transform: translateY(-2px);
    filter: brightness(1.05);
    box-shadow:
      0 0 0 1px rgba(108,158,255,0.32) inset,
      0 18px 40px -10px rgba(46,99,235,0.7),
      0 4px 14px rgba(2,8,23,0.5);
}
.stButton > button:hover::before { transform: translateX(150%); }
.stButton > button:active { transform: translateY(0); }

/* ── Expanders ────────────────────────────────────────────────────────── */
.stApp .main .streamlit-expanderHeader,
.stApp .main details {
    background: linear-gradient(180deg, rgba(22, 34, 61, 0.45), rgba(12, 19, 34, 0.65)) !important;
    backdrop-filter: blur(10px);
    border: 1px solid var(--line) !important;
    border-radius: 12px !important;
    transition: border-color 0.25s;
}
.stApp .main .streamlit-expanderHeader:hover { border-color: rgba(108,158,255,0.3) !important; }
.stApp .main details summary { color: var(--ice-200) !important; font-weight: 500; }

/* ── Spinner & progress ───────────────────────────────────────────────── */
.stApp .stSpinner > div {
    border-top-color: var(--ice-400) !important;
    border-right-color: var(--ice-400) !important;
}
.stApp [data-testid="stStatusWidget"] {
    background: rgba(22, 34, 61, 0.55); backdrop-filter: blur(10px);
    border: 1px solid var(--line); border-radius: 10px;
}

/* ── Soft fade-in for page content ────────────────────────────────────── */
.main .block-container > * {
    animation: page-rise 0.7s var(--ease-out) both;
}
.main .block-container > *:nth-child(2)  { animation-delay: 0.05s; }
.main .block-container > *:nth-child(3)  { animation-delay: 0.10s; }
.main .block-container > *:nth-child(4)  { animation-delay: 0.15s; }
.main .block-container > *:nth-child(5)  { animation-delay: 0.20s; }
.main .block-container > *:nth-child(6+) { animation-delay: 0.25s; }
@keyframes page-rise {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
}

/* Reduce motion */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}

/* ── Premium hero block ───────────────────────────────────────────────── */
.va-hero {
    position: relative;
    padding: 2rem 0 2.4rem 0;
    margin-bottom: 1.5rem;
}
.va-hero-eyebrow {
    display: inline-flex; align-items: center; gap: 8px;
    font-size: 0.72rem; font-weight: 600; letter-spacing: 0.18em;
    text-transform: uppercase; color: var(--ice-300);
    padding: 6px 14px; border-radius: 999px;
    background: rgba(74,130,255,0.10);
    border: 1px solid rgba(108,158,255,0.25);
}
.va-hero-eyebrow::before {
    content: ""; width: 6px; height: 6px; border-radius: 50%;
    background: var(--ice-400); box-shadow: 0 0 0 4px rgba(74,130,255,0.18);
    animation: hero-pulse 2.6s ease-in-out infinite;
}
@keyframes hero-pulse {
    0%, 100% { opacity: 1; box-shadow: 0 0 0 4px rgba(74,130,255,0.18); }
    50%      { opacity: 0.7; box-shadow: 0 0 0 8px rgba(74,130,255,0.0); }
}
.va-hero-title {
    font-family: 'Fraunces', serif; font-weight: 400;
    font-size: clamp(2.4rem, 4vw + 0.6rem, 3.6rem);
    line-height: 1.05; letter-spacing: -0.025em;
    color: var(--text-1); margin: 1rem 0 0.6rem 0;
    background: linear-gradient(180deg, var(--text-1) 0%, #c7d3e6 100%);
    -webkit-background-clip: text; background-clip: text;
    -webkit-text-fill-color: transparent;
}
.va-hero-title em {
    font-style: italic; font-weight: 400;
    background: linear-gradient(120deg, var(--ice-200), var(--gold-soft));
    -webkit-background-clip: text; background-clip: text;
    -webkit-text-fill-color: transparent;
}
.va-hero-sub {
    font-size: 1rem; color: var(--text-2); max-width: 640px;
    line-height: 1.55; margin: 0;
}

/* Hide Streamlit menu + footer only (do NOT touch stHeader or stToolbar —
 * collapsing them broke the layout's stacking context on Cloud) */
#MainMenu, footer { visibility: hidden; }
[data-testid="stHeader"] { background: transparent; }

/* Scrollbar — restrained */
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(148,163,184,0.18); border-radius: 8px; border: 2px solid transparent; background-clip: content-box; }
::-webkit-scrollbar-thumb:hover { background: rgba(148,163,184,0.3); background-clip: content-box; }
</style>
""", unsafe_allow_html=True)

# ─── Session state initialisation ────────────────────────────────────────────
if "history" not in st.session_state:
    st.session_state.history = []
if "patient_id" not in st.session_state:
    st.session_state.patient_id = ""
if "last_result" not in st.session_state:
    st.session_state.last_result = None

# ─── Model loading (cached) ───────────────────────────────────────────────────
@st.cache_resource(show_spinner="Loading Voice AI model...")
def load_model():
    from voice_ai_v2.model import VoiceModelV2
    return VoiceModelV2(model_dir="./model_v2")


@st.cache_resource(show_spinner=False)
def try_preload_whisper():
    """Best-effort lazy load of Whisper. Never raises; never blocks app boot."""
    try:
        from voice_ai.features import _load_whisper
        return _load_whisper() is not None
    except Exception:
        return False

# ─── Analysis function ────────────────────────────────────────────────────────
def run_analysis(audio_bytes: bytes, filename: str = "recording.wav"):
    """Load audio bytes, run model + clinical indicators, return results dict."""
    import time as _t
    import librosa
    from voice_ai.features import extract_clinical_indicators
    from voice_ai_v2.preprocessing import preprocess as v2_preprocess
    from voice_ai_v2 import LABELS

    trace = []
    def _step(name: str, t0: float, detail: str = ""):
        trace.append({"step": name, "ms": (_t.time() - t0) * 1000, "detail": detail})

    model = load_model()

    suffix = Path(filename).suffix or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(audio_bytes)
        tmp_path = f.name

    try:
        t0 = _t.time()
        raw, _ = librosa.load(tmp_path, sr=16000, mono=True)
        raw = raw.astype(np.float32)
        _step("Load & resample audio", t0,
              f"loaded {len(raw)/16000:.2f}s @ 16 kHz mono ({len(raw):,} samples)")

        # Run the SAME preprocessing the model was trained on (bandpass + loudness
        # norm + Silero VAD). Mismatch here causes the model to misclassify mic
        # audio as the closest pathological class. This step is critical.
        t0 = _t.time()
        proc = v2_preprocess(tmp_path, apply_vad=True, apply_denoise=False)
        # If VAD stripped almost everything (e.g. very quiet recording), fall
        # back to bandpass-only audio so the embedder sees something speech-like.
        if len(proc) < 16000 * 0.5:
            proc = v2_preprocess(tmp_path, apply_vad=False, apply_denoise=False)
            vad_note = "VAD found <0.5s speech — fell back to bandpass-only audio"
        else:
            vad_note = f"{len(proc)/16000:.2f}s kept after VAD"
        _step("Match-train preprocessing (bandpass + loudness + VAD)", t0,
              f"{vad_note}; −23 LUFS normalised; 80–8000 Hz bandpass")
    finally:
        os.unlink(tmp_path)

    # Cap raw audio length used for the heavy Praat/HuBERT passes. Real-world
    # screening clips rarely benefit from > 15 s.
    raw_for_features = raw[:int(16000 * 15)]

    # ── Single combined Praat call → jitter, shimmer, HNR, CPP, F0 ────────
    from voice_ai.features import _praat_all, _pause_stats, _speech_rate, ClinicalIndicators
    t0 = _t.time()
    pr_all = _praat_all(raw_for_features, 16000)
    sr_total = _speech_rate(raw_for_features, 16000)
    indicators = ClinicalIndicators(
        jitter_pct=round(pr_all['jitter_pct'], 4),
        shimmer_pct=round(pr_all['shimmer_pct'], 4),
        hnr_db=round(pr_all['hnr_db'], 2),
        f0_mean_hz=round(pr_all['f0_mean_hz'], 1),
        f0_range_hz=round(pr_all['f0_range_hz'], 1),
        speech_rate_est=round(sr_total, 2),
    )
    cpp_db = pr_all['cpp_db']
    _step("Acoustic indicators (Praat: jitter, shimmer, HNR, CPP, F0)", t0,
          f"jitter={indicators.jitter_pct:.2f}%, shimmer={indicators.shimmer_pct:.2f}%, "
          f"HNR={indicators.hnr_db:.1f} dB, CPP={cpp_db:.1f} dB, "
          f"F0={indicators.f0_mean_hz:.0f} Hz")

    # ── Pause distribution + articulation rate ────────────────────────────
    t0 = _t.time()
    pstats = {'voiced_frac': 0.5, 'n_pause_500ms': 0, 'n_pause_1s': 0, 'articulation_rate': 0.0}
    try:
        pstats = _pause_stats(raw_for_features, 16000)
        _step("Pause distribution + articulation rate", t0,
              f"voiced={pstats['voiced_frac']:.0%}, "
              f"long pauses (≥500ms)={pstats['n_pause_500ms']}, "
              f"(≥1s)={pstats['n_pause_1s']}, "
              f"articulation rate={pstats['articulation_rate']:.2f} syl/s")
    except Exception as e:
        _step("Pause distribution", t0, f"unavailable ({type(e).__name__})")

    # ── Adaptive decision: should we run Whisper (ASR for WPM)? ───────────
    # Whisper adds 1-3 s of inference (after one-time download) and is the
    # strongest single non-fluent-aphasia cue. We run it only when the clip
    # is long enough AND shows prosodic signs of possible aphasia, OR when
    # the recording is long enough to give ASR a reliable transcription.
    duration_sec = len(raw) / 16000
    aphasia_signal = (pstats['voiced_frac'] < 0.70
                       or pstats['n_pause_500ms'] >= 2
                       or pstats['n_pause_1s'] >= 1
                       or (0 < indicators.speech_rate_est < 3.5))
    voice_pathology_signal = (indicators.hnr_db > 0 and indicators.hnr_db < 12) or \
                              (indicators.jitter_pct > 2.5) or \
                              (indicators.shimmer_pct > 10)
    use_whisper = duration_sec >= 4.0 and (aphasia_signal or duration_sec >= 8.0) \
                  and not (voice_pathology_signal and duration_sec < 6.0)

    # ── Whisper-based words-per-minute (WPM) — non-fluent aphasia <90 WPM ──
    t0 = _t.time()
    wpm_res = {'words': 0, 'wpm': 0.0, 'duration_sec': duration_sec, 'transcript': ''}
    if use_whisper:
        try:
            if try_preload_whisper():
                from voice_ai.features import whisper_word_count
                wpm_res = whisper_word_count(raw, 16000)
        except Exception:
            pass
        if wpm_res['wpm'] > 0:
            snippet = wpm_res['transcript'][:80] + ('…' if len(wpm_res['transcript']) > 80 else '')
            _step("Whisper ASR → WPM (clinical fluency)", t0,
                  f"transcribed {wpm_res['words']} words in {wpm_res['duration_sec']:.1f}s "
                  f"= {wpm_res['wpm']:.0f} WPM (control ≈150-180, non-fluent aphasia <90). "
                  f"Heard: \"{snippet}\"")
        else:
            _step("Whisper ASR → WPM", t0,
                  "transcription unavailable")
    else:
        reason = ("clip < 4s — too short for reliable ASR" if duration_sec < 4.0
                  else "voice-quality signature dominant — dysarthria more likely than aphasia"
                  if voice_pathology_signal and duration_sec < 6.0
                  else "no aphasic prosodic signature — ASR unnecessary")
        _step("Whisper ASR → WPM",  t0, f"auto-skipped: {reason}")

    # Deep speech embedding — first a fast single-pass, then adaptive TTA only
    # if the baseline classifier is unsure (max prob < 70 %).
    t0 = _t.time()
    import torch as _torch
    proc_emb = proc[:int(16000 * 10)]
    emb_main = model.embedder.embed(proc_emb, sr=16000)
    _step("Deep speech embedding (fast single pass)", t0,
          f"{emb_main.shape[0]}-dim mean+std embedding (analysed first {len(proc_emb)/16000:.1f}s)")

    # Multi-window voting: for clips ≥ 8 s, classify three overlapping windows
    # independently and use AGREEMENT as a confidence signal. Disagreement
    # honestly reports uncertainty rather than fake confidence.
    from voice_ai_v2.train import _softmax_np as _sm_pre
    window_probs = []
    window_winners = []
    if len(proc) >= 16000 * 8:
        L = len(proc); w = int(16000 * 5)
        windows = [proc[:w],
                   proc[max(0, (L - w) // 2): max(0, (L - w) // 2) + w],
                   proc[max(0, L - w):]]
        t0 = _t.time()
        for w_ in windows:
            wemb = model.embedder.embed(w_, sr=16000)
            wes  = model.scaler.transform(wemb.reshape(1, -1))
            with _torch.no_grad():
                wl = model.head(_torch.tensor(wes, dtype=_torch.float32,
                                              device=model.device)).cpu().numpy()
            wp = _sm_pre(wl)[0]
            window_probs.append(wp)
            window_winners.append(int(wp.argmax()))
        win_summary = ", ".join(
            f"w{i+1}:{LABELS[w][:3]}({wp.max():.0%})"
            for i, (wp, w) in enumerate(zip(window_probs, window_winners))
        )
        _step("Multi-window voting (3 × 5s windows, independent classification)", t0, win_summary)

    # Baseline forward pass to check confidence
    t0 = _t.time()
    emb_s_main = model.scaler.transform(emb_main.reshape(1, -1))
    with _torch.no_grad():
        logits_main = model.head(_torch.tensor(emb_s_main, dtype=_torch.float32,
                                                device=model.device)).cpu().numpy()
    from voice_ai_v2.train import _softmax_np as _sm
    probs_baseline = _sm(logits_main)[0]
    baseline_conf = float(probs_baseline.max())

    # Adaptive TTA: only run if baseline is uncertain
    if baseline_conf < 0.70 and len(proc_emb) > 16000:
        rng = np.random.default_rng(0)
        v1 = (proc_emb * rng.uniform(0.85, 1.15)).astype(np.float32)
        v2 = (proc_emb + rng.normal(0, 0.003, len(proc_emb)).astype(np.float32)).clip(-1, 1).astype(np.float32)
        emb = np.mean(np.stack([emb_main, model.embedder.embed(v1, 16000),
                                model.embedder.embed(v2, 16000)], axis=0), axis=0)
        _step("Adaptive TTA triggered", t0,
              f"baseline confidence only {baseline_conf:.0%} — averaging over 3 perturbed views for stability")
    else:
        emb = emb_main
        _step("Adaptive TTA decision", t0,
              f"baseline confident ({baseline_conf:.0%}) — TTA skipped to save time")

    t0 = _t.time()
    emb_s = model.scaler.transform(emb.reshape(1, -1))
    _step("Standardize features (StandardScaler)", t0,
          f"z-scored {emb_s.shape[1]} features against training distribution")

    t0 = _t.time()
    with _torch.no_grad():
        logits = model.head(_torch.tensor(emb_s, dtype=_torch.float32,
                                          device=model.device)).cpu().numpy()
    from voice_ai_v2.train import _softmax_np, _apply_calibrators
    raw_probs = _softmax_np(logits)
    short = [l[:3] for l in LABELS]
    _step("Classifier head forward pass (MLP)", t0,
          f"softmax: {dict(zip(short, [f'{p:.2f}' for p in raw_probs[0]]))}")

    t0 = _t.time()
    probs_cal = _apply_calibrators(raw_probs, model.calibrators)[0]
    _step("Isotonic calibration (per-class)", t0,
          f"calibrated probs: {dict(zip(short, [f'{p:.2f}' for p in probs_cal]))}")

    # Multi-window agreement fusion: if all windows agree with the full-clip
    # Multi-window probability AVERAGING (no boost, no rule overrides).
    # When the clip is long enough that we ran 3 windows, average them with
    # the full-clip probabilities. This is a pure ensemble — no class-specific
    # amplification that can lock in a wrong winner.
    if window_probs:
        all_probs = np.stack([probs_cal] + window_probs, axis=0)
        probs_cal = np.mean(all_probs, axis=0)
        probs_cal = probs_cal / probs_cal.sum()
        full_winner = int(probs_cal.argmax())
        n_agree = sum(1 for w in window_winners if w == full_winner)
        _step("Multi-window probability averaging", 0,
              f"{n_agree}/3 windows agree with averaged winner; "
              f"final probs: {dict(zip(short, [f'{p:.2f}' for p in probs_cal]))}")

    # Descriptive acoustic indicator summary — shown for clinician review.
    # NO LONGER USED FOR PROBABILITY OVERRIDES. The MLP head was trained on
    # speaker-disjoint real data (89% test acc); we trust its calibrated
    # output rather than layering brittle rule-based corrections on top.
    t0 = _t.time()
    wpm = wpm_res.get('wpm', 0.0)
    wpm_str = f"{wpm:.0f}" if wpm > 0 else "n/a"
    summary = (
        f"HNR={indicators.hnr_db:.1f} dB  jitter={indicators.jitter_pct:.2f}%  "
        f"shimmer={indicators.shimmer_pct:.2f}%  voiced={pstats['voiced_frac']:.0%}  "
        f"rate={indicators.speech_rate_est:.1f} syl/s  "
        f"WPM={wpm_str}  "
        f"long pauses ≥1s: {pstats['n_pause_1s']}"
    )
    _step("Clinical indicators summary (descriptive only)", t0, summary)

    from voice_ai_v2.model import _make_prediction
    prediction = _make_prediction(probs_cal)
    trace.append({"step": "Final decision", "ms": 0.0,
                  "detail": f"argmax → {prediction.label} ({prediction.confidence:.1%}, "
                            f"{prediction.confidence_level} confidence)"})

    sr = 16000
    audio = raw
    step  = max(1, len(audio) // 500)
    times = np.arange(0, len(audio), step) / sr
    wave  = audio[::step]

    return {
        "prediction":  prediction,
        "indicators":  indicators,
        "waveform_t":  times,
        "waveform_y":  wave,
        "duration":    len(audio) / sr,
        "timestamp":   datetime.datetime.now(),
        "filename":    filename,
        "patient_id":  st.session_state.patient_id or "Anonymous",
        "trace":       trace,
    }

# ─── Chart builders ───────────────────────────────────────────────────────────

INDICATOR_CONFIG = [
    ("Jitter",       "jitter_pct",      "%",     0,    3,    1.04,  "% — pitch irregularity"),
    ("Shimmer",      "shimmer_pct",     "%",     0,    8,    3.81,  "% — amplitude irregularity"),
    ("HNR",          "hnr_db",          "dB",    0,   40,   20.0,   "dB — voice quality"),
    ("F0 Mean",      "f0_mean_hz",      "Hz",   50,  350,  None,    "Hz — fundamental frequency"),
    ("F0 Range",     "f0_range_hz",     "Hz",    0,  250,   50.0,   "Hz — pitch variation"),
    ("Speech Rate",  "speech_rate_est", "syl/s", 0,   8,   None,    "syl/s — fluency"),
]

def make_gauge(label, value, unit, lo, hi, threshold, is_higher_better, normal):
    """Single Plotly gauge indicator."""
    colour = "#10b981" if normal else "#ef4444"

    fig = go.Figure(go.Indicator(
        mode="gauge+number",
        value=round(value, 2),
        number={"suffix": f" {unit}", "font": {"size": 20, "color": colour}},
        title={"text": label, "font": {"size": 13, "color": "#374151", "family": "Inter"}},
        gauge={
            "axis": {
                "range": [lo, hi],
                "tickfont": {"size": 9, "color": "#9ca3af"},
                "tickwidth": 1,
            },
            "bar": {"color": colour, "thickness": 0.3},
            "bgcolor": "white",
            "borderwidth": 0,
            "steps": [
                {"range": [lo, hi], "color": "#f1f5f9"},
            ],
            "threshold": {
                "line": {"color": "#94a3b8", "width": 2},
                "thickness": 0.8,
                "value": threshold if threshold else (hi * 0.6),
            },
        },
    ))
    fig.update_layout(
        height=190,
        margin=dict(l=20, r=20, t=40, b=10),
        paper_bgcolor="white",
        font_family="Inter",
    )
    return fig


def make_probability_chart(probabilities: dict):
    """Horizontal bar chart for class probabilities."""
    labels_display = {
        "aphasia":    "Aphasia",
        "control":    "Control (Normal)",
        "dysarthria": "Dysarthria",
        "ua_speech":  "Unintelligible / Atypical",
    }
    sorted_probs = sorted(probabilities.items(), key=lambda x: x[1])
    labels = [labels_display.get(k, k) for k, _ in sorted_probs]
    values = [v * 100 for _, v in sorted_probs]
    colours = [
        "#3b82f6" if v == max(values) else "#cbd5e1"
        for v in values
    ]

    fig = go.Figure(go.Bar(
        x=values,
        y=labels,
        orientation="h",
        marker_color=colours,
        text=[f"{v:.1f}%" for v in values],
        textposition="outside",
        textfont={"size": 12, "color": "#374151"},
        cliponaxis=False,
    ))
    fig.update_layout(
        height=200,
        margin=dict(l=10, r=60, t=10, b=10),
        xaxis=dict(range=[0, 115], showgrid=False, showticklabels=False, zeroline=False),
        yaxis=dict(tickfont={"size": 11, "color": "#374151"}),
        plot_bgcolor="white",
        paper_bgcolor="white",
        bargap=0.35,
        font_family="Inter",
    )
    return fig


def make_waveform(times, wave):
    """Audio waveform plot."""
    fig = go.Figure(go.Scatter(
        x=times, y=wave,
        mode="lines",
        line=dict(color="#3b82f6", width=0.8),
        fill="tozeroy",
        fillcolor="rgba(59,130,246,0.07)",
    ))
    fig.update_layout(
        height=110,
        margin=dict(l=0, r=0, t=8, b=24),
        xaxis=dict(title="Time (s)", tickfont={"size": 9}, showgrid=False),
        yaxis=dict(showticklabels=False, showgrid=False, zeroline=True,
                   zerolinecolor="#e2e8f0", zerolinewidth=1),
        plot_bgcolor="white",
        paper_bgcolor="white",
        font_family="Inter",
    )
    return fig

# ─── Result rendering ─────────────────────────────────────────────────────────

CONDITION_DESC = {
    "aphasia":    "Language disorder typically following stroke or brain injury, characterised by difficulty producing or comprehending speech.",
    "dysarthria": "Motor speech disorder causing slurred, weak, or slow speech due to muscle weakness or neurological impairment.",
    "ua_speech":  "Significantly reduced speech intelligibility requiring specialist assessment.",
    "control":    "Speech patterns within normal acoustic parameters.",
}
CONDITION_LABEL = {
    "aphasia":    "Aphasia",
    "control":    "Control (Normal)",
    "dysarthria": "Dysarthria",
    "ua_speech":  "Unintelligible / Atypical Speech",
}

def render_results(result: dict):
    pred       = result["prediction"]
    indicators = result["indicators"]
    label      = CONDITION_LABEL.get(pred.label, pred.label)
    conf_pct   = pred.confidence * 100
    level      = pred.confidence_level

    level_colour = {"high": "#10b981", "moderate": "#f59e0b", "uncertain": "#ef4444"}[level]
    card_class   = f"result-card-{level}"

    # ── Primary finding ────────────────────────────────────────────────────
    st.markdown('<p class="section-heading">Primary Finding</p>', unsafe_allow_html=True)
    st.markdown(f"""
    <div class="{card_class}">
      <div style="display:flex; align-items:center; gap:14px; margin-bottom:0.4rem;">
        <span style="font-size:1.75rem; font-weight:700; color:#0f172a;">{label}</span>
        <span class="badge-{level}">{level.upper()}</span>
      </div>
      <div style="font-size:1.1rem; color:{level_colour}; font-weight:600; margin-bottom:0.5rem;">
        {conf_pct:.1f}% confidence
      </div>
      <div style="font-size:0.88rem; color:#475569; line-height:1.5;">
        {CONDITION_DESC.get(pred.label, '')}
      </div>
    </div>
    """, unsafe_allow_html=True)
    st.markdown("")

    # ── AI thinking process trace ──────────────────────────────────────────
    if result.get("trace"):
        with st.expander("AI Reasoning Trace — step-by-step analysis", expanded=True):
            st.markdown(
                "<div style='font-size:0.85rem; color:#1e3a8a; margin-bottom:0.4rem;'>"
                "Each step below shows what the model actually computed, in order, "
                "with timing and intermediate values.</div>",
                unsafe_allow_html=True,
            )
            for i, s in enumerate(result["trace"], 1):
                ms_txt = f"{s['ms']:.0f} ms" if s["ms"] > 0 else "—"
                st.markdown(
                    f"<div style='border-left:3px solid #2563eb; padding:0.4rem 0.8rem; "
                    f"margin-bottom:0.4rem; background:#ffffff; border-radius:6px;'>"
                    f"<div style='display:flex; justify-content:space-between;'>"
                    f"<strong style='color:#1e3a8a;'>{i}. {s['step']}</strong>"
                    f"<span style='color:#64748b; font-size:0.8rem;'>{ms_txt}</span></div>"
                    f"<div style='color:#475569; font-size:0.85rem; margin-top:0.2rem;'>"
                    f"{s['detail']}</div></div>",
                    unsafe_allow_html=True,
                )

    # ── Probability + Waveform ─────────────────────────────────────────────
    col_prob, col_wave = st.columns([1, 1])
    with col_prob:
        st.markdown('<p class="section-heading">Probability Breakdown</p>', unsafe_allow_html=True)
        st.plotly_chart(make_probability_chart(pred.probabilities),
                        use_container_width=True, config={"displayModeBar": False})
    with col_wave:
        st.markdown('<p class="section-heading">Audio Waveform</p>', unsafe_allow_html=True)
        st.plotly_chart(make_waveform(result["waveform_t"], result["waveform_y"]),
                        use_container_width=True, config={"displayModeBar": False})
        dur = result["duration"]
        st.caption(f"Duration: {dur:.1f} s   ·   Windows analysed: {pred.n_windows}")

    # ── Clinical indicators (6 gauges) ─────────────────────────────────────
    st.markdown('<p class="section-heading">Acoustic Indicators — 6 Core Features</p>',
                unsafe_allow_html=True)

    gauge_cols = st.columns(6)
    gauge_meta = [
        ("Jitter",      "jitter_pct",      "%",     0,    3,    1.04,  False),
        ("Shimmer",     "shimmer_pct",      "%",     0,   10,    3.81,  False),
        ("HNR",         "hnr_db",           "dB",    0,   40,   20.0,   True),
        ("F0 Mean",     "f0_mean_hz",       "Hz",   50,  350,   None,   None),
        ("F0 Range",    "f0_range_hz",      "Hz",   0,   250,   50.0,   True),
        ("Speech Rate", "speech_rate_est",  "syl/s", 0,   8,    None,   None),
    ]
    for col, (glab, gkey, gunit, glo, ghi, gthresh, higher_better) in zip(gauge_cols, gauge_meta):
        val    = getattr(indicators, gkey)
        normal = indicators.is_normal(gkey)
        with col:
            st.plotly_chart(
                make_gauge(glab, val, gunit, glo, ghi, gthresh, higher_better, normal),
                use_container_width=True, config={"displayModeBar": False},
            )
            status_html = (
                '<span style="color:#10b981;font-size:0.75rem;font-weight:600;">Normal</span>'
                if normal else
                '<span style="color:#ef4444;font-size:0.75rem;font-weight:600;">Abnormal</span>'
            )
            st.markdown(f'<div style="text-align:center;margin-top:-12px">{status_html}</div>',
                        unsafe_allow_html=True)

    abn = indicators.abnormal_count()
    if abn:
        st.info(f"{abn}/6 indicator(s) outside the normal reference range.")

    # ── Recommendation ─────────────────────────────────────────────────────
    st.markdown('<p class="section-heading">Clinical Recommendation</p>', unsafe_allow_html=True)
    rec_colour_bg = {"high": "#ecfdf5", "moderate": "#fffbeb", "uncertain": "#fef2f2"}[level]
    rec_colour_bd = {"high": "#10b981", "moderate": "#f59e0b", "uncertain": "#ef4444"}[level]
    st.markdown(f"""
    <div style="background:{rec_colour_bg}; border-left:4px solid {rec_colour_bd};
                border-radius:6px; padding:1rem 1.2rem; color:#1e293b; font-size:0.9rem;
                line-height:1.6;">
      {pred.recommendation}
    </div>
    """, unsafe_allow_html=True)

    # ── Downloads ──────────────────────────────────────────────────────────
    st.markdown('<p class="section-heading">Export Report</p>', unsafe_allow_html=True)
    dl_col1, dl_col2, _ = st.columns([1, 1, 3])

    # TXT report
    from voice_ai.clinical import build_text_report
    txt_report = build_text_report(pred, indicators, result["patient_id"])
    dl_col1.download_button(
        "Download Text Report",
        data=txt_report.encode("utf-8"),
        file_name=f"voice_ai_report_{result['timestamp'].strftime('%Y%m%d_%H%M%S')}.txt",
        mime="text/plain",
        use_container_width=True,
    )

    # PDF report
    pdf_buf = io.BytesIO()
    try:
        from voice_ai.clinical import save_pdf_report
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            save_pdf_report(pred, indicators, tmp.name, result["patient_id"])
            with open(tmp.name, "rb") as f:
                pdf_bytes = f.read()
            os.unlink(tmp.name)

        dl_col2.download_button(
            "Download PDF Report",
            data=pdf_bytes,
            file_name=f"voice_ai_report_{result['timestamp'].strftime('%Y%m%d_%H%M%S')}.pdf",
            mime="application/pdf",
            use_container_width=True,
        )
    except Exception:
        dl_col2.warning("PDF generation unavailable — install reportlab.")


# ─── Sidebar ─────────────────────────────────────────────────────────────────

def render_sidebar():
    with st.sidebar:
        st.markdown("## Voice AI")
        st.markdown("Speech Disorder Screening")
        st.divider()

        ### Patient Info ###
        st.markdown("### Patient / Session")
        pid = st.text_input(
            "Patient ID",
            value=st.session_state.patient_id,
            placeholder="e.g. PT-00123",
            label_visibility="collapsed",
        )
        if pid != st.session_state.patient_id:
            st.session_state.patient_id = pid

        st.caption(f"Session: {datetime.date.today().isoformat()}")

        ### Model status ###
        st.divider()
        st.markdown("### Model Status")
        try:
            m = load_model()
            meta = m.metadata
            acc  = meta.get("test_accuracy", 0) * 100
            st.success(f"Loaded — {acc:.1f}% test acc")
            if "class_weights" in meta:
                st.caption("Retrained model (class-balanced)")
            else:
                st.info("Model loaded — class-balanced training")
        except Exception as e:
            st.error(f"Model error: {e}")

        ### Analysis history ###
        if st.session_state.history:
            st.divider()
            st.markdown("### Recent Analyses")
            for h in reversed(st.session_state.history[-6:]):
                ts   = h["timestamp"].strftime("%H:%M")
                label = CONDITION_LABEL.get(h["label"], h["label"])
                conf  = h["confidence"] * 100
                lv    = h["level"]
                dot   = {"high": "🟢", "moderate": "🟡", "uncertain": "🔴"}.get(lv, "⚪")
                st.markdown(f"{dot} **{ts}** — {label[:18]}  \n"
                            f"<span style='font-size:0.75rem;color:#94a3b8'>{conf:.0f}% {lv}</span>",
                            unsafe_allow_html=True)

        ### Info ###
        st.divider()
        st.markdown("### About")
        st.caption(
            "Voice AI v1.0  \n"
            "4 classes: Aphasia, Control, Dysarthria, UA-Speech  \n"
            "32 acoustic features · 6 clinical indicators"
        )


# ─── Demonstrations tab ───────────────────────────────────────────────────────

DEMO_CONFIG = {
    "control": {
        "title":       "Control — Healthy Speech",
        "color":       "#60a5fa",
        "description": "Smooth voicing, regular pitch contour, clean harmonic structure. "
                       "Expected ranges on connected reading: jitter < 2.5%, shimmer < 12%, HNR > 10 dB.",
        "passage":     "The rainbow is a division of white light into many beautiful colors. "
                       "These take the shape of a long round arch, with its path high above, "
                       "and its two ends apparently beyond the horizon.",
        "tip":         "Read in a relaxed conversational pace. Even, sustained phonation.",
        "gait":        "steady",
    },
    "dysarthria": {
        "title":       "Dysarthria — Motor Speech Disorder",
        "color":       "#f59e0b",
        "description": "Weak, slurred, or slow articulation from neuromuscular impairment "
                       "(stroke, Parkinson's, ALS). Elevated jitter (>2%), shimmer (>10%), "
                       "reduced HNR, narrowed pitch range.",
        "passage":     "Pa-ta-ka, pa-ta-ka, pa-ta-ka. The big black bug bit the big black bear. "
                       "Methodist Episcopal. Aluminum linoleum.",
        "tip":         "Diadochokinetic (DDK) task. Try at maximum speed — uneven syllable "
                       "timing or imprecise consonants resemble dysarthric speech.",
        "gait":        "asymmetric",
    },
    "aphasia": {
        "title":       "Aphasia — Language Disorder",
        "color":       "#a78bfa",
        "description": "Difficulty producing or comprehending language, typically from left-"
                       "hemisphere stroke. Halting speech, word-finding pauses, telegraphic "
                       "phrases. Long voiceless gaps in acoustic envelope.",
        "passage":     "Cookie... the boy... falling. Stool. Mother... washing. Water... over.",
        "tip":         "Read with long unnatural pauses between content words. Omit function "
                       "words (the, is, and). Mimics Broca-type non-fluent aphasia.",
        "gait":        "halting",
    },
    "ua_speech": {
        "title":       "Atypical Speech — Severe Intelligibility Loss",
        "color":       "#ec4899",
        "description": "Severely reduced intelligibility from cerebral palsy or advanced "
                       "neuromotor disease. Highly irregular voicing, prolonged segments, "
                       "very low HNR, extreme jitter/shimmer.",
        "passage":     "Aaaaa... uuuu... eee... (sustained vowels with intentional tremor)",
        "tip":         "Hold a vowel /a/ for 3 seconds with audible tremor and amplitude "
                       "irregularity. Mimics UA-Speech atypical phonation.",
        "gait":        "tremor",
    },
}


def make_stick_figure(gait: str, color: str = "#60a5fa"):
    """3D plotly skeleton animation illustrating gait/movement disturbance per condition."""
    import plotly.graph_objects as go

    N_FRAMES = 30

    def joints(t: float):
        """Return 13 joint coordinates (head, neck, shoulders, elbows, hands, hip, knees, feet)."""
        # base walking gait
        stride = 0.35
        knee_lift = 0.18
        arm_swing = 0.25
        tremor_x = 0.0
        asymm = 0.0
        gap = 1.0  # phase coherence

        if gait == "asymmetric":
            asymm = 0.15 * np.sin(t * 2 * np.pi)
            stride *= 0.6
            knee_lift *= 0.4
        elif gait == "halting":
            # freeze for parts of cycle
            gap = 1.0 if (t % 1.0) < 0.55 else 0.0
        elif gait == "tremor":
            tremor_x = 0.04 * np.sin(t * 2 * np.pi * 8)

        phase = t * 2 * np.pi * gap
        # walking offset along y axis
        y_walk = t * 1.6
        # leg phases
        l_leg = np.sin(phase)
        r_leg = -np.sin(phase)
        l_arm = -np.sin(phase) * arm_swing
        r_arm =  np.sin(phase) * arm_swing

        hip   = (0 + tremor_x + asymm,    y_walk,     0.95)
        neck  = (0 + tremor_x,            y_walk,     1.45)
        head  = (0 + tremor_x,            y_walk,     1.70)
        l_sh  = (-0.18 + tremor_x,        y_walk,     1.40)
        r_sh  = ( 0.18 + tremor_x,        y_walk,     1.40)
        l_el  = (-0.22 + tremor_x,        y_walk + l_arm * 0.6, 1.10)
        r_el  = ( 0.22 + tremor_x,        y_walk + r_arm * 0.6, 1.10)
        l_hd  = (-0.24 + tremor_x,        y_walk + l_arm,       0.85)
        r_hd  = ( 0.24 + tremor_x,        y_walk + r_arm,       0.85)
        l_kn  = (-0.10,                   y_walk + l_leg * stride * 0.5, 0.55 + max(0, l_leg) * knee_lift)
        r_kn  = ( 0.10,                   y_walk + r_leg * stride * 0.5, 0.55 + max(0, r_leg) * knee_lift)
        l_ft  = (-0.10,                   y_walk + l_leg * stride,       0.05)
        r_ft  = ( 0.10,                   y_walk + r_leg * stride,       0.05)
        return [head, neck, l_sh, l_el, l_hd, r_sh, r_el, r_hd, hip, l_kn, l_ft, r_kn, r_ft]

    # Edges as pairs of joint indices
    bones = [(0, 1), (1, 2), (2, 3), (3, 4), (1, 5), (5, 6), (6, 7),
             (1, 8), (8, 9), (9, 10), (8, 11), (11, 12)]

    def frame_traces(t: float):
        j = joints(t)
        xs, ys, zs = [], [], []
        for a, b in bones:
            xs += [j[a][0], j[b][0], None]
            ys += [j[a][1], j[b][1], None]
            zs += [j[a][2], j[b][2], None]
        skeleton = go.Scatter3d(x=xs, y=ys, z=zs, mode='lines',
                                line=dict(color=color, width=8))
        jx = [p[0] for p in j]; jy = [p[1] for p in j]; jz = [p[2] for p in j]
        markers = go.Scatter3d(x=jx, y=jy, z=jz, mode='markers',
                               marker=dict(color=color, size=5,
                                           line=dict(color='#0b1220', width=1)))
        return [skeleton, markers]

    times = np.linspace(0, 2.0, N_FRAMES)
    frames = [go.Frame(data=frame_traces(t), name=f"{i}") for i, t in enumerate(times)]
    fig = go.Figure(data=frame_traces(times[0]), frames=frames)
    fig.update_layout(
        scene=dict(
            xaxis=dict(range=[-1.2, 1.2], showbackground=False, color='#475569',
                       gridcolor='#1e293b', title=''),
            yaxis=dict(range=[-0.5, 4.0], showbackground=False, color='#475569',
                       gridcolor='#1e293b', title=''),
            zaxis=dict(range=[0, 2.2],   showbackground=False, color='#475569',
                       gridcolor='#1e293b', title=''),
            bgcolor='#0b1220',
            aspectratio=dict(x=1, y=2.5, z=1.2),
            camera=dict(eye=dict(x=2.2, y=-1.2, z=0.6)),
        ),
        paper_bgcolor='#0b1220', plot_bgcolor='#0b1220',
        margin=dict(l=0, r=0, t=0, b=0), height=320,
        showlegend=False,
        updatemenus=[dict(
            type="buttons", showactive=False, x=0.05, y=0.05,
            bgcolor='#1e293b', font=dict(color='#93c5fd'),
            buttons=[
                dict(label="▶ Play", method="animate",
                     args=[None, {"frame": {"duration": 60, "redraw": True},
                                  "fromcurrent": True, "transition": {"duration": 0},
                                  "mode": "immediate"}]),
                dict(label="⏸ Pause", method="animate",
                     args=[[None], {"frame": {"duration": 0, "redraw": False},
                                    "mode": "immediate"}]),
            ],
        )],
    )
    return fig


def render_demonstrations():
    st.markdown("#### Speech Disorder Demonstrations")
    st.markdown(
        "<div style='color:#cbd5e1; font-size:0.9rem; margin-bottom:1rem;'>"
        "Listen to real patient samples, watch how motor symptoms affect movement, "
        "and read clinical passages that produce confident detections.</div>",
        unsafe_allow_html=True,
    )

    classes = ["control", "dysarthria", "aphasia", "ua_speech"]
    sub_tabs = st.tabs([DEMO_CONFIG[c]["title"].split(" — ")[0] for c in classes])

    for cls, t in zip(classes, sub_tabs):
        with t:
            cfg = DEMO_CONFIG[cls]
            st.markdown(f"### {cfg['title']}")
            st.markdown(
                f"<div style='color:#cbd5e1; padding:0.8rem 1rem; background:#131f36; "
                f"border-left:4px solid {cfg['color']}; border-radius:6px; margin-bottom:1rem;'>"
                f"{cfg['description']}</div>",
                unsafe_allow_html=True,
            )

            col_audio, col_anim = st.columns([1, 1])

            with col_audio:
                st.markdown('<p class="section-heading">Real Patient Samples</p>',
                            unsafe_allow_html=True)
                for i in (1, 2):
                    sample = Path(f"assets/samples/{cls}_{i}.wav")
                    if sample.exists():
                        st.markdown(f"**Sample {i}**")
                        st.audio(str(sample))
                    else:
                        st.caption(f"Sample {i} not bundled.")

            with col_anim:
                st.markdown('<p class="section-heading">Motor Signature</p>',
                            unsafe_allow_html=True)
                fig = make_stick_figure(cfg["gait"], color=cfg["color"])
                st.plotly_chart(fig, use_container_width=True,
                                config={"displayModeBar": False})
                gait_label = {
                    "steady":     "Steady symmetric gait — control baseline",
                    "asymmetric": "Reduced stride, asymmetric arm swing — Parkinsonian-type",
                    "halting":    "Halting, intermittent freezing — Broca-aphasic analogue",
                    "tremor":     "High-frequency tremor — atypical neuromotor",
                }[cfg["gait"]]
                st.caption(gait_label)

            st.markdown('<p class="section-heading">Clinical Reading Passage</p>',
                        unsafe_allow_html=True)
            st.markdown(
                f"<div style='font-size:1.05rem; line-height:1.6; padding:1rem 1.2rem; "
                f"background:#131f36; border:1px solid #1e293b; border-radius:8px; "
                f"color:#f1f5f9; font-style:italic;'>“{cfg['passage']}”</div>",
                unsafe_allow_html=True,
            )
            st.caption(f"How to read: {cfg['tip']}")


# ─── Main application ─────────────────────────────────────────────────────────

def main():
    # Preload HuBERT — needed for every analysis. Whisper is loaded lazily
    # on first analysis (best-effort; the prosody rule has WPM-free fallbacks).
    try:
        load_model()
    except Exception as exc:
        st.error(f"Model failed to load: {exc}")
        st.stop()
    render_sidebar()

    # Premium hero — animated eyebrow, serif display title with gradient fill,
    # and a refined subtitle. The aurora-mesh background slowly pans behind it.
    st.markdown("""
    <section class="va-hero">
      <span class="va-hero-eyebrow">Clinical Voice Intelligence</span>
      <h1 class="va-hero-title">
        Precise screening<br/>for <em>disordered speech</em>.
      </h1>
      <p class="va-hero-sub">
        A research-grade acoustic engine for the early identification of
        dysarthria, aphasia and healthy phonation — built on a frozen deep
        speech encoder, calibrated probabilities, and Praat-grade indicators.
      </p>
    </section>
    """, unsafe_allow_html=True)

    # Main tabs
    tab_analyse, tab_demo, tab_history, tab_train, tab_about = st.tabs([
        "New Analysis", "Demonstrations", "History", "Model Training", "About"
    ])

    # ── Tab 1: New Analysis ──────────────────────────────────────────────────
    with tab_analyse:
        st.markdown("#### Input Audio")
        input_mode = st.radio(
            "Source",
            ["Upload file", "Record from microphone"],
            horizontal=True,
            label_visibility="collapsed",
        )

        audio_bytes = None
        audio_name  = "recording.wav"

        if input_mode == "Upload file":
            uploaded = st.file_uploader(
                "Drop an audio file here (.wav / .mp3 / .flac / .ogg)",
                type=["wav", "mp3", "flac", "ogg", "m4a"],
                label_visibility="collapsed",
            )
            if uploaded:
                audio_bytes = uploaded.read()
                audio_name  = uploaded.name
                st.audio(audio_bytes, format=f"audio/{Path(audio_name).suffix[1:]}")

        else:
            st.info(
                "Press the microphone button below to record directly from your browser. "
                "Speak clearly for at least 5 seconds for best results."
            )
            try:
                recorded = st.audio_input("Record speech sample", label_visibility="collapsed")
                if recorded:
                    audio_bytes = recorded.read()
                    audio_name  = "browser_recording.wav"
                    st.audio(audio_bytes)
            except AttributeError:
                st.warning(
                    "Browser recording requires Streamlit ≥ 1.31. "
                    "Please upload a .wav file instead, or use the CLI: `python app.py record`"
                )

        # Analysis trigger
        if audio_bytes:
            st.markdown("")
            patient_display = st.session_state.patient_id or "Anonymous"
            st.caption(
                "The model adaptively decides whether to run speech recognition "
                "and test-time augmentation based on the recording — full reasoning "
                "trace shown below the result."
            )
            if st.button("Analyse", type="primary", use_container_width=False):
                with st.spinner("Preprocessing audio and running analysis..."):
                    try:
                        result = run_analysis(audio_bytes, audio_name)
                        st.session_state.last_result = result
                        st.session_state.history.append({
                            "timestamp": result["timestamp"],
                            "label":     result["prediction"].label,
                            "confidence":result["prediction"].confidence,
                            "level":     result["prediction"].confidence_level,
                            "patient_id":result["patient_id"],
                            "filename":  audio_name,
                        })
                    except Exception as e:
                        st.error(f"Analysis failed: {e}")
                        st.exception(e)

        # Show results (persisted in session state)
        if st.session_state.last_result:
            st.divider()
            render_results(st.session_state.last_result)

    # ── Tab 2: Demonstrations ────────────────────────────────────────────────
    with tab_demo:
        render_demonstrations()

    # ── Tab 3: History ───────────────────────────────────────────────────────
    with tab_history:
        if not st.session_state.history:
            st.info("No analyses performed in this session yet.")
        else:
            st.markdown("#### Analysis History (this session)")

            history_data = []
            for h in reversed(st.session_state.history):
                history_data.append({
                    "Time":       h["timestamp"].strftime("%H:%M:%S"),
                    "Patient":    h["patient_id"],
                    "File":       h["filename"],
                    "Finding":    CONDITION_LABEL.get(h["label"], h["label"]),
                    "Confidence": f"{h['confidence']*100:.1f}%",
                    "Level":      h["level"].capitalize(),
                })

            import pandas as pd
            df = pd.DataFrame(history_data)
            st.dataframe(df, use_container_width=True, hide_index=True)

            if st.button("Clear history"):
                st.session_state.history = []
                st.session_state.last_result = None
                st.rerun()

            # Distribution chart if enough data
            if len(st.session_state.history) >= 3:
                from collections import Counter
                counts = Counter(h["label"] for h in st.session_state.history)
                fig = px.pie(
                    values=list(counts.values()),
                    names=[CONDITION_LABEL.get(k, k) for k in counts.keys()],
                    title="Finding Distribution",
                    color_discrete_sequence=px.colors.qualitative.Set2,
                    hole=0.4,
                )
                fig.update_layout(height=320, margin=dict(t=40, b=20),
                                  font_family="Inter", paper_bgcolor="white")
                st.plotly_chart(fig, use_container_width=True,
                                config={"displayModeBar": False})

    # ── Tab 3: Model Training ────────────────────────────────────────────────
    with tab_train:
        st.markdown("#### Retrain the Model")
        st.markdown("""
The bundled model was trained on **imbalanced data** (88.5% UA-Speech, 0.7% Aphasia)
and underperforms on aphasia detection. Retraining with class-balanced weights
is required for reliable clinical screening.
        """)

        col1, col2 = st.columns(2)
        with col1:
            st.markdown("**Data directory structure required:**")
            st.code("""data/
  aphasia/      *.wav
  control/      *.wav
  dysarthria/   *.wav
  ua_speech/    *.wav""", language="text")

        with col2:
            st.markdown("**Class weights applied during training:**")
            st.code("""aphasia    ~38×  (severely under-represented)
control    ~10×
dysarthria  ~2×
ua_speech   ~0.3×  (majority class, down-weighted)""", language="text")

        st.divider()
        st.markdown("**Training configuration:**")

        t_col1, t_col2, t_col3 = st.columns(3)
        data_dir   = t_col1.text_input("Data directory", value="./data")
        output_dir = t_col2.text_input("Output directory", value="./model_output")
        epochs     = t_col3.number_input("Epochs", min_value=5, max_value=500, value=120)

        st.caption("Run training from VS Code or terminal — not from this browser window. "
                   "Use the command below:")
        st.code(
            f"python app.py train --data_dir {data_dir} "
            f"--output_dir {output_dir} --epochs {epochs}",
            language="bash",
        )
        st.code(
            "# Or from VS Code: Terminal → Run Task → 'Voice AI: Train Model'",
            language="bash",
        )

        st.divider()
        st.markdown("**Training improvements in this version:**")
        improvements = [
            ("Class-weighted loss", "Aphasia gets ~38× weight — fixes near-zero detection"),
            ("Label smoothing 0.05", "Better probability calibration, reduces overconfidence"),
            ("L2 regularisation",   "Prevents overfitting on small aphasia class"),
            ("Stratified 70/15/15 split", "Balanced train/val/test with per-class F1 evaluation"),
            ("Early stopping + LR decay", "Prevents overfitting, restores best weights"),
        ]
        for title, detail in improvements:
            st.markdown(f"- **{title}** — {detail}")

    # ── Tab 4: About ─────────────────────────────────────────────────────────
    with tab_about:
        col_a, col_b = st.columns([1.3, 1])
        with col_a:
            st.markdown("#### About Voice AI")
            st.markdown("""
Voice AI is a clinical acoustic screening tool for speech disorder detection.
It analyses Wav2Vec2 deep-speech embeddings and reports 6 clinically validated
acoustic indicators (Praat cycle-by-cycle measurements) to assist speech-language
pathologists in early identification of:

| Condition | Description |
|---|---|
| **Dysarthria** | Motor speech disorder — slurred, weak, or slow speech |
| **Aphasia** | Language disorder — difficulty producing or understanding speech |
| **Unintelligible / Atypical** | Significantly reduced intelligibility |
| **Control** | Speech within normal acoustic parameters |
            """)

            st.markdown("#### 6 Core Acoustic Indicators")
            st.markdown("""
| Indicator | Normal (connected speech) | Clinical Significance |
|---|---|---|
| **Jitter** | < 2.5 % | Pitch cycle-to-cycle irregularity |
| **Shimmer** | < 12 % | Amplitude cycle-to-cycle irregularity |
| **HNR** | > 10 dB | Harmonics-to-Noise Ratio (voice quality) |
| **F0 Mean** | 70–280 Hz | Fundamental frequency (pitch) |
| **F0 Range** | > 25 Hz | Pitch variation (prosodic range) |
| **Speech Rate** | 2.5–6.0 syl/s | Articulatory fluency |

*Ranges calibrated for **connected / conversational speech**, not sustained
vowel phonation. Stricter sustained-vowel norms (jitter < 1.04 %, shimmer
< 3.81 %, HNR > 20 dB; Boersma & Weenink) only apply to the /a/ phonation
task and would produce excess false positives on reading samples.*
            """)

        with col_b:
            st.markdown("#### Model Information")
            try:
                m    = load_model()
                meta = m.metadata
                if meta:
                    for k, v in {
                        "Architecture":  meta.get("model_architecture", "—"),
                        "Input features":f"{meta.get('feature_dimension', 32)} dimensions",
                        "Classes":       ", ".join(meta.get("class_labels", [])),
                        "Test accuracy": f"{meta.get('test_accuracy', 0)*100:.2f}%",
                        "Training set":  f"{meta.get('total_samples', 0):,} samples",
                    }.items():
                        st.markdown(f"**{k}:** {v}")
            except Exception:
                st.warning("Model not loaded.")

            st.markdown("#### Datasets Used")
            st.markdown("""
| Dataset | Samples | Condition |
|---|---|---|
| TORGO | 17,606 | Dysarthria |
| UA-Speech | 143,290 | Unintelligible speech |
| APROCSA | 1,070 | Aphasia |
            """)

            st.markdown("#### Known Limitations")
            st.warning("""
**Important:** The bundled model was trained on imbalanced data. Aphasia detection
accuracy is low until the model is retrained with balanced class weights.
See the **Model Training** tab for instructions.
            """)

        st.divider()
        st.markdown("""
<div style="font-size:0.8rem; color:#1e3a8a; line-height:1.6;">
Voice AI is intended to assist speech-language pathologists in clinical screening.
Findings should be reviewed alongside professional assessment for diagnostic decisions.
</div>
        """, unsafe_allow_html=True)


if __name__ == "__main__":
    main()
