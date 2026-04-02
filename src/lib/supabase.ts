import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (!url?.trim() || !key?.trim()) {
      throw new Error("未配置 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY");
    }
    client = createClient(url.trim(), key.trim(), {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
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
