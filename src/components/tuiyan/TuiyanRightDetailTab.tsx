import { ChevronRight, FileText } from "lucide-react"
import type { TuiyanPlanningUnifiedPanelProps } from "./TuiyanPlanningUnifiedPanel"
import { TuiyanPlanningUnifiedPanel } from "./TuiyanPlanningUnifiedPanel"
import { ScrollArea } from "../ui/scroll-area"

export type TuiyanRightDetailOutlineNode = {
  id: string
  title: string
  children?: TuiyanRightDetailOutlineNode[]
}

export type TuiyanRightDetailTabProps = {
  unifiedPanelProps: TuiyanPlanningUnifiedPanelProps
  selectedOutlineNode: TuiyanRightDetailOutlineNode | null
  onSelectOutlineNode: (id: string) => void
}

/** 右栏「详情」Tab：规划详情卡 + 当前 outline 节点子项快捷跳转。 */
export function TuiyanRightDetailTab({
  unifiedPanelProps,
  selectedOutlineNode,
  onSelectOutlineNode,
}: TuiyanRightDetailTabProps) {
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="space-y-4 p-4">
        <TuiyanPlanningUnifiedPanel {...unifiedPanelProps} />
        {selectedOutlineNode?.children?.length ? (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-foreground">
              子项 ({selectedOutlineNode.children.length})
            </h3>
            <div className="space-y-2">
              {selectedOutlineNode.children.map((child) => (
                <button
                  key={child.id}
                  className="flex w-full items-center gap-2 rounded-lg border border-border/40 bg-card/30 p-3 text-left transition-colors hover:bg-card/50"
                  onClick={() => onSelectOutlineNode(child.id)}
                >
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 truncate text-sm text-foreground">
                    {child.title}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </ScrollArea>
  )
}
