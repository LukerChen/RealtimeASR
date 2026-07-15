// ============================================================
// RealtimeASR SDK — AudioWorkletManager
// 负责 AudioWorklet 的注册、连接、断开
// ============================================================

import { AudioError } from './errors.js'

/**
 * AudioWorklet 消息格式
 */
export interface WorkletAudioMessage {
  type: 'audio'
  data: Float32Array
  sampleRate: number
}

export type AudioDataCallback = (message: WorkletAudioMessage) => void

/**
 * AudioWorkletManager 配置
 */
export interface WorkletManagerOptions {
  /** AudioWorklet processor 脚本路径 */
  processorPath: string
  /** 缓冲区大小（样本数），默认 128 */
  bufferSize?: number
}

/**
 * AudioWorklet 管理器
 *
 * 负责：
 * - 注册 AudioWorklet processor
 * - 创建并连接 AudioWorkletNode
 * - 接收 PCM 数据回调
 * - 断开并清理节点
 */
export class AudioWorkletManager {
  private processorPath: string
  private bufferSize: number
  private audioContext: AudioContext | null = null
  private workletNode: AudioWorkletNode | null = null
  private mediaStreamSource: MediaStreamAudioSourceNode | null = null
  private onAudioData: AudioDataCallback | null = null
  private registered = false

  constructor(options: WorkletManagerOptions) {
    this.processorPath = options.processorPath
    this.bufferSize = options.bufferSize ?? 128
  }

  /**
   * 注册 AudioWorklet processor
   */
  async register(audioContext: AudioContext): Promise<void> {
    if (this.registered) {
      return
    }

    try {
      await audioContext.audioWorklet.addModule(this.processorPath)
      this.audioContext = audioContext
      this.registered = true
    } catch (err) {
      throw new AudioError(
        `Failed to register AudioWorklet processor: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  /**
   * 连接音频流并开始接收 PCM 数据
   */
  connect(stream: MediaStream, sampleRate: number, callback: AudioDataCallback): void {
    if (!this.audioContext) {
      throw new AudioError('AudioContext not initialized. Call register() first.')
    }

    this.onAudioData = callback

    // 创建 MediaStreamSource
    this.mediaStreamSource = this.audioContext.createMediaStreamSource(stream)

    // 创建 AudioWorkletNode
    this.workletNode = new AudioWorkletNode(this.audioContext, 'realtime-asr-processor', {
      processorOptions: {
        sampleRate: sampleRate,
        bufferSize: this.bufferSize,
      },
    })

    // 监听 PCM 数据
    this.workletNode.port.onmessage = (event: MessageEvent<WorkletAudioMessage>) => {
      if (event.data?.type === 'audio' && this.onAudioData) {
        this.onAudioData(event.data)
      }
    }

    // 连接音频图: Source → WorkletNode → (不输出到扬声器)
    // WorkletNode 不需要连接到 destination，只需要 process 被调用
    this.mediaStreamSource.connect(this.workletNode)
  }

  /**
   * 断开所有音频节点
   */
  disconnect(): void {
    if (this.mediaStreamSource) {
      try {
        this.mediaStreamSource.disconnect()
      } catch {
        // 忽略已断开的错误
      }
      this.mediaStreamSource = null
    }

    if (this.workletNode) {
      try {
        this.workletNode.port.onmessage = null
        this.workletNode.disconnect()
      } catch {
        // 忽略已断开的错误
      }
      this.workletNode = null
    }

    this.onAudioData = null
  }

  /**
   * 彻底销毁
   */
  destroy(): void {
    this.disconnect()
    this.audioContext = null
    this.registered = false
  }
}
