import type { ReferenceLibraryEntry, TuiyanReferenceBinding, TuiyanReferencePolicy } from "../db/types"
import { logTuiyanReferenceSafeBuildFailed } from "./tuiyan-reference-dev-log"
import { buildReferenceStrategyBlock, hasEffectiveReferenceStrategy } from "./tuiyan-reference-policy"

/**
 * 非致命：关联 id 在已加载的 `refLibrary` 中找不到时，策略块仍可能生成，但书名为占位。
 */
export function collectReferenceAssemblyWarnings(args: {
  linkedRefWorkIds: string[]
  refLibrary: ReferenceLibraryEntry[]
}): string[] {
  const has = new Set(args.refLibrary.map((r) => r.id))
  const missingN = args.linkedRefWorkIds.filter((id) => !has.has(id)).length
  if (missingN === 0) return []
  return [
    `装配提醒：有 ${missingN} 本已关联书在「当前已加载的藏经列表」中未找到，摘要里可能显示「未命名」；可尝试刷新页或到藏经页确认。`,
  ]
}

/**
 * 策略块生成失败时返回空串并带 `errorMessage`，供显式降级（不注入参考，走普通规划），避免静默半残。
 */
export function safeBuildReferenceStrategyBlock(args: {
  linkedRefWorkIds: string[]
  referenceBindings: TuiyanReferenceBinding[]
  referencePolicy: TuiyanReferencePolicy
  refLibrary: ReferenceLibraryEntry[]
}): { block: string; errorMessage: string | null } {
  if (!hasEffectiveReferenceStrategy(args.linkedRefWorkIds, args.referenceBindings)) {
    return { block: "", errorMessage: null }
  }
  try {
    return { block: buildReferenceStrategyBlock(args), errorMessage: null }
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    logTuiyanReferenceSafeBuildFailed(detail, { stage: "buildReferenceStrategyBlock" })
    return {
      block: "",
      errorMessage: `参考策略块生成失败，本次将不注入参考策略（按普通规划继续）。原因：${detail}`,
    }
  }
}
