// ============================================================
// RealtimeASR SDK — FrameBuffer
// RingBuffer 实现，累积 PCM 数据到固定帧长后触发发送
// ============================================================

/**
 * 帧缓冲器
 *
 * 负责：
 * - 累积 PCM16 样本到固定帧长
 * - 达到帧长后通过回调通知发送
 * - RingBuffer 防止无限增长
 *
 * 默认帧长：
 * - 200ms @ 16kHz = 3200 samples
 * - 3200 samples × 2 bytes = 6400 bytes
 *
 * @example
 * ```ts
 * const buffer = new FrameBuffer(3200, (frame) => provider.send(frame))
 * buffer.push(int16Data)
 * ```
 */
export class FrameBuffer {
  /** 每帧样本数 */
  public readonly frameSize: number
  /** 每帧字节数 */
  public readonly frameBytes: number

  /** RingBuffer 存储 */
  private ringBuffer: Int16Array
  /** 读指针 */
  private readIndex = 0
  /** 已有样本数 */
  private sampleCount = 0
  /** 帧就绪回调 */
  private onFrameReady: ((frame: ArrayBuffer) => void) | null = null

  /**
   * @param frameSize 每帧样本数（默认 3200 for 16kHz 200ms）
   * @param onFrameReady 帧就绪回调
   */
  constructor(frameSize = 3200, onFrameReady?: (frame: ArrayBuffer) => void) {
    this.frameSize = frameSize
    this.frameBytes = frameSize * 2 // Int16 = 2 bytes per sample

    // RingBuffer 容量 = 帧大小 × 4（防止溢出）
    this.ringBuffer = new Int16Array(frameSize * 4)

    if (onFrameReady) {
      this.onFrameReady = onFrameReady
    }
  }

  /**
   * 设置帧就绪回调
   */
  setOnFrameReady(callback: (frame: ArrayBuffer) => void): void {
    this.onFrameReady = callback
  }

  /**
   * 推送 PCM16 数据到缓冲区
   *
   * 当累积样本达到 frameSize 时，自动触发 onFrameReady 回调
   */
  push(data: Int16Array): void {
    const dataLength = data.length
    let offset = 0

    while (offset < dataLength) {
      const remaining = dataLength - offset
      const capacity = this.ringBuffer.length

      // 写入到 RingBuffer 的可用空间
      const writeIndex = (this.readIndex + this.sampleCount) % capacity
      const spaceToEnd = capacity - writeIndex
      const writeCount = Math.min(remaining, spaceToEnd)

      // 分两段写入（RingBuffer 环绕）
      this.ringBuffer.set(data.subarray(offset, offset + writeCount), writeIndex)

      const wrappedCount = Math.min(remaining - writeCount, capacity - this.sampleCount - writeCount)
      if (wrappedCount > 0) {
        this.ringBuffer.set(
          data.subarray(offset + writeCount, offset + writeCount + wrappedCount),
          0
        )
      }

      const totalWritten = writeCount + wrappedCount
      this.sampleCount += totalWritten
      offset += totalWritten

      // 检查是否有完整帧可用
      this.flushFrames()
    }
  }

  /**
   * 获取缓冲的样本数
   */
  getSampleCount(): number {
    return this.sampleCount
  }

  /**
   * 缓冲区是否有完整帧
   */
  hasFrame(): boolean {
    return this.sampleCount >= this.frameSize
  }

  /**
   * 强制刷新所有可用帧
   */
  flushFrames(): void {
    while (this.sampleCount >= this.frameSize) {
      const capacity = this.ringBuffer.length
      const frame = new Int16Array(this.frameSize)

      const spaceToEnd = capacity - this.readIndex
      if (spaceToEnd >= this.frameSize) {
        // 数据连续，直接复制
        frame.set(this.ringBuffer.subarray(this.readIndex, this.readIndex + this.frameSize))
        this.readIndex = (this.readIndex + this.frameSize) % capacity
      } else {
        // 数据被环绕，分两段复制
        frame.set(this.ringBuffer.subarray(this.readIndex, capacity))
        const remaining = this.frameSize - spaceToEnd
        frame.set(this.ringBuffer.subarray(0, remaining), spaceToEnd)
        this.readIndex = remaining
      }

      this.sampleCount -= this.frameSize

      // 触发帧就绪回调
      if (this.onFrameReady) {
        this.onFrameReady(frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength))
      }
    }
  }

  /**
   * 清空缓冲区
   */
  clear(): void {
    this.readIndex = 0
    this.sampleCount = 0
  }

  /**
   * 重置缓冲区
   */
  reset(): void {
    this.clear()
  }
}
