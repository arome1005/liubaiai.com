import type { TuiyanImitationMode } from "../db/types"

/**
 * 与 `TUIYAN_PLANNING_REFERENCE_SYSTEM_ADDON` 衔接的**仿写模式**补充段（system 侧，随 `imitationMode` 分岔）。
 * 不含基础「禁复述剧情」句，仅描述本模式在规划输出上的**优先侧重**。
 */
const MODE_EMPHASIS: Record<TuiyanImitationMode, string> = {
  balanced: `【系统级·仿写模式侧重：平衡】
- 在遵守安全硬约束的前提下，对「用户构思与节点继承链」与「参考可迁移的表达与结构习惯」**并重**；若必须取舍，以用户构思与既有规划为准，不为贴参考而改主线。`,

  style: `【系统级·仿写模式侧重：风格近似】
- 规划输出在语体、口吻、叙事节奏与句式变化上可更积极借鉴参考的**可抽象写法**；结构排布可相对稳妥、以不抢戏为主。
- 仍须遵守硬约束：不复述参考剧情，不经抽象迁入专名与原创设定。`,

  structure: `【系统级·仿写模式侧重：结构近似】
- 规划输出在阶段目标、冲突链、推进节拍、转折与卷/章**钩子的排布**上可更积极借鉴参考套路；措辞以清晰可执行为主。
- 仍须遵守硬约束：不复述参考剧情，不经抽象迁入专名与原创设定。`,

  genre: `【系统级·仿写模式侧重：类型惯例】
- 规划输出在题材期待、爽点/悬念类型、读者习惯与常见**变体手法**上可更积极参考；须与用户已定题材、主线与世界观自洽。
- 仍须遵守硬约束：不复述参考剧情，不经抽象迁入专名与原创设定。`,
}

export function tuiyanReferenceImitationEmphasisBlock(mode: TuiyanImitationMode | undefined): string {
  return MODE_EMPHASIS[mode ?? "balanced"]
}
