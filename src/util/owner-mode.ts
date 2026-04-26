/**
 * 本地直连（高级）工具：判断"用户是否已同意条款 + 是否启用 + 本机 sidecar 是否可达"，
 * 读写本机 sidecar 的 token / baseUrl / 默认模型。
 *
 * 这是一个**完全本地化的高级特性**：
 * - 所有凭据（token / baseUrl）仅保存在浏览器 localStorage，平台不托管
 * - 启用前必须勾选《用户协议》《隐私政策》中"本地直连模式"条款的同意
 * - 仅在用户本机的 sidecar 进程在线时生效；离线即自动 fallback 到原 provider
 *
 * 注意：函数 / localStorage key 名沿用历史命名（含 "owner"）以维持向后兼容；
 * 旧版"仅 owner 邮箱可用"的限制已移除——任何登录用户均可在自担风险下启用。
 */

const LS_OWNER_ENABLE_KEY = "liubai.ownerMode.enabled";
const LS_OWNER_TOKEN_KEY = "liubai.ownerMode.sidecarToken";
const LS_OWNER_BASEURL_KEY = "liubai.ownerMode.sidecarBaseUrl";
const LS_OWNER_MODEL_KEY = "liubai.ownerMode.model";

/**
 * 协议同意状态。值为 "<版本>:<ISO 时间>" 字符串；版本变化时自动失效，需重新勾选。
 * 当前版本对应的协议条款见 TermsPage / PrivacyPage 中"本地直连模式（高级）"小节。
 */
const LS_LOCAL_SIDECAR_DISCLAIMER_KEY = "liubai.localSidecar.disclaimerAcceptedAt";
export const LOCAL_SIDECAR_DISCLAIMER_VERSION = "2026-04-26";

const SIDECAR_DEFAULT_BASE_URL = "http://127.0.0.1:7788";
const SIDECAR_PROBE_TIMEOUT_MS = 800;
const SIDECAR_PROBE_CACHE_MS = 30_000;

let probeCache: { at: number; ok: boolean } | null = null;

