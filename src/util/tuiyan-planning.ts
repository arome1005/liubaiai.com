import type { PlanningNodeStructuredMeta, PromptSlot, TuiyanPlanningLevel, TuiyanPlanningNode } from "../db/types"

export const PLANNING_LEVEL_TO_SLOT: Record<TuiyanPlanningLevel, PromptSlot> = {
  master_outline: "tuiyan_master",
  outline: "tuiyan_outline",
  volume: "tuiyan_volume",
  chapter_outline: "tuiyan_scene",
  chapter_detail: "tuiyan_detail",
}

export const PLANNING_LEVEL_LABEL: Record<TuiyanPlanningLevel, string> = {
  master_outline: "总纲",
  outline: "一级大纲",
  volume: "二级卷纲",
  chapter_outline: "三级细纲",
  chapter_detail: "详细细纲",
}

export function planningNodeTitleFallback(level: TuiyanPlanningLevel, order: number): string {
  if (level === "master_outline") return `总纲 ${order + 1}`
  if (level === "outline") return `大纲 ${order + 1}`
  if (level === "volume") return `卷纲 ${order + 1}`
  if (level === "chapter_outline") return `章节细纲 ${order + 1}`
  return `详细细纲 ${order + 1}`
}

export type StructuredFieldDef = {
  key: keyof PlanningNodeStructuredMeta
  label: string
}

export const STRUCTURED_FIELDS_BY_LEVEL: Record<TuiyanPlanningLevel, StructuredFieldDef[]> = {
  master_outline: [
    { key: "logline", label: "核心创意 / Logline" },
    { key: "worldSetting", label: "世界观 / 力量体系" },
    { key: "worldSettingTerms", label: "世界观核心词条" },
    { key: "mainConflict", label: "主要冲突" },
    { key: "coreCharacters", label: "核心人物" },
    { key: "storyStages", label: "故事阶段" },
  ],
  outline: [
    { key: "stageGoal", label: "本阶段目标" },
    { key: "characterAllocation", label: "人物分配" },
    { key: "mainFactions", label: "主要势力" },
    { key: "characterArcs", label: "人物弧光" },
  ],
  volume: [
    { key: "mainCharacters", label: "本卷主要人物" },
    { key: "coreFactions", label: "核心势力" },
    { key: "keyLocations", label: "关键地点" },
    { key: "keyItems", label: "关键道具 / 功法 / 机遇" },
    { key: "volumeHook", label: "本卷钩子" },
  ],
  chapter_outline: [
    { key: "conflictPoints", label: "冲突点" },
    { key: "appearedCharacters", label: "登场人物" },
    { key: "locations", label: "涉及地点" },
    { key: "keyBeats", label: "关键节拍" },
    { key: "requiredInfo", label: "必出现信息" },
    { key: "tags", label: "标签" },
  ],
  chapter_detail: [
    { key: "tags", label: "标签" },
    { key: "conflictPoints", label: "冲突点" },
    { key: "appearedCharacters", label: "登场人物" },
    { key: "locations", label: "涉及地点" },
    { key: "keyBeats", label: "关键节拍" },
    { key: "requiredInfo", label: "必出现信息" },
  ],
}

// ── 规模设置 ──────────────────────────────────────────────────────────────────

export type PlanningScale = {
  /** 目标卷数（3-8） */
  volumeCount: number
  /** 每卷目标章节数（20-90） */
  chaptersPerVolume: number
  /**
   * 一级大纲条数（阶段/大剧情条数），默认 3；短篇可改为 1–2 条。
   * @see {@link clampPlanningOutlineItemCount}
   */
  outlineItemCount: number
}

export const DEFAULT_PLANNING_SCALE: PlanningScale = {
  volumeCount: 5,
  chaptersPerVolume: 40,
  outlineItemCount: 3,
}
export const PLANNING_SCALE_VOLUME_MIN = 3
export const PLANNING_SCALE_VOLUME_MAX = 8
export const PLANNING_SCALE_CHAPTERS_MIN = 20
export const PLANNING_SCALE_CHAPTERS_MAX = 90
export const PLANNING_OUTLINE_ITEM_MIN = 1
export const PLANNING_OUTLINE_ITEM_MAX = 12

export function clampPlanningOutlineItemCount(n: number): number {
  const r = Math.round(Number(n))
  if (!Number.isFinite(r)) return DEFAULT_PLANNING_SCALE.outlineItemCount
  return Math.max(PLANNING_OUTLINE_ITEM_MIN, Math.min(PLANNING_OUTLINE_ITEM_MAX, r))
}

