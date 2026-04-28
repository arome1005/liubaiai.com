import { BookOpen, List } from "lucide-react"
import type { Edge, Node, Viewport } from "reactflow"
import type {
  PlanningNodeStructuredMeta,
  TuiyanPlanningLevel,
  TuiyanPlanningMeta,
  TuiyanPlanningNode,
} from "../../db/types"
import type { WenCeEntry } from "./WenCeCard"
import { ScrollArea } from "../ui/scroll-area"
import { TuiyanMindmapTab } from "./TuiyanMindmapTab"
import { TuiyanPlanningNodeCenterEditor } from "./TuiyanPlanningNodeCenterEditor"
import { TuiyanWenceTab } from "./TuiyanWenceTab"

export type TuiyanCenterTab = "outline" | "mindmap" | "wence"

export type TuiyanCenterOutlineNode = {
  id: string
  title: string
  type: string
}

export type TuiyanCenterWorkspaceProps = {
  activeTab: TuiyanCenterTab
  workId: string | null
  outline: TuiyanCenterOutlineNode[]
  planningTree: TuiyanPlanningNode[]

  planningSelectedNode: TuiyanPlanningNode | null
  planningSelectedDraft: string
  planningSelectedNodeId: string | null
  planningNodeMap: Map<string, TuiyanPlanningNode>
  planningMetaByNodeId: Record<string, TuiyanPlanningMeta>
  planningStructuredMetaByNodeId: Record<string, PlanningNodeStructuredMeta>
  planningBusyLevel: TuiyanPlanningLevel | null
  chipLibRefreshKey: number
  onUpdatePlanningNodeTitle: (nodeId: string, value: string) => void
  onUpdatePlanningNodeSummary: (nodeId: string, value: string) => void
  onUpdatePlanningNodeDraft: (nodeId: string, value: string) => void
  onUpdatePlanningNodeStructuredMeta: (
    nodeId: string,
    patch: Partial<PlanningNodeStructuredMeta>,
  ) => void
  onGenerateChapterDetail: (node: TuiyanPlanningNode) => void

  mmNodes: Node[]
  mmEdges: Edge[]
  mmViewport: Viewport
  onSetMmNodes: (updater: (prev: Node[]) => Node[]) => void
  onSetMmEdges: (updater: (prev: Edge[]) => Edge[]) => void
  onSetMmViewport: (viewport: Viewport) => void
  exportTitle: string
  onReloadMindmap: () => void

  wenCe: WenCeEntry[]
  planningNodeTitleById: Map<string, string>
  onPinWenCe: (id: string) => void
  onCopyWenCe: (id: string) => void
  onDeleteWenCe: (id: string) => void
  onCreateWenCe: (entry: WenCeEntry) => void
}

/** 中区工作台：大纲编辑 / 导图 / 文策三个 tab 的纯区域编排。 */
export function TuiyanCenterWorkspace(props: TuiyanCenterWorkspaceProps) {
  const {
    activeTab,
    workId,
    outline,
    planningTree,
    planningSelectedNode,
    planningSelectedDraft,
    planningSelectedNodeId,
    planningNodeMap,
    planningMetaByNodeId,
    planningStructuredMetaByNodeId,
    planningBusyLevel,
    chipLibRefreshKey,
    onUpdatePlanningNodeTitle,
    onUpdatePlanningNodeSummary,
    onUpdatePlanningNodeDraft,
    onUpdatePlanningNodeStructuredMeta,
    onGenerateChapterDetail,
    mmNodes,
    mmEdges,
    mmViewport,
    onSetMmNodes,
    onSetMmEdges,
    onSetMmViewport,
    exportTitle,
    onReloadMindmap,
    wenCe,
    planningNodeTitleById,
    onPinWenCe,
    onCopyWenCe,
    onDeleteWenCe,
    onCreateWenCe,
  } = props

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-card/10">
      {activeTab === "outline" && planningSelectedNode && (
        <ScrollArea className="min-h-0 flex-1">
          <TuiyanPlanningNodeCenterEditor
            node={planningSelectedNode}
            meta={planningMetaByNodeId[planningSelectedNode.id]}
            structuredMeta={planningStructuredMetaByNodeId[planningSelectedNode.id]}
            draftText={planningSelectedDraft}
            disabled={!workId}
            planningBusyLevel={planningBusyLevel}
            parentChapterNode={
              planningSelectedNode.level === "chapter_detail" && planningSelectedNode.parentId
                ? (planningNodeMap.get(planningSelectedNode.parentId) ?? null)
                : null
            }
            onTitleChange={onUpdatePlanningNodeTitle}
            onSummaryChange={onUpdatePlanningNodeSummary}
            onDraftChange={onUpdatePlanningNodeDraft}
            onStructuredMetaChange={onUpdatePlanningNodeStructuredMeta}
            workId={workId}
            onRegenerateChapterDetail={onGenerateChapterDetail}
            libraryRefreshKey={chipLibRefreshKey}
          />
        </ScrollArea>
      )}
      {activeTab === "outline" && !planningSelectedNode && workId && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
          <List className="h-10 w-10 opacity-40" />
          <p>请从左侧规划树选择节点。</p>
          <p className="max-w-sm text-xs leading-relaxed text-muted-foreground/90">
            作品构思与「生成总纲 / 一级大纲 / 卷纲 / 章纲」在右侧辅助栏「详情」顶部；本页中间用于编辑当前选中节点的摘要与细纲。
          </p>
          {outline.length === 0 ? (
            <p className="max-w-sm text-xs leading-relaxed">
              当前作品尚无写作卷章，不影响在此做五层规划；需要导图或推送正文时，请先在写作页创建卷与章节。
            </p>
          ) : null}
        </div>
      )}
      {activeTab === "outline" && !planningSelectedNode && !workId && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
          <BookOpen className="h-10 w-10 opacity-40" />
          <p>请从顶部选择作品以开始推演。</p>
        </div>
      )}

      {activeTab === "mindmap" && (
        <TuiyanMindmapTab
          outlineEmpty={outline.length === 0 && planningTree.length === 0}
          nodes={mmNodes}
          edges={mmEdges}
          viewport={mmViewport}
          onNodesChange={onSetMmNodes}
          onEdgesChange={onSetMmEdges}
          onViewportChange={onSetMmViewport}
          exportTitle={exportTitle}
          canReload={!!workId}
          onReload={onReloadMindmap}
        />
      )}

      {activeTab === "wence" && (
        <TuiyanWenceTab
          entries={wenCe}
          planningSelectedNodeId={planningSelectedNodeId}
          planningSelectedNodeTitle={planningSelectedNode?.title ?? null}
          planningNodeTitleById={planningNodeTitleById}
          onPin={onPinWenCe}
          onCopy={onCopyWenCe}
          onDelete={onDeleteWenCe}
          onCreateEntry={onCreateWenCe}
        />
      )}
    </div>
  )
}