function safeLs(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/* ────────────────────────── 协议同意门禁 ────────────────────────── */

export function getLocalSidecarDisclaimerAccepted(): boolean {
  const v = safeLs()?.getItem(LS_LOCAL_SIDECAR_DISCLAIMER_KEY) ?? "";
  return v.startsWith(`${LOCAL_SIDECAR_DISCLAIMER_VERSION}:`);
}

export function setLocalSidecarDisclaimerAccepted(v: boolean) {
  const ls = safeLs();
  if (!ls) return;
  if (v) {
    ls.setItem(
      LS_LOCAL_SIDECAR_DISCLAIMER_KEY,
      `${LOCAL_SIDECAR_DISCLAIMER_VERSION}:${new Date().toISOString()}`,
    );
  } else {
    ls.removeItem(LS_LOCAL_SIDECAR_DISCLAIMER_KEY);
  }
  probeCache = null;
}

export function getLocalSidecarDisclaimerAcceptedAt(): string | null {
  const v = safeLs()?.getItem(LS_LOCAL_SIDECAR_DISCLAIMER_KEY) ?? "";
  if (!v.startsWith(`${LOCAL_SIDECAR_DISCLAIMER_VERSION}:`)) return null;
  return v.slice(`${LOCAL_SIDECAR_DISCLAIMER_VERSION}:`.length) || null;
}

/* ────────────────────────── 启用开关 / token / baseUrl / model ────────────────────────── */

export function getOwnerModeEnabled(): boolean {
  return safeLs()?.getItem(LS_OWNER_ENABLE_KEY) === "1";
}

export function setOwnerModeEnabled(v: boolean) {
  const ls = safeLs();
  if (!ls) return;
  ls.setItem(LS_OWNER_ENABLE_KEY, v ? "1" : "0");
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

/* ────────────────────────── sidecar 健康探测 ────────────────────────── */

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

/* ────────────────────────── 高级接入 · 日用量统计 ────────────────────────── */

const LS_SIDECAR_DAILY_KEY_PREFIX = "liubai:sidecarDailyTokens:";

interface SidecarDailyEntry {
  date: string;
  inputTokens: number;
  outputTokens: number;
  calls: number;
}

function todayDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 记录一次 sidecar 调用的估算 token 用量 */
export function addSidecarDailyTokens(inputTokens: number, outputTokens: number): void {
  const ls = safeLs();
  if (!ls) return;
  const key = `${LS_SIDECAR_DAILY_KEY_PREFIX}${todayDateStr()}`;
  let entry: SidecarDailyEntry = { date: todayDateStr(), inputTokens: 0, outputTokens: 0, calls: 0 };
  try {
    const raw = ls.getItem(key);
    if (raw) entry = JSON.parse(raw) as SidecarDailyEntry;
  } catch { /* ignore */ }
  entry.inputTokens = (entry.inputTokens ?? 0) + Math.max(0, inputTokens);
  entry.outputTokens = (entry.outputTokens ?? 0) + Math.max(0, outputTokens);
  entry.calls = (entry.calls ?? 0) + 1;
  try { ls.setItem(key, JSON.stringify(entry)); } catch { /* ignore */ }
}

/** 读取今日 sidecar 估算用量 */
export function readSidecarDailyTokens(): { inputTokens: number; outputTokens: number; total: number; calls: number } {
  const ls = safeLs();
  if (!ls) return { inputTokens: 0, outputTokens: 0, total: 0, calls: 0 };
  try {
    const raw = ls.getItem(`${LS_SIDECAR_DAILY_KEY_PREFIX}${todayDateStr()}`);
    if (!raw) return { inputTokens: 0, outputTokens: 0, total: 0, calls: 0 };
    const e = JSON.parse(raw) as SidecarDailyEntry;
    const inp = e.inputTokens ?? 0;
    const out = e.outputTokens ?? 0;
    return { inputTokens: inp, outputTokens: out, total: inp + out, calls: e.calls ?? 0 };
  } catch {
    return { inputTokens: 0, outputTokens: 0, total: 0, calls: 0 };
  }
}

/* ── 等效 API 参考价（美元，仅供参考） ─────────────────────────── */

const SIDECAR_PRICING: Record<string, { input: number; output: number }> = {
  sonnet:  { input: 3.0,  output: 15.0  },
  opus:    { input: 15.0, output: 75.0  },
  haiku:   { input: 0.8,  output: 4.0   },
};

/**
 * 计算等效 API 参考成本（美元）。
 * 基于 Claude 公开定价，仅供参考，不是计费凭证。
 */
export function calcSidecarEquivCostUsd(
  inputTokens: number,
  outputTokens: number,
  model = "sonnet",
): number {
  const p = SIDECAR_PRICING[model] ?? SIDECAR_PRICING.sonnet;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

/* ────────────────────────── 综合判定 ────────────────────────── */

/**
 * 当前是否应该走本地 sidecar：协议同意 + 开关开 + token 已配 + sidecar 健康。
 * 调用方：在 AI 调用入口处把 provider 覆盖为 "claude-code-local"。
 */
export async function shouldUseOwnerSidecar(): Promise<boolean> {
  if (!getLocalSidecarDisclaimerAccepted()) return false;
  if (!getOwnerModeEnabled()) return false;
  if (!getOwnerSidecarToken()) return false;
  return probeSidecar();
}

/**
 * 同步：用户是否已"完成接入"（协议同意 + 开关 + token），不做 sidecar 探测。
 * 用于设置 UI / 徽章等需要立即决定渲染状态的场景。
 */
export function ownerModeAllowedSync(): boolean {
  return (
    getLocalSidecarDisclaimerAccepted() &&
    getOwnerModeEnabled() &&
    !!getOwnerSidecarToken()
  );
}

/**
 * 同步：当前是否可能跳过 token 预算检查（API 计费导向的预警/拦截）。
 * 用于 AiPanel 在弹"超额确认"前同步判断。
 *
 * 这是个"宽松判断"：用户已同意协议且开关打开 + token 已配，就视为意图走订阅。
 * 即便 sidecar 临时挂掉、call 落到 API 上，丢失一次预算预警的代价小于
 * 让用户在写作流里反复确认 token 预算。
 */
export function ownerModeWillBypassBudget(): boolean {
  return ownerModeAllowedSync();
}
