// ============================================================
// RealtimeASR SDK — Recorder
// SDK 对外唯一入口，整合所有 Core 模块和 Provider
// ============================================================

import type { ASRProvider, RecorderOptions, RecorderEvents } from '@realtime-asr/shared'
import { RecorderState } from '@realtime-asr/shared'
import { EventEmitter } from './EventEmitter.js'
import { StateMachine } from './StateMachine.js'
import { AudioEngine } from './AudioEngine.js'
import { AudioWorkletManager } from './AudioWorkletManager.js'
import type { WorkletAudioMessage } from './AudioWorkletManager.js'
import { PCMEncoder } from './PCMEncoder.js'
import { Resampler } from './Resampler.js'
import { FrameBuffer } from './FrameBuffer.js'
import { VolumeMeter } from './VolumeMeter.js'
import { AudioError, StateError } from './errors.js'

/**
 * 默认配置
 */
const DEFAULTS = {
  sampleRate: 16000,
  channels: 1,
  frameDuration: 200,
  debug: false,
} as const

/**
 * 计算每帧样本数
 */
function samplesPerFrame(sampleRate: number, frameDurationMs: number): number {
  return Math.floor(sampleRate * (frameDurationMs / 1000))
}

/**
 * Recorder — RealtimeASR SDK 主入口
 *
 * 职责：
 * - 生命周期管理（初始化、开始、停止、销毁）
 * - 协调各 Core 模块
 * - 通过 Provider 发送音频数据
 * - 事件派发（volume, wave, partial, final, error 等）
 *
 * Recorder 不关心：
 * - Provider 的具体实现（腾讯/阿里/FunASR）
 * - WebSocket 协议
 * - UI 渲染
 *
 * @example
 * ```ts
 * const recorder = new Recorder({
 *   provider: new TencentProvider({ appId, secretId, secretKey })
 * })
 *
 * recorder.on('partial', (text) => { console.log('实时:', text) })
 * recorder.on('final', (text) => { console.log('最终:', text) })
 * recorder.on('volume', (vol) => { updateVolumeBar(vol) })
 *
 * await recorder.start()
 * // ... 用户说话 ...
 * await recorder.stop()
 * ```
 */
export class Recorder {
  // ---- 配置 ----
  private options: Required<Omit<RecorderOptions, 'provider'>> & { provider: ASRProvider }

  // ---- 模块 ----
  private emitter: EventEmitter<Record<string, unknown>>
  private stateMachine: StateMachine
  private audioEngine: AudioEngine
  private workletManager: AudioWorkletManager
  private pcmEncoder: PCMEncoder
  private resampler: Resampler
  private frameBuffer: FrameBuffer
  private volumeMeter: VolumeMeter
  private provider: ASRProvider

  // ---- 运行时状态 ----
  private inputSampleRate = 48000 // 浏览器实际采样率，初始化后更新
  private debug: boolean

  constructor(options: RecorderOptions) {
    this.options = {
      provider: options.provider,
      sampleRate: options.sampleRate ?? DEFAULTS.sampleRate,
      channels: options.channels ?? DEFAULTS.channels,
      frameDuration: options.frameDuration ?? DEFAULTS.frameDuration,
      debug: options.debug ?? DEFAULTS.debug,
    }

    this.debug = this.options.debug
    this.provider = this.options.provider

    // 初始化模块
    this.emitter = new EventEmitter()
    this.stateMachine = new StateMachine()

    this.audioEngine = new AudioEngine({
      sampleRate: 48000, // 浏览器原生采样率
      channels: this.options.channels,
    })

    // AudioWorkletManager — processorPath 由构建工具处理
    this.workletManager = new AudioWorkletManager({
      processorPath: this.resolveProcessorPath(),
      bufferSize: 128,
    })

    this.pcmEncoder = new PCMEncoder()
    this.resampler = new Resampler(48000, this.options.sampleRate)
    this.volumeMeter = new VolumeMeter()

    // FrameBuffer — 帧大小计算
    const frameSize = samplesPerFrame(this.options.sampleRate, this.options.frameDuration)
    this.frameBuffer = new FrameBuffer(frameSize, (frame: ArrayBuffer) => {
      this.sendFrame(frame)
    })

    // 转发 Provider 事件到 Recorder 统一事件系统
    this.proxyProviderEvents()
  }

  // ============================================================
  // 公共 API
  // ============================================================

  /**
   * 注册事件监听
   */
  on<K extends keyof RecorderEvents>(
    event: K,
    handler: (data: RecorderEvents[K]) => void
  ): void {
    this.emitter.on(event as string, handler as (data: unknown) => void)
  }

  /**
   * 注册一次性事件监听
   */
  once<K extends keyof RecorderEvents>(
    event: K,
    handler: (data: RecorderEvents[K]) => void
  ): void {
    this.emitter.once(event as string, handler as (data: unknown) => void)
  }

  /**
   * 移除事件监听
   */
  off<K extends keyof RecorderEvents>(
    event: K,
    handler: (data: RecorderEvents[K]) => void
  ): void {
    this.emitter.off(event as string, handler as (data: unknown) => void)
  }

