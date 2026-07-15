// ============================================================
// RealtimeASR SDK — Tencent Cloud ASR Response Parser
// 解析 WebSocket 返回的 JSON 响应并转换为 SDK 统一事件
// ============================================================

import type { TencentASRResponse } from './Protocol.js'
import { ProtocolError } from './errors.js'

/**
 * 解析后的识别结果
 */
export interface ParsedResult {
  /** 识别文本 */
  text: string
  /** 是否为最终结果 */
  isFinal: boolean
  /** 语音 ID */
  voiceId: string
  /** 错误码 */
  code: number
  /** 错误信息 */
  message: string
}

/**
 * 腾讯云 ASR 响应解析器
 *
 * 解析规则：
 * - slice_type = 0: 句子开始（忽略文本）
 * - slice_type = 1: 中间结果 → emit("partial", text)
 * - slice_type = 2: 句子结束 → emit("final", text)
 * - code ≠ 0: 错误
 */
export class Parser {
  /**
   * 解析单条 WebSocket 消息
   *
   * @param data WebSocket 消息文本
   * @returns 解析后的结果，如果不是有效结果则返回 null
   */
  parse(data: string): ParsedResult | null {
    let response: TencentASRResponse

    try {
      response = JSON.parse(data) as TencentASRResponse
    } catch {
      throw new ProtocolError(`Failed to parse JSON response: ${data.slice(0, 200)}`)
    }

    // 错误响应
    if (response.code !== 0) {
      throw new ProtocolError(
        `Tencent ASR error [code=${response.code}]: ${response.message || 'Unknown error'}`
      )
    }

    // 无识别结果
    if (!response.result) {
      return null
    }

    const { voice_text_str: text, slice_type: sliceType } = response.result

    // slice_type 0 = 句子开始，通常无有效文本
    if (sliceType === 0) {
      return null
    }

    // slice_type 1 = 中间结果 (partial)
    // slice_type 2 = 句子结束 (final)
    const isFinal = sliceType === 2

    return {
      text: text || '',
      isFinal,
      voiceId: response.voice_id,
      code: response.code,
      message: response.message || '',
    }
  }

  /**
   * 批量解析（用于某些场景下一帧可能包含多条消息）
   */
  parseMultiple(data: string): ParsedResult[] {
    const results: ParsedResult[] = []

    // 尝试按换行分割
    const lines = data.split('\n').filter((line) => line.trim().length > 0)

    for (const line of lines) {
      try {
        const result = this.parse(line)
        if (result) {
          results.push(result)
        }
      } catch {
        // 跳过解析失败的行
        continue
      }
    }

    return results
  }
}
