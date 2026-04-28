import type {
  ReferenceLibraryEntry,
  TuiyanImitationMode,
  TuiyanReferenceAspect,
  TuiyanReferenceBinding,
  TuiyanReferencePolicy,
  TuiyanReferenceRangeMode,
} from "../db/types"

export const TUIYAN_REFERENCE_POLICY_VERSION = 1

/** 与 `buildReferenceStrategyBlock` 首行一致；供 system 层检测是否启用参考仿写硬约束。 */
export const TUIYAN_REFERENCE_STRATEGY_BLOCK_HEADER = "【参考策略（强约束）】"

const DEFAULT_ASPECTS: TuiyanReferenceAspect[] = ["voice", "pacing", "genre"]

/** 作用维度：供参考 Tab 配置与策略文案共用 */
export const TUIYAN_REFERENCE_ASPECT_OPTIONS: { value: TuiyanReferenceAspect; label: string }[] = [
  { value: "voice", label: "文风口吻" },
  { value: "pacing", label: "叙事节奏" },
  { value: "structure", label: "结构编排" },
  { value: "genre", label: "类型惯例" },
]

/** 引用范围：与落库 `rangeMode` 一一对应 */
export const TUIYAN_REFERENCE_RANGE_OPTIONS: { value: TuiyanReferenceRangeMode; label: string }[] = [
  { value: "summary_only", label: "摘要优先" },
  { value: "summary_plus_excerpt", label: "摘要+短节选" },
  { value: "selected_sections", label: "指定章节" },
]

/** 仿写模式：全局 `imitationMode` */
export const TUIYAN_IMITATION_MODE_OPTIONS: { value: TuiyanImitationMode; label: string; hint: string }[] = [
  { value: "balanced", label: "平衡", hint: "构思主导+参考辅助" },
  { value: "style", label: "风格近似", hint: "优先语言与口吻" },
  { value: "structure", label: "结构近似", hint: "优先章节推进与转折" },
  { value: "genre", label: "类型惯例", hint: "优先题材套路与变体" },
]

/**
 * 将指定书目设为主参考，其余已关联书自动为辅（单主多辅）。
 */
export function withPrimaryRefWorkId(
  bindings: TuiyanReferenceBinding[],
  primaryId: string,
  now: number,
): TuiyanReferenceBinding[] {
  return bindings.map((b) => ({
    ...b,
    role: b.refWorkId === primaryId ? "primary" : "secondary",
    updatedAt: now,
  }))
}

export function defaultTuiyanReferencePolicy(): TuiyanReferencePolicy {
  return {
    version: TUIYAN_REFERENCE_POLICY_VERSION,
    imitationMode: "balanced",
    antiPatterns: "",
    conceptFirst: true,
  }
}

export function normalizeReferencePolicy(
  policy: TuiyanReferencePolicy | undefined,
): TuiyanReferencePolicy {
  const base = defaultTuiyanReferencePolicy()
  if (!policy) return base
  return {
    ...base,
    ...policy,
    version: TUIYAN_REFERENCE_POLICY_VERSION,
    antiPatterns: policy.antiPatterns ?? "",
  }
}

/** linkedRefWorkIds -> referenceBindings 迁移与修复（保持 UI 兼容，不改变视觉）。 */
export function normalizeReferenceBindings(
  linkedRefWorkIds: string[],
  current: TuiyanReferenceBinding[] | undefined,
  now = Date.now(),
): TuiyanReferenceBinding[] {
  const linked = Array.from(new Set(linkedRefWorkIds))
  const prevById = new Map((current ?? []).map((x) => [x.refWorkId, x]))
  return linked.map((id, idx) => {
    const prev = prevById.get(id)
    if (prev) {
      return {
        ...prev,
        role: prev.role ?? (idx === 0 ? "primary" : "secondary"),
        aspects: prev.aspects?.length ? prev.aspects : DEFAULT_ASPECTS,
        rangeMode: prev.rangeMode ?? "summary_only",
        updatedAt: prev.updatedAt ?? now,
      }
    }
    return {
      refWorkId: id,
      role: idx === 0 ? "primary" : "secondary",
      aspects: DEFAULT_ASPECTS,
      rangeMode: "summary_only",
      updatedAt: now,
    }
  })
}

export function hasEffectiveReferenceStrategy(
  linkedRefWorkIds: string[],
  referenceBindings: TuiyanReferenceBinding[],
): boolean {
  if (!linkedRefWorkIds.length) return false
  const linked = new Set(linkedRefWorkIds)
  return referenceBindings.some((b) => linked.has(b.refWorkId) && b.aspects.length > 0)
}

function aspectLabel(a: TuiyanReferenceAspect): string {
  if (a === "voice") return "文风口吻"
  if (a === "pacing") return "叙事节奏"
  if (a === "structure") return "结构编排"
  return "类型惯例"
}

function rangeLabel(m: TuiyanReferenceBinding["rangeMode"]): string {
  if (m === "summary_plus_excerpt") return "摘要+短节选"
  if (m === "selected_sections") return "指定章节"
  return "摘要优先"
}

/**
 * 强约束策略块：注入到各层生成输入。
 * 注：这里不拼接大段原文，只给策略说明；具体检索片段在后续步骤注入。
 */
export function buildReferenceStrategyBlock(args: {
  linkedRefWorkIds: string[]
  referenceBindings: TuiyanReferenceBinding[]
  referencePolicy: TuiyanReferencePolicy
  refLibrary: ReferenceLibraryEntry[]
}): string {
  const { linkedRefWorkIds, referenceBindings, referencePolicy, refLibrary } = args
  if (!hasEffectiveReferenceStrategy(linkedRefWorkIds, referenceBindings)) return ""

  const byId = new Map(refLibrary.map((r) => [r.id, r]))
  const lines = referenceBindings
    .filter((b) => linkedRefWorkIds.includes(b.refWorkId))
    .map((b, idx) => {
      const title = byId.get(b.refWorkId)?.title ?? `未命名参考#${idx + 1}`
      const sectionHint =
        b.rangeMode === "selected_sections"
          ? b.sectionIds?.length
            ? `；已选 ${b.sectionIds.length} 个章节锚点`
            : "；指定章节：未选锚点"
          : ""
      return `- ${b.role === "primary" ? "主参考" : "辅参考"}《${title}》：作用=${b.aspects.map(aspectLabel).join("、")}；范围=${rangeLabel(b.rangeMode)}${sectionHint}${b.note?.trim() ? `；备注=${b.note.trim()}` : ""}`
    })

  const antiPatterns = (referencePolicy.antiPatterns ?? "").trim()

  return [
    TUIYAN_REFERENCE_STRATEGY_BLOCK_HEADER,
    `- 模式：${referencePolicy.imitationMode}`,
    `- 构思优先：${referencePolicy.conceptFirst ? "是" : "否"}`,
    antiPatterns ? `- 反向约束：${antiPatterns}` : "",
    ...lines,
    "- 必须遵守：仅学习表达与结构，不复述参考书具体剧情链与标志性对白。",
  ]
    .filter(Boolean)
    .join("\n")
}

