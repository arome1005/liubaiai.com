import { PanelLeft, PanelLeftClose } from "lucide-react"
import type { TuiyanPlanningNode } from "../../db/types"
import { Button } from "../ui/button"
import { ScrollArea } from "../ui/scroll-area"
import { TuiyanPlanningStatsInline } from "./TuiyanPlanningStatsInline"
import { TuiyanPlanningTree } from "./TuiyanPlanningTree"

export type TuiyanLeftPlanningPanelProps = {
  show: boolean
  width: number
  planningTree: TuiyanPlanningNode[]
  selectedNodeId: string | null
  expandedById: Record<string, boolean>
  masterCount: number
  outlineCount: number
  volumeCount: number
  chapterOutlineCount: number
  onSelectNode: (id: string) => void
  onToggleExpand: (id: string) => void
  onCollapse: () => void
  onExpand: () => void
  onBeginResize: (clientX: number) => void
  onResetWidth: () => void
}

/** 左侧「五层规划树」工作区：只负责展示、选择、折叠与宽度拖拽入口。 */
export function TuiyanLeftPlanningPanel(props: TuiyanLeftPlanningPanelProps) {
  const {
    show,
    width,
    planningTree,
    selectedNodeId,
    expandedById,
    masterCount,
    outlineCount,
    volumeCount,
    chapterOutlineCount,
    onSelectNode,
    onToggleExpand,
    onCollapse,
    onExpand,
    onBeginResize,
    onResetWidth,
  } = props

  if (!show) {
    return (
      <div className="flex w-8 shrink-0 items-start border-r border-border/40 bg-card/25 pt-2">
        <Button
          variant="ghost"
          size="sm"
          className="mx-auto h-7 w-7 p-0"
          type="button"
          title="展开左侧栏"
          onClick={onExpand}
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  return (
    <>
      <div
        className="flex h-full min-h-0 min-w-[18rem] flex-shrink-0 flex-col border-r border-border/40 bg-card/35 backdrop-blur-sm"
        style={{ width: `${width}px` }}
      >
        <div className="flex min-h-0 items-center gap-2 border-b border-border/40 bg-card/55 px-2.5 py-1.5">
          <p className="shrink-0 text-xs font-medium text-foreground">规划章纲</p>
          <div className="min-w-0 flex-1">
            <TuiyanPlanningStatsInline
              masterCount={masterCount}
              outlineCount={outlineCount}
              volumeCount={volumeCount}
              chapterOutlineCount={chapterOutlineCount}
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 shrink-0 p-0"
            type="button"
            title="收起左侧栏"
            onClick={onCollapse}
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="min-h-0 flex-1 overflow-hidden">
          <div className="p-2 pb-3">
            <TuiyanPlanningTree
              tree={planningTree}
              selectedId={selectedNodeId}
              onSelectNode={onSelectNode}
              expandedById={expandedById}
              onToggleExpand={onToggleExpand}
            />
          </div>
        </ScrollArea>
      </div>

      <div
        className="group relative z-10 w-1.5 shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-primary/35"
        role="separator"
        aria-orientation="vertical"
        aria-label="调整左侧栏宽度"
        title="拖拽调整宽度；双击恢复默认"
        onMouseDown={(e) => {
          e.preventDefault()
          onBeginResize(e.clientX)
        }}
        onDoubleClick={onResetWidth}
      />
    </>
  )
}
