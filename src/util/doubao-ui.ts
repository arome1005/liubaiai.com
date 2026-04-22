import type { AiProviderConfig } from "../ai/types";

/** 燎原（豆包）在界面展示的模型名：有 `modelDisplayName` 时优先，否则回落到真实 `model`。 */
export function doubaoModelDisplayLabel(cfg: Pick<AiProviderConfig, "model" | "modelDisplayName">): string {
  const d = (cfg.modelDisplayName ?? "").trim();
  if (d) return d;
  return (cfg.model ?? "").trim();
}
