import { apiUrl } from "./base";
import { getSessionStorageSupabase, getSupabase } from "../lib/supabase";

const JSON_HEADERS = { "Content-Type": "application/json" };

export type AuthUser = { id: string; email: string };

function normEmail(email: string) {
  return String(email ?? "").trim().toLowerCase();
}

function mapUser(u: { id: string; email?: string | null }): AuthUser {
  return { id: u.id, email: u.email ?? "" };
}

export async function authMe(): Promise<{ user: AuthUser | null }> {
  if (!import.meta.env.VITE_SUPABASE_URL?.trim() || !import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()) {
    return { user: null };
  }
  const persist = getSupabase();
  const sessionOnly = getSessionStorageSupabase();
  for (const sb of [sessionOnly, persist]) {
    const { data, error } = await sb.auth.getSession();
    if (error) throw new Error("ME_FAILED");
    const u = data.session?.user;
    if (u) return { user: mapUser(u) };
  }
  return { user: null };
}

/** 发送注册验证码到邮箱（未创建账号） */
export async function authRequestRegisterCode(email: string): Promise<{ ok: true; dev?: { code: string } }> {
  const r = await fetch(apiUrl("/api/auth/register/request-code"), {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ email: normEmail(email) }),
  });
  const data = (await r.json().catch(() => ({}))) as { error?: string; ok?: boolean; dev?: { code: string } };
  if (!r.ok) throw new Error(data.error ?? "REQUEST_CODE_FAILED");
  return data as { ok: true; dev?: { code: string } };
}

/** 验证码通过后后端在 Supabase 建号；此处再 signIn 写入本地会话 */
export async function authRegisterComplete(
  email: string,
  password: string,
  code: string,
  rememberLogin = true,
): Promise<{ user: AuthUser }> {
  const r = await fetch(apiUrl("/api/auth/register/complete"), {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ email: normEmail(email), password, code: code.trim() }),
  });
  const data = (await r.json().catch(() => ({}))) as { error?: string; user?: AuthUser };
  if (!r.ok) throw new Error(data.error ?? "REGISTER_FAILED");
  if (!data.user) throw new Error("REGISTER_FAILED");

  const persist = getSupabase();
  const sessionOnly = getSessionStorageSupabase();
  await persist.auth.signOut();
  await sessionOnly.auth.signOut();

  const client = rememberLogin ? persist : sessionOnly;
  const { error } = await client.auth.signInWithPassword({
    email: normEmail(email),
    password,
  });
  if (error) throw new Error("LOGIN_FAILED");
  return { user: data.user };
}

export async function authLogin(email: string, password: string, rememberLogin = true): Promise<{ user: AuthUser }> {
  const persist = getSupabase();
  const sessionOnly = getSessionStorageSupabase();
  await persist.auth.signOut();
  await sessionOnly.auth.signOut();

  const client = rememberLogin ? persist : sessionOnly;
  const { data, error } = await client.auth.signInWithPassword({
    email: normEmail(email),
    password,
  });
  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes("invalid") || m.includes("credential")) throw new Error("INVALID_CREDENTIALS");
    throw new Error("LOGIN_FAILED");
  }
  if (!data.user) throw new Error("INVALID_CREDENTIALS");
  return { user: { id: data.user.id, email: data.user.email ?? "" } };
}

export async function authLogout(): Promise<void> {
  await getSupabase().auth.signOut();
  await getSessionStorageSupabase().auth.signOut();
}

/** 由 Supabase 发送重置邮件（需在控制台配置 SMTP / 发信模板与 Redirect URLs） */
export async function authForgotPassword(email: string): Promise<{ ok: true }> {
  const redirectTo = `${window.location.origin}/reset-password`;
  const { error } = await getSupabase().auth.resetPasswordForEmail(normEmail(email), { redirectTo });
  if (error) throw new Error(error.message.includes("rate") ? "RATE_LIMIT" : "FORGOT_FAILED");
  return { ok: true };
}
