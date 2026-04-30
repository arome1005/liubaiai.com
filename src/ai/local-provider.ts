import type { AiProviderId } from "./types";

/** 本机直连、不经云端隐私门控的提供方（Ollama / Apple MLX 等） */
export function isLocalAiProvider(id: AiProviderId): boolean {
  return id === "ollama" || id === "mlx";
}

/**
 * 是否要求用户在「AI 设置」里为该提供方填写 apiKey 后才允许调用。
 * Vertex（云谷）：走本站后端 `/api/ai/vertex`，密钥与 GCP 凭据在服务端，浏览器侧不必填 apiKey。
 */
export function requiresClientSavedApiKey(provider: AiProviderId): boolean {
  if (isLocalAiProvider(provider)) return false;
  if (provider === "vertex") return false;
  return true;
}
