import { createClient } from "@supabase/supabase-js";

let adminClient;

/** Service role：仅后端使用，用于校验 JWT、注册时 createUser */
export function getSupabaseAdmin() {
  if (!adminClient) {
    const url = process.env.SUPABASE_URL ?? "";
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    if (!url || !key) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }
    adminClient = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  }
  return adminClient;
}
