#!/usr/bin/env python3
"""
Voice AI — Clinical Speech Disorder Screening Tool
===================================================

Commands
--------
  python app.py record                          Record 10 s from microphone
  python app.py record --duration 15            Custom duration
  python app.py record --passes 3               Three repeated passes (more robust)
  python app.py record --streaming              Continuous real-time mode
  python app.py record --output report.pdf      Save PDF clinical report
  python app.py analyse patient.wav             Analyse an audio file
  python app.py train --data_dir ./data         Retrain with new data
  python app.py check                           Verify model + feature pipeline
"""

import sys
import os
import argparse
import warnings

warnings.filterwarnings('ignore')
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'


# ─── Dependency check ─────────────────────────────────────────────────────────

def _check_deps():
    missing = []
    for pkg, import_name in [
        ('tensorflow',  'tensorflow'),
        ('librosa',     'librosa'),
        ('sounddevice', 'sounddevice'),
        ('sklearn',     'sklearn'),
        ('numpy',       'numpy'),
        ('rich',        'rich'),
    ]:
        try:
            __import__(import_name)
        except ImportError:
            missing.append(pkg)
    return missing


# ─── Commands ─────────────────────────────────────────────────────────────────

def cmd_check(_args):
    """Verify the model loads and the feature pipeline is consistent."""
    from rich.console import Console
    console = Console()

    console.print('\n[bold blue]Voice AI — System Check[/]\n')

    # Model
    console.print('  Loading model...', end=' ')
    try:
        from voice_ai.model import VoiceModel
        m = VoiceModel()
        meta = m.metadata()
        console.print('[green]OK[/]')
        if meta:
            console.print(f'    Architecture  : {meta.get("model_architecture","?")}')
            console.print(f'    Feature dim   : {meta.get("feature_dimension","?")}')
            console.print(f'    Test accuracy : {meta.get("test_accuracy", 0)*100:.2f}%')
    except Exception as e:
        console.print(f'[red]FAIL — {e}[/]')
        return

    # Feature pipeline
    console.print('  Checking feature pipeline...', end=' ')
    try:
        from voice_ai.features import verify_feature_pipeline
        ok = verify_feature_pipeline()
        console.print('[green]OK[/]' if ok else '[yellow]WARNING — scaler may not match[/]')
    except Exception as e:
        console.print(f'[red]FAIL — {e}[/]')

    # Microphone
    console.print('  Checking microphone...', end=' ')
    try:
        import sounddevice as sd
        devices = sd.query_devices()
        input_devs = [d for d in devices if d['max_input_channels'] > 0]
        console.print(f'[green]OK[/]  ({len(input_devs)} input device(s))')
    except Exception as e:
        console.print(f'[red]FAIL — {e}[/]')

    # Quick inference smoke-test
    console.print('  Running inference smoke test...', end=' ')
    try:
        import numpy as np
        audio = np.random.randn(SAMPLE_RATE * 3).astype(np.float32) * 0.05
        pred  = m.predict_audio(audio)
        console.print(f'[green]OK[/]  -> {pred.label} ({pred.confidence*100:.1f}%)')
    except Exception as e:
        console.print(f'[red]FAIL - {e}[/]')

    # Clinical indicator smoke-test
    console.print('  Testing clinical indicators...', end=' ')
    try:
        import numpy as np
        from voice_ai.features import extract_clinical_indicators
        t     = np.linspace(0, 3, SAMPLE_RATE * 3)
        audio = (np.sin(2 * np.pi * 150 * t) * 0.05).astype(np.float32)
        ind   = extract_clinical_indicators(audio)
        console.print(f'[green]OK[/]  (jitter={ind.jitter_pct:.3f}%  HNR={ind.hnr_db:.1f} dB)')
    except Exception as e:
        console.print(f'[red]FAIL - {e}[/]')

    console.print()
    console.print('[yellow]Model status:[/]')
    console.print('  The bundled model was trained on imbalanced data (88.5% ua_speech,')
    console.print('  0.7% aphasia) and underperforms on aphasia detection.')
    console.print('  For clinical accuracy, retrain using:')
    console.print('  [bold]  python app.py train --data_dir ./data[/]')

    console.print('\n[dim]All checks complete.[/]\n')


