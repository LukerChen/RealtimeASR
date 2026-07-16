// ============================================================
// RealtimeASR SDK — AudioWorklet Processor Code (as string)
//
// 将 AudioWorkletProcessor 代码作为字符串内联，
// 运行时通过 Blob URL 加载，不依赖外部文件路径，
// 兼容所有 bundler（webpack / Vite / esbuild / Rollup 等）。
// ============================================================

export const AUDIO_PROCESSOR_CODE = `\
class RealtimeASRProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super(options)
    this.sampleRate = options.processorOptions?.sampleRate ?? sampleRate
    this.bufferSize = options.processorOptions?.bufferSize ?? 128
    this.buffer = new Float32Array(this.bufferSize)
    this.bufferIndex = 0
  }

  process(inputs, _outputs, _parameters) {
    const input = inputs[0]
    if (!input || input.length === 0) {
      return true
    }

    const channel = input[0]
    if (!channel || channel.length === 0) {
      return true
    }

    for (let i = 0; i < channel.length; i++) {
      this.buffer[this.bufferIndex] = channel[i]
      this.bufferIndex++

      if (this.bufferIndex >= this.bufferSize) {
        const data = new Float32Array(this.buffer)
        this.port.postMessage(
          {
            type: 'audio',
            data: data,
            sampleRate: this.sampleRate,
          },
          [data.buffer]
        )
        this.buffer = new Float32Array(this.bufferSize)
        this.bufferIndex = 0
      }
    }

    return true
  }
}

registerProcessor('realtime-asr-processor', RealtimeASRProcessor)
`
