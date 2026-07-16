// ============================================================
// RealtimeASR SDK — TencentProvider
// 腾讯云实时语音识别 Provider 实现
//
// 参考文档: https://cloud.tencent.com/document/product/1093/48982
// ============================================================

import type { ASRProvider } from '@realtime-asr/shared'
import { Signer } from './Signer.js'
import type { SignParams } from './Signer.js'
import { Parser } from './Parser.js'
import { DEFAULT_ASR_PARAMS } from './Protocol.js'
import { WebSocketError } from './errors.js'

/**
 * TencentProvider 配置
 */
export interface TencentProviderOptions extends SignParams {
  /** 引擎模型类型，默认 "16k_zh" */
  engineModelType?: string
  /** 是否开启 VAD，默认 0 */
  needVad?: number
  /** 是否过滤脏词，默认 0 */
  filterDirty?: number
  /** 是否过滤标点，默认 0 */
  filterPunc?: number
  /** 是否转换数字，默认 1 */
  convertNumMode?: number
  /** 热词表 ID */
  hotwordId?: string
  /** 自学习模型 ID */
  customizationId?: string
  /** 是否输出词级别时间戳 */
  wordInfo?: number
  /** 签名有效期（秒），默认 24 小时 */
  expired?: number
  /** 是否开启调试日志 */
  debug?: boolean
}

/** WebSocket 连接状态 */
enum ConnectionState {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
  Streaming = 'streaming',
  Closing = 'closing',
  Closed = 'closed',
}

/**
 * 腾讯云实时语音识别 Provider
 *
 * 通信流程:
 * 1. 签名 → WebSocket 连接 (wss://asr.cloud.tencent.com/asr/v2/{appid}?params)
 * 2. 建立后即可发送二进制 PCM16 音频数据
 * 3. 结束发送 {"type": "end"} 文本帧
 * 4. 服务端返回最后的结果后关闭连接
 */
export class TencentProvider implements ASRProvider {
  // ---- 配置 ----
  private options: TencentProviderOptions & {
    engineModelType: string
    needVad: number
    filterDirty: number
    filterPunc: number
    convertNumMode: number
    expired: number
    debug: boolean
  }
  private debug: boolean
  private signer: Signer
  private parser: Parser
  private ws: WebSocket | null = null
  private voiceId: string = ''

  // ---- 状态 ----
  private connectionState: ConnectionState = ConnectionState.Disconnected
  /** 防止 onerror/onclose 重复 reject */
  private connectResolved = false

  // ---- 事件 ----
  private eventHandlers = new Map<string, Set<(...args: unknown[]) => void>>()

  constructor(options: TencentProviderOptions) {
    this.options = {
      appId: options.appId,
      secretId: options.secretId,
      secretKey: options.secretKey,
      token: options.token,
      engineModelType: options.engineModelType ?? DEFAULT_ASR_PARAMS.engine_model_type ?? '16k_zh',
      needVad: options.needVad ?? DEFAULT_ASR_PARAMS.needvad ?? 0,
      filterDirty: options.filterDirty ?? DEFAULT_ASR_PARAMS.filter_dirty ?? 0,
      filterPunc: options.filterPunc ?? DEFAULT_ASR_PARAMS.filter_punc ?? 0,
      convertNumMode: options.convertNumMode ?? DEFAULT_ASR_PARAMS.convert_num_mode ?? 1,
      hotwordId: options.hotwordId as string | undefined,
      customizationId: options.customizationId as string | undefined,
      wordInfo: options.wordInfo as number | undefined,
      expired: options.expired ?? 86400,
      debug: options.debug ?? false,
    }

    this.debug = this.options.debug
    this.signer = new Signer({
      appId: this.options.appId,
      secretId: this.options.secretId,
      secretKey: this.options.secretKey,
    })
    this.parser = new Parser()
  }

  // ============================================================
  // ASRProvider 接口
  // ============================================================

  async connect(): Promise<void> {
    if (this.connectionState === ConnectionState.Connecting) {
      throw new WebSocketError('Already connecting')
    }
    if (this.connectionState === ConnectionState.Connected ||
        this.connectionState === ConnectionState.Streaming) {
      throw new WebSocketError('Already connected')
    }

    this.connectionState = ConnectionState.Connecting
    this.connectResolved = false
    this.voiceId = this.generateVoiceId()
    this.log(`Connecting... voiceId=${this.voiceId}`)

    try {
      const url = await this.buildWebSocketURL()
      this.log(`Sign URL: ${url.slice(0, 120)}...`)
      await this.connectWebSocket(url)

      this.connectionState = ConnectionState.Connected
      this.log('Connected OK')
    } catch (err) {
      this.connectionState = ConnectionState.Disconnected
      throw err
    }
  }

  send(buffer: ArrayBuffer): void {
    if (this.connectionState !== ConnectionState.Connected &&
        this.connectionState !== ConnectionState.Streaming) {
      return
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.emit('error', new WebSocketError('WebSocket is not open'))
      return
    }

    if (this.connectionState === ConnectionState.Connected) {
      this.connectionState = ConnectionState.Streaming
      this.log('Streaming...')
    }

    this.ws.send(buffer)
  }

