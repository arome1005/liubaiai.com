/**
 * Owner 模式工具：判断当前登录账号是否 owner、读写本机 sidecar 的 token / baseUrl，
 * 探测 sidecar 是否可达。
 *
 * 这是一个**仅 owner 本人**使用的旁路：开启后 AI 调用不走 API，而是走本机 sidecar
 * （tools/sidecar 子项目）→ Claude Agent SDK → Pro 订阅。
 *
 * 安全约束：
 * - email 必须严格等于 OWNER_EMAIL；其它账号即使打开开关也不会激活
 * - sidecar 监听 127.0.0.1，外部网络无法访问，所以非 owner 用户即便伪造前端状态也连不上
 * - token 校验是 sidecar 侧强制的；前端只是把 token 透传到 Authorization 头
 */

import { authMe } from "../api/auth";

const OWNER_EMAIL = "hesongqiang3@gmail.com";

const LS_OWNER_ENABLE_KEY = "liubai.ownerMode.enabled";
const LS_OWNER_TOKEN_KEY = "liubai.ownerMode.sidecarToken";
const LS_OWNER_BASEURL_KEY = "liubai.ownerMode.sidecarBaseUrl";
const LS_OWNER_MODEL_KEY = "liubai.ownerMode.model";

const SIDECAR_DEFAULT_BASE_URL = "http://127.0.0.1:7788";
const SIDECAR_PROBE_TIMEOUT_MS = 800;
const SIDECAR_PROBE_CACHE_MS = 30_000;

let probeCache: { at: number; ok: boolean } | null = null;

export function isOwnerEmail(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === OWNER_EMAIL;
}

function safeLs(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function getOwnerModeEnabled(): boolean {
  return safeLs()?.getItem(LS_OWNER_ENABLE_KEY) === "1";
}

export function setOwnerModeEnabled(v: boolean) {
  const ls = safeLs();
  if (!ls) return;
  ls.setItem(LS_OWNER_ENABLE_KEY, v ? "1" : "0");
  // 切换状态后立刻让探测失效，避免拿到旧缓存
  probeCache = null;
}

export function getOwnerSidecarToken(): string {
  return safeLs()?.getItem(LS_OWNER_TOKEN_KEY) ?? "";
}

export function setOwnerSidecarToken(token: string) {
  const ls = safeLs();
  if (!ls) return;
  ls.setItem(LS_OWNER_TOKEN_KEY, token.trim());
  probeCache = null;
}

export function getOwnerSidecarBaseUrl(): string {
  const v = safeLs()?.getItem(LS_OWNER_BASEURL_KEY)?.trim();
  return v || SIDECAR_DEFAULT_BASE_URL;
}

export function setOwnerSidecarBaseUrl(url: string) {
  const ls = safeLs();
  if (!ls) return;
  ls.setItem(LS_OWNER_BASEURL_KEY, url.trim());
  probeCache = null;
}

export function getOwnerModel(): string {
  const v = safeLs()?.getItem(LS_OWNER_MODEL_KEY)?.trim();
  return v || "sonnet";
}

export function setOwnerModel(model: string) {
  const ls = safeLs();
  if (!ls) return;
  ls.setItem(LS_OWNER_MODEL_KEY, model.trim() || "sonnet");
}

/**
 * 探测 sidecar 是否在线。30s 内的结果会被缓存以避免反复打 /health。
 * `force=true` 时强制重新探测。
 */
export async function probeSidecar(force = false): Promise<boolean> {
  if (!force && probeCache && Date.now() - probeCache.at < SIDECAR_PROBE_CACHE_MS) {
    return probeCache.ok;
  }
  const url = `${getOwnerSidecarBaseUrl().replace(/\/+$/, "")}/health`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), SIDECAR_PROBE_TIMEOUT_MS);
    const r = await fetch(url, { signal: ctrl.signal, mode: "cors" });
    clearTimeout(t);
    const ok = r.ok;
    probeCache = { at: Date.now(), ok };
    return ok;
  } catch {
    probeCache = { at: Date.now(), ok: false };
    return false;
  }
}

let cachedEmail: { at: number; email: string | null } | null = null;
const EMAIL_CACHE_MS = 60_000;

export async function getCurrentUserEmailForOwner(): Promise<string | null> {
  if (cachedEmail && Date.now() - cachedEmail.at < EMAIL_CACHE_MS) {
    return cachedEmail.email;
  }
  try {
    const { user } = await authMe();
    const email = user?.email ?? null;
    cachedEmail = { at: Date.now(), email };
    return email;
  } catch {
    cachedEmail = { at: Date.now(), email: null };
    return null;
  }
}

export function clearOwnerEmailCache() {
  cachedEmail = null;
}

/**
 * 当前是否应该走 owner 直连：邮箱匹配 + 开关开 + token 已配 + sidecar 健康。
 * 调用方：在 AI 调用入口处把 provider 覆盖为 "claude-code-local"。
 */
export async function shouldUseOwnerSidecar(email?: string | null): Promise<boolean> {
  const e = email ?? (await getCurrentUserEmailForOwner());
  if (!isOwnerEmail(e)) return false;
  if (!getOwnerModeEnabled()) return false;
  if (!getOwnerSidecarToken()) return false;
  return probeSidecar();
}

/**
 * 同步版本：在已知 email 的 React 组件里使用，避免 await。
 * 不做 sidecar 探测，仅判断"用户允许 owner 模式"。
 */
export function ownerModeAllowedSync(email: string | null | undefined): boolean {
  return isOwnerEmail(email) && getOwnerModeEnabled() && !!getOwnerSidecarToken();
}

/**
 * 同步：当前是否可能跳过 token 预算检查。
 * 用于 AiPanel 等需要在弹"超额确认"弹窗前同步判断的场景。
 * 不做 email 校验（懒加载邮箱会破坏同步契约）；仅看本机开关状态。
 *
 * 这是个"宽松判断"：owner 把开关打开 + token 已配，就视为意图走订阅。
 * 即便 sidecar 临时挂掉、call 落到 API 上，丢失一次预算预警的代价小于
 * 让 owner 在写作流里反复确认 token 预算。
 */
export function ownerModeWillBypassBudget(): boolean {
  return getOwnerModeEnabled() && !!getOwnerSidecarToken();
}
