import { getProviderTemperature } from "../ai/storage";
import type { AiProviderId, AiSettings } from "../ai/types";

/** 相对当前模型「写作温度」向两侧偏移量（同 prompt 异参对比，N3）。 */
export const SHENG_HUI_AB_TEMP_SPREAD = 0.32;

function clampModelT(t: number): number {
  return Math.min(2, Math.max(0, t));
}

/**
 * 基于设置里当前 provider 的基准温度，拆出 A(偏低) / B(偏高) 两档。
 * 当基准已在边界时仍保证 A≠B 的可分性。
 */
export function resolveShengHuiAbPairTemperatures(
  settings: AiSettings,
  provider: AiProviderId,
): { a: number; b: number; base: number } {
  const base = getProviderTemperature(settings, provider);
  const down = clampModelT(base - SHENG_HUI_AB_TEMP_SPREAD);
  const up = clampModelT(base + SHENG_HUI_AB_TEMP_SPREAD);
  if (Math.abs(up - down) >= 0.08) {
    return { a: down, b: up, base };
  }
  if (base <= 0.04) {
    return { a: 0, b: clampModelT(base + 0.25), base };
  }
  if (base >= 1.96) {
    return { a: clampModelT(base - 0.25), b: 2, base };
  }
  return { a: clampModelT(base - 0.15), b: clampModelT(base + 0.15), base };
}
