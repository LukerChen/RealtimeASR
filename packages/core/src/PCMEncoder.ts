// ============================================================
// RealtimeASR SDK — PCMEncoder
// Float32Array [-1.0, 1.0] → Int16Array [-32768, 32767]
// ============================================================

/**
 * PCM 编码器
 *
 * 将 Float32 音频样本转换为 Int16 (PCM16) 格式。
 *
 * @example
 * ```ts
 * const encoder = new PCMEncoder()
 * const int16 = encoder.encode(float32Data)
 * ```
 */
export class PCMEncoder {
  /**
   * 将 Float32Array 编码为 Int16Array
   *
   * Float32 [-1.0, 1.0] → Int16 [-32768, 32767]
   */
  encode(input: Float32Array): Int16Array {
    const length = input.length
    const output = new Int16Array(length)

    for (let i = 0; i < length; i++) {
      const sample = input[i]!
      // 防止削波：限制在 [-1.0, 1.0] 范围内
      const clamped = Math.max(-1, Math.min(1, sample))
      // 转换为 Int16：[-1, 1] → [-32768, 32767]
      // 使用 32767 而不是 32768 避免正负不对称
      output[i] = clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767)
    }

    return output
  }

  /**
   * 批量编码：直接在目标数组上写入
   */
  encodeInto(input: Float32Array, output: Int16Array, offset = 0): void {
    const length = input.length
    for (let i = 0; i < length; i++) {
      const sample = input[i]!
      const clamped = Math.max(-1, Math.min(1, sample))
      output[offset + i] = clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767)
    }
  }

  /**
   * 解码 PCM16 → Float32（用于验证/调试）
   */
  decode(input: Int16Array): Float32Array {
    const length = input.length
    const output = new Float32Array(length)
    for (let i = 0; i < length; i++) {
      const sample = input[i]!
      output[i] = sample < 0 ? sample / 32768 : sample / 32767
    }
    return output
  }
}
