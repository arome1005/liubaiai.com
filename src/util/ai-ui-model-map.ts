import type { AiProviderId } from "../ai/types";

/** 与设置页「默认提供方」、BackendModelConfigModal、AIModelSelector 中条目一致 */
export const AI_PROVIDER_TO_MODEL_ID: Record<AiProviderId, string> = {
  openai: "jianshan",
  anthropic: "tingyu",
  gemini: "guanyun",
  doubao: "liaoyuan",
  zhipu: "zhipu",
  kimi: "kimi",
  xiaomi: "xiaomi",
  ollama: "qianlong",
  mlx: "qianlong_mlx",
  // owner-only：不出现在选择 UI；保留映射以满足 Record<AiProviderId> 类型要求
  "claude-code-local": "tingyu_local",
};

const AI_MODEL_ID_TO_PROVIDER = Object.fromEntries(
  (Object.entries(AI_PROVIDER_TO_MODEL_ID) as [AiProviderId, string][]).map(
    ([provider, modelId]) => [modelId, provider],
  ),
) as Record<string, AiProviderId>;

export function aiProviderToModelId(provider: AiProviderId): string {
  return AI_PROVIDER_TO_MODEL_ID[provider] ?? "qianlong";
}

export function aiModelIdToProvider(modelId: string): AiProviderId {
  return AI_MODEL_ID_TO_PROVIDER[modelId] ?? "ollama";
}
