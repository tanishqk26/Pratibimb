import sounddevice as sd
import numpy as np
import base64


class MicInput:

    def __init__(self, sample_rate=16000, block_size=4096):

        self.sample_rate = sample_rate
        self.block_size = block_size
        self.active = False
        self.callback = None

    def set_callback(self, callback):
        self.callback = callback

    def enable(self):

        if not self.active:
            self.active = True
            print("🎤 Mic ON")

    def disable(self):

        if self.active:
            self.active = False
            print("🎤 Mic OFF")

    def audio_callback(self, indata, frames, time_info, status):

        if not self.active or self.callback is None:
            return

        audio_int16 = (indata * 32767).astype(np.int16)

        encoded = base64.b64encode(
            audio_int16.tobytes()
        ).decode("utf-8")

        self.callback(encoded)

    def start(self):

        self.stream = sd.InputStream(
            samplerate=self.sample_rate,
            channels=1,
            blocksize=self.block_size,
            dtype="float32",
            callback=self.audio_callback
        )

        self.stream.start()

    def stop(self):

        self.stream.stop()
        self.stream.close()