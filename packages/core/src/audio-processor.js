// ============================================================
// RealtimeASR SDK — AudioWorkletProcessor
//
// 在 AudioWorklet 线程中运行，负责从麦克风采集 Float32 PCM 数据
// 并通过 postMessage 发送到主线程
// ============================================================

class RealtimeASRProcessor extends AudioWorkletProcessor {
  /**
   * @param {AudioWorkletNodeOptions} options
   */
  constructor(options) {
    super(options)
    this.sampleRate = options.processorOptions?.sampleRate ?? sampleRate

    // 每隔 bufferSize 个样本发送一次数据到主线程
    // 128 样本 ≈ 2.7ms @ 48kHz，足够实时且不阻塞
    this.bufferSize = options.processorOptions?.bufferSize ?? 128
    this.buffer = new Float32Array(this.bufferSize)
    this.bufferIndex = 0
  }

  process(inputs, _outputs, _parameters) {
    const input = inputs[0]
    if (!input || input.length === 0) {
      return true // 保持处理器活跃
    }

    const channel = input[0]
    if (!channel || channel.length === 0) {
      return true
    }

    // 累积到缓冲区，到达 bufferSize 时发送
    for (let i = 0; i < channel.length; i++) {
      this.buffer[this.bufferIndex] = channel[i]
      this.bufferIndex++

      if (this.bufferIndex >= this.bufferSize) {
        // 复制缓冲区数据并发送到主线程
        const data = new Float32Array(this.buffer)
        this.port.postMessage(
          {
            type: 'audio',
            data: data,
            sampleRate: this.sampleRate,
          },
          [data.buffer] // 转移所有权，避免复制
        )
        // 重新分配缓冲区
        this.buffer = new Float32Array(this.bufferSize)
        this.bufferIndex = 0
      }
    }

    return true // 返回 true 保持处理器活跃
  }
}

registerProcessor('realtime-asr-processor', RealtimeASRProcessor)
