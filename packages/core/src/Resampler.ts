// ============================================================
// RealtimeASR SDK — Resampler
// 音频重采样：使用线性插值将任意采样率转换为目标采样率
// 默认：48000Hz → 16000Hz
// ============================================================

/**
 * 音频重采样器
 *
 * 使用线性插值算法进行重采样。
 * 典型的浏览器音频采样率为 48000Hz，而 ASR 服务（如腾讯云）要求 16000Hz。
 *
 * @example
 * ```ts
 * const resampler = new Resampler(48000, 16000)
 * const output = resampler.resample(inputFloat32)
 * ```
 */
export class Resampler {
  private fromRate: number
  private toRate: number
  private ratio: number

  /**
   * @param fromRate 原始采样率（如 48000）
   * @param toRate 目标采样率（如 16000）
   */
  constructor(fromRate: number, toRate: number) {
    this.fromRate = fromRate
    this.toRate = toRate
    this.ratio = fromRate / toRate
  }

  /**
   * 对输入音频数据进行重采样
   *
   * @param input 输入 Float32Array（原始采样率）
   * @returns 输出 Float32Array（目标采样率）
   */
  resample(input: Float32Array): Float32Array {
    if (this.fromRate === this.toRate) {
      return new Float32Array(input)
    }

    const inputLength = input.length
    // 输出长度 = 输入长度 / 比率
    const outputLength = Math.floor(inputLength / this.ratio)
    const output = new Float32Array(outputLength)

    for (let i = 0; i < outputLength; i++) {
      // 计算在输入数组中的浮点位置
      const srcIndex = i * this.ratio
      const srcIndexFloor = Math.floor(srcIndex)
      const srcIndexCeil = Math.min(srcIndexFloor + 1, inputLength - 1)

      // 线性插值权重
      const t = srcIndex - srcIndexFloor

      const left = input[srcIndexFloor]!
      const right = input[srcIndexCeil]!

      // 线性插值
      output[i] = left + (right - left) * t
    }

    return output
  }

  /**
   * 更新采样率参数
   */
  setRates(fromRate: number, toRate: number): void {
    this.fromRate = fromRate
    this.toRate = toRate
    this.ratio = fromRate / toRate
  }

  /**
   * 获取当前重采样比率
   */
  getRatio(): number {
    return this.ratio
  }
}
