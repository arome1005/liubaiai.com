import type { LockFunc } from "@supabase/auth-js";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * 默认的 `navigator.locks` 在 Firefox（尤其隐私/严格模式）下可能「立即获取失败」，
 * 调试器会在 `auth-js` 的 locks.js 上暂停，页面像「卡住」。
 * 使用 no-op 锁：不依赖 Web Locks；多标签同时刷新 token 的竞态风险略增，对个人写作场景可接受。
 */
const authLockNoOp: LockFunc = async (_name, _acquireTimeout, fn) => fn();

/** 记录「记住登录」偏好，供自定义 Storage 在 local / session 间二选一写入 */
const PERSIST_MODE_KEY = "sb_ui_auth_persist_v1";

let client: SupabaseClient | null = null;
/** 与当前会话存储位置一致：local = localStorage，session = sessionStorage */
let cachedMode: "local" | "session" | null = null;

function envOrThrow() {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url?.trim() || !key?.trim()) {
    throw new Error("未配置 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY");
  }
  return { url: url.trim(), key: key.trim() };
}

function getPersistenceMode(): "local" | "session" {
  if (cachedMode) return cachedMode;
  if (typeof window === "undefined") return "local";
  if (sessionStorage.getItem(PERSIST_MODE_KEY) === "session") {
    cachedMode = "session";
    return "session";
  }
  if (localStorage.getItem(PERSIST_MODE_KEY) === "local") {
    cachedMode = "local";
    return "local";
  }
  return "local";
}

/**
 * 登录/注册前调用，决定 token 写入 localStorage 还是 sessionStorage（仅本会话）。
 * 传 `null` 表示登出后清除偏好（下次登录前仍可从已有 token 推断）。
 */
export function setAuthPersistenceMode(mode: "local" | "session" | null) {
  cachedMode = mode ?? null;
  if (typeof window === "undefined") return;
  if (mode === null) {
    sessionStorage.removeItem(PERSIST_MODE_KEY);
    localStorage.removeItem(PERSIST_MODE_KEY);
    return;
  }
  if (mode === "session") {
    localStorage.removeItem(PERSIST_MODE_KEY);
    sessionStorage.setItem(PERSIST_MODE_KEY, "session");
  } else {
    sessionStorage.removeItem(PERSIST_MODE_KEY);
    localStorage.setItem(PERSIST_MODE_KEY, "local");
  }
}

/**
 * 单一浏览器端 Supabase 实例 + 自定义 Storage，避免两个 `createClient` 触发
 * 「Multiple GoTrueClient instances」警告；行为与原先「双客户端」等价。
 */
function createHybridAuthStorage() {
  return {
    getItem(key: string): string | null {
      if (typeof window === "undefined") return null;
      const s = sessionStorage.getItem(key);
      const l = localStorage.getItem(key);
      if (s && !l) {
        cachedMode = "session";
        return s;
      }
      if (l && !s) {
        cachedMode = "local";
        return l;
      }
      if (s && l) {
        cachedMode = "session";
        return s;
      }
      return null;
    },
    setItem(key: string, value: string) {
      if (typeof window === "undefined") return;
      const mode = getPersistenceMode();
      if (mode === "session") {
        localStorage.removeItem(key);
        sessionStorage.setItem(key, value);
      } else {
        sessionStorage.removeItem(key);
        localStorage.setItem(key, value);
      }
    },
    removeItem(key: string) {
      if (typeof window === "undefined") return;
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
    },
  };
}

/** 长期会话（localStorage）或仅标签页会话（sessionStorage），由 `setAuthPersistenceMode` 与读盘推断 */
export function getSupabase(): SupabaseClient {
  if (!client) {
    const { url, key } = envOrThrow();
    client = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: typeof window !== "undefined" ? createHybridAuthStorage() : undefined,
        lock: authLockNoOp,
      },
    });
  }
  return client;
}

/** 调用自建 API（Fastify）时在 Header 带上 Supabase access_token */
export async function authFetchHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const { data } = await getSupabase().auth.getSession();
  const h: Record<string, string> = { ...extra };
  const t = data.session?.access_token;
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}
