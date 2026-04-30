import type { AiProviderId } from "./types";

const KEY = "liubai:lastUsedAiProvider";

const ALL: AiProviderId[] = [
  "openai",
  "anthropic",
  "gemini",
  "vertex",
  "ollama",
  "mlx",
  "doubao",
  "zhipu",
  "kimi",
  "xiaomi",
];

export function rememberLastUsedAiProvider(id: AiProviderId): void {
  // Owner 模式的 sidecar provider 不持久化为"上次使用"——它只在 owner 模式开启时才存在，
  // 写进 lastUsed 会让 owner 关闭后留下一个用户选不到的 ghost provider。
  if (id === "claude-code-local") return;
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
