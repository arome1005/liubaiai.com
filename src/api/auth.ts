const JSON_HEADERS = { "Content-Type": "application/json" };

export type AuthUser = { id: string; email: string };

export async function authMe(): Promise<{ user: AuthUser | null }> {
  const r = await fetch("/api/auth/me", { credentials: "include" });
  if (!r.ok) throw new Error("ME_FAILED");
  return r.json() as Promise<{ user: AuthUser | null }>;
}

/** 发送注册验证码到邮箱（未创建账号） */
export async function authRequestRegisterCode(email: string): Promise<{ ok: true; dev?: { code: string } }> {
  const r = await fetch("/api/auth/register/request-code", {
    method: "POST",
    credentials: "include",
    headers: JSON_HEADERS,
    body: JSON.stringify({ email }),
  });
  const data = (await r.json().catch(() => ({}))) as { error?: string; ok?: boolean; dev?: { code: string } };
  if (!r.ok) throw new Error(data.error ?? "REQUEST_CODE_FAILED");
  return data as { ok: true; dev?: { code: string } };
}

/** 验证码 + 密码完成注册并登录 */
export async function authRegisterComplete(
  email: string,
  password: string,
  code: string,
): Promise<{ user: AuthUser }> {
  const r = await fetch("/api/auth/register/complete", {
    method: "POST",
    credentials: "include",
    headers: JSON_HEADERS,
    body: JSON.stringify({ email, password, code }),
  });
  const data = (await r.json().catch(() => ({}))) as { error?: string; user?: AuthUser };
  if (!r.ok) throw new Error(data.error ?? "REGISTER_FAILED");
  if (!data.user) throw new Error("REGISTER_FAILED");
  return { user: data.user };
}

export async function authLogin(email: string, password: string): Promise<{ user: AuthUser }> {
  const r = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "include",
    headers: JSON_HEADERS,
    body: JSON.stringify({ email, password }),
  });
  const data = (await r.json().catch(() => ({}))) as { error?: string; user?: AuthUser };
  if (!r.ok) throw new Error(data.error ?? "LOGIN_FAILED");
  if (!data.user) throw new Error("LOGIN_FAILED");
  return { user: data.user };
}

export async function authLogout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
}
