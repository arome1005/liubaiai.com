import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import {
  TuiyanPlanningPushDialog,
  type TuiyanPlanningPushCandidate,
  type KnowledgePushOptions,
} from "../components/tuiyan/TuiyanPlanningPushDialog"
import { PlanningDeleteConfirmDialog, type PlanningDeleteTarget } from "../components/tuiyan/PlanningDeleteConfirmDialog"
import { TuiyanPostPlanningKnowledgeDialog } from "../components/tuiyan/TuiyanPostPlanningKnowledgeDialog"
import { TuiyanChatHistoryOverlay } from "../components/tuiyan/TuiyanChatHistoryOverlay"
import { TuiyanChatPanel, type ChatMessage } from "../components/tuiyan/TuiyanChatPanel"
import { TuiyanReferencePanel } from "../components/tuiyan/TuiyanReferencePanel"
import { TuiyanTopBar } from "../components/tuiyan/TuiyanTopBar"
import { TuiyanLeftPlanningPanel } from "../components/tuiyan/TuiyanLeftPlanningPanel"
import { TuiyanCenterWorkspace } from "../components/tuiyan/TuiyanCenterWorkspace"
import { TuiyanRightPanel } from "../components/tuiyan/TuiyanRightPanel"
import { TuiyanRightDetailTab } from "../components/tuiyan/TuiyanRightDetailTab"
import type { WenCeEntry } from "../components/tuiyan/WenCeCard"
import { useTuiyanLayoutPanels } from "../hooks/useTuiyanLayoutPanels"
import type {
  GlobalPromptTemplate,
  PlanningNodeStructuredMeta,
  TuiyanReferenceBinding,
  TuiyanReferencePolicy,
  TuiyanPlanningLevel,
  TuiyanPlanningMeta,
  TuiyanPlanningNode,
} from "../db/types"
import { renderPromptTemplate } from "../util/render-prompt-template"
import {
  clampPlanningOutlineVolumeTarget,
  clampPlanningVolumeChapterTarget,
  listPlanningChildren,
  PLANNING_LEVEL_LABEL,
  STRUCTURED_FIELDS_BY_LEVEL,
  planningNodeTitleFallback,
  DEFAULT_PLANNING_SCALE,
  type PlanningScale,
} from "../util/tuiyan-planning"
import { useNavigate } from "react-router-dom"
import { isFirstAiGateCancelledError } from "../ai/client"
import { generateLogicThreeBranches, LogicBranchPredictError } from "../ai/logic-branch-predict"
import { generatePlanningAdvisorReply, TuiyanPlanningChatError } from "../ai/tuiyan-planning-chat"
import { useTuiyanAutoLink } from "../hooks/useTuiyanAutoLink"
import { useTuiyanPostPlanningKnowledgeOffer } from "../hooks/useTuiyanPostPlanningKnowledgeOffer"
import { useTuiyanGenProgress } from "../hooks/useTuiyanGenProgress"
import { useTuiyanMindmapActions } from "../hooks/useTuiyanMindmapActions"
import { useTuiyanPlanningActions } from "../hooks/useTuiyanPlanningActions"
import { useTuiyanReferenceStrategyWithGuards } from "../hooks/useTuiyanReferenceStrategyWithGuards"
import { useTuiyanReferenceActions } from "../hooks/useTuiyanReferenceActions"
import { useTuiyanReferenceConfig } from "../hooks/useTuiyanReferenceConfig"
import { useTuiyanWenCeActions } from "../hooks/useTuiyanWenCeActions"
import { useToast } from "../components/ui/use-toast"
import { workStyleCardToWritingSlice } from "../util/work-style-card-to-slice"
import { loadAiSettings, saveAiSettings } from "../ai/storage"
import { aiModelIdToProvider, aiProviderToModelId } from "../util/ai-ui-model-map"
import {
  getWork,
  getWorkStyleCard,
  listWorks,
} from "../db/repo"
import { useTuiyanChatSessions } from "../hooks/useTuiyanChatSessions"
import {
  buildTuiyanUpsertPayload,
  hydrateWenCe,
  loadTuiyanWorkbench,
  useTuiyanDebouncedSave,
} from "../hooks/useTuiyanPersistence"
import type { Chapter, ReferenceLibraryEntry, Work } from "../db/types"
import { resolveDefaultChapterId } from "../util/resolve-default-chapter"
import { workTagsToProfileText } from "../util/work-tags"
import { buildShengHuiUrl } from "../util/sheng-hui-deeplink"
import { workPathSegment } from "../util/work-url"
import { writeAiPanelDraft } from "../util/ai-panel-draft"
import { writeEditorHitHandoff } from "../util/editor-hit-handoff"
import { writeWenceHandoff } from "../util/wence-handoff"
import type { Edge, Node, Viewport } from "reactflow"
import {
  firstChapterIdInTree,
  type V0OutlineNode,
} from "../util/v0-tuiyan-outline"
import { buildDefaultTuiyanMindmap } from "../util/tuiyan-default-mindmap"
import {
  defaultTuiyanReferencePolicy,
  hasEffectiveReferenceStrategy,
  normalizeReferenceBindings,
  normalizeReferencePolicy,
} from "../util/tuiyan-reference-policy"
import {
  buildEditorHitHandoffSource,
  buildEditorHitNavUrl,
  buildWenceHandoffPayload,
} from "../util/tuiyan-handoffs"
import { cn } from "../lib/utils"
import { AI_MODELS } from "../components/ai-model-selector"
import { Button } from "../components/ui/button"
import { Textarea } from "../components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog"
// ============ Types ============
type OutlineNode = V0OutlineNode

const LS_LAST_WORK = "liubai:lastWorkId"

function formatBranchesForChat(branches: { title: string; summary: string }[]): string {
  return branches
    .map((b, i) => `**分支${i + 1}：${b.title}**\n\n${b.summary}`)
    .join("\n\n---\n\n")
}

function findNodeById(nodes: OutlineNode[], id: string): OutlineNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children) {
      const found = findNodeById(node.children, id)
      if (found) return found
    }
  }
  return null
}

function findFirstChapterDeep(node: OutlineNode): OutlineNode | null {
  if (node.type === "chapter") return node
  if (node.children) {
    for (const c of node.children) {
      const x = findFirstChapterDeep(c)
      if (x) return x
    }
  }
  return null
}

function resolveChapterForAi(
  selectedId: string | null,
  outline: OutlineNode[],
  chapters: Chapter[],
): Chapter | null {
  if (!selectedId || !chapters.length) return null
  const node = findNodeById(outline, selectedId)
  if (!node) return null
  const chapterNode =
    node.type === "chapter" ? node : findFirstChapterDeep(node)
  if (!chapterNode) return null
  return chapters.find((c) => c.id === chapterNode.id) ?? null
}