  /**
   * 开始录音
   *
   * 流程：
   * 1. 状态检查 → Idle/Stopped 状态下允许
   * 2. Provider 建立连接
   * 3. AudioEngine 初始化（麦克风 + AudioContext）
   * 4. AudioWorklet 注册并连接
   * 5. 开始接收 PCM 数据
   */
  async start(): Promise<void> {
    if (this.stateMachine.is(RecorderState.Recording)) {
      throw new StateError('Already recording')
    }

    if (this.stateMachine.is(RecorderState.Destroyed)) {
      throw new StateError('Recorder has been destroyed')
    }

    try {
      // 1. 状态切换
      this.stateMachine.transition(RecorderState.Initializing)
      this.log('Initializing...')

      // 2. Provider 建立连接
      this.log('Connecting to provider...')
      await this.provider.connect()
      this.log('Provider connected')

      // 3. AudioEngine 初始化
      this.log('Initializing audio engine...')
      const { audioContext, mediaStream, sampleRate } = await this.audioEngine.init()
      this.inputSampleRate = sampleRate
      this.resampler.setRates(this.inputSampleRate, this.options.sampleRate)
      this.log(`Audio engine initialized, sampleRate=${sampleRate}`)

      // 4. AudioWorklet 注册并连接
      this.log('Registering AudioWorklet...')
      await this.workletManager.register(audioContext)

      this.log('Connecting AudioWorklet...')
      this.workletManager.connect(mediaStream, sampleRate, this.handleAudioData.bind(this))

      // 5. 进入录音状态
      this.stateMachine.transition(RecorderState.Recording)
      this.emitter.emit('start')
      this.log('Recording started ✓')
    } catch (err) {
      // 初始化失败，回到 Stopped 状态
      if (this.stateMachine.is(RecorderState.Initializing)) {
        this.stateMachine.transition(RecorderState.Stopped)
      }
      this.emitter.emit('error', err instanceof Error ? err : new AudioError(String(err)))
    }
  }

  /**
   * 停止录音
   */
  async stop(): Promise<void> {
    if (!this.stateMachine.is(RecorderState.Recording)) {
      throw new StateError('Not recording')
    }

    this.log('Stopping...')
    this.stateMachine.transition(RecorderState.Stopping)

    try {
      // 1. 断开音频
      this.workletManager.disconnect()

      // 2. 停止音频引擎
      this.audioEngine.stop()

      // 3. 关闭 Provider 连接（等待服务端返回剩余结果）
      await this.provider.close()

      // 4. 清空缓冲区
      this.frameBuffer.clear()
      this.volumeMeter.reset()

      this.stateMachine.transition(RecorderState.Stopped)
      this.emitter.emit('stop')
      this.log('Stopped ✓')
    } catch (err) {
      // 即使出错也标记为停止
      this.stateMachine.transition(RecorderState.Stopped)
      this.emitter.emit('error', err instanceof Error ? err : new Error(String(err)))
    }
  }

  /**
   * 销毁 Recorder，释放所有资源
   */
  async destroy(): Promise<void> {
    if (this.stateMachine.is(RecorderState.Destroyed)) {
      return
    }

    this.log('Destroying...')

    try {
      // 如果在录音中，先停止
      if (this.stateMachine.is(RecorderState.Recording)) {
        this.workletManager.disconnect()
        this.audioEngine.stop()
        await this.provider.close()
      }
    } catch {
      // 忽略销毁过程中的错误
    }

    // 释放所有资源
    this.workletManager.destroy()
    this.audioEngine.destroy()
    this.frameBuffer.clear()
    this.volumeMeter.reset()
    this.emitter.removeAllListeners()

    this.stateMachine.transition(RecorderState.Destroyed)
    this.log('Destroyed ✓')
  }

  /**
   * 获取当前状态
   */
  getState(): RecorderState {
    return this.stateMachine.getState()
  }

  // ============================================================
  // 私有方法
  // ============================================================

  /**
   * 处理 AudioWorklet 发来的原始音频数据
   */
  private handleAudioData(message: WorkletAudioMessage): void {
    const rawFloat32 = message.data

    // 1. 发送波形数据给业务层
    this.emitter.emit('wave', rawFloat32)

    // 2. 计算音量
    const volume = this.volumeMeter.calculate(rawFloat32)
    this.emitter.emit('volume', volume)

    // 3. 重采样
    const resampled = this.resampler.resample(rawFloat32)

    // 4. PCM 编码
    const pcm16 = this.pcmEncoder.encode(resampled)

    // 5. 推入帧缓冲区
    this.frameBuffer.push(pcm16)
  }

  /**
   * 发送一帧音频数据到 Provider
   */
  private sendFrame(frame: ArrayBuffer): void {
    this.log(`Sending frame: ${frame.byteLength} bytes`)
    try {
      this.provider.send(frame)
    } catch (err) {
      this.emitter.emit('error', err instanceof Error ? err : new Error(String(err)))
    }
  }

  /**
   * 转发 Provider 事件到 Recorder 统一事件系统
   * Provider 通过 emit('partial'/'final'/'error') 输出结果
   */
  private proxyProviderEvents(): void {
    // 字幕中间结果
    this.provider.on('partial', (text: string) => {
      this.emitter.emit('partial', text)
    })

    // 字幕最终结果
    this.provider.on('final', (text: string) => {
      this.emitter.emit('final', text)
    })

    // Provider 错误
    this.provider.on('error', (err: Error) => {
      this.emitter.emit('error', err)
    })
  }

  /**
   * 解析 AudioWorklet processor 的脚本路径
   */
  private resolveProcessorPath(): string {
    // 使用相对于当前脚本的路径
    // 在构建输出中，audio-processor.js 位于 dist 目录下
    return new URL('./audio-processor.js', import.meta.url).href
  }

  /**
   * 调试日志
   */
  private log(message: string): void {
    if (this.debug) {
      console.debug(`[RealtimeASR] ${message}`)
    }
  }
}
