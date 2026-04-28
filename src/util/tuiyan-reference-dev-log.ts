import { TUIYAN_REFERENCE_STRATEGY_BLOCK_HEADER } from "./tuiyan-reference-policy"

const PREFIX = "[tuiyan-ref]"

/**
 * P0 第十四批：仅 `import.meta.env.DEV` 下输出，便于对照「入口矩阵」验收参考策略是否进入 user/上下文。
 * 生产构建无开销、无控制台噪音。
 */
export function logTuiyanReferenceTouchpoint(
  touchpoint: string,
  userOrContextText: string,
  extra?: Record<string, unknown>,
): void {
  if (!import.meta.env.DEV) return
  const t = userOrContextText
  const hasStrategyBlock = t.includes(TUIYAN_REFERENCE_STRATEGY_BLOCK_HEADER)
  let planningEffect: "linked" | "unlinked" | "other" = "other"
  if (t.includes("【生效条件】已关联参考")) planningEffect = "linked"
  else if (t.includes("【生效条件】未关联参考")) planningEffect = "unlinked"
  // eslint-disable-next-line no-console
  console.debug(PREFIX, touchpoint, { hasStrategyBlock, planningEffect, ...extra })
}

export function logTuiyanReferenceSafeBuildFailed(message: string, extra?: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return
  // eslint-disable-next-line no-console
  console.debug(PREFIX, "safeBuildReferenceStrategyBlock", message, extra ?? {})
}
