import { useEffect, useRef } from "react"
import {
  getTuiyanState,
  getWork,
  listChapters,
  listReferenceLibrary,
  listVolumes,
  upsertTuiyanState,
} from "../db/repo"
import type {
  Chapter,
  GlobalPromptTemplate,
  PlanningNodeStructuredMeta,
  ReferenceLibraryEntry,
  TuiyanReferenceBinding,
  TuiyanReferencePolicy,
  TuiyanPlanningMeta,
  TuiyanPlanningNode,
  TuiyanState,
  Work,
} from "../db/types"
import {
  buildV0TuiyanOutline,
  type V0OutlineNode,
} from "../util/v0-tuiyan-outline"
import type { ChatMessage } from "../components/tuiyan/TuiyanChatPanel"
import type { WenCeEntry } from "../components/tuiyan/WenCeCard"
import {
  toPersistedChatSessions,
  type HydratedChatThread,
} from "../util/tuiyan-chat-sessions"

/**
 * 推演工作台「冷启动数据快照」：
 * 一次性把 DB/IO 拉好的、与作品强相关的数据集中返回，
 * 由调用方（页面）负责把它分发给各个 React state。
 */
export type TuiyanWorkbenchSnapshot = {
  work: Work | null
  chapters: Chapter[]
  refLibrary: ReferenceLibraryEntry[]
  state: TuiyanState | undefined
  /** 由 listVolumes + listChapters 合成出的卷章树（不含 scene） */
  outlineFromVolChap: V0OutlineNode[]
}

/** 拉取推演工作台的所有冷启动数据（不做任何状态写入；纯 IO + 转换）。 */
export async function loadTuiyanWorkbench(
  wid: string,
): Promise<TuiyanWorkbenchSnapshot> {
  const [vols, chs, w, st, refs] = await Promise.all([
    listVolumes(wid),
    listChapters(wid),
    getWork(wid),
    getTuiyanState(wid),
    listReferenceLibrary(),
  ])
  return {
    work: w ?? null,
    chapters: chs,
    refLibrary: refs,
    state: st,
    outlineFromVolChap: buildV0TuiyanOutline(vols, chs),
  }
}

/** 把 DB 里的 chatHistory(timestamp 数字) 转成 UI 用 ChatMessage(Date)。 */
export function hydrateChatHistory(
  list: TuiyanState["chatHistory"] | undefined,
): ChatMessage[] {
  return (list ?? []).map((m) => ({
    ...m,
    timestamp: new Date(m.timestamp),
  })) as unknown as ChatMessage[]
}

/** 把 DB 里的 wenCe(timestamp 数字) 转成 UI 用 WenCeEntry(Date)。 */
export function hydrateWenCe(
  list: TuiyanState["wenCe"] | undefined,
): WenCeEntry[] {
  return (list ?? []).map((e) => ({
    ...e,
    timestamp: new Date(e.timestamp),
  })) satisfies WenCeEntry[] as WenCeEntry[]
}

/** 推演工作台「待落库快照」（页面 state → DB 持久化形态的纯转换输入）。 */
export type TuiyanPersistSnapshot = {
  /** 多会话（内存态）；落库时修剪 15 天未活动会话并写入 chatThreads + chatHistory 镜像 */
  chatThreads: HydratedChatThread[]
  activeChatThreadId: string
  wenCe: WenCeEntry[]
  finalizedNodeIds: string[]
  statusByNodeId: Record<string, "draft" | "refining" | "locked">
  linkedRefWorkIds: string[]
  referenceBindings: TuiyanReferenceBinding[]
  referencePolicy: TuiyanReferencePolicy
  mmNodes: unknown[]
  mmEdges: unknown[]
  mmViewport: { x: number; y: number; zoom: number }
  scenes: NonNullable<TuiyanState["scenes"]>
  selectedPromptTemplateId: string | null
  planningIdea: string
  planningTree: TuiyanPlanningNode[]
  planningDraftsByNodeId: Record<string, string>
  planningMetaByNodeId: Record<string, TuiyanPlanningMeta>
  planningStructuredMetaByNodeId: Record<string, PlanningNodeStructuredMeta>
  planningOutlineTargetVolumesByNodeId: Record<string, number>
  planningVolumeTargetChaptersByNodeId: Record<string, number>
  planningSelectedNodeId: string | null
}

