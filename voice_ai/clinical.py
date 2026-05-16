"""
Clinical report generation.

Produces:
  • Terminal report   — rich-formatted, colour-coded, instant
  • Plain-text report — for EMR notes / audit trail
  • PDF report        — formal clinical document with tables
"""

import datetime
import textwrap
from typing import Optional

from voice_ai.model import Prediction, LABELS, CONDITION_DISPLAY
from voice_ai.features import (
    ClinicalIndicators,
    JITTER_NORMAL_MAX, SHIMMER_NORMAL_MAX, HNR_NORMAL_MIN,
    F0_MEAN_RANGE, F0_RANGE_MIN, SPEECH_RATE_RANGE,
)

DISCLAIMER = (
    "DISCLAIMER: This tool provides acoustic screening support only. "
    "It is NOT a certified medical device and must NOT be used as the sole basis "
    "for clinical diagnosis. All findings must be confirmed by a qualified "
    "speech-language pathologist or neurologist. Results are for research and "
    "screening purposes only."
)

_REFERENCES = {
    'jitter_pct':      (f'< {JITTER_NORMAL_MAX} %',           'jitter_pct'),
    'shimmer_pct':     (f'< {SHIMMER_NORMAL_MAX} %',          'shimmer_pct'),
    'hnr_db':          (f'> {HNR_NORMAL_MIN} dB',             'hnr_db'),
    'f0_mean_hz':      (f'{F0_MEAN_RANGE[0]}–{F0_MEAN_RANGE[1]} Hz', 'f0_mean_hz'),
    'f0_range_hz':     (f'> {F0_RANGE_MIN} Hz',               'f0_range_hz'),
    'speech_rate_est': (f'{SPEECH_RATE_RANGE[0]}–{SPEECH_RATE_RANGE[1]} syl/s', 'speech_rate_est'),
}

_FIELD_LABELS = [
    ('Jitter',       'jitter_pct',       lambda i: f'{i.jitter_pct:.3f} %'),
    ('Shimmer',      'shimmer_pct',      lambda i: f'{i.shimmer_pct:.3f} %'),
    ('HNR',          'hnr_db',           lambda i: f'{i.hnr_db:.1f} dB'),
    ('F0 Mean',      'f0_mean_hz',       lambda i: f'{i.f0_mean_hz:.0f} Hz'),
    ('F0 Range',     'f0_range_hz',      lambda i: f'{i.f0_range_hz:.0f} Hz'),
    ('Speech Rate',  'speech_rate_est',  lambda i: f'{i.speech_rate_est:.1f} syl/s'),
]


# ─── Terminal (Rich) report ───────────────────────────────────────────────────

def print_rich_report(
    prediction: Prediction,
    indicators: Optional[ClinicalIndicators] = None,
    patient_id: Optional[str] = None,
):
    """Print a colour-coded clinical report to the terminal using Rich."""
    from rich.console import Console
    from rich.table import Table
    from rich.panel import Panel
    from rich.text import Text
    from rich import box

    console = Console()
    ts = datetime.datetime.now().strftime('%Y-%m-%d  %H:%M:%S')

    # ── Header ──────────────────────────────────────────────────────────────
    console.print()
    console.rule('[bold blue]Voice AI — Speech Disorder Screening Report[/]')

    meta = Table.grid(padding=(0, 2))
    meta.add_column(style='dim')
    meta.add_column()
    meta.add_row('Date / Time :', ts)
    if patient_id:
        meta.add_row('Patient ID  :', patient_id)
    meta.add_row('Windows     :', str(prediction.n_windows))
    console.print(meta)
    console.print()

    # ── Primary finding ──────────────────────────────────────────────────────
    conf_pct = f'{prediction.confidence * 100:.1f}%'
    level_colour = {'high': 'green', 'moderate': 'yellow', 'uncertain': 'red'}.get(
        prediction.confidence_level, 'white')

    title_text = Text()
    title_text.append('Primary Finding:  ', style='bold')
    title_text.append(CONDITION_DISPLAY.get(prediction.label, prediction.label).upper(),
                      style=f'bold {level_colour}')
    title_text.append(f'   {conf_pct}', style=f'{level_colour}')
    title_text.append(f'  [{prediction.confidence_level.upper()}]', style=f'dim {level_colour}')
    console.print(title_text)
    console.print()

    # ── Probability table ────────────────────────────────────────────────────
    prob_table = Table(title='Probability Breakdown', box=box.ROUNDED,
                       show_header=True, header_style='bold blue')
    prob_table.add_column('Condition', style='cyan')
    prob_table.add_column('Probability', justify='right')
    prob_table.add_column('Bar', no_wrap=True)

    for label, prob in sorted(prediction.probabilities.items(), key=lambda x: -x[1]):
        bar    = '█' * int(prob * 28)
        colour = level_colour if label == prediction.label else 'dim'
        prob_table.add_row(
            CONDITION_DISPLAY.get(label, label),
            f'{prob * 100:.1f} %',
            f'[{colour}]{bar}[/]',
        )
    console.print(prob_table)
    console.print()

    # ── Clinical indicators ──────────────────────────────────────────────────
    if indicators is not None:
        ind_table = Table(title='Acoustic Indicators — 6 Core Features',
                          box=box.ROUNDED, show_header=True, header_style='bold blue')
        ind_table.add_column('Feature',        style='cyan')
        ind_table.add_column('Measured',       justify='right')
        ind_table.add_column('Normal Range',   justify='center', style='dim')
        ind_table.add_column('Status',         justify='center')

        for label, key, fmt in _FIELD_LABELS:
            ref_str, _ = _REFERENCES[key]
            value_str  = fmt(indicators)
            normal     = indicators.is_normal(key)
            status     = '[green]Normal[/]' if normal else '[red]Abnormal[/]'
            ind_table.add_row(label, value_str, ref_str, status)

        console.print(ind_table)
        abn = indicators.abnormal_count()
        if abn:
            console.print(f'  [yellow]{abn}/6 indicator(s) outside normal range.[/]')
        console.print()

    # ── Recommendation ───────────────────────────────────────────────────────
    rec_colour = {'high': 'green', 'moderate': 'yellow', 'uncertain': 'red'}[
        prediction.confidence_level]
    console.print(Panel(
        prediction.recommendation,
        title='[bold]Recommendation[/]',
        border_style=rec_colour,
    ))

    # ── Disclaimer ───────────────────────────────────────────────────────────
    console.print()
    for line in textwrap.wrap(DISCLAIMER, 78):
        console.print(f'  [dim italic]{line}[/]')
    console.rule(style='dim')
    console.print()


