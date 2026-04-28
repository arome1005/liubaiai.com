import type { TuiyanImitationMode } from "../db/types"
import { tuiyanReferenceImitationEmphasisBlock } from "../util/tuiyan-reference-imitation-system"
import { TUIYAN_REFERENCE_STRATEGY_BLOCK_HEADER } from "../util/tuiyan-reference-policy"

/**
 * 当 user/上下文中已含 `buildReferenceStrategyBlock` 输出时，追加到 **system** 侧，
 * 与 user 内策略块双轨约束（避免模型只读 user 时削弱安全边界）。
 */
export const TUIYAN_PLANNING_REFERENCE_SYSTEM_ADDON = `【系统级·参考仿写硬约束】（必须与下方用户消息中的参考策略同时满足）
- 用户构思与规划节点继承链为最高优先级；若与参考书或参考策略表意冲突，以用户构思与既有节点为准。
- 参考仅用于语言风格、叙事节奏、结构习惯与类型套路的**类比与抽象**；不得复述、拼接或改头换面复现参考书的具体剧情链、名场面与标志性对白。
- 不得将参考书专有名、原创设定不经抽象直接迁入用户作品；可化为类型化、去标识的写法建议。
- 你的输出须为可执行规划/细纲，禁止大段引用或改编参考原文为「成品段落」。`

export function userContextHasReferenceStrategyBlock(text: string): boolean {
  return text.includes(TUIYAN_REFERENCE_STRATEGY_BLOCK_HEADER)
}

function buildReferenceSystemPromptSuffix(imitationMode: TuiyanImitationMode | undefined): string {
  return `${TUIYAN_PLANNING_REFERENCE_SYSTEM_ADDON}\n\n${tuiyanReferenceImitationEmphasisBlock(imitationMode)}`
}

export type MergeTuiyanReferenceSystemOptions = {
  /** 与 `TuiyanReferencePolicy.imitationMode` 一致时，在硬约束后追加**分模式** system 侧重段。 */
  imitationMode?: TuiyanImitationMode
}

/**
 * 五层规划 list/detail：在已有 system 提示词后追加硬约束 + 仿写模式侧重（仅当 userInput 已含参考策略块时）。
 */
export function mergeTuiyanPlanningSystemWithReferenceHardRules(
  baseSystem: string,
  userInput: string,
  options?: MergeTuiyanReferenceSystemOptions,
): string {
  if (!userContextHasReferenceStrategyBlock(userInput)) return baseSystem
  return `${baseSystem.trimEnd()}\n\n${buildReferenceSystemPromptSuffix(options?.imitationMode)}`
}

/**
 * 规划顾问：当「当前节点上下文」串里已含参考策略时，在 system 末尾追加硬约束 + 分模式侧重。
 */
export function mergeAdvisorSystemWithReferenceHardRules(
  baseSystemWithContext: string,
  options?: MergeTuiyanReferenceSystemOptions,
): string {
  if (!userContextHasReferenceStrategyBlock(baseSystemWithContext)) return baseSystemWithContext
  return `${baseSystemWithContext.trimEnd()}\n\n${buildReferenceSystemPromptSuffix(options?.imitationMode)}`
}
