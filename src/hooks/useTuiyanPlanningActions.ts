import { useCallback, type Dispatch, type RefObject, type SetStateAction } from "react"
import { isFirstAiGateCancelledError } from "../ai/client"
import {
  generateTuiyanPlanningDetail,
  generateTuiyanPlanningList,
  TuiyanPlanningGenerateError,
} from "../ai/tuiyan-planning-generate"
import { extractKnowledgeFromNodes, type KnowledgeExtractInput } from "../ai/tuiyan-knowledge-extract"
import { AI_MODELS } from "../components/ai-model-selector"
import type {
  KnowledgePushOptions,
  TuiyanPlanningPushCandidate,
} from "../components/tuiyan/TuiyanPlanningPushDialog"
import type { useToast } from "../components/ui/use-toast"
import {
  getTuiyanState,
  upsertBibleCharactersByWork,
  upsertBibleGlossaryTermsByWork,
  upsertTuiyanState,
} from "../db/repo"
import type {
  Chapter,
  GlobalPromptTemplate,
  PlanningNodeStructuredMeta,
  TuiyanKnowledgeBatch,
  TuiyanPlanningLevel,
  TuiyanPlanningMeta,
  TuiyanImitationMode,
  TuiyanPlanningNode,
  TuiyanPushedOutlineEntry,
} from "../db/types"
import { loadAiSettings } from "../ai/storage"
import type { TuiyanGenProgressControls } from "./useTuiyanGenProgress"
import type { AutoLinkItem } from "../util/tuiyan-chip-autolink"
import {
  clampPlanningOutlineItemCount,
  countCharsWithPunct,
  listPlanningChildren,
  PLANNING_LEVEL_TO_SLOT,
  planningNodeTitleFallback,
  resolveOutlineTargetVolumeCount,
  resolveVolumeTargetChapterCount,
  serializePlanningNodeForCount,
  type PlanningScale,
} from "../util/tuiyan-planning"
import { filterPlanningPushCandidatesBySubtreeScope } from "../util/tuiyan-planning-push"
import type { PlanningThickness } from "../util/tuiyan-planning-thickness"

type ToastFn = ReturnType<typeof useToast>["toast"]
type PlanningMode = "model" | "template"

export type UseTuiyanPlanningActionsArgs = {
  workId: string | null
  chapters: Chapter[]
  planningMode: PlanningMode
  selectedModelId: string
  selectedPromptTemplateRef: RefObject<GlobalPromptTemplate | null>
  planningAbortRef: RefObject<AbortController | null>
  planningIdea: string
  planningTree: TuiyanPlanningNode[]
  planningScale: PlanningScale
  planningOutlineTargetVolumesByNodeId: Record<string, number>
  planningVolumeTargetChaptersByNodeId: Record<string, number>
  planningActiveOutline: TuiyanPlanningNode | null
  planningActiveVolume: TuiyanPlanningNode | null
  /** 已归一化；与提示词、本地校验一致 */
  planningThickness: PlanningThickness
  planningPushCandidates: TuiyanPlanningPushCandidate[]
  planningStructuredMetaByNodeId: Record<string, PlanningNodeStructuredMeta>
  makePlanningContext: (
    level: TuiyanPlanningLevel,
    parentNode: TuiyanPlanningNode | null,
  ) => string
  makeOnChunk: TuiyanGenProgressControls["makeOnChunk"]
  completeProgress: TuiyanGenProgressControls["completeProgress"]
  resetProgress: TuiyanGenProgressControls["resetProgress"]
  runAutoLink: (items: AutoLinkItem[]) => void
  toast: ToastFn
  setPlanningError: Dispatch<SetStateAction<string>>
  setPlanningBusyLevel: Dispatch<SetStateAction<TuiyanPlanningLevel | null>>
  setPlanningTree: Dispatch<SetStateAction<TuiyanPlanningNode[]>>
  setPlanningSelectedNodeId: Dispatch<SetStateAction<string | null>>
  setPlanningDraftsByNodeId: Dispatch<SetStateAction<Record<string, string>>>
  setPlanningMetaByNodeId: Dispatch<SetStateAction<Record<string, TuiyanPlanningMeta>>>
  setPlanningStructuredMetaByNodeId: Dispatch<
    SetStateAction<Record<string, PlanningNodeStructuredMeta>>
  >
  setPendingKnowledgeOpts: Dispatch<SetStateAction<KnowledgePushOptions | null>>
  setPushOverwriteConfirmOpen: Dispatch<SetStateAction<boolean>>
  /** 与 `TuiyanReferencePolicy.imitationMode` 同步，供 system 分模式仿写侧重 */
  referenceImitationMode: TuiyanImitationMode
  /**
   * 各层规划生成成功且落树/草稿后：若提供，则不再立即 runAutoLink，由页面弹窗决定是否先知识抽取入书斋。
   * 未提供时保持旧行为（立即 runAutoLink）。
   */
  onPlanningLevelKnowledgeOffer?: (ctx: {
    level: TuiyanPlanningLevel
    autoLinkItems: AutoLinkItem[]
    extractInputs: KnowledgeExtractInput[]
  }) => void
}

