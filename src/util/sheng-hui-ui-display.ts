import type { AiProviderId } from "../ai/types";
import { PROVIDER_UI } from "../components/ai-panel/provider-ui";

/** 本机 token 粗估的示意「成本」数字，仅 UI 展示，不用于计费。 */
export function formatShengHuiIllustrativeYuan(approxTokens: number): string {
  if (!Number.isFinite(approxTokens) || approxTokens <= 0) return "0.00";
  const y = (approxTokens / 1_000_000) * 2.4;
  return y < 0.01 ? y.toFixed(3) : y.toFixed(2);
}

export function shengHuiModelMetricLine(provider: AiProviderId): string {
  const card = PROVIDER_UI[provider];
  if (!card) return "";
  const { prose, cost } = card.meters;
  const speed = prose >= 4 ? "偏慢" : prose <= 2 ? "偏快" : "中速";
  const price = cost >= 4 ? "偏高" : cost <= 2 ? "省" : "中价";
  return `${speed} · ${price}`;
}
