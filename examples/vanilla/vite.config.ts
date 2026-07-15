import { defineConfig } from 'vite'
import path from 'path'

const resolveSrc = (pkg: string) =>
  path.resolve(__dirname, `../../packages/${pkg}/src`)

export default defineConfig({
  resolve: {
    alias: {
      // 直接指向 TypeScript 源码，跳过 dist，避免缓存问题
      '@realtime-asr/shared': resolveSrc('shared'),
      '@realtime-asr/core': resolveSrc('core'),
      '@realtime-asr/provider-tencent': resolveSrc('provider-tencent'),
    },
  },
  server: {
    port: 3000,
    open: true,
  },
})
