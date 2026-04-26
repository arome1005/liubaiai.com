/**
 * 后端模型测试健康状态的本地持久化（localStorage）。
 *
 * - Gemini 单独 key（历史原因）
 * - 其他 provider 统一前缀 + provider id
 *
 * 这里只负责读写；UI / 批量测试逻辑放在弹窗组件里。
 */
import type { AiProviderId } from "../../ai/types";

export type ModelVerdict = "ok" | "err";
export type ModelHealth = Record<string, { verdict: ModelVerdict; testedAt: number }>;

export type GeminiModelVerdict = "ok" | "err";
export type GeminiModelHealth = Record<string, { verdict: GeminiModelVerdict; testedAt: number }>;

export const GEMINI_HEALTH_KEY = "liubai:geminiModelHealth";
export const HEALTH_KEY_PREFIX = "liubai:modelHealth:";

export function healthKey(provider: AiProviderId): string {
  return `${HEALTH_KEY_PREFIX}${provider}`;
}

export function loadModelHealth(provider: AiProviderId): ModelHealth {
  try {
    const raw = localStorage.getItem(healthKey(provider));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ModelHealth;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveModelHealth(provider: AiProviderId, next: ModelHealth): void {
  try {
    localStorage.setItem(healthKey(provider), JSON.stringify(next));
  } catch {
    /* ignore quota / SecurityError */
  }
}

export function loadGeminiModelHealth(): GeminiModelHealth {
  try {
    const raw = localStorage.getItem(GEMINI_HEALTH_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as GeminiModelHealth;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveGeminiModelHealth(next: GeminiModelHealth): void {
  try {
    localStorage.setItem(GEMINI_HEALTH_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
