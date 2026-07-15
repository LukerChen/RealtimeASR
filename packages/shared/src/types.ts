// ============================================================
// RealtimeASR SDK — Shared Types
// ============================================================

/**
 * Recorder 生命周期状态
 */
export enum RecorderState {
  Idle = 'idle',
  Initializing = 'initializing',
  Recording = 'recording',
  Stopping = 'stopping',
  Stopped = 'stopped',
  Destroyed = 'destroyed',
}

/**
 * ASR Provider 统一接口
 * 所有 Provider 必须实现此接口
 */
export interface ASRProvider {
  /** 建立连接（签名、WebSocket 握手） */
  connect(): Promise<void>

  /** 发送音频二进制数据 */
  send(buffer: ArrayBuffer): void

  /** 关闭连接 */
  close(): Promise<void>

  /** 注册事件回调 */
  on(event: string, handler: (...args: any[]) => void): void

  /** 移除事件回调 */
  off(event: string, handler: (...args: any[]) => void): void
}

/**
 * Recorder 初始化配置
 */
export interface RecorderOptions {
  /** ASR Provider 实例（必填） */
  provider: ASRProvider

  /** 目标采样率，默认 16000 */
  sampleRate?: number

  /** 声道数，默认 1（单声道） */
  channels?: number

  /** 帧时长（毫秒），默认 200 */
  frameDuration?: number

  /** 是否开启调试日志 */
  debug?: boolean
}

/**
 * 事件回调类型
 */
export type EventHandler<T = unknown> = (data: T) => void

/**
 * Recorder 事件类型映射
 */
export interface RecorderEvents {
  start: void
  stop: void
  partial: string
  final: string
  volume: number
  wave: Float32Array
  error: Error
}
