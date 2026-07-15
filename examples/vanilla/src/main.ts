// ============================================================
// RealtimeASR Vanilla Demo
// 使用 Vite 开发服务器运行：pnpm dev
// ============================================================

import { RealtimeASR } from '@realtime-asr/core'
import { TencentProvider } from '@realtime-asr/provider-tencent'

// ---- DOM 元素 ----
const $ = (id: string) => document.getElementById(id)!

const statusDot = $('statusDot')
const statusText = $('statusText')
const volumeBar = $('volumeBar')
const volumeVal = $('volumeVal')
const partialText = $('partialText')
const resultList = $('resultList')
const errorMsg = $('errorMsg')
const btnStart = $('btnStart') as HTMLButtonElement
const btnStop = $('btnStop') as HTMLButtonElement
const waveCanvas = $('waveCanvas') as HTMLCanvasElement

// ---- 状态 ----
let recorder: RealtimeASR | null = null
let isRecording = false

// ---- Canvas 波形 ----
const ctx = waveCanvas.getContext('2d')!
let waveBuf = new Float32Array(0)

function drawWave() {
  const w = waveCanvas.clientWidth
  const h = waveCanvas.clientHeight
  waveCanvas.width = w * devicePixelRatio
  waveCanvas.height = h * devicePixelRatio
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)

  ctx.clearRect(0, 0, w, h)

  if (waveBuf.length === 0) return

  const mid = h / 2
  const step = Math.max(1, Math.floor(waveBuf.length / w))

  ctx.strokeStyle = '#60a5fa'
  ctx.lineWidth = 1.5
  ctx.beginPath()

  for (let i = 0; i < w; i++) {
    const idx = Math.min(i * step, waveBuf.length - 1)
    const y = mid - (waveBuf[idx] ?? 0) * mid

    if (i === 0) ctx.moveTo(i, y)
    else ctx.lineTo(i, y)
  }

  ctx.stroke()
}

// ---- UI 更新 ----
function showError(msg: string) {
  errorMsg.textContent = `❌ ${msg}`
  errorMsg.classList.add('show')
  setTimeout(() => errorMsg.classList.remove('show'), 6000)
}

function setStatus(state: 'idle' | 'connecting' | 'recording') {
  statusDot.className = 'status-dot'
  if (state === 'connecting') {
    statusDot.classList.add('connecting')
    statusText.textContent = '连接中...'
  } else if (state === 'recording') {
    statusDot.classList.add('recording')
    statusText.textContent = '录音中'
  } else {
    statusText.textContent = '就绪'
  }
}

function setBtn(start: boolean) {
  btnStart.disabled = !start
  btnStop.disabled = start
}

// ---- 核心逻辑 ----
async function startRecording() {
  const appId = ($('appId') as HTMLInputElement).value.trim()
  const secretId = ($('secretId') as HTMLInputElement).value.trim()
  const secretKey = ($('secretKey') as HTMLInputElement).value.trim()

  if (!appId || !secretId || !secretKey) {
    showError('请先填写腾讯云 App ID、Secret ID、Secret Key')
    return
  }

  errorMsg.classList.remove('show')
  setStatus('connecting')
  setBtn(false)

  try {
    const provider = new TencentProvider({
      appId,
      secretId,
      secretKey,
      debug: true,
    })

    recorder = new RealtimeASR({
      provider,
      debug: true,
    })

    // ---- 事件绑定 ----
    recorder.on('start', () => {
      isRecording = true
      setStatus('recording')
      setBtn(false)
    })

    recorder.on('stop', () => {
      isRecording = false
      setStatus('idle')
      setBtn(true)
    })

    recorder.on('volume', (vol: number) => {
      volumeBar.style.width = `${vol}%`
      volumeVal.textContent = String(vol)
    })

    recorder.on('wave', (data: Float32Array) => {
      waveBuf = data
      drawWave()
    })

    recorder.on('partial', (text: string) => {
      partialText.textContent = text
    })

    recorder.on('final', (text: string) => {
      if (text.trim()) {
        const div = document.createElement('div')
        div.className = 'result-item'
        div.textContent = text
        resultList.appendChild(div)
        resultList.scrollTop = resultList.scrollHeight
      }
      partialText.textContent = ''
    })

    recorder.on('error', (err: Error) => {
      showError(err.message)
      setStatus('idle')
      setBtn(true)
      isRecording = false
    })

    await recorder.start()
  } catch (err) {
    showError(err instanceof Error ? err.message : String(err))
    setStatus('idle')
    setBtn(true)
  }
}

async function stopRecording() {
  if (!recorder || !isRecording) return

  btnStop.disabled = true

  try {
    await recorder.stop()
  } catch (err) {
    showError(err instanceof Error ? err.message : String(err))
    setBtn(true)
  }
}

// ---- 全局挂载 ----
;(window as unknown as Record<string, unknown>).startRecording = startRecording
;(window as unknown as Record<string, unknown>).stopRecording = stopRecording

// ---- 初始化 ----
drawWave()
window.addEventListener('resize', drawWave)

console.log('🎙️ RealtimeASR Demo 已就绪')
console.log('请填入腾讯云配置并点击开始录音')

// 按钮事件
btnStart.addEventListener('click', startRecording)
btnStop.addEventListener('click', stopRecording)
