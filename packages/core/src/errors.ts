// ============================================================
// RealtimeASR SDK — 统一错误类型
// ============================================================

/**
 * RealtimeASR 错误基类
 */
export class RealtimeASRError extends Error {
  public readonly code: string
  public readonly timestamp: number

  constructor(code: string, message: string) {
    super(`[RealtimeASR] ${message}`)
    this.name = 'RealtimeASRError'
    this.code = code
    this.timestamp = Date.now()
  }
}

/**
 * 麦克风权限被拒绝
 */
export class PermissionError extends RealtimeASRError {
  constructor(message = 'Microphone permission denied') {
    super('PERMISSION_DENIED', message)
    this.name = 'PermissionError'
  }
}

/**
 * 音频相关错误（AudioContext、AudioWorklet 等）
 */
export class AudioError extends RealtimeASRError {
  constructor(message: string) {
    super('AUDIO_ERROR', message)
    this.name = 'AudioError'
  }
}

/**
 * Provider 相关错误
 */
export class ProviderError extends RealtimeASRError {
  constructor(message: string) {
    super('PROVIDER_ERROR', message)
    this.name = 'ProviderError'
  }
}

/**
 * 协议解析错误
 */
export class ProtocolError extends RealtimeASRError {
  constructor(message: string) {
    super('PROTOCOL_ERROR', message)
    this.name = 'ProtocolError'
  }
}

/**
 * WebSocket 错误
 */
export class WebSocketError extends RealtimeASRError {
  constructor(message: string) {
    super('WEBSOCKET_ERROR', message)
    this.name = 'WebSocketError'
  }
}

/**
 * 状态机非法转换错误
 */
export class StateError extends RealtimeASRError {
  constructor(message: string) {
    super('STATE_ERROR', message)
    this.name = 'StateError'
  }
}
