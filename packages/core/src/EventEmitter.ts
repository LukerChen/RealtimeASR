// ============================================================
// RealtimeASR SDK — EventEmitter
// 自定义事件中心，不依赖浏览器 EventTarget
// ============================================================

import type { EventHandler } from '@realtime-asr/shared'

/**
 * 统一事件中心
 *
 * 支持泛型事件类型映射，提供类型安全的事件处理。
 *
 * @example
 * ```ts
 * const emitter = new EventEmitter<{ start: void; data: string }>()
 * emitter.on('start', () => console.log('started'))
 * emitter.on('data', (text) => console.log(text))
 * emitter.emit('data', 'hello')
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class EventEmitter<T extends { [K in keyof T]: unknown } = Record<string, unknown>> {
  private handlers = new Map<string, Set<EventHandler<unknown>>>()
  private onceHandlers = new Map<string, Set<EventHandler<unknown>>>()

  /**
   * 注册事件监听
   */
  on<K extends keyof T & string>(event: K, handler: T[K] extends void ? () => void : EventHandler<T[K]>): void {
    const handlers = this.getOrCreate(event)
    handlers.add(handler as EventHandler<unknown>)
  }

  /**
   * 注册一次性事件监听（触发后自动移除）
   */
  once<K extends keyof T & string>(event: K, handler: T[K] extends void ? () => void : EventHandler<T[K]>): void {
    const handlers = this.getOrCreateOnce(event)
    handlers.add(handler as EventHandler<unknown>)
  }

  /**
   * 移除事件监听
   */
  off<K extends keyof T & string>(event: K, handler: T[K] extends void ? () => void : EventHandler<T[K]>): void {
    this.handlers.get(event as string)?.delete(handler as EventHandler<unknown>)
    this.onceHandlers.get(event as string)?.delete(handler as EventHandler<unknown>)
  }

  /**
   * 触发事件
   */
  emit<K extends keyof T & string>(event: K, data?: T[K]): void {
    // 触发持久监听
    const handlers = this.handlers.get(event as string)
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data)
        } catch (err) {
          // 避免一个 handler 的异常影响其他 handler
          console.error(`[RealtimeASR] Error in event handler for "${event as string}":`, err)
        }
      }
    }

    // 触发一次性监听
    const onceSet = this.onceHandlers.get(event as string)
    if (onceSet) {
      for (const handler of onceSet) {
        try {
          handler(data)
        } catch (err) {
          console.error(`[RealtimeASR] Error in once handler for "${event as string}":`, err)
        }
      }
      onceSet.clear()
    }
  }

  /**
   * 移除指定事件的所有监听器
   */
  removeAllListeners(event?: string): void {
    if (event) {
      this.handlers.delete(event)
      this.onceHandlers.delete(event)
    } else {
      this.handlers.clear()
      this.onceHandlers.clear()
    }
  }

  /**
   * 获取事件监听器数量
   */
  listenerCount(event: string): number {
    const persistent = this.handlers.get(event)?.size ?? 0
    const once = this.onceHandlers.get(event)?.size ?? 0
    return persistent + once
  }

  private getOrCreate(event: string): Set<EventHandler<unknown>> {
    let set = this.handlers.get(event)
    if (!set) {
      set = new Set()
      this.handlers.set(event, set)
    }
    return set
  }

  private getOrCreateOnce(event: string): Set<EventHandler<unknown>> {
    let set = this.onceHandlers.get(event)
    if (!set) {
      set = new Set()
      this.onceHandlers.set(event, set)
    }
    return set
  }
}
