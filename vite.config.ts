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

/**
 * 上游连接 / 流式响应可超时较久（单次正文生成可达数分钟）；不显式拉长会被 vite 默认 ~120s
 * 截断成 502；同时显式监听 `error` 事件，避免 ECONNRESET 透传成空响应。
 */
const LONG_PROXY_TIMEOUT_MS = 10 * 60 * 1000

type ProxyConfigureOptions = {
  on: (event: 'error' | 'proxyReq' | 'proxyRes', handler: (...args: unknown[]) => void) => void
}

function attachUpstreamErrorLogger(label: string) {
  return (proxy: ProxyConfigureOptions) => {
    proxy.on('error', (...args) => {
      const err = args[0] as { code?: string; message?: string } | undefined
      const res = args[2] as
        | { headersSent?: boolean; writeHead?: (s: number, h: Record<string, string>) => void; end?: (b?: string) => void }
        | undefined
      // eslint-disable-next-line no-console
      console.warn(`[proxy:${label}] upstream error:`, err?.code ?? err?.message ?? err)
      if (res && !res.headersSent && res.writeHead && res.end) {
        try {
          res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' })
          res.end(
            JSON.stringify({
              error: {
                message: `${label} 上游连接异常（${err?.code ?? 'UPSTREAM_ERROR'}）。可稍候重试或在「设置 → AI」切换其它模型。`,
              },
            }),
          )
        } catch {
          /* ignore */
        }
      }
    })
  }
}

const mimoProxy = {
  '/__proxy/mimo-v2': {
    target: 'https://api.mimo-v2.com',
    changeOrigin: true,
    secure: true,
    rewrite: (path: string) => path.replace(/^\/__proxy\/mimo-v2/, ''),
    timeout: LONG_PROXY_TIMEOUT_MS,
    proxyTimeout: LONG_PROXY_TIMEOUT_MS,
    configure: attachUpstreamErrorLogger('小米 MiMo'),
  },
} as const

/**
 * 小米 MiMo · Token Plan 套餐专属域名（订阅后才能用，需配套 tp-* API Key）。
 * 与 `mimoProxy` 互不影响：未购套餐的用户仍走 api.mimo-v2.com。
 */
function makeMimoTokenPlanProxy(region: 'cn' | 'sgp' | 'ams') {
  const path = `/__proxy/mimo-tp-${region}`
  return {
    [path]: {
      target: `https://token-plan-${region}.xiaomimimo.com`,
      changeOrigin: true,
      secure: true,
      rewrite: (p: string) => p.replace(new RegExp(`^/__proxy/mimo-tp-${region}`), ''),
      timeout: LONG_PROXY_TIMEOUT_MS,
      proxyTimeout: LONG_PROXY_TIMEOUT_MS,
      configure: attachUpstreamErrorLogger(`小米 Token Plan ${region.toUpperCase()}`),
    },
  } as const
}

const mimoTokenPlanProxies = {
  ...makeMimoTokenPlanProxy('cn'),
  ...makeMimoTokenPlanProxy('sgp'),
  ...makeMimoTokenPlanProxy('ams'),
}

/** 豆包/火山 Ark：与小米类似，浏览器直连常无 CORS，开发时走同源再转发到 volces */
const doubaoArkProxy = {
  '/__proxy/doubao-ark': {
    target: 'https://ark.cn-beijing.volces.com',
    changeOrigin: true,
    secure: true,
    rewrite: (path: string) => path.replace(/^\/__proxy\/doubao-ark/, ''),
    timeout: LONG_PROXY_TIMEOUT_MS,
    proxyTimeout: LONG_PROXY_TIMEOUT_MS,
    configure: attachUpstreamErrorLogger('豆包 Ark'),
  },
} as const

// https://vite.dev/config/
// 与后端共用 backend/.env，避免 VITE_SUPABASE_* 只写在 backend 时前端读不到
export default defineConfig({
  envDir: 'backend',
  plugins: [react(), tailwindcss()],
  /** 创作中心「用量洞察」时间序列依赖 recharts；预构建可避免部分环境下 dev 解析 500 */
  optimizeDeps: {
    include: ['recharts'],
  },
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
      ...mimoTokenPlanProxies,
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
      ...mimoTokenPlanProxies,
      ...doubaoArkProxy,
    },
  },
})
