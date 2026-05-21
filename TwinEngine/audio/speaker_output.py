import sounddevice as sd
import queue
import threading


class Speaker:

    def __init__(self):

        self.audio_queue = queue.Queue()
        self.stream = None
        self._interrupted = threading.Event()

    def start(self):

        self.stream = sd.OutputStream(
            samplerate=44100,
            channels=1,
            dtype="float32"
        )
        self.stream.start()

        threading.Thread(target=self.worker, daemon=True).start()
        print("🔊 Speaker ready")

    def worker(self):

        while True:
            audio = self.audio_queue.get()

            if audio is None:
                break

            chunk_size = 4410  # ~100ms at 44100Hz

            for i in range(0, len(audio), chunk_size):
                if self._interrupted.is_set():
                    break
                self.stream.write(audio[i : i + chunk_size])

    def play(self, samples):
        if not self._interrupted.is_set():
            self.audio_queue.put(samples)

    def interrupt(self):
        """Stop playback within ~100ms. Only meaningful if audio is playing."""
        self._interrupted.set()
        while not self.audio_queue.empty():
            try:
                self.audio_queue.get_nowait()
            except queue.Empty:
                break

    def reset_interrupt(self):
        """Must be called before each new TTS utterance."""
        self._interrupted.clear()

    @property
    def is_interrupted(self) -> bool:
        return self._interrupted.is_set()

    def stop(self):
        self.audio_queue.put(None)
        self.stream.stop()
        self.stream.close()