// ============ Main Component ============
export default function V0TuiyanPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [works, setWorks] = useState<Work[]>([])
  const [workId, setWorkId] = useState<string | null>(null)
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [workTitle, setWorkTitle] = useState("")
  const [pageLoading, setPageLoading] = useState(true)

  const [outline, setOutline] = useState<OutlineNode[]>([])
  const [selectedOutlineId, setSelectedOutlineId] = useState<string | null>(null)
  const [wenCe, setWenCe] = useState<WenCeEntry[]>([])
  const [finalizedNodeIds, setFinalizedNodeIds] = useState<string[]>([])
  const [statusByNodeId, setStatusByNodeId] = useState<Record<string, "draft" | "refining" | "locked">>({})
  const [linkedRefWorkIds, setLinkedRefWorkIds] = useState<string[]>([])
  const [referenceBindings, setReferenceBindings] = useState<TuiyanReferenceBinding[]>([])
  const [referencePolicy, setReferencePolicy] = useState<TuiyanReferencePolicy>(() => defaultTuiyanReferencePolicy())
  const [refLibrary, setRefLibrary] = useState<ReferenceLibraryEntry[]>([])
  const [mmNodes, setMmNodes] = useState<Node[]>([])
  const [mmEdges, setMmEdges] = useState<Edge[]>([])
  const [mmViewport, setMmViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 })
  const [scenes, setScenes] = useState<
    Array<{ id: string; title: string; summary?: string; linkedChapterIds: string[]; createdAt: number; updatedAt: number }>
  >([])
  const [chatInput, setChatInput] = useState("")
  const [activeTab, setActiveTab] = useState<"outline" | "mindmap" | "wence">("outline")
  const [rightPanelTab, setRightPanelTab] = useState<"detail" | "chat" | "reference">("detail")
  const {
    showLeftPanel,
    showRightPanel,
    leftPanelWidth,
    rightPanelWidth,
    setShowLeftPanel,
    setShowRightPanel,
    beginPanelDrag,
    resetLeftPanelWidth,
    resetRightPanelWidth,
  } = useTuiyanLayoutPanels()
  const [isGenerating, setIsGenerating] = useState(false)
  const [planningIdea, setPlanningIdea] = useState("")
  const [planningTree, setPlanningTree] = useState<TuiyanPlanningNode[]>([])
  const [planningDraftsByNodeId, setPlanningDraftsByNodeId] = useState<Record<string, string>>({})
  const [planningMetaByNodeId, setPlanningMetaByNodeId] = useState<Record<string, TuiyanPlanningMeta>>({})
  const [planningStructuredMetaByNodeId, setPlanningStructuredMetaByNodeId] = useState<Record<string, PlanningNodeStructuredMeta>>({})
  const [planningOutlineTargetVolumesByNodeId, setPlanningOutlineTargetVolumesByNodeId] = useState<
    Record<string, number>
  >({})
  const [planningVolumeTargetChaptersByNodeId, setPlanningVolumeTargetChaptersByNodeId] = useState<
    Record<string, number>
  >({})
  const [planningSelectedNodeId, setPlanningSelectedNodeId] = useState<string | null>(null)
  const [planningMode, setPlanningMode] = useState<"model" | "template">("model")
  const [planningBusyLevel, setPlanningBusyLevel] = useState<TuiyanPlanningLevel | null>(null)
  const [planningError, setPlanningError] = useState("")
  const { autoLinkEnabled, toggleAutoLink, runAutoLink, bumpChipLibRefreshKey, chipLibRefreshKey } =
    useTuiyanAutoLink(workId)
  const {
    postPlanningKnowledgeOpen,
    postPlanningKnowledgeBusy,
    postPlanningKnowledgeLevel,
    offerAfterPlanningLevel,
    onPostPlanningSkip,
    onPostPlanningEnrich,
    onPostPlanningOpenChange,
  } = useTuiyanPostPlanningKnowledgeOffer({ workId, runAutoLink, bumpChipLibRefreshKey, toast })
  const { genProgress, makeOnChunk, completeProgress, resetProgress } = useTuiyanGenProgress()
  const [planningIdeaDialogOpen, setPlanningIdeaDialogOpen] = useState(false)
  const [planningPushDialogOpen, setPlanningPushDialogOpen] = useState(false)
  const [planningScale, setPlanningScale] = useState<PlanningScale>(() => {
    try {
      const saved = localStorage.getItem("liubai:tuiyan:planningScale:v1")
      if (saved) return { ...DEFAULT_PLANNING_SCALE, ...(JSON.parse(saved) as PlanningScale) }
    } catch { /* ignore */ }
    return DEFAULT_PLANNING_SCALE
  })
  const handlePlanningScaleChange = useCallback((s: PlanningScale) => {
    setPlanningScale(s)
    localStorage.setItem("liubai:tuiyan:planningScale:v1", JSON.stringify(s))
  }, [])
  const [pushOverwriteConfirmOpen, setPushOverwriteConfirmOpen] = useState(false)
  const [pendingKnowledgeOpts, setPendingKnowledgeOpts] = useState<KnowledgePushOptions | null>(null)
  const [planningDeleteTarget, setPlanningDeleteTarget] = useState<PlanningDeleteTarget>(null)
  /** 规划树折叠：undefined / true 为展开，false 为收起 */
  const [planningExpandedById, setPlanningExpandedById] = useState<Record<string, boolean>>({})
  // Sprint 3：选中的提示词模板（运行时对象，随 picker 更新）
  const [selectedPromptTemplate, _setSelectedPromptTemplate] = useState<GlobalPromptTemplate | null>(null)
  const selectedPromptTemplateRef = useRef<GlobalPromptTemplate | null>(null)
  const setSelectedPromptTemplate = useCallback((t: GlobalPromptTemplate | null) => {
    selectedPromptTemplateRef.current = t
    _setSelectedPromptTemplate(t)
  }, [])
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const chatSessions = useTuiyanChatSessions()
  const branchAbortRef = useRef<AbortController | null>(null)
  const planningAbortRef = useRef<AbortController | null>(null)
  const tuiyanHydratedRef = useRef(false)

  const [showModelSelector, setShowModelSelector] = useState(false)
  const [selectedModelId, setSelectedModelId] = useState(() =>
    aiProviderToModelId(loadAiSettings().provider),
  )

  const selectedAiModel = useMemo(
    () => AI_MODELS.find((m) => m.id === selectedModelId) ?? AI_MODELS[0],
    [selectedModelId],
  )

  const handleSelectAiModel = useCallback((modelId: string) => {
    const provider = aiModelIdToProvider(modelId)
    const s = loadAiSettings()
    saveAiSettings({ ...s, provider })
    setSelectedModelId(modelId)
  }, [])

  useEffect(() => {
    const onFocus = () =>
      setSelectedModelId(aiProviderToModelId(loadAiSettings().provider))
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [])

  const primaryTag =
    works.find((w) => w.id === workId)?.tags?.filter(Boolean)[0] ?? "作品"

  const toolbarWorkTitle =
    workTitle || (works.length ? "—" : "暂无作品")

  const workLinkSeg = useMemo(() => {
    if (!workId) return null
    const w = works.find((x) => x.id === workId)
    return w ? workPathSegment(w) : workId
  }, [works, workId])

  const shengHuiHref = useMemo(() => {
    if (!workId) return null
    const ch = resolveChapterForAi(selectedOutlineId, outline, chapters)
    return buildShengHuiUrl(workId, ch?.id ?? null)
  }, [workId, selectedOutlineId, outline, chapters])

  const effectiveReferencePolicy = useMemo(
    () => normalizeReferencePolicy(referencePolicy),
    [referencePolicy],
  )

  const reloadOutlineForWork = useCallback(async (wid: string) => {
    tuiyanHydratedRef.current = false
    const { work: w, chapters: chs, refLibrary: refs, state: st, outlineFromVolChap: tree } =
      await loadTuiyanWorkbench(wid)

    setRefLibrary(refs)
    setChapters(chs)
    setWenCe(hydrateWenCe(st?.wenCe))
    setWorkTitle(w?.title ?? "")

    const stScenes = (st?.scenes ?? []) as typeof scenes
    setScenes(stScenes)
    const sceneNodes: OutlineNode[] = stScenes.map((s) => ({
      id: s.id,
      title: s.title,
      type: "scene",
      status: "draft",
      summary: s.summary ?? "",
      children: undefined,
      collapsed: false,
    }))
    const withScenes = [...sceneNodes, ...tree]
    setOutline(withScenes)
    setFinalizedNodeIds(st?.finalizedNodeIds ?? [])
    setStatusByNodeId((st?.statusByNodeId ?? {}) as Record<string, "draft" | "refining" | "locked">)
    const loadedLinked = st?.linkedRefWorkIds ?? []
    setLinkedRefWorkIds(loadedLinked)
    setReferencePolicy(normalizeReferencePolicy(st?.referencePolicy))
    setReferenceBindings(normalizeReferenceBindings(loadedLinked, st?.referenceBindings))

    if (st?.mindmap && Array.isArray(st.mindmap.nodes) && Array.isArray(st.mindmap.edges)) {
      setMmNodes(st.mindmap.nodes as Node[])
      setMmEdges(st.mindmap.edges as Edge[])
      if (st.mindmap.viewport) setMmViewport(st.mindmap.viewport as Viewport)
    } else {
      // 默认导图：优先用五层规划树（master_outline → outline → volume），
      // 没有规划树时回退到按卷章树的卷渲染。
      const volsForFallback = tree
        .filter((n) => n.type === "volume")
        .map((v) => ({ id: v.id, title: v.title }))
      const built = buildDefaultTuiyanMindmap(
        w?.title ?? "",
        st?.planningTree ?? [],
        volsForFallback,
      )
      setMmNodes(built.nodes)
      setMmEdges(built.edges)
      setMmViewport({ x: 0, y: 0, zoom: 1 })
    }

    chatSessions.resetFromDb(st)
    setPlanningIdea(st?.planningIdea ?? "")
    setPlanningTree(st?.planningTree ?? [])
    setPlanningDraftsByNodeId(st?.planningDraftsByNodeId ?? {})
    setPlanningMetaByNodeId(st?.planningMetaByNodeId ?? {})
    setPlanningStructuredMetaByNodeId(st?.planningStructuredMetaByNodeId ?? {})
    setPlanningOutlineTargetVolumesByNodeId(st?.planningOutlineTargetVolumesByNodeId ?? {})
    setPlanningVolumeTargetChaptersByNodeId(st?.planningVolumeTargetChaptersByNodeId ?? {})
    setPlanningSelectedNodeId(st?.planningSelectedNodeId ?? null)
    setSelectedOutlineId((prev) => {
      if (prev && findNodeById(withScenes, prev)) return prev
      if (chs.length && w) {
        const def = resolveDefaultChapterId(wid, chs, w)
        if (def && findNodeById(withScenes, def)) return def
      }
      return firstChapterIdInTree(withScenes)
    })
    // Sprint 3：恢复上次选中的提示词 id；实体在 PromptPicker 打开时懒加载
    // 切换作品时清空（实体将在用户下次打开 picker 时重新选择）
    selectedPromptTemplateRef.current = null
    _setSelectedPromptTemplate(null)
    tuiyanHydratedRef.current = true
  }, [chatSessions.resetFromDb])

  // 推演工作台 debounce 自动落库：序列化逻辑见 buildTuiyanUpsertPayload。
  useTuiyanDebouncedSave({
    workId,
    enabled: tuiyanHydratedRef.current,
    getPayload: () =>
      buildTuiyanUpsertPayload({
        chatThreads: chatSessions.threads,
        activeChatThreadId: chatSessions.activeChatThreadId,
        wenCe,
        finalizedNodeIds,
        statusByNodeId,
        linkedRefWorkIds,
        referenceBindings,
        referencePolicy: effectiveReferencePolicy,
        mmNodes: mmNodes as unknown[],
        mmEdges: mmEdges as unknown[],
        mmViewport,
        scenes,
        selectedPromptTemplateId: selectedPromptTemplateRef.current?.id ?? null,
        planningIdea,
        planningTree,
        planningDraftsByNodeId,
        planningMetaByNodeId,
        planningStructuredMetaByNodeId,
        planningOutlineTargetVolumesByNodeId,
        planningVolumeTargetChaptersByNodeId,
        planningSelectedNodeId,
      }),
    deps: [
      chatSessions.threads,
      chatSessions.activeChatThreadId,
      wenCe,
      finalizedNodeIds,
      statusByNodeId,
      linkedRefWorkIds,
      referenceBindings,
      effectiveReferencePolicy,
      mmNodes,
      mmEdges,
      mmViewport,
      scenes,
      selectedPromptTemplate,
      planningIdea,
      planningTree,
      planningDraftsByNodeId,
      planningMetaByNodeId,
      planningStructuredMetaByNodeId,
      planningOutlineTargetVolumesByNodeId,
      planningVolumeTargetChaptersByNodeId,
      planningSelectedNodeId,
    ],
  })

  useEffect(() => {
    void (async () => {
      try {
        const list = await listWorks()
        setWorks(list)
        if (list.length > 0) {
          const lastId = localStorage.getItem(LS_LAST_WORK)
          const pick = list.find((x) => x.id === lastId) ?? list[0]
          setWorkId(pick.id)
        }
      } finally {
        setPageLoading(false)
      }
    })()
  }, [])

  useEffect(() => {
    if (!workId) {
      setOutline([])
      setChapters([])
      setWorkTitle("")
      setSelectedOutlineId(null)
      chatSessions.clearAll()
      setWenCe([])
      setLinkedRefWorkIds([])
      setReferenceBindings([])
      setReferencePolicy(defaultTuiyanReferencePolicy())
      setPlanningIdea("")
      setPlanningTree([])
      setPlanningDraftsByNodeId({})
      setPlanningMetaByNodeId({})
      setPlanningOutlineTargetVolumesByNodeId({})
      setPlanningVolumeTargetChaptersByNodeId({})
      setPlanningSelectedNodeId(null)
      return
    }
    void reloadOutlineForWork(workId)
  }, [workId, reloadOutlineForWork, chatSessions.clearAll])

  useEffect(() => () => {
    branchAbortRef.current?.abort()
    planningAbortRef.current?.abort()
  }, [])

  useEffect(() => {
    setReferenceBindings((prev) => {
      const next = normalizeReferenceBindings(linkedRefWorkIds, prev)
      if (
        prev.length === next.length &&
        prev.every((p, i) => {
          const n = next[i]
          return (
            n &&
            p.refWorkId === n.refWorkId &&
            p.role === n.role &&
            p.rangeMode === n.rangeMode &&
            p.note === n.note &&
            p.aspects.length === n.aspects.length &&
            p.aspects.every((a, idx) => a === n.aspects[idx])
          )
        })
      ) return prev
      return next
    })
  }, [linkedRefWorkIds])

  const hasReferenceStrategyEnabled = useMemo(
    () => hasEffectiveReferenceStrategy(linkedRefWorkIds, referenceBindings),
    [linkedRefWorkIds, referenceBindings],
  )
  const { referenceStrategyBlock, referenceAssemblySummaryLines, referenceAssemblyHardError } =
    useTuiyanReferenceStrategyWithGuards({
      planningIdeaTrimmedLength: planningIdea.trim().length,
      linkedRefWorkIds,
      referenceBindings,
      effectiveReferencePolicy,
      refLibrary,
      hasReferenceStrategyEnabled,
    })

  const appendAssistant = useCallback(
    (content: string) => {
      chatSessions.appendAssistantToActive(content, selectedOutlineId ?? undefined)
    },
    [chatSessions.appendAssistantToActive, selectedOutlineId],
  )

  const planningNodeMap = useMemo(() => new Map(planningTree.map((n) => [n.id, n])), [planningTree])
  const planningSelectedNode = planningSelectedNodeId ? planningNodeMap.get(planningSelectedNodeId) ?? null : null

  const runBranchPredict = useCallback(
    async (userHint: string, planningContextArg?: string) => {
      if (!workId) {
        appendAssistant("请先在作品库创建并选择一部作品。")
        return
      }

      // ── 规划顾问模式：有选中规划节点时走新路径 ──────────────────────────
      if (planningSelectedNodeId) {
        branchAbortRef.current?.abort()
        const ac = new AbortController()
        branchAbortRef.current = ac
        setIsGenerating(true)
        try {
          const history = chatSessions.activeMessages.map((m) => ({ role: m.role, content: m.content }))
          const reply = await generatePlanningAdvisorReply({
            planningContext: planningContextArg ?? "",
            userHint,
            history,
            imitationMode: effectiveReferencePolicy.imitationMode,
            settings: loadAiSettings(),
            signal: ac.signal,
          })
          appendAssistant(reply)
        } catch (e) {
          if (isFirstAiGateCancelledError(e)) return
          if (e instanceof DOMException && e.name === "AbortError") return
          if (e instanceof Error && e.name === "AbortError") return
          const msg =
            e instanceof TuiyanPlanningChatError
              ? e.message
              : e instanceof Error
                ? e.message
                : String(e)
          appendAssistant(msg)
        } finally {
          setIsGenerating(false)
          branchAbortRef.current = null
        }
        return
      }

      // ── 兜底续写模式：依赖写作大纲选中的章节正文 ─────────────────────────
      const ch = resolveChapterForAi(selectedOutlineId, outline, chapters)
      if (!ch) {
        appendAssistant("请在左侧规划树选中一个节点（推荐），或在写作大纲中选择一章开始对话。")
        return
      }
      branchAbortRef.current?.abort()
      const ac = new AbortController()
      branchAbortRef.current = ac
      setIsGenerating(true)
      try {
        const [card, w] = await Promise.all([getWorkStyleCard(workId), getWork(workId)])
        const tagProfile = workTagsToProfileText(w?.tags)
        const workStyle = workStyleCardToWritingSlice(card)
        const tpl = selectedPromptTemplateRef.current
        const baseHint = tpl
          ? `【提示词模板：${tpl.title}】\n${renderPromptTemplate(tpl.body, {
              work_title:           (w?.title ?? workTitle).trim() || "未命名",
              work_tags:            (w?.tags ?? []).join("，"),
              chapter_title:        ch.title,
              chapter_summary:      ch.summary ?? "",
              chapter_content:      ch.content ?? "",
            }).trim()}\n\n${userHint.trim()}`.trim()
          : userHint.trim()
        const effectiveHint = referenceStrategyBlock
          ? `${referenceStrategyBlock}\n\n${baseHint}`.trim()
          : baseHint
        const { branches } = await generateLogicThreeBranches({
          workTitle: (w?.title ?? workTitle).trim() || "未命名",
          chapterTitle: ch.title,
          chapterSummary: ch.summary ?? "",
          chapterContent: ch.content ?? "",
          userHint: effectiveHint,
          workStyle,
          tagProfileText: tagProfile,
          imitationMode: effectiveReferencePolicy.imitationMode,
          settings: loadAiSettings(),
          signal: ac.signal,
        })
        appendAssistant(formatBranchesForChat(branches))
      } catch (e) {
        if (isFirstAiGateCancelledError(e)) return
        if (e instanceof DOMException && e.name === "AbortError") return
        if (e instanceof Error && e.name === "AbortError") return
        const msg =
          e instanceof LogicBranchPredictError
            ? e.message
            : e instanceof Error
              ? e.message
              : String(e)
        appendAssistant(msg)
      } finally {
        setIsGenerating(false)
        branchAbortRef.current = null
      }
    },
    [
      workId,
      outline,
      chapters,
      selectedOutlineId,
      workTitle,
      appendAssistant,
      planningSelectedNodeId,
      chatSessions.activeMessages,
      referenceStrategyBlock,
      effectiveReferencePolicy.imitationMode,
    ],
  )

  const resolveChapterForJump = useCallback((): Chapter | null => {
    if (!workId) return null
    const ch = resolveChapterForAi(selectedOutlineId, outline, chapters)
    return ch
  }, [workId, selectedOutlineId, outline, chapters])

  const selectedNode = selectedOutlineId ? findNodeById(outline, selectedOutlineId) : null

  const planningSelectedDraft =
    planningSelectedNodeId && planningSelectedNodeId in planningDraftsByNodeId
      ? planningDraftsByNodeId[planningSelectedNodeId] ?? ""
      : ""

  useEffect(() => {
    setPlanningError("")
  }, [planningSelectedNodeId])

  const planningMasterNodes = useMemo(
    () => listPlanningChildren(planningTree, null, "master_outline"),
    [planningTree],
  )
  const planningOutlineNodes = useMemo(
    () => planningTree.filter((n) => n.level === "outline").sort((a, b) => a.order - b.order),
    [planningTree],
  )
  const planningSelectedAncestors = useMemo(() => {
    const ancestors: TuiyanPlanningNode[] = []
    let n = planningSelectedNode
    while (n?.parentId) {
      const parent = planningNodeMap.get(n.parentId)
      if (!parent) break
      ancestors.unshift(parent)
      n = parent
    }
    return ancestors
  }, [planningNodeMap, planningSelectedNode])
  const planningActiveMaster = useMemo(() => {
    if (planningSelectedNode?.level === "master_outline") return planningSelectedNode
    return planningSelectedAncestors.find((n) => n.level === "master_outline") ?? planningMasterNodes[0] ?? null
  }, [planningMasterNodes, planningSelectedAncestors, planningSelectedNode])
  const planningActiveOutline = useMemo(() => {
    if (planningSelectedNode?.level === "outline") return planningSelectedNode
    return (
      planningSelectedAncestors.find((n) => n.level === "outline") ??
      (planningActiveMaster ? listPlanningChildren(planningTree, planningActiveMaster.id, "outline")[0] : null) ??
      listPlanningChildren(planningTree, null, "outline")[0] ??
      null
    )
  }, [planningActiveMaster, planningSelectedAncestors, planningSelectedNode, planningTree])
  const planningVolumeNodes = useMemo(
    () => listPlanningChildren(planningTree, planningActiveOutline?.id ?? null, "volume"),
    [planningTree, planningActiveOutline?.id],
  )
  const planningActiveVolume = useMemo(() => {
    if (planningSelectedNode?.level === "volume") return planningSelectedNode
    const ancestorVolume = planningSelectedAncestors.find((n) => n.level === "volume")
    if (ancestorVolume) return ancestorVolume
    return planningVolumeNodes[0] ?? null
  }, [planningSelectedAncestors, planningSelectedNode, planningVolumeNodes])
  const planningMasterTotal = useMemo(
    () => planningTree.filter((n) => n.level === "master_outline").length,
    [planningTree],
  )
  const planningVolumeTotal = useMemo(
    () => planningTree.filter((n) => n.level === "volume").length,
    [planningTree],
  )
  /** 当前激活大纲节点下已生成的卷数（用于串行生成按钮提示） */
  const volumeCountForActiveOutline = useMemo(
    () => listPlanningChildren(planningTree, planningActiveOutline?.id ?? null, "volume").length,
    [planningTree, planningActiveOutline?.id],
  )
  const planningChapterOutlineTotal = useMemo(
    () => planningTree.filter((n) => n.level === "chapter_outline").length,
    [planningTree],
  )
  const planningPushCandidates = useMemo<TuiyanPlanningPushCandidate[]>(() => {
    const levelOrder: Record<TuiyanPlanningLevel, number> = {
      master_outline: 0,
      outline: 1,
      volume: 2,
      chapter_outline: 3,
      chapter_detail: 4,
    }
    const pathFor = (node: TuiyanPlanningNode) => {
      const chain: TuiyanPlanningNode[] = []
      let cur: TuiyanPlanningNode | undefined = node
      while (cur) {
        chain.unshift(cur)
        cur = cur.parentId ? planningNodeMap.get(cur.parentId) : undefined
      }
      return chain
    }
    const pathKey = (node: TuiyanPlanningNode) =>
      pathFor(node)
        .map((n) => String(n.order).padStart(4, "0"))
        .join(".")

    return planningTree
      .slice()
      .sort((a, b) => {
        const ka = pathKey(a)
        const kb = pathKey(b)
        if (ka !== kb) return ka.localeCompare(kb)
        return levelOrder[a.level] - levelOrder[b.level]
      })
      .map((node) => {
        const content =
          node.level === "chapter_detail"
            ? (planningDraftsByNodeId[node.id] ?? "").trim() || (node.summary ?? "").trim()
            : (node.summary ?? "").trim()
        return {
          id: node.id,
          parentId: node.parentId ?? null,
          level: node.level,
          order: node.order,
          title: node.title,
          content,
        }
      })
  }, [planningDraftsByNodeId, planningNodeMap, planningTree])

  const togglePlanningExpand = useCallback((id: string) => {
    setPlanningExpandedById((prev) => {
      const cur = prev[id] !== false
      return { ...prev, [id]: !cur }
    })
  }, [])

  const selectPlanningNode = useCallback((id: string) => {
    setPlanningSelectedNodeId(id)
    setSelectedOutlineId(null)
    setPlanningExpandedById((prev) => {
      const map = new Map(planningTree.map((n) => [n.id, n]))
      const next = { ...prev }
      let n = map.get(id)
      while (n?.parentId) {
        next[n.parentId] = true
        n = map.get(n.parentId)
      }
      return next
    })
  }, [planningTree])

  const makePlanningContext = useCallback(
    (targetLevel: TuiyanPlanningLevel, parentNode: TuiyanPlanningNode | null) => {
      const work = works.find((w) => w.id === workId)
      const ancestors: TuiyanPlanningNode[] = []
      let cursor = parentNode
      while (cursor?.parentId) {
        const parent = planningNodeMap.get(cursor.parentId)
        if (!parent) break
        ancestors.unshift(parent)
        cursor = parent
      }
      const lineage = [...ancestors, ...(parentNode ? [parentNode] : [])]

      const serializeNodeWithMeta = (n: TuiyanPlanningNode): string => {
        const parts: string[] = [`【${PLANNING_LEVEL_LABEL[n.level]}】${n.title}`]
        if (n.summary.trim()) parts.push(n.summary.trim())
        const meta = planningStructuredMetaByNodeId[n.id]
        if (meta) {
          const fields = STRUCTURED_FIELDS_BY_LEVEL[n.level]
          for (const f of fields) {
            const val = (meta[f.key] ?? "").trim()
            if (val) parts.push(`${f.label}：${val}`)
          }
        }
        return parts.join("\n")
      }

      const parentContext = parentNode ? serializeNodeWithMeta(parentNode) : ""
      const lineageContext = lineage.map(serializeNodeWithMeta).join("\n\n")

      const tpl = selectedPromptTemplateRef.current
      const promptCtx = renderPromptTemplate(tpl?.body ?? "", {
        work_title: (work?.title ?? workTitle).trim() || "未命名",
        work_tags: (work?.tags ?? []).join("，"),
        outline_node_title: parentNode?.title ?? "",
        outline_node_summary: parentNode?.summary ?? "",
        parent_context: parentContext,
        lineage_context: lineageContext,
        planning_level: PLANNING_LEVEL_LABEL[targetLevel],
        idea_text: planningIdea,
      }).trim()
      const header = [
        `作品：${(work?.title ?? workTitle).trim() || "未命名"}`,
        planningIdea.trim() ? `构思：${planningIdea.trim()}` : "",
        lineageContext ? `继承链上下文（后续推演必须服从上层约束）：\n${lineageContext}` : "",
        parentContext ? `父层上下文：\n${parentContext}` : "",
      ]
        .filter(Boolean)
        .join("\n\n")
      const base = planningMode !== "template" || !tpl
        ? header
        : `${header}\n\n【模板(${tpl.title})】\n${promptCtx}`.trim()
      return referenceStrategyBlock
        ? `${base}\n\n${referenceStrategyBlock}\n\n【生效条件】已关联参考，当前层生成必须注入参考策略。`.trim()
        : `${base}\n\n【生效条件】未关联参考，当前层走普通生成模式。`.trim()
    },
    [planningIdea, planningMode, planningNodeMap, planningStructuredMetaByNodeId, workId, workTitle, works, referenceStrategyBlock],
  )

  /** 当前规划节点的序列化继承链上下文，供 AI 对话组件使用 */
  const planningContext = useMemo(
    () => planningSelectedNode ? makePlanningContext(planningSelectedNode.level, planningSelectedNode) : "",
    [planningSelectedNode, makePlanningContext],
  )

  const {
    generatePlanningLevel,
    cancelPlanningGeneration,
    regenerateCurrentVolume,
    doPushPlanningTree,
    pushPlanningTreeToWriter,
  } = useTuiyanPlanningActions({
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
    referenceImitationMode: effectiveReferencePolicy.imitationMode,
    onPlanningLevelKnowledgeOffer: offerAfterPlanningLevel,
  })

  const updatePlanningNodeDraft = useCallback((nodeId: string, value: string) => {
    setPlanningDraftsByNodeId((prev) => ({ ...prev, [nodeId]: value }))
  }, [])

  const updatePlanningNodeSummary = useCallback((nodeId: string, value: string) => {
    setPlanningTree((prev) =>
      prev.map((n) => (n.id === nodeId ? { ...n, summary: value } : n)),
    )
  }, [])

  const updatePlanningNodeTitle = useCallback((nodeId: string, value: string) => {
    setPlanningTree((prev) => prev.map((n) => (n.id === nodeId ? { ...n, title: value } : n)))
  }, [])

  const updatePlanningNodeStructuredMeta = useCallback(
    (nodeId: string, patch: Partial<PlanningNodeStructuredMeta>) => {
      setPlanningStructuredMetaByNodeId((prev) => ({
        ...prev,
        [nodeId]: { ...prev[nodeId], ...patch },
      }))
    },
    [],
  )

  const handleOutlineTargetVolumesChange = useCallback((outlineId: string, value: number) => {
    const n = clampPlanningOutlineVolumeTarget(value)
    setPlanningOutlineTargetVolumesByNodeId((prev) => ({ ...prev, [outlineId]: n }))
  }, [])

  const handleVolumeTargetChaptersChange = useCallback((volumeId: string, value: number) => {
    const n = clampPlanningVolumeChapterTarget(value)
    setPlanningVolumeTargetChaptersByNodeId((prev) => ({ ...prev, [volumeId]: n }))
  }, [])

  const executePlanningDelete = useCallback((target: NonNullable<PlanningDeleteTarget>) => {
    if (target.type === "all") {
      setPlanningTree([])
      setPlanningDraftsByNodeId({})
      setPlanningMetaByNodeId({})
      setPlanningStructuredMetaByNodeId({})
      setPlanningOutlineTargetVolumesByNodeId({})
      setPlanningVolumeTargetChaptersByNodeId({})
      setPlanningSelectedNodeId(null)
      return
    }
    // 收集该节点及所有后代 id
    setPlanningTree((prev) => {
      const toRemove = new Set<string>([target.nodeId])
      let changed = true
      while (changed) {
        changed = false
        for (const n of prev) {
          if (n.parentId && toRemove.has(n.parentId) && !toRemove.has(n.id)) {
            toRemove.add(n.id)
            changed = true
          }
        }
      }
      setPlanningDraftsByNodeId((d) => Object.fromEntries(Object.entries(d).filter(([k]) => !toRemove.has(k))))
      setPlanningMetaByNodeId((m) => Object.fromEntries(Object.entries(m).filter(([k]) => !toRemove.has(k))))
      setPlanningStructuredMetaByNodeId((s) => Object.fromEntries(Object.entries(s).filter(([k]) => !toRemove.has(k))))
      setPlanningOutlineTargetVolumesByNodeId((m) =>
        Object.fromEntries(Object.entries(m).filter(([k]) => !toRemove.has(k))),
      )
      setPlanningVolumeTargetChaptersByNodeId((m) =>
        Object.fromEntries(Object.entries(m).filter(([k]) => !toRemove.has(k))),
      )
      setPlanningSelectedNodeId((cur) => (cur && toRemove.has(cur) ? null : cur))
      return prev.filter((n) => !toRemove.has(n.id))
    })
  }, [])

  const writeToAiPanelDraftAndOpenEditor = useCallback(
    (draft: string) => {
      if (!workId) return
      const ch = resolveChapterForJump()
      if (!ch) return
      const r = writeAiPanelDraft(workId, ch.id, draft)
      if (!r.ok) {
        appendAssistant(r.error)
        return
      }
      const { url, needle } = buildEditorHitNavUrl({
        workLinkSeg,
        workId,
        chapterId: ch.id,
        draft,
      })
      if (needle) {
        writeEditorHitHandoff({
          workId,
          chapterId: ch.id,
          query: needle,
          isRegex: false,
          offset: 0,
          source: buildEditorHitHandoffSource(selectedNode?.title),
        })
      }
      navigate(url)
    },
    [workId, workLinkSeg, navigate, resolveChapterForJump, appendAssistant, selectedNode?.title],
  )

  const goWenceWithPrefill = useCallback(
    (content: string) => {
      const ch = resolveChapterForJump()
      const payload = buildWenceHandoffPayload({
        workId: workId ?? null,
        workTitle: toolbarWorkTitle,
        chapter: ch,
        content,
      })
      writeWenceHandoff(payload)
      navigate("/chat?handoff=1")
    },
    [resolveChapterForJump, toolbarWorkTitle, workId, navigate],
  )

  const handleAiShortcut = useCallback(
    (hint: string) => {
      setRightPanelTab("chat")
      void runBranchPredict(hint)
    },
    [runBranchPredict],
  )

  const { rebuildMindmapFromPlanning } = useTuiyanMindmapActions({
    outline,
    planningTree,
    workTitle,
    setMmNodes,
    setMmEdges,
    setMmViewport,
    toast,
  })

  const {
    handlePinWenCe,
    handleCopyWenCe,
    handleDeleteWenCe,
    handleCreateWenCe,
  } = useTuiyanWenCeActions({
    wenCe,
    setWenCe,
    toast,
  })

  // 五层规划节点 id → 标题（用于卡片展示绑定关系）
  const planningNodeTitleById = useMemo(() => {
    const m = new Map<string, string>()
    for (const n of planningTree) {
      m.set(n.id, n.title || planningNodeTitleFallback(n.level, n.order))
    }
    return m
  }, [planningTree])

  useEffect(() => {
    // Keep outline's scene nodes in sync with `scenes` (scenes are independent of vol/chap tree).
    setOutline((prev) => {
      const rest = prev.filter((n) => n.type !== "scene")
      const sceneNodes: OutlineNode[] = scenes.map((s) => ({
        id: s.id,
        title: s.title,
        type: "scene",
        status: "draft",
        summary: s.summary ?? "",
        children: undefined,
        collapsed: false,
      }))
      return [...sceneNodes, ...rest]
    })
  }, [scenes])

  const {
    applyRefToOutline,
    handleLinkRef,
    handleUnlinkRef,
    handleInjectRefToChat,
  } = useTuiyanReferenceActions({
    selectedOutlineId,
    planningSelectedNodeId,
    setWenCe,
    setActiveTab,
    setRightPanelTab,
    setChatInput,
    setLinkedRefWorkIds,
  })

  const {
    updatePolicy: updateReferencePolicy,
    setPrimaryRef: setPrimaryRefWork,
    updateBinding: updateReferenceBinding,
    toggleAspect: toggleReferenceAspect,
  } = useTuiyanReferenceConfig(setReferenceBindings, setReferencePolicy)

  if (pageLoading) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="mt-2 text-sm text-muted-foreground">加载中...</p>
        </div>
      </div>
    )
  }

  return (
    <>
    <div className="flex h-dvh flex-col bg-[radial-gradient(1200px_520px_at_10%_-20%,rgba(99,102,241,0.14),transparent),radial-gradient(900px_420px_at_95%_0%,rgba(16,185,129,0.1),transparent)] bg-background">
      <Dialog open={planningIdeaDialogOpen} onOpenChange={setPlanningIdeaDialogOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col gap-0 p-0 sm:max-w-4xl">
          <DialogHeader className="shrink-0 space-y-1 border-b border-border/40 px-6 py-4 text-left">
            <DialogTitle>作品构思</DialogTitle>
            <DialogDescription>
              可粘贴多段、几千字长文。关闭本窗口后内容会保留在右侧详情区，并随作品自动保存。
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-col gap-2 px-6 pb-4 pt-2">
            <Textarea
              value={planningIdea}
              onChange={(e) => setPlanningIdea(e.target.value)}
              placeholder="梗概、人设、矛盾、卷线、结局走向等均可写在这里…"
              className="min-h-[min(55vh,480px)] w-full resize-y text-sm leading-relaxed"
              disabled={!workId}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>约 {planningIdea.length} 字</span>
              <Button type="button" size="sm" variant="secondary" onClick={() => setPlanningIdeaDialogOpen(false)}>
                完成
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <TuiyanPlanningPushDialog
        open={planningPushDialogOpen}
        onOpenChange={setPlanningPushDialogOpen}
        candidates={planningPushCandidates}
        onConfirmPush={pushPlanningTreeToWriter}
      />

      <AlertDialog open={pushOverwriteConfirmOpen} onOpenChange={setPushOverwriteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>覆盖章纲快照</AlertDialogTitle>
            <AlertDialogDescription>
              写作页左侧「章纲」栏已有上一次推送的五层快照，继续推送会整体覆盖旧的快照。
              <br /><br />
              这只会更新「章纲」栏，不会动「章节正文」。是否继续？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingKnowledgeOpts(null)}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const opts = pendingKnowledgeOpts ?? { generateCharacters: false, generateTerms: false, levelFilter: [] }
                setPendingKnowledgeOpts(null)
                void doPushPlanningTree(opts)
              }}
            >
              确认覆盖
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TuiyanTopBar
        works={works}
        workId={workId}
        toolbarWorkTitle={toolbarWorkTitle}
        primaryTag={primaryTag}
        onSelectWork={(id) => {
          setWorkId(id)
          localStorage.setItem(LS_LAST_WORK, id)
        }}
        onGoLibrary={() => navigate("/library")}
        activeTab={activeTab}
        onChangeActiveTab={setActiveTab}
        workLinkSeg={workLinkSeg}
        shengHuiHref={shengHuiHref}
        autoLinkEnabled={autoLinkEnabled}
        onToggleAutoLink={toggleAutoLink}
        selectedAiModel={selectedAiModel}
        selectedModelId={selectedModelId}
        onSelectAiModel={handleSelectAiModel}
        showModelSelector={showModelSelector}
        onSetShowModelSelector={setShowModelSelector}
        isGenerating={isGenerating}
        onAiGenerate={() =>
          handleAiShortcut("请基于当前选中章节，推演三条可接续的剧情走向。")
        }
      />

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        <TuiyanLeftPlanningPanel
          show={showLeftPanel}
          width={leftPanelWidth}
          planningTree={planningTree}
          selectedNodeId={planningSelectedNodeId}
          expandedById={planningExpandedById}
          masterCount={planningMasterTotal}
          outlineCount={planningOutlineNodes.length}
          volumeCount={planningVolumeTotal}
          chapterOutlineCount={planningChapterOutlineTotal}
          onSelectNode={selectPlanningNode}
          onToggleExpand={togglePlanningExpand}
          onCollapse={() => setShowLeftPanel(false)}
          onExpand={() => setShowLeftPanel(true)}
          onBeginResize={(clientX) => beginPanelDrag("left", clientX)}
          onResetWidth={resetLeftPanelWidth}
        />

        <TuiyanCenterWorkspace
          activeTab={activeTab}
          workId={workId}
          outline={outline}
          planningTree={planningTree}
          planningSelectedNode={planningSelectedNode}
          planningSelectedDraft={planningSelectedDraft}
          planningSelectedNodeId={planningSelectedNodeId}
          planningNodeMap={planningNodeMap}
          planningMetaByNodeId={planningMetaByNodeId}
          planningStructuredMetaByNodeId={planningStructuredMetaByNodeId}
          planningBusyLevel={planningBusyLevel}
          chipLibRefreshKey={chipLibRefreshKey}
          onUpdatePlanningNodeTitle={updatePlanningNodeTitle}
          onUpdatePlanningNodeSummary={updatePlanningNodeSummary}
          onUpdatePlanningNodeDraft={updatePlanningNodeDraft}
          onUpdatePlanningNodeStructuredMeta={updatePlanningNodeStructuredMeta}
          onGenerateChapterDetail={(chapterNode) => void generatePlanningLevel("chapter_detail", chapterNode)}
          mmNodes={mmNodes}
          mmEdges={mmEdges}
          mmViewport={mmViewport}
          onSetMmNodes={(updater) => setMmNodes(updater)}
          onSetMmEdges={(updater) => setMmEdges(updater)}
          onSetMmViewport={setMmViewport}
          exportTitle={toolbarWorkTitle}
          onReloadMindmap={rebuildMindmapFromPlanning}
          wenCe={wenCe}
          planningNodeTitleById={planningNodeTitleById}
          onPinWenCe={handlePinWenCe}
          onCopyWenCe={handleCopyWenCe}
          onDeleteWenCe={handleDeleteWenCe}
          onCreateWenCe={handleCreateWenCe}
        />

        <TuiyanRightPanel
          show={showRightPanel}
          width={rightPanelWidth}
          activeTab={rightPanelTab}
          onChangeTab={setRightPanelTab}
          onCollapse={() => setShowRightPanel(false)}
          onExpand={() => setShowRightPanel(true)}
          onBeginResize={(clientX) => beginPanelDrag("right", clientX)}
          onResetWidth={resetRightPanelWidth}
          chatTabMenuActions={{
            onNewChat: () => {
              chatSessions.createNewThread()
              setRightPanelTab("chat")
            },
            onOpenHistory: () => {
              chatSessions.openHistory()
              setRightPanelTab("chat")
            },
          }}
          chat={(
            <div className="relative flex min-h-0 flex-1 flex-col">
              <TuiyanChatHistoryOverlay
                open={chatSessions.historyOpen}
                onClose={chatSessions.closeHistory}
                threads={chatSessions.threads}
                activeChatThreadId={chatSessions.activeChatThreadId}
                previewThreadId={chatSessions.historyPreviewThreadId}
                previewMessages={chatSessions.previewMessages}
                onSelectPreviewThread={chatSessions.selectHistoryPreview}
                onClearPreview={chatSessions.clearHistoryPreview}
              />
              <div
                className={cn(
                  "flex min-h-0 flex-1 flex-col",
                  chatSessions.historyOpen && "pointer-events-none invisible",
                )}
                aria-hidden={chatSessions.historyOpen}
              >
                <TuiyanChatPanel
                  planningSelectedNode={planningSelectedNode}
                  outlineNodeTitle={selectedNode?.title ?? null}
                  chatHistory={chatSessions.activeMessages}
                  isGenerating={isGenerating}
                  chatInput={chatInput}
                  setChatInput={setChatInput}
                  onSend={(text) => {
                    const msg: ChatMessage = {
                      id: `m${Date.now()}`,
                      role: "user",
                      content: text,
                      timestamp: new Date(),
                      relatedOutlineId: selectedOutlineId ?? undefined,
                    }
                    chatSessions.appendUserToActive(msg)
                    setChatInput("")
                    setRightPanelTab("chat")
                    void runBranchPredict(text, planningContext)
                  }}
                  onWriteToDraft={writeToAiPanelDraftAndOpenEditor}
                  onGoWence={goWenceWithPrefill}
                  chatScrollRef={chatScrollRef}
                />
              </div>
            </div>
          )}
          reference={(
            <TuiyanReferencePanel
              linkedRefWorkIds={linkedRefWorkIds}
              refLibrary={refLibrary}
              currentNodeKeywords={planningSelectedNode?.title ?? selectedNode?.title ?? ""}
              onLinkRef={handleLinkRef}
              onUnlinkRef={handleUnlinkRef}
              onApplyToOutline={(r) => { void applyRefToOutline(r) }}
              onInjectToChat={handleInjectRefToChat}
              referenceBindings={referenceBindings}
              referencePolicy={effectiveReferencePolicy}
              onUpdateReferencePolicy={updateReferencePolicy}
              onSetPrimaryRef={setPrimaryRefWork}
              onUpdateReferenceBinding={updateReferenceBinding}
              onToggleReferenceAspect={toggleReferenceAspect}
            />
          )}
          detail={(
            <TuiyanRightDetailTab
              unifiedPanelProps={{
                workId,
                planningMode,
                onPlanningModeChange: setPlanningMode,
                planningIdea,
                onPlanningIdeaChange: setPlanningIdea,
                onOpenBigIdeaDialog: () => setPlanningIdeaDialogOpen(true),
                selectedPromptTemplate,
                onPickPromptTemplate: setSelectedPromptTemplate,
                onClearPromptTemplate: () => setSelectedPromptTemplate(null),
                planningBusyLevel,
                genProgress,
                referenceAssemblySummaryLines,
                referenceAssemblyHardError,
                planningError,
                planningMasterTotal,
                planningOutlineNodesLength: planningOutlineNodes.length,
                planningVolumeTotal,
                planningChapterOutlineTotal,
                planningSelectedNode,
                planningSelectedMeta: planningSelectedNode ? planningMetaByNodeId[planningSelectedNode.id] : undefined,
                planningActiveOutline,
                planningActiveVolume,
                onUpdateSelectedNodeSummary: updatePlanningNodeSummary,
                onOpenPushDialog: () => setPlanningPushDialogOpen(true),
                onGenerateMasterOutline: () => void generatePlanningLevel("master_outline", null),
                onGenerateOutline: () => {
                  if (planningActiveMaster) void generatePlanningLevel("outline", planningActiveMaster)
                },
                onGenerateVolumeForActiveOutline: () => {
                  if (planningActiveOutline) void generatePlanningLevel("volume", planningActiveOutline)
                },
                onGenerateChapterOutlinesForActiveVolume: () => {
                  if (planningActiveVolume) void generatePlanningLevel("chapter_outline", planningActiveVolume)
                },
                planningScale,
                onPlanningScaleChange: handlePlanningScaleChange,
                planningOutlineTargetVolumesByNodeId,
                onPlanningOutlineTargetVolumesChange: handleOutlineTargetVolumesChange,
                planningVolumeTargetChaptersByNodeId,
                onPlanningVolumeTargetChaptersChange: handleVolumeTargetChaptersChange,
                volumeCountForActiveOutline,
                onGenerateVolume: (node) => void generatePlanningLevel("volume", node),
                onRegenerateMasterOutline: () => void generatePlanningLevel("master_outline", null),
                onRegenerateOutlineRoot: () => {
                  if (planningActiveMaster) void generatePlanningLevel("outline", planningActiveMaster)
                },
                onGenerateChapterOutlines: (node) => void generatePlanningLevel("chapter_outline", node),
                onRegenerateVolume: () => void regenerateCurrentVolume(),
                onGenerateChapterDetail: (node) => void generatePlanningLevel("chapter_detail", node),
                onRegenerateChapterOutlines: () => {
                  if (planningActiveVolume) void generatePlanningLevel("chapter_outline", planningActiveVolume)
                },
                onDeleteSelectedNode: () => {
                  if (!planningSelectedNode) return
                  setPlanningDeleteTarget({
                    type: "node",
                    nodeId: planningSelectedNode.id,
                    nodeTitle: planningSelectedNode.title || PLANNING_LEVEL_LABEL[planningSelectedNode.level],
                  })
                },
                onClearAllPlanning: () => setPlanningDeleteTarget({ type: "all" }),
                onCancelPlanningGeneration: cancelPlanningGeneration,
              }}
              selectedOutlineNode={selectedNode}
              onSelectOutlineNode={setSelectedOutlineId}
            />
          )}
        />
      </div>
    </div>

    <PlanningDeleteConfirmDialog
      target={planningDeleteTarget}
      onConfirm={(target) => {
        executePlanningDelete(target)
        setPlanningDeleteTarget(null)
      }}
      onCancel={() => setPlanningDeleteTarget(null)}
    />

    <TuiyanPostPlanningKnowledgeDialog
      open={postPlanningKnowledgeOpen}
      busy={postPlanningKnowledgeBusy}
      level={postPlanningKnowledgeLevel}
      onOpenChange={onPostPlanningOpenChange}
      onSkip={onPostPlanningSkip}
      onEnrich={onPostPlanningEnrich}
    />
    </>
  )
}
