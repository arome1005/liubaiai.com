import type { TuiyanPlanningLevel, TuiyanPlanningNode } from "../../db/types"
import { listPlanningChildren } from "../../util/tuiyan-planning"
import { cn } from "../../lib/utils"
import { BookOpen, ChevronDown, ChevronRight, FileText, Milestone, Sparkles } from "lucide-react"

function planningChildLevel(level: TuiyanPlanningLevel): TuiyanPlanningLevel | null {
  if (level === "master_outline") return "outline"
  if (level === "outline") return "volume"
  if (level === "volume") return "chapter_outline"
  if (level === "chapter_outline") return "chapter_detail"
  return null
}

function planningLevelIcon(level: TuiyanPlanningLevel) {
  if (level === "master_outline") return Sparkles
  if (level === "outline") return Milestone
  if (level === "volume") return BookOpen
  if (level === "chapter_outline") return FileText
  return Sparkles
}

function planningTreeDisplayTitle(title: string) {
  const trimmed = title.trim()
  const [head] = trimmed.split(/[：:]/, 1)
  return head?.trim() || trimmed
}

export type TuiyanPlanningTreeProps = {
  tree: TuiyanPlanningNode[]
  selectedId: string | null
  onSelectNode: (id: string) => void
  expandedById: Record<string, boolean>
  onToggleExpand: (id: string) => void
}

function isPlanningRowExpanded(expandedById: Record<string, boolean>, id: string) {
  return expandedById[id] !== false
}

function PlanningRow({
  tree,
  node,
  depth,
  selectedId,
  onSelectNode,
  expandedById,
  onToggleExpand,
}: {
  tree: TuiyanPlanningNode[]
  node: TuiyanPlanningNode
  depth: number
  selectedId: string | null
  onSelectNode: (id: string) => void
  expandedById: Record<string, boolean>
  onToggleExpand: (id: string) => void
}) {
  const childLevel = planningChildLevel(node.level)
  const children = childLevel ? listPlanningChildren(tree, node.id, childLevel) : []
  const hasChildren = children.length > 0
  const expanded = isPlanningRowExpanded(expandedById, node.id)
  const isSelected = selectedId === node.id
  const TypeIcon = planningLevelIcon(node.level)
  const displayTitle = planningTreeDisplayTitle(node.title)

  return (
    <div>
      <div
        className={cn(
          "group flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 transition-colors",
          isSelected ? "bg-primary/10" : "hover:bg-muted/50",
          depth > 0 && "ml-3",
        )}
        onClick={() => onSelectNode(node.id)}
      >
        {hasChildren ? (
          <button
            type="button"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-muted"
            onClick={(e) => {
              e.stopPropagation()
              onToggleExpand(node.id)
            }}
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <TypeIcon
          className={cn(
            "h-4 w-4 shrink-0",
            node.level === "master_outline" && "text-primary",
            node.level === "outline" && "text-primary",
            node.level === "volume" && "text-primary",
            node.level === "chapter_outline" && "text-muted-foreground",
            node.level === "chapter_detail" && "text-amber-400/90",
          )}
        />
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[11px]",
            isSelected ? "font-medium text-foreground" : "text-foreground/85",
          )}
        >
          {displayTitle}
        </span>
      </div>
      {hasChildren && expanded && (
        <div className="ml-[10px] border-l border-border/30 pl-1">
          {children.map((ch) => (
            <PlanningRow
              key={ch.id}
              tree={tree}
              node={ch}
              depth={depth + 1}
              selectedId={selectedId}
              onSelectNode={onSelectNode}
              expandedById={expandedById}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * 五层规划：总纲 → 一级大纲 → 卷纲 → 章细纲 →（可选）详细细纲，树形折叠。
 */
export function TuiyanPlanningTree({
  tree,
  selectedId,
  onSelectNode,
  expandedById,
  onToggleExpand,
}: TuiyanPlanningTreeProps) {
  const masterRoots = listPlanningChildren(tree, null, "master_outline")
  const roots = masterRoots.length > 0 ? masterRoots : listPlanningChildren(tree, null, "outline")
  if (roots.length === 0) {
    return (
      <p className="px-1 text-[10px] leading-relaxed text-muted-foreground">
        生成总纲后，将在此以树形展示：总纲 → 一级大纲 → 卷纲 → 章细纲（可折叠）。
      </p>
    )
  }
  return (
    <div className="space-y-0.5">
      {roots.map((node) => (
        <PlanningRow
          key={node.id}
          tree={tree}
          node={node}
          depth={0}
          selectedId={selectedId}
          onSelectNode={onSelectNode}
          expandedById={expandedById}
          onToggleExpand={onToggleExpand}
        />
      ))}
    </div>
  )
}