def cmd_record(args):
    """Record from microphone and produce a clinical screening result."""
    from rich.console import Console
    from voice_ai.model import VoiceModel
    from voice_ai.features import extract_clinical_indicators
    from voice_ai.clinical import print_rich_report, build_text_report, save_text_report, save_pdf_report
    from voice_ai.realtime import record_with_progress, MicrophoneStream

    console = Console()
    console.print('\n[bold blue]Voice AI — Microphone Recording[/]\n')

    model = VoiceModel(temperature=args.temperature)

    if args.streaming:
        _cmd_streaming(args, model)
        return

    # ── Fixed-duration recording (one or more passes) ──────────────────────
    import numpy as np
    final_audio = None

    for pass_num in range(1, args.passes + 1):
        if args.passes > 1:
            console.print(f'[bold]Pass {pass_num} / {args.passes}[/]')

        console.print(f'  [dim]Speak naturally for {args.duration:.0f} seconds.[/]')
        input('  Press ENTER to start recording... ')
        console.print()

        audio = record_with_progress(duration=args.duration)
        final_audio = audio

        pred = model.predict_audio(audio)
        conf_colour = {'high': 'green', 'moderate': 'yellow', 'uncertain': 'red'}[pred.confidence_level]
        console.print(f'  Result: [{conf_colour}]{pred.label.upper()}[/]  '
                      f'{pred.confidence*100:.1f}%  [{pred.confidence_level}]\n')

    # Aggregate across passes if multiple
    final_pred = model.aggregate() if args.passes > 1 else pred

    # Extract clinical indicators from the last recording
    console.print('  Extracting acoustic indicators...', end=' ')
    indicators = extract_clinical_indicators(final_audio)
    console.print('[green]done[/]\n')

    print_rich_report(final_pred, indicators, patient_id=args.patient_id)

    if args.output:
        if args.output.endswith('.pdf'):
            save_pdf_report(final_pred, indicators, args.output, args.patient_id)
        else:
            txt = build_text_report(final_pred, indicators, args.patient_id)
            save_text_report(txt, args.output)


def _cmd_streaming(args, model):
    """Continuous real-time streaming inference."""
    from rich.console import Console
    from voice_ai.model import VoiceModel
    from voice_ai.clinical import print_rich_report
    from voice_ai.realtime import MicrophoneStream
    from rich.live import Live
    from rich.table import Table
    from rich import box
    import time

    console = Console()
    console.print('[bold cyan]Streaming mode[/]  — speak naturally.  Press [bold]Ctrl+C[/] to stop.\n')

    stream = MicrophoneStream(chunk_secs=args.window)
    stream.start()
    model.clear_session()

    try:
        with Live(console=console, refresh_per_second=4) as live:
            while True:
                chunk = stream.next_chunk(timeout=0.5)
                if chunk is not None and stream.is_speech(chunk):
                    pred = model.predict_audio(chunk)
                    t = Table(box=box.SIMPLE, show_header=False, padding=(0, 1))
                    t.add_column(style='dim')
                    t.add_column()
                    conf_c = {'high': 'green', 'moderate': 'yellow', 'uncertain': 'red'}[
                        pred.confidence_level]
                    t.add_row('Detection',   f'[bold {conf_c}]{pred.label.upper()}[/]')
                    t.add_row('Confidence',  f'{pred.confidence*100:.1f}% [{pred.confidence_level}]')
                    t.add_row('Windows',     str(model.window_count))
                    probs_str = '  '.join(f'{l}:{v*100:.0f}%' for l, v in
                                          sorted(pred.probabilities.items(), key=lambda x: -x[1]))
                    t.add_row('Breakdown',   f'[dim]{probs_str}[/]')
                    live.update(t)
                time.sleep(0.05)

    except KeyboardInterrupt:
        pass

    stream.stop()
    console.print('\n[dim]Stopped.[/]\n')

    agg = model.aggregate()
    if agg and model.window_count > 0:
        console.print(f'[bold]Aggregate result across {model.window_count} windows:[/]')
        print_rich_report(agg, patient_id=args.patient_id)

        if args.output:
            from voice_ai.clinical import build_text_report, save_text_report, save_pdf_report
            if args.output.endswith('.pdf'):
                save_pdf_report(agg, None, args.output, args.patient_id)
            else:
                save_text_report(build_text_report(agg, None, args.patient_id), args.output)


