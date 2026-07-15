// ============================================================
// RealtimeASR SDK — Tencent Cloud ASR Protocol
// 腾讯云实时语音识别 WebSocket API 协议常量与参数构建
// ============================================================

/**
 * 腾讯云 ASR WebSocket 端点
 */
export const TENCENT_ASR_ENDPOINT = 'asr.cloud.tencent.com'

/**
 * 腾讯云 ASR WebSocket 路径模板
 */
export const TENCENT_ASR_PATH = '/asr/v2'

/**
 * 语音编码格式
 */
export const VOICE_FORMAT = 1 // 1 = PCM (16k, 16bit, mono)

/**
 * 引擎模型类型
 */
export const ENGINE_MODEL_TYPE = '16k_zh' // 16k 中文普通话

/**
 * 腾讯云 ASR 连接参数
 */
export interface TencentASRParams {
  /** 腾讯云 AppID */
  appid: string
  /** 腾讯云 SecretId */
  secretid: string
  /** Unix 时间戳（秒） */
  timestamp: number
  /** 签名有效期（秒后过期） */
  expired: number
  /** 随机数 */
  nonce: number
  /** 语音 ID（唯一标识一次识别会话） */
  voice_id: string
  /** 语音编码格式: 1=PCM */
  voice_format: number
  /** 引擎模型类型 */
  engine_model_type: string
  /** 是否需要 VAD，默认 0（不需要） */
  needvad: number
  /** 是否过滤脏词，默认 0 */
  filter_dirty: number
  /** 是否过滤句末标点，默认 0 */
  filter_punc: number
  /** 是否转换数字，默认 1 */
  convert_num_mode: number
  /** 热词表 ID */
  hotword_id?: string
  /** 自学习模型 ID */
  customization_id?: string
  /** 是否输出词级别时间戳 */
  word_info?: number
}

/**
 * 腾讯云 ASR 默认参数
 */
export const DEFAULT_ASR_PARAMS: Partial<TencentASRParams> = {
  voice_format: VOICE_FORMAT,
  engine_model_type: ENGINE_MODEL_TYPE,
  needvad: 0,
  filter_dirty: 0,
  filter_punc: 0,
  convert_num_mode: 1,
}

/**
 * 腾讯云实时 ASR WebSocket 响应格式
 */
export interface TencentASRResponse {
  /** 错误码，0 表示成功 */
  code: number
  /** 错误信息 */
  message: string
  /** 语音 ID */
  voice_id: string
  /** 识别结果 */
  result?: {
    /** 识别文本 */
    voice_text_str: string
    /**
     * 分片类型:
     * 0 = 一句话开始
     * 1 = 中间结果 (partial)
     * 2 = 一句话结束 (final)
     */
    slice_type: number
    /** 分片索引 */
    index?: number
    /** 开始时间 ms */
    start_time?: number
    /** 结束时间 ms */
    end_time?: number
    /** 词级别时间戳 */
    word_list?: Array<{
      word: string
      start_time: number
      end_time: number
      stable_flag: number
    }>
  }
  /** 最终识别的完整文本 */
  final?: number
}

/**
 * 构建查询参数字符串（不含 signature）
 */
export function buildQueryString(params: Record<string, string | number | undefined>): string {
  // 过滤 undefined 值，按 key 排序
  const entries = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => [k, String(v)] as [string, string])
    .sort(([a], [b]) => a.localeCompare(b))

  return entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
}