// ── 字数要求（固定规则） ───────────────────────────────────────────────────────

export const PLANNING_MIN_CHARS = {
  /** 构思→总纲：不含标点 >= 1000 字 */
  masterOutlineNoPunct: 1000,
  /** 总纲→一级大纲（三条合计）：含标点 >= 2000 字 */
  outlineTotalWithPunct: 2000,
  /** 每卷卷纲：含标点 >= 1500 字 */
  volumeWithPunct: 1500,
} as const

/**
 * 各推演层级的预估输出字符数（保守估计），用于把流式接收到的 accumulated 字符数
 * 映射成进度百分比。超出预估时调用方应钳制在 95%，留出「完成跳 100%」的视觉空间。
 */
export const PLANNING_GEN_EXPECTED_CHARS: Record<
  TuiyanPlanningLevel | "chapter_detail",
  number
> = {
  master_outline: 1800,
  outline: 3000,
  volume: 2000,
  chapter_outline: 4000,
  chapter_detail: 1200,
}

/** 当 level 不在预估表里时的兜底字符数。 */
export const PLANNING_GEN_EXPECTED_CHARS_FALLBACK = 2000

/** 含标点字数：去掉所有空白符后计数 */
export function countCharsWithPunct(text: string): number {
  return text.replace(/\s/g, "").length
}

/** 不含标点字数：去掉空白符与标点/符号后计数 */
export function countCharsNoPunct(text: string): number {
  return text.replace(/[\p{P}\p{S}\s]/gu, "").length
}

/** 将规划节点序列化为纯文本（用于字数统计） */
export function serializePlanningNodeForCount(
  title: string,
  summary: string,
  meta?: Record<string, string | undefined>,
): string {
  const parts = [title.trim(), summary.trim()]
  if (meta) {
    for (const val of Object.values(meta)) {
      if (val?.trim()) parts.push(val.trim())
    }
  }
  return parts.filter(Boolean).join("\n")
}

// ── 树操作工具 ────────────────────────────────────────────────────────────────

export function listPlanningChildren(
  tree: TuiyanPlanningNode[],
  parentId: string | null,
  level?: TuiyanPlanningLevel,
): TuiyanPlanningNode[] {
  return tree
    .filter((n) => n.parentId === parentId && (!level || n.level === level))
    .sort((a, b) => a.order - b.order)
}

// ── 分大纲 / 分卷规模（回退到 PlanningScale） ──────────────────────────────

/** 用户为某一级大纲单独设置的目标卷数。 */
export function clampPlanningOutlineVolumeTarget(n: number): number {
  const r = Math.round(Number(n))
  if (!Number.isFinite(r)) return PLANNING_SCALE_VOLUME_MIN
  return Math.max(PLANNING_SCALE_VOLUME_MIN, Math.min(PLANNING_SCALE_VOLUME_MAX, r))
}

/** 用户为某卷单独设置的章细纲条数。 */
export function clampPlanningVolumeChapterTarget(n: number): number {
  const r = Math.round(Number(n))
  if (!Number.isFinite(r)) return PLANNING_SCALE_CHAPTERS_MIN
  return Math.max(PLANNING_SCALE_CHAPTERS_MIN, Math.min(PLANNING_SCALE_CHAPTERS_MAX, r))
}

export function resolveOutlineTargetVolumeCount(
  outlineId: string | null | undefined,
  byNodeId: Record<string, number> | undefined,
  fallbackVolumeCount: number,
): number {
  if (!outlineId) return clampPlanningOutlineVolumeTarget(fallbackVolumeCount)
  const v = byNodeId?.[outlineId]
  return v !== undefined ? clampPlanningOutlineVolumeTarget(v) : clampPlanningOutlineVolumeTarget(fallbackVolumeCount)
}

export function resolveVolumeTargetChapterCount(
  volumeId: string | null | undefined,
  byNodeId: Record<string, number> | undefined,
  fallbackChapters: number,
): number {
  if (!volumeId) return clampPlanningVolumeChapterTarget(fallbackChapters)
  const v = byNodeId?.[volumeId]
  return v !== undefined ? clampPlanningVolumeChapterTarget(v) : clampPlanningVolumeChapterTarget(fallbackChapters)
}