/**
 * 把页面 state（含 Date 等富类型）转换成 `upsertTuiyanState` 需要的纯结构。
 * 注意：仅做形态转换，不在这里读取/写入任何 React state。
 */
export function buildTuiyanUpsertPayload(
  s: TuiyanPersistSnapshot,
): Omit<TuiyanState, "id" | "workId" | "updatedAt"> {
  const persisted = toPersistedChatSessions(s.chatThreads, s.activeChatThreadId)
  return {
    chatHistory: persisted.chatHistory,
    chatThreads: persisted.chatThreads,
    activeChatThreadId: persisted.activeChatThreadId,
    wenCe: s.wenCe.map((e) => ({
      id: e.id,
      timestamp: e.timestamp instanceof Date ? e.timestamp.getTime() : Date.now(),
      type: e.type,
      title: e.title,
      content: e.content,
      relatedOutlineId: e.relatedOutlineId,
      planningNodeId: e.planningNodeId,
      isPinned: e.isPinned,
      tags: e.tags,
    })),
    finalizedNodeIds: s.finalizedNodeIds,
    statusByNodeId: s.statusByNodeId,
    linkedRefWorkIds: s.linkedRefWorkIds,
    referenceBindings: s.referenceBindings,
    referencePolicy: s.referencePolicy,
    mindmap: { nodes: s.mmNodes, edges: s.mmEdges, viewport: s.mmViewport },
    scenes: s.scenes,
    selectedPromptTemplateId: s.selectedPromptTemplateId,
    planningIdea: s.planningIdea,
    planningTree: s.planningTree,
    planningDraftsByNodeId: s.planningDraftsByNodeId,
    planningMetaByNodeId: s.planningMetaByNodeId,
    planningStructuredMetaByNodeId: s.planningStructuredMetaByNodeId,
    planningOutlineTargetVolumesByNodeId: s.planningOutlineTargetVolumesByNodeId,
    planningVolumeTargetChaptersByNodeId: s.planningVolumeTargetChaptersByNodeId,
    planningSelectedNodeId: s.planningSelectedNodeId,
  }
}

/** 默认 debounce 时长（ms）。改在这里以便统一调整与回归。 */
export const TUIYAN_SAVE_DEBOUNCE_MS = 550

/**
 * 推演工作台的 debounced 自动落库 hook。
 *
 * - `enabled` 一般传 `tuiyanHydratedRef.current`，避免冷启动期间把空 state 覆盖到 DB。
 * - `getPayload` 以 ref 形式持有最新闭包，timer fire 时再调一次以避免快照过期。
 * - 卸载时自动清理未触发的 timer。
 *
 * 仅承担「调度与清理」，序列化逻辑请使用 `buildTuiyanUpsertPayload`。
 */
export function useTuiyanDebouncedSave(opts: {
  workId: string | null
  enabled: boolean
  getPayload: () => Omit<TuiyanState, "id" | "workId" | "updatedAt">
  /** 触发 debounce 的依赖列表（与现有页面 useEffect 的 deps 等价） */
  deps: ReadonlyArray<unknown>
  delayMs?: number
}): void {
  const { workId, enabled, getPayload, deps, delayMs = TUIYAN_SAVE_DEBOUNCE_MS } = opts
  const timerRef = useRef<number | null>(null)
  const payloadRef = useRef(getPayload)
  payloadRef.current = getPayload

  useEffect(() => {
    if (!workId) return
    if (!enabled) return
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      void upsertTuiyanState(workId, payloadRef.current())
    }, delayMs)
    // 依赖完全由调用方提供（与页面原 effect 等价）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workId, enabled, delayMs, ...deps])

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    },
    [],
  )
}

// 仅为类型转发，避免页面层重复 import GlobalPromptTemplate（保持调用面整洁）。
export type { GlobalPromptTemplate }