def cmd_analyse(args):
    """Analyse an existing audio file."""
    from rich.console import Console
    from voice_ai.model import VoiceModel
    from voice_ai.features import extract_clinical_indicators, load_and_preprocess
    from voice_ai.clinical import print_rich_report, build_text_report, save_text_report, save_pdf_report

    console = Console()

    if not os.path.exists(args.file):
        console.print(f'[red]File not found: {args.file}[/]')
        sys.exit(1)

    console.print(f'\n[bold blue]Analysing:[/] {args.file}\n')

    console.print('  Loading and preprocessing audio...', end=' ')
    audio = load_and_preprocess(args.file)
    console.print('[green]done[/]')

    console.print('  Running model inference...', end=' ')
    model = VoiceModel(temperature=args.temperature)
    pred  = model.predict_audio(audio)
    console.print('[green]done[/]')

    console.print('  Extracting acoustic indicators...', end=' ')
    indicators = extract_clinical_indicators(audio)
    console.print('[green]done[/]\n')

    print_rich_report(pred, indicators, patient_id=args.patient_id)

    if args.output:
        if args.output.endswith('.pdf'):
            save_pdf_report(pred, indicators, args.output, args.patient_id)
        else:
            txt = build_text_report(pred, indicators, args.patient_id)
            save_text_report(txt, args.output)


def cmd_train(args):
    """Retrain the model on new labelled data."""
    from voice_ai.train import train
    train(
        data_dir=args.data_dir,
        output_dir=args.output_dir,
        epochs=args.epochs,
        batch_size=args.batch_size,
        max_per_class=args.max_per_class,
    )


# ─── Argument parsing & dispatch ─────────────────────────────────────────────

SAMPLE_RATE = 16000

def main():
    missing = _check_deps()
    if missing:
        print(f'Missing packages: {", ".join(missing)}')
        print('Run:  pip install -r requirements.txt')
        sys.exit(1)

    parser = argparse.ArgumentParser(
        prog='voice_ai',
        description='Voice AI — Speech Disorder Screening Tool',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    sub = parser.add_subparsers(dest='command', required=True)

    # ── record ──────────────────────────────────────────────────────────────
    rec = sub.add_parser('record', help='Record from microphone and analyse')
    rec.add_argument('--duration',    type=float, default=10.0,
                     help='Recording duration per pass in seconds (default: 10)')
    rec.add_argument('--passes',      type=int,   default=1,
                     help='Number of recording passes (results aggregated, default: 1)')
    rec.add_argument('--streaming',   action='store_true',
                     help='Continuous real-time sliding-window mode')
    rec.add_argument('--window',      type=float, default=2.0,
                     help='Analysis window size in streaming mode (default: 2 s)')
    rec.add_argument('--patient-id',  dest='patient_id', default=None,
                     help='Optional patient/session identifier for the report')
    rec.add_argument('--output',      default=None,
                     help='Save report to .txt or .pdf path')
    rec.add_argument('--temperature', type=float, default=2.0,
                     help='Temperature scaling factor: >1 reduces overconfidence (default: 2.0)')

    # ── analyse ─────────────────────────────────────────────────────────────
    ana = sub.add_parser('analyse', help='Analyse an audio file (.wav / .mp3 / .flac)')
    ana.add_argument('file',          help='Path to audio file')
    ana.add_argument('--patient-id',  dest='patient_id', default=None)
    ana.add_argument('--output',      default=None, help='Save report to .txt or .pdf')
    ana.add_argument('--temperature', type=float, default=2.0)

    # ── train ────────────────────────────────────────────────────────────────
    trn = sub.add_parser('train', help='Retrain model with balanced class weights')
    trn.add_argument('--data_dir',      required=True,
                     help='Root directory: data_dir/{aphasia,control,dysarthria,ua_speech}/')
    trn.add_argument('--output_dir',    default='model_output')
    trn.add_argument('--epochs',        type=int, default=120)
    trn.add_argument('--batch_size',    type=int, default=256)
    trn.add_argument('--max_per_class', type=int, default=None,
                     help='Cap samples per class (useful for quick experiments)')

    # ── check ────────────────────────────────────────────────────────────────
    sub.add_parser('check', help='Verify model, feature pipeline, and microphone')

    args = parser.parse_args()

    dispatch = {
        'record':  cmd_record,
        'analyse': cmd_analyse,
        'train':   cmd_train,
        'check':   cmd_check,
    }
    dispatch[args.command](args)


if __name__ == '__main__':
    main()
