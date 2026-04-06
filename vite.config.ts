import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** 开发 / preview 共用，避免 `vite preview` 时 POST /api 落到静态服务导致 405 */
const apiProxy = {
  '/api': {
    target: 'http://localhost:8788',
    changeOrigin: true,
    secure: false,
  },
} as const

const mimoProxy = {
  '/__proxy/mimo-v2': {
    target: 'https://api.mimo-v2.com',
    changeOrigin: true,
    secure: true,
    rewrite: (path: string) => path.replace(/^\/__proxy\/mimo-v2/, ''),
  },
} as const

// https://vite.dev/config/
// 与后端共用 backend/.env，避免 VITE_SUPABASE_* 只写在 backend 时前端读不到
export default defineConfig({
  envDir: 'backend',
  plugins: [react(), tailwindcss()],
  server: {
    /** 小米 MiMo 等 API 常不返回 CORS；开发时走同源代理避免浏览器拦截 fetch */
    proxy: {
      ...apiProxy,
      ...mimoProxy,
    },
  },
  /** 与 dev 一致；否则 `npm run build && npm run preview` 时 /api 无代理 → 405 */
  preview: {
    proxy: {
      ...apiProxy,
      ...mimoProxy,
    },
  },
})
