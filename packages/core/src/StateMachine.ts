// ============================================================
// RealtimeASR SDK — StateMachine
// 统一生命周期状态管理
// ============================================================

import { RecorderState } from '@realtime-asr/shared'
import { StateError } from './errors.js'

/**
 * 状态转换表 — 定义所有合法状态转换
 *
 * Idle → Initializing → Recording → Stopping → Stopped → Destroyed
 */
const VALID_TRANSITIONS: ReadonlyMap<RecorderState, readonly RecorderState[]> = new Map([
  [RecorderState.Idle, [RecorderState.Initializing]],
  [RecorderState.Initializing, [RecorderState.Recording, RecorderState.Stopped, RecorderState.Destroyed]],
  [RecorderState.Recording, [RecorderState.Stopping, RecorderState.Destroyed]],
  [RecorderState.Stopping, [RecorderState.Stopped, RecorderState.Destroyed]],
  [RecorderState.Stopped, [RecorderState.Idle, RecorderState.Initializing, RecorderState.Destroyed]],
  [RecorderState.Destroyed, []],
])

/**
 * 状态机 — 统一管理 Recorder 生命周期
 *
 * 所有状态流转必须经过此状态机，非法转换将抛出 StateError。
 */
export class StateMachine {
  private currentState: RecorderState

  constructor(initialState: RecorderState = RecorderState.Idle) {
    this.currentState = initialState
  }

  /**
   * 尝试转换到新状态
   * @throws StateError 非法转换时抛出
   */
  transition(newState: RecorderState): void {
    const allowed = VALID_TRANSITIONS.get(this.currentState)
    if (!allowed || !allowed.includes(newState)) {
      throw new StateError(
        `Invalid state transition: ${this.currentState} → ${newState}`
      )
    }
    this.currentState = newState
  }

  /**
   * 获取当前状态
   */
  getState(): RecorderState {
    return this.currentState
  }

  /**
   * 检查是否处于指定状态
   */
  is(state: RecorderState): boolean {
    return this.currentState === state
  }

  /**
   * 检查是否可以转换到指定状态
   */
  canTransition(target: RecorderState): boolean {
    const allowed = VALID_TRANSITIONS.get(this.currentState)
    return allowed ? allowed.includes(target) : false
  }

  /**
   * 重置到 Idle 状态
   */
  reset(): void {
    this.currentState = RecorderState.Idle
  }
}
