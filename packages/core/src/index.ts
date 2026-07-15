// ============================================================
// RealtimeASR SDK — Core 入口
// ============================================================

// 主入口
export { Recorder } from './Recorder.js'

// 便于使用的别名
export { Recorder as RealtimeASR } from './Recorder.js'

// 事件系统（业务层独立使用时可用）
export { EventEmitter } from './EventEmitter.js'

// 错误类型
export {
  RealtimeASRError,
  PermissionError,
  AudioError,
  ProviderError,
  ProtocolError,
  WebSocketError,
  StateError,
} from './errors.js'

// 类型重导出
export type { RecorderOptions, ASRProvider, RecorderEvents } from '@realtime-asr/shared'
export { RecorderState } from '@realtime-asr/shared'

// 内部模块（供高级用户或自定义场景使用）
export { AudioEngine } from './AudioEngine.js'
export type { AudioEngineOptions } from './AudioEngine.js'
export { AudioWorkletManager } from './AudioWorkletManager.js'
export { PCMEncoder } from './PCMEncoder.js'
export { Resampler } from './Resampler.js'
export { FrameBuffer } from './FrameBuffer.js'
export { VolumeMeter } from './VolumeMeter.js'
export { StateMachine } from './StateMachine.js'
