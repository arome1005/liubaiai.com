import type { AiProviderId } from "./types";

const KEY = "liubai:lastUsedAiProvider";

const ALL: AiProviderId[] = [
  "openai",
  "anthropic",
  "gemini",
  "ollama",
  "mlx",
  "doubao",
  "zhipu",
  "kimi",
  "xiaomi",
];

export function rememberLastUsedAiProvider(id: AiProviderId): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* ignore */
  }
}

export function loadLastUsedAiProvider(): AiProviderId | null {
  try {
    const v = localStorage.getItem(KEY);
    if (!v) return null;
    return ALL.includes(v as AiProviderId) ? (v as AiProviderId) : null;
  } catch {
    return null;
  }
}

/** 一键生成：优先用户上次成功调用 AI 的 provider，否则回落到设置里的当前默认 */
export function resolveOneClickAiProvider(defaultProvider: AiProviderId): AiProviderId {
  return loadLastUsedAiProvider() ?? defaultProvider;
}