  /**
   * 关闭连接（异步）
   * 1. 发送 {"type": "end"} 表示音频结束
   * 2. 等待服务端返回剩余结果（最多 2s）
   * 3. 关闭 WebSocket
   */
  async close(): Promise<void> {
    if (this.connectionState === ConnectionState.Closed ||
        this.connectionState === ConnectionState.Disconnected) {
      return
    }

    this.connectionState = ConnectionState.Closing
    this.log('Closing...')

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: 'end' }))
      } catch {
        // 忽略
      }
    }

    // 等待服务端回传最终结果（最多 2s）
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        this.closeWebSocket()
        resolve()
      }, 2000)
    })
  }

  // ============================================================
  // 事件
  // ============================================================

  on(event: string, handler: (...args: unknown[]) => void): void {
    this.getOrCreateHandlers(event).add(handler)
  }

  off(event: string, handler: (...args: unknown[]) => void): void {
    this.eventHandlers.get(event)?.delete(handler)
  }

  // ============================================================
  // 私有
  // ============================================================

  private async buildWebSocketURL(): Promise<string> {
    const now = Math.floor(Date.now() / 1000)
    // 10 位随机正整数
    const nonce = Math.floor(1000000000 + Math.random() * 9000000000)

    const params: Record<string, string | number | undefined> = {
      secretid: this.options.secretId,
      timestamp: now,
      expired: now + this.options.expired,
      nonce,
      voice_id: this.voiceId,
      voice_format: DEFAULT_ASR_PARAMS.voice_format ?? 1,
      engine_model_type: this.options.engineModelType,
      needvad: this.options.needVad,
      filter_dirty: this.options.filterDirty,
      filter_punc: this.options.filterPunc,
      convert_num_mode: this.options.convertNumMode,
      hotword_id: this.options.hotwordId,
      customization_id: this.options.customizationId,
      word_info: this.options.wordInfo,
      token: this.options.token,
    }

    return this.signer.generateURL(params)
  }

  private connectWebSocket(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url)
      ws.binaryType = 'arraybuffer'

      const timeout = setTimeout(() => {
        if (!this.connectResolved) {
          this.connectResolved = true
          reject(new WebSocketError('Connection timeout (10s)'))
        }
      }, 10000)

      ws.onopen = () => {
        clearTimeout(timeout)
        if (!this.connectResolved) {
          this.connectResolved = true
          this.ws = ws
          resolve()
        }
      }

      ws.onmessage = (event: MessageEvent) => {
        this.handleMessage(event.data)
      }

      ws.onerror = () => {
        clearTimeout(timeout)
        if (!this.connectResolved) {
          this.connectResolved = true
          const err = new WebSocketError('WebSocket connection failed')
          this.emit('error', err)
          reject(err)
        }
      }

      ws.onclose = (event: CloseEvent) => {
        this.log(`Closed: code=${event.code} reason="${event.reason}"`)
        const prevState = this.connectionState
        this.connectionState = ConnectionState.Closed

        // 如果还未 resolve（连接失败时 onerror 后紧跟 onclose），不做额外处理
        if (!this.connectResolved && event.code !== 1000) {
          this.connectResolved = true
          reject(new WebSocketError(`WebSocket closed: code=${event.code}`))
        }

        // 运行时异常关闭通知业务层（非主动关闭触发）
        if (this.connectResolved &&
            prevState !== ConnectionState.Closing &&
            event.code !== 1000 &&
            event.code !== 1005) {
          this.emit('error', new WebSocketError(
            `WebSocket closed unexpectedly: code=${event.code}`
          ))
        }
      }
    })
  }

  private handleMessage(data: string | ArrayBuffer): void {
    if (typeof data !== 'string') return

    try {
      const result = this.parser.parse(data)
      if (!result) return

      if (result.isFinal) {
        this.log(`Final: "${result.text}"`)
        this.emit('final', result.text)
      } else {
        this.log(`Partial: "${result.text}"`)
        this.emit('partial', result.text)
      }
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)))
    }
  }

  private closeWebSocket(): void {
    if (!this.ws) return

    const ws = this.ws
    this.ws = null

    ws.onopen = null
    ws.onmessage = null
    ws.onerror = null
    ws.onclose = null

    if (ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING) {
      ws.close(1000, 'Normal closure')
    }

    this.connectionState = ConnectionState.Closed
    this.log('Closed OK')
  }

  /** 生成唯一 Voice ID: UUID-like (8-4-4-4-12) */
  private generateVoiceId(): string {
    const hex = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1)
    return `${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}`
  }

  private emit(event: string, ...args: unknown[]): void {
    const handlers = this.eventHandlers.get(event)
    if (!handlers) return
    for (const h of handlers) {
      try { h(...args) } catch (err) {
        console.error(`[TencentProvider] handler error on "${event}":`, err)
      }
    }
  }

  private getOrCreateHandlers(event: string): Set<(...args: unknown[]) => void> {
    let set = this.eventHandlers.get(event)
    if (!set) {
      set = new Set()
      this.eventHandlers.set(event, set)
    }
    return set
  }

  private log(msg: string): void {
    if (this.debug) console.debug(`[TencentProvider] ${msg}`)
  }
}
