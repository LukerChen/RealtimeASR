// ============================================================
// RealtimeASR SDK — Tencent Cloud Signer
// 腾讯云实时 ASR 签名生成 (HMAC-SHA1 + Base64)
//
// 参考文档: https://cloud.tencent.com/document/product/1093/48982
// ============================================================

/** 签名参数 */
export interface SignParams {
  appId: string
  secretId: string
  secretKey: string
  /** 临时密钥 Token（使用临时密钥时必传） */
  token?: string
}

/** ASR WebSocket 服务地址 */
const ASR_HOST = 'asr.cloud.tencent.com'

/**
 * 腾讯云 ASR 签名器
 *
 * 签名算法 (HMAC-SHA1 + Base64):
 * 1. 将所有请求参数（不含 signature）按 key 字典序排序
 * 2. 拼接: asr.cloud.tencent.com/asr/v2/{appid}?key1=val1&key2=val2...
 *    注意: 签名字符串中的参数值不进行 URL 编码
 * 3. 用 SecretKey 做 HMAC-SHA1 → Base64 编码
 * 4. 对签名结果做 URL 编码 (encodeURIComponent)，拼入最终 URL
 */
export class Signer {
  private appId: string
  private secretKey: string

  constructor(params: SignParams) {
    this.appId = params.appId
    this.secretKey = params.secretKey
  }

  /**
   * 生成完整的签名后 WebSocket URL
   *
   * @param params 所有请求参数（不含 signature，值不编码）
   * @returns 完整 wss:// URL，可直接用于 new WebSocket(url)
   */
  async generateURL(
    params: Record<string, string | number | undefined>
  ): Promise<string> {
    // 1. 过滤 undefined，转为字符串，按 key 字典序排序
    const sorted: [string, string][] = Object.entries(params)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)] as [string, string])
      .sort(([a], [b]) => a.localeCompare(b))

    // 2. 构建签名字符串（原始值，不 URL 编码）
    //    asr.cloud.tencent.com/asr/v2/{appid}?k1=v1&k2=v2...
    const signStr =
      `${ASR_HOST}/asr/v2/${this.appId}?` +
      sorted.map(([k, v]) => `${k}=${v}`).join('&')

    // 3. HMAC-SHA1 → Base64
    const rawSig = await this.hmacSha1Base64(signStr)

    // 4. 签名结果做 URL 编码
    const encodedSig = encodeURIComponent(rawSig)

    // 5. 拼接最终 URL（参数值做 URL 编码，加入签名）
    const queryString =
      sorted.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&') +
      `&signature=${encodedSig}`

    return `wss://${ASR_HOST}/asr/v2/${this.appId}?${queryString}`
  }

  // ---- 内部方法 ----

  /** HMAC-SHA1 → Base64 */
  private async hmacSha1Base64(data: string): Promise<string> {
    const enc = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(this.secretKey),
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    )
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data))
    return this.buf2b64(sig)
  }

  /** ArrayBuffer → Base64 */
  private buf2b64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]!)
    }
    return btoa(binary)
  }
}