# ─── Plain-text report ────────────────────────────────────────────────────────

def build_text_report(
    prediction: Prediction,
    indicators: Optional[ClinicalIndicators] = None,
    patient_id: Optional[str] = None,
) -> str:
    ts    = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    lines = []
    W = 72

    lines += [
        '=' * W,
        '  VOICE AI — SPEECH DISORDER SCREENING REPORT',
        '=' * W,
        f'  Date/Time  : {ts}',
    ]
    if patient_id:
        lines.append(f'  Patient ID : {patient_id}')
    lines += [
        f'  Windows    : {prediction.n_windows}',
        '',
        f'  PRIMARY FINDING : {CONDITION_DISPLAY.get(prediction.label, prediction.label).upper()}',
        f'  Confidence      : {prediction.confidence * 100:.1f}%  [{prediction.confidence_level.upper()}]',
        '',
        '  PROBABILITY BREAKDOWN:',
    ]
    for label, prob in sorted(prediction.probabilities.items(), key=lambda x: -x[1]):
        bar = '█' * int(prob * 28)
        lines.append(f'    {CONDITION_DISPLAY.get(label, label):<32} {prob * 100:5.1f}%  {bar}')
    lines.append('')

    if indicators is not None:
        lines += [
            '  ACOUSTIC INDICATORS (6 Core Features):',
            f'    {"Feature":<18} {"Measured":>12}  {"Normal Range":<18}  Status',
            '    ' + '-' * 58,
        ]
        for label, key, fmt in _FIELD_LABELS:
            ref_str, _ = _REFERENCES[key]
            value_str  = fmt(indicators)
            status     = 'Normal' if indicators.is_normal(key) else 'ABNORMAL'
            lines.append(f'    {label:<18} {value_str:>12}  {ref_str:<18}  {status}')
        lines.append('')

    lines += [
        '  RECOMMENDATION:',
        *[f'  {l}' for l in textwrap.wrap(prediction.recommendation, W - 2)],
        '',
        '  ' + '-' * (W - 2),
        *[f'  {l}' for l in textwrap.wrap(DISCLAIMER, W - 2)],
        '=' * W,
    ]
    return '\n'.join(lines)


def save_text_report(report: str, path: str):
    with open(path, 'w', encoding='utf-8') as f:
        f.write(report)
    print(f'Text report saved → {path}')


# ─── PDF report ───────────────────────────────────────────────────────────────

