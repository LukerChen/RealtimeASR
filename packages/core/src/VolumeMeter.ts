// ============================================================
// RealtimeASR SDK — VolumeMeter
// 使用 RMS 算法计算实时音量，输出 0~100
// ============================================================

/**
 * 音量计
 *
 * 使用 RMS (Root Mean Square) 算法计算实时音量电平。
 * 输出归一化到 0~100 范围，方便业务层直接绘制音量条。
 *
 * @example
 * ```ts
 * const meter = new VolumeMeter()
 * const volume = meter.calculate(float32Data) // 0~100
 * ```
 */
export class VolumeMeter {
  /** RMS 平滑因子（介于 0~1，越大越灵敏） */
  private smoothingFactor: number
  /** 平滑后的 RMS 值 */
  private smoothedRMS = 0

  /**
   * @param smoothingFactor 平滑因子，默认 0.3
   */
  constructor(smoothingFactor = 0.3) {
    this.smoothingFactor = Math.max(0, Math.min(1, smoothingFactor))
  }

  /**
   * 计算音量
   *
   * @param input Float32Array 音频样本 [-1.0, 1.0]
   * @returns 音量值 0~100
   */
  calculate(input: Float32Array): number {
    if (input.length === 0) {
      return 0
    }

    const length = input.length

    // 计算 RMS = sqrt(mean(square(samples)))
    let sumSquares = 0
    for (let i = 0; i < length; i++) {
      const sample = input[i]!
      sumSquares += sample * sample
    }

    const meanSquares = sumSquares / length
    const rms = Math.sqrt(meanSquares)

    // 指数平滑
    this.smoothedRMS =
      this.smoothingFactor * rms + (1 - this.smoothingFactor) * this.smoothedRMS

    // 转换为 dB 并映射到 0~100
    return this.rmsToRange(this.smoothedRMS)
  }

  /**
   * 将 RMS 值映射到 0~100 范围
   *
   * 使用对数刻度，对人耳更自然：
   * - RMS < 0.0001 → 0 (静音)
   * - RMS >= 0.5   → 100 (很响)
   * - 中间用 dB 插值
   */
  private rmsToRange(rms: number): number {
    if (rms <= 0.0001) {
      return 0
    }

    if (rms >= 0.5) {
      return 100
    }

    // dB 计算: 20 * log10(rms)
    // -80 dB (0.0001) → 0
    // -6 dB (0.5) → 100
    const minDB = -80
    const maxDB = -6
    const db = 20 * Math.log10(rms)

    // 限制在范围内
    const clampedDB = Math.max(minDB, Math.min(maxDB, db))

    // 线性映射到 0~100
    return Math.round(((clampedDB - minDB) / (maxDB - minDB)) * 100)
  }

  /**
   * 重置平滑值
   */
  reset(): void {
    this.smoothedRMS = 0
  }
}
