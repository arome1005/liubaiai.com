import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;
let sessionClient: SupabaseClient | null = null;

function envOrThrow() {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url?.trim() || !key?.trim()) {
    throw new Error("未配置 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY");
  }
  return { url: url.trim(), key: key.trim() };
}

/** 长期会话（localStorage），对应「30 天内保持登录」勾选 */
export function getSupabase(): SupabaseClient {
  if (!client) {
    const { url, key } = envOrThrow();
    client = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

/** 仅浏览器会话（sessionStorage），关闭标签页后需重新登录 */
export function getSessionStorageSupabase(): SupabaseClient {
  if (!sessionClient) {
    const { url, key } = envOrThrow();
    sessionClient = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: typeof window !== "undefined" ? window.sessionStorage : undefined,
      },
    });
  }
  return sessionClient;
}

/** 调用自建 API（Fastify）时在 Header 带上 Supabase access_token */
export async function authFetchHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const { data } = await getSupabase().auth.getSession();
  const h: Record<string, string> = { ...extra };
  const t = data.session?.access_token;
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}
