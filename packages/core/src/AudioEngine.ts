// ============================================================
// RealtimeASR SDK — AudioEngine
// 封装浏览器音频：AudioContext + MediaStream + AudioWorkletNode
// ============================================================

import { AudioError, PermissionError } from './errors.js'

/**
 * AudioEngine 配置
 */
export interface AudioEngineOptions {
  /** 采样率（用于 getUserMedia 约束），默认 48000 */
  sampleRate?: number
  /** 声道数，默认 1 */
  channels?: number
  /** AudioWorklet 缓冲区大小 */
  bufferSize?: number
}

/**
 * 音频引擎
 *
 * 负责：
 * - 创建 AudioContext
 * - 获取麦克风权限和 MediaStream
 * - 管理音频生命周期
 *
 * 不负责：
 * - PCM 编码
 * - 网络上传
 * - 事件分发
 */
export class AudioEngine {
  private options: Required<AudioEngineOptions>
  private audioContext: AudioContext | null = null
  private mediaStream: MediaStream | null = null
  private initialized = false

  constructor(options: AudioEngineOptions = {}) {
    this.options = {
      sampleRate: options.sampleRate ?? 48000,
      channels: options.channels ?? 1,
      bufferSize: options.bufferSize ?? 128,
    }
  }

  /**
   * 初始化音频引擎
   * - 请求麦克风权限
   * - 创建 AudioContext
   */
  async init(): Promise<{
    audioContext: AudioContext
    mediaStream: MediaStream
    sampleRate: number
  }> {
    if (this.initialized) {
      throw new AudioError('AudioEngine is already initialized')
    }

    // 1. 请求麦克风权限
    let mediaStream: MediaStream
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: { ideal: this.options.sampleRate },
          channelCount: { ideal: this.options.channels },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      })
    } catch (err) {
      const error = err as DOMException
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        throw new PermissionError()
      }
      throw new AudioError(
        `Failed to get microphone access: ${error.message}`
      )
    }

    // 2. 创建 AudioContext
    let audioContext: AudioContext
    try {
      audioContext = new AudioContext({
        sampleRate: this.options.sampleRate,
      })
    } catch (err) {
      // 清理已获取的 stream
      mediaStream.getTracks().forEach((track) => track.stop())
      throw new AudioError(
        `Failed to create AudioContext: ${err instanceof Error ? err.message : String(err)}`
      )
    }

    this.audioContext = audioContext
    this.mediaStream = mediaStream
    this.initialized = true

    return {
      audioContext,
      mediaStream,
      sampleRate: audioContext.sampleRate, // 返回实际采样率
    }
  }

  /**
   * 获取 AudioContext
   */
  getAudioContext(): AudioContext | null {
    return this.audioContext
  }

  /**
   * 获取 MediaStream
   */
  getMediaStream(): MediaStream | null {
    return this.mediaStream
  }

  /**
   * 是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * 停止并关闭音频引擎
   */
  stop(): void {
    // 停止所有 track
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop())
      this.mediaStream = null
    }
  }

  /**
   * 彻底销毁
   */
  destroy(): void {
    this.stop()

    // 关闭 AudioContext
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {
        // 忽略关闭错误
      })
    }
    this.audioContext = null
    this.initialized = false
  }
}