def save_pdf_report(
    prediction: Prediction,
    indicators: Optional[ClinicalIndicators],
    path: str,
    patient_id: Optional[str] = None,
):
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.lib import colors
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
        )
        from reportlab.lib.enums import TA_CENTER
    except ImportError:
        print('reportlab not installed. Run: pip install reportlab')
        return

    doc = SimpleDocTemplate(
        path, pagesize=A4,
        rightMargin=2*cm, leftMargin=2*cm,
        topMargin=2*cm, bottomMargin=2*cm,
    )
    styles = getSampleStyleSheet()
    navy   = colors.HexColor('#1a237e')
    green  = colors.HexColor('#1b5e20')
    orange = colors.HexColor('#e65100')
    red    = colors.HexColor('#b71c1c')

    level_colour = {'high': green, 'moderate': orange, 'uncertain': red}[prediction.confidence_level]

    title_style = ParagraphStyle('T', parent=styles['Heading1'],
                                 fontSize=15, textColor=navy,
                                 alignment=TA_CENTER, spaceAfter=4)
    h2 = ParagraphStyle('H2', parent=styles['Heading2'], fontSize=12, textColor=navy)
    body = styles['Normal']
    small = ParagraphStyle('S', parent=body, fontSize=8, textColor=colors.grey, leading=10)

    story = []
    ts = datetime.datetime.now().strftime('%Y-%m-%d  %H:%M:%S')

    story.append(Paragraph('Voice AI — Speech Disorder Screening Report', title_style))
    story.append(HRFlowable(width='100%', color=navy, thickness=1))
    story.append(Spacer(1, 0.3*cm))

    # Meta block
    meta_rows = [['Date / Time', ts]]
    if patient_id:
        meta_rows.append(['Patient ID', patient_id])
    meta_rows.append(['Analysis Windows', str(prediction.n_windows)])
    meta_t = Table(meta_rows, colWidths=[4*cm, 13*cm])
    meta_t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#e8eaf6')),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#c5cae9')),
        ('PADDING', (0, 0), (-1, -1), 5),
    ]))
    story += [meta_t, Spacer(1, 0.4*cm)]

    # Primary finding
    story.append(Paragraph('Primary Finding', h2))
    finding_colour = level_colour
    disp = CONDITION_DISPLAY.get(prediction.label, prediction.label)
    story.append(Paragraph(
        f'<font color="{finding_colour.hexval()}" size="13"><b>{disp}</b></font>   '
        f'<font size="11">{prediction.confidence * 100:.1f}% '
        f'[{prediction.confidence_level.upper()}]</font>',
        body,
    ))
    story.append(Spacer(1, 0.3*cm))

    # Probability table
    story.append(Paragraph('Probability Breakdown', h2))
    prows = [['Condition', 'Probability']]
    for label, prob in sorted(prediction.probabilities.items(), key=lambda x: -x[1]):
        prows.append([CONDITION_DISPLAY.get(label, label), f'{prob * 100:.1f} %'])
    pt = Table(prows, colWidths=[10*cm, 4*cm])
    pt.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), navy),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.4, colors.grey),
        ('PADDING', (0, 0), (-1, -1), 5),
        ('ALIGN', (1, 0), (1, -1), 'CENTER'),
    ]))
    story += [pt, Spacer(1, 0.4*cm)]

    # Clinical indicators
    if indicators is not None:
        story.append(Paragraph('Acoustic Indicators — 6 Core Features', h2))
        irows = [['Feature', 'Measured', 'Normal Range', 'Status']]
        row_bg = []
        for r_idx, (lbl, key, fmt) in enumerate(_FIELD_LABELS, start=1):
            ref_str, _ = _REFERENCES[key]
            normal = indicators.is_normal(key)
            irows.append([lbl, fmt(indicators), ref_str, 'Normal' if normal else 'Abnormal'])
            bg = colors.HexColor('#e8f5e9') if normal else colors.HexColor('#ffebee')
            row_bg.append(('BACKGROUND', (3, r_idx), (3, r_idx), bg))

        it = Table(irows, colWidths=[4.5*cm, 3.5*cm, 5*cm, 3*cm])
        base_style = [
            ('BACKGROUND', (0, 0), (-1, 0), navy),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('GRID', (0, 0), (-1, -1), 0.4, colors.grey),
            ('PADDING', (0, 0), (-1, -1), 5),
            ('ALIGN', (1, 0), (3, -1), 'CENTER'),
        ] + row_bg
        it.setStyle(TableStyle(base_style))
        story += [it, Spacer(1, 0.4*cm)]

    # Recommendation
    story.append(Paragraph('Recommendation', h2))
    story.append(Paragraph(prediction.recommendation, body))
    story.append(Spacer(1, 0.4*cm))

    # Disclaimer
    story.append(HRFlowable(width='100%', color=colors.grey, thickness=0.5))
    story.append(Spacer(1, 0.2*cm))
    story.append(Paragraph(DISCLAIMER, small))

    doc.build(story)
    print(f'PDF report saved → {path}')
