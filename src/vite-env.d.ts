/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 生产 API 完整源（无末尾 /），如 https://api.example.com；留空则走同源 /api */
  readonly VITE_API_BASE?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}
