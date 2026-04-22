/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 生产 API 完整源（无末尾 /），如 https://api.example.com；留空则走同源 /api */
  readonly VITE_API_BASE?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /**
   * 管理员解锁密码（仅在 .env.local 中设置，不可提交到 Git）。
   * 用于 PromptsPage 的审核 Tab 解锁校验。
   * 生产部署时请在部署平台的环境变量中设置同名变量。
   */
  readonly VITE_ADMIN_KEY?: string;
  /** Playwright 等 E2E：为 `1` 时在启动后注册 `window.__LIUBAI_PW_SEED` */
  readonly VITE_E2E?: string;
}
