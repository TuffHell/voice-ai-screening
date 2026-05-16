"""
Real-time microphone capture for live clinical screening.

Two modes:
  RecordingSession  — record a fixed-duration clip (simple, reliable)
  MicrophoneStream  — continuous sliding-window inference (streaming)

Voice Activity Detection (VAD) is applied so silent frames are skipped,
avoiding misleading predictions on background noise.
"""

import time
import queue
import threading
import numpy as np
from typing import Callable, Optional

SAMPLE_RATE   = 16000
CHUNK_SECS    = 2.0      # analysis window length
OVERLAP_RATIO = 0.5      # 50 % overlap between consecutive windows
VAD_RMS_FLOOR = 0.008    # below this RMS → considered silence


# ─── Fixed-duration recording ─────────────────────────────────────────────────

class RecordingSession:
    """
    Record a fixed-duration clip from the default microphone.

    Usage:
        session = RecordingSession(duration=10.0)
        audio   = session.record(on_progress=callback)   # numpy float32 array
    """

    def __init__(self, duration: float = 10.0, sr: int = SAMPLE_RATE):
        self.duration = duration
        self.sr = sr

    def record(self, on_progress: Optional[Callable[[float], None]] = None) -> np.ndarray:
        """
        Block until `duration` seconds of audio are captured.
        `on_progress(fraction)` is called ~10 times per second if provided.
        Returns a 1-D float32 numpy array.
        """
        import sounddevice as sd

        n_samples = int(self.sr * self.duration)
        buf = sd.rec(n_samples, samplerate=self.sr, channels=1, dtype='float32')

        if on_progress is not None:
            elapsed = 0.0
            step    = 0.1
            while elapsed < self.duration:
                time.sleep(step)
                elapsed += step
                on_progress(min(elapsed / self.duration, 1.0))
        else:
            sd.wait()
            return buf[:, 0]

        sd.wait()
        return buf[:, 0]

    @staticmethod
    def list_devices():
        """Print available audio input devices."""
        import sounddevice as sd
        print(sd.query_devices())


# ─── Continuous streaming ─────────────────────────────────────────────────────

class MicrophoneStream:
    """
    Continuous sliding-window capture from the microphone.

    Usage:
        stream = MicrophoneStream()
        stream.start()
        while True:
            chunk = stream.next_chunk()   # blocks until a full window is ready
            if chunk is not None:
                pred = model.predict_audio(chunk)
        stream.stop()
    """

    def __init__(
        self,
        sr:             int   = SAMPLE_RATE,
        chunk_secs:     float = CHUNK_SECS,
        overlap:        float = OVERLAP_RATIO,
        vad_floor:      float = VAD_RMS_FLOOR,
    ):
        self.sr         = sr
        self.chunk_size = int(sr * chunk_secs)
        self.hop_size   = int(self.chunk_size * (1 - overlap))
        self.vad_floor  = vad_floor
        self._q: queue.Queue = queue.Queue()
        self._buf = np.empty(0, dtype=np.float32)
        self._stream = None
        self._running = False

    def _audio_callback(self, indata, frames, time_info, status):
        self._q.put_nowait(indata[:, 0].copy())

    def start(self):
        import sounddevice as sd
        self._running = True
        self._stream = sd.InputStream(
            samplerate=self.sr,
            channels=1,
            dtype='float32',
            blocksize=int(self.sr * 0.05),   # 50 ms blocks
            callback=self._audio_callback,
        )
        self._stream.start()

    def stop(self):
        self._running = False
        if self._stream:
            self._stream.stop()
            self._stream.close()
            self._stream = None

    def next_chunk(self, timeout: float = 0.5) -> Optional[np.ndarray]:
        """
        Drain the queue into the internal buffer.
        Returns a complete chunk when enough data has accumulated, else None.
        """
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                data = self._q.get(timeout=0.05)
                self._buf = np.concatenate([self._buf, data])
            except queue.Empty:
                pass
            if len(self._buf) >= self.chunk_size:
                chunk = self._buf[:self.chunk_size].copy()
                self._buf = self._buf[self.hop_size:]
                return chunk
        return None

    def is_speech(self, audio: np.ndarray) -> bool:
        """Energy-based Voice Activity Detection."""
        return float(np.sqrt(np.mean(audio ** 2))) > self.vad_floor

    @property
    def running(self) -> bool:
        return self._running


# ─── Rich progress bar helper (used by app.py) ────────────────────────────────

def record_with_progress(duration: float = 10.0, sr: int = SAMPLE_RATE) -> np.ndarray:
    """
    Record `duration` seconds with a live Rich progress bar.
    Returns raw audio array.
    """
    from rich.progress import Progress, BarColumn, TimeRemainingColumn, TextColumn
    import sounddevice as sd

    n_samples = int(sr * duration)
    buf = sd.rec(n_samples, samplerate=sr, channels=1, dtype='float32')

    with Progress(
        TextColumn('[bold cyan]  Recording[/]'),
        BarColumn(bar_width=40),
        TextColumn('[progress.percentage]{task.percentage:>3.0f}%'),
        TimeRemainingColumn(),
        transient=True,
    ) as progress:
        task = progress.add_task('', total=100)
        elapsed = 0.0
        step = 0.1
        while elapsed < duration:
            time.sleep(step)
            elapsed += step
            progress.update(task, completed=min(elapsed / duration * 100, 100))

    sd.wait()
    return buf[:, 0]
