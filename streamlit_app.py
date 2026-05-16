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
        "About": "Voice AI v1.0 — Research screening tool. Not a medical device.",
    },
)

# ─── Custom CSS ───────────────────────────────────────────────────────────────
st.markdown("""
<style>
/* ── Typography & base ── */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

html, body, [class*="css"] {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
}

/* ── Sidebar ── */
section[data-testid="stSidebar"] {
    background: #0f172a;
    border-right: 1px solid #1e293b;
}
section[data-testid="stSidebar"] * {
    color: #e2e8f0 !important;
}
section[data-testid="stSidebar"] .stMarkdown h3 {
    color: #7dd3fc !important;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-top: 1.4rem;
}

/* ── Main background ── */
.main .block-container {
    padding-top: 1rem;
    padding-bottom: 2rem;
    max-width: 1200px;
}

/* ── Disclaimer banner ── */
.disclaimer-banner {
    background: linear-gradient(90deg, #fef3c7, #fde68a);
    border-left: 4px solid #f59e0b;
    border-radius: 6px;
    padding: 0.6rem 1rem;
    font-size: 0.82rem;
    color: #78350f;
    margin-bottom: 1rem;
}

/* ── Primary result card ── */
.result-card-high {
    background: linear-gradient(135deg, #ecfdf5, #d1fae5);
    border: 2px solid #10b981;
    border-radius: 12px;
    padding: 1.5rem 2rem;
}
.result-card-moderate {
    background: linear-gradient(135deg, #fffbeb, #fef3c7);
    border: 2px solid #f59e0b;
    border-radius: 12px;
    padding: 1.5rem 2rem;
}
.result-card-uncertain {
    background: linear-gradient(135deg, #fef2f2, #fee2e2);
    border: 2px solid #ef4444;
    border-radius: 12px;
    padding: 1.5rem 2rem;
}

/* ── Metric cards ── */
.metric-card {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 1rem 1.2rem;
    text-align: center;
}
.metric-label { font-size: 0.75rem; color: #64748b; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; }
.metric-value { font-size: 1.6rem; font-weight: 700; color: #0f172a; margin: 0.2rem 0; }
.metric-range { font-size: 0.72rem; color: #94a3b8; }
.metric-normal { color: #10b981 !important; }
.metric-abnormal { color: #ef4444 !important; }

/* ── Section headings ── */
.section-heading {
    font-size: 0.78rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #64748b;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 0.4rem;
    margin: 1.5rem 0 0.8rem 0;
}

/* ── Confidence badge ── */
.badge-high     { background: #d1fae5; color: #065f46; padding: 2px 10px; border-radius: 20px; font-size: 0.78rem; font-weight: 600; }
.badge-moderate { background: #fef3c7; color: #78350f; padding: 2px 10px; border-radius: 20px; font-size: 0.78rem; font-weight: 600; }
.badge-uncertain{ background: #fee2e2; color: #7f1d1d; padding: 2px 10px; border-radius: 20px; font-size: 0.78rem; font-weight: 600; }

/* ── Tab styling ── */
.stTabs [data-baseweb="tab-list"] {
    gap: 4px;
    border-bottom: 2px solid #e2e8f0;
}
.stTabs [data-baseweb="tab"] {
    font-size: 0.88rem;
    font-weight: 500;
    color: #64748b;
}
.stTabs [aria-selected="true"] {
    color: #1d4ed8 !important;
    border-bottom: 2px solid #1d4ed8;
}

/* ── Buttons ── */
.stButton > button {
    font-weight: 600;
    border-radius: 8px;
    transition: all 0.15s;
}
.stButton > button:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.12); }

/* ── Hide Streamlit branding ── */
#MainMenu, footer { visibility: hidden; }
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

# ─── Analysis function ────────────────────────────────────────────────────────
def run_analysis(audio_bytes: bytes, filename: str = "recording.wav"):
    """Load audio bytes, run model + clinical indicators, return results dict."""
    import soundfile as sf
    from voice_ai.features import load_and_preprocess, extract_model_features, extract_clinical_indicators

    model = load_model()

    # Write to temp file so librosa can load it
    suffix = Path(filename).suffix or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(audio_bytes)
        tmp_path = f.name

    try:
        audio = load_and_preprocess(tmp_path)
    finally:
        os.unlink(tmp_path)

    model.clear_session()
    prediction  = model.predict_audio(audio)
    indicators  = extract_clinical_indicators(audio)

    # Waveform data (downsample to 500 pts for display)
    sr = 16000
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
                st.warning("Original model — aphasia detection limited. Retrain for clinical use.")
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


# ─── Main application ─────────────────────────────────────────────────────────

def main():
    render_sidebar()

    # Header
    st.markdown("""
    <div style="display:flex; align-items:center; gap:12px; margin-bottom:0.5rem;">
      <div>
        <h1 style="margin:0; font-size:1.6rem; font-weight:700; color:#0f172a;">
          Voice AI — Speech Disorder Screening
        </h1>
        <p style="margin:0; color:#64748b; font-size:0.88rem;">
          Acoustic analysis for dysarthria, aphasia and atypical speech detection
        </p>
      </div>
    </div>
    """, unsafe_allow_html=True)

    # Disclaimer banner
    st.markdown("""
    <div class="disclaimer-banner">
      <strong>Research Tool Only.</strong> This application is not a certified medical device.
      All findings must be confirmed by a qualified speech-language pathologist or neurologist.
      Do not use as the sole basis for clinical decisions.
    </div>
    """, unsafe_allow_html=True)

    # Main tabs
    tab_analyse, tab_history, tab_train, tab_about = st.tabs([
        "New Analysis", "History", "Model Training", "About"
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

    # ── Tab 2: History ───────────────────────────────────────────────────────
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
Voice AI is a research-grade acoustic screening tool for speech disorder detection.
It analyses 32 acoustic features and reports 6 clinically validated indicators
to assist speech-language pathologists in early identification of:

| Condition | Description |
|---|---|
| **Dysarthria** | Motor speech disorder — slurred, weak, or slow speech |
| **Aphasia** | Language disorder — difficulty producing or understanding speech |
| **Unintelligible / Atypical** | Significantly reduced intelligibility |
| **Control** | Speech within normal acoustic parameters |
            """)

            st.markdown("#### 6 Core Acoustic Indicators")
            st.markdown("""
| Indicator | Normal Range | Clinical Significance |
|---|---|---|
| **Jitter** | < 1.04 % | Pitch cycle-to-cycle irregularity |
| **Shimmer** | < 3.81 % | Amplitude cycle-to-cycle irregularity |
| **HNR** | > 20 dB | Harmonics-to-Noise Ratio (voice quality) |
| **F0 Mean** | 80–250 Hz | Fundamental frequency (pitch) |
| **F0 Range** | > 50 Hz | Pitch variation (prosodic range) |
| **Speech Rate** | 3.5–5.0 syl/s | Articulatory fluency |

*Reference ranges: Boersma & Weenink (Praat), Shrivastav et al., ASHA clinical guidelines.*
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
<div style="font-size:0.8rem; color:#64748b; line-height:1.6;">
<strong>DISCLAIMER:</strong> Voice AI is a research and screening tool only.
It is NOT a certified medical device and must NOT replace clinical judgement.
All findings require confirmation by a qualified speech-language pathologist or neurologist.
Use only under appropriate professional supervision. Not suitable for emergency or
acute clinical decision-making.
</div>
        """, unsafe_allow_html=True)


if __name__ == "__main__":
    main()
