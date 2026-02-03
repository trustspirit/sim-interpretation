class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 2400; // 100ms at 24kHz
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];

    if (input && input.length > 0) {
      const inputChannel = input[0];

      // Calculate audio level for visualization (every frame)
      let sum = 0;
      for (let i = 0; i < inputChannel.length; i++) {
        sum += inputChannel[i] * inputChannel[i];
      }
      const rms = Math.sqrt(sum / inputChannel.length);
      const level = Math.min(1, rms * 8); // Amplify for better visibility

      // Always send level for smooth visualization
      this.port.postMessage({ type: 'level', level: level });

      for (let i = 0; i < inputChannel.length; i++) {
        this.buffer[this.bufferIndex++] = inputChannel[i];

        if (this.bufferIndex >= this.bufferSize) {
          // Convert Float32 to PCM16
          const pcm16 = this.float32ToPcm16(this.buffer);
          this.port.postMessage({ type: 'audio', buffer: pcm16.buffer }, [pcm16.buffer]);

          // Reset buffer
          this.buffer = new Float32Array(this.bufferSize);
          this.bufferIndex = 0;
        }
      }
    }

    return true;
  }

  float32ToPcm16(float32Array) {
    const pcm16 = new Int16Array(float32Array.length);

    for (let i = 0; i < float32Array.length; i++) {
      // Clamp the value between -1 and 1
      let sample = Math.max(-1, Math.min(1, float32Array[i]));
      // Convert to 16-bit signed integer
      pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }

    return pcm16;
  }
}

registerProcessor('audio-processor', AudioProcessor);
