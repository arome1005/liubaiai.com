import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    /** 小米 MiMo 等 API 常不返回 CORS；开发时走同源代理避免浏览器拦截 fetch */
    proxy: {
      '/__proxy/mimo-v2': {
        target: 'https://api.mimo-v2.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/__proxy\/mimo-v2/, ''),
      },
    },
  },
})
