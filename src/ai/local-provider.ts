import type { AiProviderId } from "./types";

/** 本机直连、不经云端隐私门控的提供方（Ollama / Apple MLX 等） */
export function isLocalAiProvider(id: AiProviderId): boolean {
  return id === "ollama" || id === "mlx";
}
