// ============================================================
// RealtimeASR SDK — Provider 层通用错误
// ============================================================

/** Provider 层错误基类 */
export class ProviderError extends Error {
  public readonly code: string
  constructor(code: string, message: string) {
    super(`[TencentProvider] ${message}`)
    this.name = 'ProviderError'
    this.code = code
  }
}

/** 协议解析错误 */
export class ProtocolError extends ProviderError {
  constructor(message: string) {
    super('PROTOCOL_ERROR', message)
    this.name = 'ProtocolError'
  }
}

/** WebSocket 错误 */
export class WebSocketError extends ProviderError {
  constructor(message: string) {
    super('WEBSOCKET_ERROR', message)
    this.name = 'WebSocketError'
  }
}