export type UseTuiyanPlanningActionsResult = {
  generatePlanningLevel: (
    level: TuiyanPlanningLevel,
    parentNode: TuiyanPlanningNode | null,
  ) => Promise<void>
  /** 中断当前五层规划生成流（与主按钮「生成中」旁的终止一致） */
  cancelPlanningGeneration: () => void
  regenerateCurrentVolume: () => Promise<void>
  doPushPlanningTree: (opts: KnowledgePushOptions) => Promise<void>
  pushPlanningTreeToWriter: (opts: KnowledgePushOptions) => Promise<void>
}

/**
 * 五层规划的 AI 生成与推送编排。
 *
 * 这里保留原页面逻辑的所有副作用：进度、Abort、结构化字段写回、自动 chip 入库、
 * 章纲快照推送、可选知识抽取以及覆盖确认。
 */
export function useTuiyanPlanningActions({
  workId,
  chapters,
  planningMode,
  selectedModelId,
  selectedPromptTemplateRef,
  planningAbortRef,
  planningIdea,
  planningTree,
  planningScale,
  planningOutlineTargetVolumesByNodeId,
  planningVolumeTargetChaptersByNodeId,
  planningActiveOutline,
  planningActiveVolume,
  planningThickness,
  planningPushCandidates,
  planningStructuredMetaByNodeId,
  makePlanningContext,
  makeOnChunk,
  completeProgress,
  resetProgress,
  runAutoLink,
  toast,
  setPlanningError,
  setPlanningBusyLevel,
  setPlanningTree,
  setPlanningSelectedNodeId,
  setPlanningDraftsByNodeId,
  setPlanningMetaByNodeId,
  setPlanningStructuredMetaByNodeId,
  setPendingKnowledgeOpts,
  setPushOverwriteConfirmOpen,
  referenceImitationMode,
  onPlanningLevelKnowledgeOffer,
}: UseTuiyanPlanningActionsArgs): UseTuiyanPlanningActionsResult {
  const upsertPlanningMeta = useCallback(
    (nodeIds: string[], level: TuiyanPlanningLevel) => {
      const s = loadAiSettings()
      const model = AI_MODELS.find((m) => m.id === selectedModelId)
      const slot = PLANNING_LEVEL_TO_SLOT[level]
      const base: TuiyanPlanningMeta = {
        generatedAt: Date.now(),
        mode: planningMode,
        promptSlot: slot,
        provider: s.provider,
        modelId: model?.id ?? selectedModelId,
        templateId: selectedPromptTemplateRef.current?.id ?? null,
      }
      setPlanningMetaByNodeId((prev) => {
        const next = { ...prev }
        for (const id of nodeIds) next[id] = base
        return next
      })
    },
    [planningMode, selectedModelId, selectedPromptTemplateRef, setPlanningMetaByNodeId],
  )

  const generatePlanningLevel = useCallback(
    async (level: TuiyanPlanningLevel, parentNode: TuiyanPlanningNode | null) => {
      if (!workId) return
      setPlanningError("")
      planningAbortRef.current?.abort()
      const ac = new AbortController()
      planningAbortRef.current = ac
      setPlanningBusyLevel(level)
      const onChunk = makeOnChunk(level)
      let genFailed = false
      try {
        if (planningMode === "template" && !selectedPromptTemplateRef.current) {
          throw new TuiyanPlanningGenerateError("当前是模板高级模式，请先选择提示词模板。")
        }
        if (level === "master_outline") {
          if (!planningIdea.trim()) {
            throw new TuiyanPlanningGenerateError("请先填写「作品构思」，再生成总纲。")
          }
          const userInput = makePlanningContext("master_outline", null)
          const { items } = await generateTuiyanPlanningList({
            level: "master_outline",
            desiredCount: 1,
            userInput,
            imitationMode: referenceImitationMode,
            settings: loadAiSettings(),
            signal: ac.signal,
            onChunk,
            workId,
            planningThickness,
            planningScale,
          })
          const it0 = items[0]!
          const masterText = serializePlanningNodeForCount(
            it0.title,
            it0.summary,
            it0.structuredMeta as Record<string, string | undefined>,
          )
          const masterCharCount = countCharsWithPunct(masterText)
          if (masterCharCount < planningThickness.masterOutlineMinWithPunct) {
            throw new TuiyanPlanningGenerateError(
              `总纲字数（${masterCharCount}字，含标点）不足 ${planningThickness.masterOutlineMinWithPunct} 字，请重试或在「高级设置」中调低下限。`,
            )
          }
          const nodes: TuiyanPlanningNode[] = items.slice(0, 1).map((it, idx) => ({
            id: `plan-master-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
            parentId: null,
            level: "master_outline",
            title: it.title.trim() || planningNodeTitleFallback("master_outline", idx),
            summary: it.summary.trim(),
            order: idx,
          }))
          setPlanningTree((prev) => {
            const oldMasterIds = new Set(prev.filter((n) => n.level === "master_outline").map((n) => n.id))
            const removeIds = new Set(oldMasterIds)
            let changed = true
            while (changed) {
              changed = false
              for (const node of prev) {
                if (node.parentId && removeIds.has(node.parentId) && !removeIds.has(node.id)) {
                  removeIds.add(node.id)
                  changed = true
                }
              }
            }
            return [...prev.filter((n) => !removeIds.has(n.id)), ...nodes]
          })
          setPlanningSelectedNodeId(nodes[0]?.id ?? null)
          upsertPlanningMeta(nodes.map((n) => n.id), "master_outline")
          const masterPatch: Record<string, PlanningNodeStructuredMeta> = {}
          nodes.forEach((n, idx) => {
            const sm = items[idx]?.structuredMeta
            if (sm && Object.keys(sm).length) masterPatch[n.id] = sm
          })
          if (Object.keys(masterPatch).length) {
            setPlanningStructuredMetaByNodeId((prev) => ({ ...prev, ...masterPatch }))
          }
          const autoItems: AutoLinkItem[] = nodes.map((n, idx) => ({
            summary: n.summary,
            structuredMeta: items[idx]?.structuredMeta ?? {},
            level: "master_outline",
            nodeId: n.id,
          }))
          if (onPlanningLevelKnowledgeOffer) {
            onPlanningLevelKnowledgeOffer({
              level: "master_outline",
              autoLinkItems: autoItems,
              extractInputs: [
                {
                  nodeId: nodes[0]!.id,
                  level: "master_outline",
                  title: nodes[0]!.title,
                  content: nodes[0]!.summary,
                  structuredMeta: items[0]?.structuredMeta,
                },
              ],
            })
          } else {
            runAutoLink(autoItems)
          }
          return
        }
        if (!parentNode) {
          throw new TuiyanPlanningGenerateError("请先选择父节点，再生成下一层。")
        }
        if (level === "outline") {
          const userInput = makePlanningContext("outline", parentNode)
          const outlineN = clampPlanningOutlineItemCount(planningScale.outlineItemCount)
          const { items } = await generateTuiyanPlanningList({
            level: "outline",
            desiredCount: outlineN,
            userInput,
            imitationMode: referenceImitationMode,
            settings: loadAiSettings(),
            signal: ac.signal,
            onChunk,
            workId,
            planningThickness,
            planningScale,
          })
          const outlineCombinedText = items
            .map((it) =>
              serializePlanningNodeForCount(
                it.title,
                it.summary,
                it.structuredMeta as Record<string, string | undefined>,
              ),
            )
            .join("\n\n")
          const outlineCharCount = countCharsWithPunct(outlineCombinedText)
          if (outlineCharCount < planningThickness.outlineTotalWithPunct) {
            throw new TuiyanPlanningGenerateError(
              `一级大纲合计字数（${outlineCharCount}字，含标点）不足 ${planningThickness.outlineTotalWithPunct} 字，请重试或在「高级设置」中调低下限。`,
            )
          }
          const nodes: TuiyanPlanningNode[] = items.map((it, idx) => ({
            id: `plan-outline-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
            parentId: parentNode.id,
            level: "outline",
            title: it.title.trim() || planningNodeTitleFallback("outline", idx),
            summary: it.summary.trim(),
            order: idx,
          }))
          setPlanningTree((prev) => [
            ...prev.filter((n) => n.parentId !== parentNode.id || n.level !== "outline"),
            ...nodes,
          ])
          setPlanningSelectedNodeId(nodes[0]?.id ?? null)
          upsertPlanningMeta(nodes.map((n) => n.id), "outline")
          const outlinePatch: Record<string, PlanningNodeStructuredMeta> = {}
          nodes.forEach((n, idx) => {
            const sm = items[idx]?.structuredMeta
            if (sm && Object.keys(sm).length) outlinePatch[n.id] = sm
          })
          if (Object.keys(outlinePatch).length) {
            setPlanningStructuredMetaByNodeId((prev) => ({ ...prev, ...outlinePatch }))
          }
          const autoItems: AutoLinkItem[] = nodes.map((n, idx) => ({
            summary: n.summary,
            structuredMeta: items[idx]?.structuredMeta ?? {},
            level: "outline",
            nodeId: n.id,
          }))
          if (onPlanningLevelKnowledgeOffer) {
            onPlanningLevelKnowledgeOffer({
              level: "outline",
              autoLinkItems: autoItems,
              extractInputs: nodes.map((n, idx) => ({
                nodeId: n.id,
                level: "outline",
                title: n.title,
                content: n.summary,
                structuredMeta: items[idx]?.structuredMeta,
              })),
            })
          } else {
            runAutoLink(autoItems)
          }
          return
        }
        if (level === "volume") {
          const existingVolumes = listPlanningChildren(planningTree, parentNode.id, "volume")
          const nextVolumeOrder = existingVolumes.length
          const targetVolCount = resolveOutlineTargetVolumeCount(
            parentNode.id,
            planningOutlineTargetVolumesByNodeId,
            planningScale.volumeCount,
          )
          if (nextVolumeOrder >= targetVolCount) {
            throw new TuiyanPlanningGenerateError(
              `本大纲已完成全部 ${targetVolCount} 卷卷纲，如需更多请在本一级大纲的「目标卷数」或全局规模里调高。`,
            )
          }
          const existingVolumeHint =
            existingVolumes.length > 0
              ? `已生成的卷（请在剧情上接续）：${existingVolumes.map((v) => v.title || `第${v.order + 1}卷`).join("、")}`
              : ""
          const userInput = [
            makePlanningContext("volume", parentNode),
            `本次任务：生成【第 ${nextVolumeOrder + 1} 卷】（该大纲段共规划 ${targetVolCount} 卷；单卷章细纲条数可在选中卷纲后单独设置，未设置时约 ${planningScale.chaptersPerVolume} 章）。`,
            existingVolumeHint,
          ]
            .filter(Boolean)
            .join("\n\n")
          const { items } = await generateTuiyanPlanningList({
            level: "volume",
            desiredCount: 1,
            userInput,
            imitationMode: referenceImitationMode,
            settings: loadAiSettings(),
            signal: ac.signal,
            onChunk,
            workId,
            planningThickness,
            planningScale,
          })
          const volItem = items[0]!
          const volText = serializePlanningNodeForCount(
            volItem.title,
            volItem.summary,
            volItem.structuredMeta as Record<string, string | undefined>,
          )
          const volCharCount = countCharsWithPunct(volText)
          if (volCharCount < planningThickness.volumeWithPunct) {
            throw new TuiyanPlanningGenerateError(
              `第 ${nextVolumeOrder + 1} 卷卷纲字数（${volCharCount}字，含标点）不足 ${planningThickness.volumeWithPunct} 字，请重试或在「高级设置」中调低下限。`,
            )
          }
          const newVolNode: TuiyanPlanningNode = {
            id: `plan-volume-${Date.now()}-${nextVolumeOrder}-${Math.random().toString(36).slice(2, 7)}`,
            parentId: parentNode.id,
            level: "volume",
            title: volItem.title.trim() || planningNodeTitleFallback("volume", nextVolumeOrder),
            summary: volItem.summary.trim(),
            order: nextVolumeOrder,
          }
          setPlanningTree((prev) => [...prev, newVolNode])
          setPlanningSelectedNodeId(newVolNode.id)
          upsertPlanningMeta([newVolNode.id], "volume")
          if (volItem.structuredMeta && Object.keys(volItem.structuredMeta).length) {
            setPlanningStructuredMetaByNodeId((prev) => ({ ...prev, [newVolNode.id]: volItem.structuredMeta }))
          }
          const volAuto: AutoLinkItem = {
            summary: newVolNode.summary,
            structuredMeta: volItem.structuredMeta ?? {},
            level: "volume",
            nodeId: newVolNode.id,
          }
          if (onPlanningLevelKnowledgeOffer) {
            onPlanningLevelKnowledgeOffer({
              level: "volume",
              autoLinkItems: [volAuto],
              extractInputs: [
                {
                  nodeId: newVolNode.id,
                  level: "volume",
                  title: newVolNode.title,
                  content: newVolNode.summary,
                  structuredMeta: volItem.structuredMeta,
                },
              ],
            })
          } else {
            runAutoLink([volAuto])
          }
          return
        }
        if (level === "chapter_outline") {
          const chapterCount = resolveVolumeTargetChapterCount(
            parentNode.id,
            planningVolumeTargetChaptersByNodeId,
            planningScale.chaptersPerVolume,
          )
          const userInput = makePlanningContext("chapter_outline", parentNode)
          const { items } = await generateTuiyanPlanningList({
            level: "chapter_outline",
            desiredCount: chapterCount,
            userInput,
            imitationMode: referenceImitationMode,
            settings: loadAiSettings(),
            signal: ac.signal,
            onChunk,
            workId,
            planningThickness,
            planningScale,
          })
          for (let i = 0; i < items.length; i++) {
            const it = items[i]!
            const coText = serializePlanningNodeForCount(
              it.title,
              it.summary,
              it.structuredMeta as Record<string, string | undefined>,
            )
            const coCount = countCharsWithPunct(coText)
            if (coCount < planningThickness.chapterOutlineMinPerNodeWithPunct) {
              throw new TuiyanPlanningGenerateError(
                `第 ${i + 1} 条章细纲（标题+摘要+结构化信息，含标点）为 ${coCount} 字，不足 ${planningThickness.chapterOutlineMinPerNodeWithPunct} 字，请重试或在「高级设置」中调低下限。`,
              )
            }
          }
          const volumeChapters = chapters.filter((c) => c.volumeId === parentNode.id)
          const fallbackChapters = volumeChapters.length ? volumeChapters : chapters
          const nodes: TuiyanPlanningNode[] = items.map((it, idx) => ({
            id: `plan-chapter-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
            parentId: parentNode.id,
            level: "chapter_outline",
            title: it.title.trim() || planningNodeTitleFallback("chapter_outline", idx),
            summary: it.summary.trim(),
            order: idx,
            chapterId: fallbackChapters[idx]?.id ?? null,
          }))
          setPlanningTree((prev) => [
            ...prev.filter((n) => n.parentId !== parentNode.id || n.level !== "chapter_outline"),
            ...nodes,
          ])
          setPlanningSelectedNodeId(nodes[0]?.id ?? null)
          upsertPlanningMeta(nodes.map((n) => n.id), "chapter_outline")
          const chapterPatch: Record<string, PlanningNodeStructuredMeta> = {}
          nodes.forEach((n, idx) => {
            const sm = items[idx]?.structuredMeta
            if (sm && Object.keys(sm).length) chapterPatch[n.id] = sm
          })
          if (Object.keys(chapterPatch).length) {
            setPlanningStructuredMetaByNodeId((prev) => ({ ...prev, ...chapterPatch }))
          }
          const autoItems: AutoLinkItem[] = nodes.map((n, idx) => ({
            summary: n.summary,
            structuredMeta: items[idx]?.structuredMeta ?? {},
            level: "chapter_outline",
            nodeId: n.id,
          }))
          if (onPlanningLevelKnowledgeOffer) {
            onPlanningLevelKnowledgeOffer({
              level: "chapter_outline",
              autoLinkItems: autoItems,
              extractInputs: nodes.map((n, idx) => ({
                nodeId: n.id,
                level: "chapter_outline",
                title: n.title,
                content: n.summary,
                structuredMeta: items[idx]?.structuredMeta,
              })),
            })
          } else {
            runAutoLink(autoItems)
          }
          return
        }
        const userInput = makePlanningContext("chapter_detail", parentNode)
        const { text, structuredMeta: detailMeta } = await generateTuiyanPlanningDetail({
          userInput,
          imitationMode: referenceImitationMode,
          settings: loadAiSettings(),
          signal: ac.signal,
          onChunk,
          workId,
          planningThickness,
          planningScale,
        })
        const existing = listPlanningChildren(planningTree, parentNode.id, "chapter_detail")[0]
        const detailNode: TuiyanPlanningNode =
          existing ?? {
            id: `plan-detail-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            parentId: parentNode.id,
            level: "chapter_detail",
            title: `${parentNode.title}·详细细纲`,
            summary: "",
            order: 0,
          }
        setPlanningTree((prev) => {
          if (existing) return prev
          return [...prev, detailNode]
        })
        setPlanningDraftsByNodeId((prev) => ({ ...prev, [detailNode.id]: text }))
        setPlanningSelectedNodeId(detailNode.id)
        upsertPlanningMeta([detailNode.id], "chapter_detail")
        if (detailMeta && Object.keys(detailMeta).some((k) => !!(detailMeta as Record<string, string>)[k])) {
          setPlanningStructuredMetaByNodeId((prev) => ({
            ...prev,
            [detailNode.id]: { ...prev[detailNode.id], ...detailMeta },
          }))
        }
        const smForExtract: PlanningNodeStructuredMeta = {
          ...planningStructuredMetaByNodeId[detailNode.id],
          ...detailMeta,
        }
        const detailAuto: AutoLinkItem = {
          summary: text,
          structuredMeta: { ...detailMeta },
          level: "chapter_detail",
          nodeId: detailNode.id,
        }
        if (onPlanningLevelKnowledgeOffer) {
          onPlanningLevelKnowledgeOffer({
            level: "chapter_detail",
            autoLinkItems: [detailAuto],
            extractInputs: [
              {
                nodeId: detailNode.id,
                level: "chapter_detail",
                title: detailNode.title,
                content: text,
                structuredMeta: smForExtract,
              },
            ],
          })
        } else {
          runAutoLink([detailAuto])
        }
      } catch (e) {
        genFailed = true
        if (isFirstAiGateCancelledError(e)) return
        if (e instanceof DOMException && e.name === "AbortError") return
        if (e instanceof Error && e.name === "AbortError") return
        const msg = e instanceof Error ? e.message : String(e)
        setPlanningError(msg)
      } finally {
        if (genFailed) resetProgress()
        else completeProgress()
        setPlanningBusyLevel(null)
        planningAbortRef.current = null
      }
    },
    [
      chapters,
      completeProgress,
      makeOnChunk,
      makePlanningContext,
      planningAbortRef,
      planningIdea,
      planningMode,
    planningOutlineTargetVolumesByNodeId,
    planningScale,
    planningThickness,
    planningTree,
    planningVolumeTargetChaptersByNodeId,
    planningStructuredMetaByNodeId,
    referenceImitationMode,
    resetProgress,
    onPlanningLevelKnowledgeOffer,
    runAutoLink,
    selectedPromptTemplateRef,
    setPlanningBusyLevel,
    setPlanningDraftsByNodeId,
    setPlanningError,
    setPlanningSelectedNodeId,
    setPlanningStructuredMetaByNodeId,
    setPlanningTree,
    upsertPlanningMeta,
    workId,
  ],
  )

  const regenerateCurrentVolume = useCallback(async () => {
    if (!planningActiveOutline || !planningActiveVolume) return
    const volumeOrder = planningActiveVolume.order
    const volumeId = planningActiveVolume.id
    const removedIds = new Set<string>([volumeId])
    planningTree.forEach((n) => {
      if (n.parentId === volumeId) removedIds.add(n.id)
    })
    const siblingsKept = planningTree.filter(
      (n) => n.parentId === planningActiveOutline.id && n.level === "volume" && n.id !== volumeId,
    )
    const existingVolumeHint =
      siblingsKept.length > 0
        ? `已生成的其他卷（请在剧情上保持一致）：${siblingsKept.map((v) => v.title || `第${v.order + 1}卷`).join("、")}`
        : ""
    const targetVolCount = resolveOutlineTargetVolumeCount(
      planningActiveOutline.id,
      planningOutlineTargetVolumesByNodeId,
      planningScale.volumeCount,
    )
    const userInput = [
      makePlanningContext("volume", planningActiveOutline),
      `本次任务：重新生成【第 ${volumeOrder + 1} 卷】（该大纲段共规划 ${targetVolCount} 卷；单卷章细纲条数可在选中卷纲后单独设置，未设置时约 ${planningScale.chaptersPerVolume} 章）。`,
      existingVolumeHint,
    ]
      .filter(Boolean)
      .join("\n\n")

    setPlanningError("")
    planningAbortRef.current?.abort()
    const ac = new AbortController()
    planningAbortRef.current = ac
    setPlanningBusyLevel("volume")
    const onChunk = makeOnChunk("volume")
    let genFailed = false
    try {
      const { items } = await generateTuiyanPlanningList({
        level: "volume",
        desiredCount: 1,
        userInput,
        imitationMode: referenceImitationMode,
        settings: loadAiSettings(),
        signal: ac.signal,
        onChunk,
        workId,
        planningThickness,
        planningScale,
      })
      const volItem = items[0]!
      const volText = serializePlanningNodeForCount(
        volItem.title,
        volItem.summary,
        volItem.structuredMeta as Record<string, string | undefined>,
      )
      const volCharCount = countCharsWithPunct(volText)
      if (volCharCount < planningThickness.volumeWithPunct) {
        throw new TuiyanPlanningGenerateError(
          `重生成的第 ${volumeOrder + 1} 卷卷纲字数（${volCharCount}字，含标点）不足 ${planningThickness.volumeWithPunct} 字，请重试或在「高级设置」中调低下限。`,
        )
      }
      const newVolNode: TuiyanPlanningNode = {
        id: `plan-volume-${Date.now()}-${volumeOrder}-${Math.random().toString(36).slice(2, 7)}`,
        parentId: planningActiveOutline.id,
        level: "volume",
        title: volItem.title.trim() || planningNodeTitleFallback("volume", volumeOrder),
        summary: volItem.summary.trim(),
        order: volumeOrder,
      }
      setPlanningTree((prev) => [...prev.filter((n) => !removedIds.has(n.id)), newVolNode])
      setPlanningSelectedNodeId(newVolNode.id)
      upsertPlanningMeta([newVolNode.id], "volume")
      if (volItem.structuredMeta && Object.keys(volItem.structuredMeta).length) {
        setPlanningStructuredMetaByNodeId((prev) => ({ ...prev, [newVolNode.id]: volItem.structuredMeta }))
      }
      const volAuto: AutoLinkItem = {
        summary: newVolNode.summary,
        structuredMeta: volItem.structuredMeta ?? {},
        level: "volume",
        nodeId: newVolNode.id,
      }
      if (onPlanningLevelKnowledgeOffer) {
        onPlanningLevelKnowledgeOffer({
          level: "volume",
          autoLinkItems: [volAuto],
          extractInputs: [
            {
              nodeId: newVolNode.id,
              level: "volume",
              title: newVolNode.title,
              content: newVolNode.summary,
              structuredMeta: volItem.structuredMeta,
            },
          ],
        })
      } else {
        runAutoLink([volAuto])
      }
    } catch (e) {
      genFailed = true
      if (isFirstAiGateCancelledError(e)) return
      if (e instanceof DOMException && e.name === "AbortError") return
      if (e instanceof Error && e.name === "AbortError") return
      setPlanningError(e instanceof Error ? e.message : String(e))
    } finally {
      if (genFailed) resetProgress()
      else completeProgress()
      setPlanningBusyLevel(null)
      planningAbortRef.current = null
    }
  }, [
    completeProgress,
    makeOnChunk,
    makePlanningContext,
    planningAbortRef,
    planningActiveOutline,
    planningActiveVolume,
    onPlanningLevelKnowledgeOffer,
    planningOutlineTargetVolumesByNodeId,
    planningScale,
    planningThickness,
    planningTree,
    referenceImitationMode,
    resetProgress,
    runAutoLink,
    setPlanningBusyLevel,
    setPlanningError,
    setPlanningSelectedNodeId,
    setPlanningStructuredMetaByNodeId,
    setPlanningTree,
    upsertPlanningMeta,
  ])

  const doPushPlanningTree = useCallback(async (opts: KnowledgePushOptions) => {
    if (!workId || planningPushCandidates.length === 0) return
    const effective = filterPlanningPushCandidatesBySubtreeScope(
      planningPushCandidates,
      opts.subtreeScope,
    )
    if (effective.length === 0) {
      toast({
        title: "无法推送",
        description: "所选子树无节点，请重选推送范围。",
        variant: "destructive",
      })
      return
    }
    const pushedAt = Date.now()
    const nextEntries: TuiyanPushedOutlineEntry[] = effective.map((candidate) => ({
      id: candidate.id,
      parentId: candidate.parentId,
      level: candidate.level,
      order: candidate.order,
      title: candidate.title,
      content: candidate.content,
      pushedAt,
      structuredMeta: planningStructuredMetaByNodeId[candidate.id] ?? undefined,
    }))
    await upsertTuiyanState(workId, { planningPushedOutlines: nextEntries })
    setPlanningError("")

    const needsKnowledge = opts.generateCharacters || opts.generateTerms
    if (!needsKnowledge) {
      toast({ title: "章纲已推送", description: `共 ${nextEntries.length} 条节点已写入写作页章纲栏。` })
      return
    }

    const filterLevels = opts.levelFilter
    const extractInputs: KnowledgeExtractInput[] = effective
      .filter((c) => filterLevels.length === 0 || filterLevels.includes(c.level))
      .map((c) => ({
        nodeId: c.id,
        level: c.level,
        title: c.title,
        content: c.content,
        structuredMeta: planningStructuredMetaByNodeId[c.id],
      }))

    try {
      const { characters, terms } = await extractKnowledgeFromNodes({ inputs: extractInputs })

      let charAdded = 0
      let charUpdated = 0
      let termAdded = 0
      let termUpdated = 0

      if (opts.generateCharacters && characters.length > 0) {
        const r = await upsertBibleCharactersByWork(workId, characters)
        charAdded = r.added
        charUpdated = r.updated
      }
      if (opts.generateTerms && terms.length > 0) {
        const r = await upsertBibleGlossaryTermsByWork(workId, terms)
        termAdded = r.added
        termUpdated = r.updated
      }

      const batch: TuiyanKnowledgeBatch = {
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        sourceNodeIds: extractInputs.map((n) => n.nodeId),
        characters: opts.generateCharacters ? characters : [],
        terms: opts.generateTerms ? terms : [],
        stats: { charactersAdded: charAdded, charactersUpdated: charUpdated, termsAdded: termAdded, termsUpdated: termUpdated },
      }
      const prevState = await getTuiyanState(workId)
      const prevBatches = prevState?.planningKnowledgeBatches ?? []
      await upsertTuiyanState(workId, {
        planningKnowledgeBatches: [...prevBatches.slice(-9), batch],
      })

      const parts: string[] = [`章纲 ${nextEntries.length} 条已推送。`]
      if (opts.generateCharacters) parts.push(`人物：新增 ${charAdded}、更新 ${charUpdated}。`)
      if (opts.generateTerms) parts.push(`词条：新增 ${termAdded}、更新 ${termUpdated}。`)
      toast({ title: "推送完成", description: parts.join(" ") })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "未知错误"
      toast({
        title: "章纲已推送，配套库未更新",
        description: `知识库生成失败：${msg}`,
        variant: "destructive",
      })
    }
  }, [planningPushCandidates, planningStructuredMetaByNodeId, setPlanningError, toast, workId])

  const pushPlanningTreeToWriter = useCallback(async (opts: KnowledgePushOptions) => {
    if (!workId) return
    if (planningPushCandidates.length === 0) {
      setPlanningError("当前规划树为空，请先生成总纲/大纲/卷纲/细纲。")
      return
    }
    const previousState = await getTuiyanState(workId)
    const hadPrevious = (previousState?.planningPushedOutlines?.length ?? 0) > 0
    if (hadPrevious) {
      setPendingKnowledgeOpts(opts)
      setPushOverwriteConfirmOpen(true)
      return
    }
    await doPushPlanningTree(opts)
  }, [
    doPushPlanningTree,
    planningPushCandidates.length,
    setPendingKnowledgeOpts,
    setPlanningError,
    setPushOverwriteConfirmOpen,
    workId,
  ])

  const cancelPlanningGeneration = useCallback(() => {
    planningAbortRef.current?.abort()
  }, [planningAbortRef])

  return {
    generatePlanningLevel,
    cancelPlanningGeneration,
    regenerateCurrentVolume,
    doPushPlanningTree,
    pushPlanningTreeToWriter,
  }
}
