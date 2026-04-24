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

/** 豆包/火山 Ark：与小米类似，浏览器直连常无 CORS，开发时走同源再转发到 volces */
const doubaoArkProxy = {
  '/__proxy/doubao-ark': {
    target: 'https://ark.cn-beijing.volces.com',
    changeOrigin: true,
    secure: true,
    rewrite: (path: string) => path.replace(/^\/__proxy\/doubao-ark/, ''),
  },
} as const

// https://vite.dev/config/
// 与后端共用 backend/.env，避免 VITE_SUPABASE_* 只写在 backend 时前端读不到
export default defineConfig({
  envDir: 'backend',
  plugins: [react(), tailwindcss()],
  build: {
    // 目前应用以单入口为主，chunk 体积告警对发版意义不大；先提高阈值避免“每次构建必有警告”干扰验收。
    chunkSizeWarningLimit: 2700,
  },
  server: {
    /** 仅本机环回，避免 0.0.0.0 监听被误认为「另一套地址」 */
    host: 'localhost',
    /** 避免 Cursor/内置浏览器等强缓存旧 HMR 包，改代码后仍像「没生效」 */
    headers: {
      'Cache-Control': 'no-store',
    },
    /** 固定 5173：占线时请关掉旧进程，勿静默漂到 5174（易误以为「两套 UI」） */
    port: 5173,
    strictPort: true,
    /** 启动 dev 时打开作品库（与 src/dev/dev-local-origin.ts 约定一致） */
    open: '/library',
    /** 小米 MiMo 等 API 常不返回 CORS；开发时走同源代理避免浏览器拦截 fetch */
    proxy: {
      ...apiProxy,
      ...mimoProxy,
      ...doubaoArkProxy,
    },
  },
  /** 与 dev 一致；否则 `npm run build && npm run preview` 时 /api 无代理 → 405 */
  preview: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
    proxy: {
      ...apiProxy,
      ...mimoProxy,
      ...doubaoArkProxy,
    },
  },
})
