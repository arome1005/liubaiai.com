import { useMemo, useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { cn } from "../../lib/utils"
import type { TuiyanPlanningLevel, TuiyanPushedOutlineEntry } from "../../db/types"
import { PLANNING_LEVEL_LABEL } from "../../util/tuiyan-planning"

type TreeNode = TuiyanPushedOutlineEntry & { children: TreeNode[] }

function buildTree(entries: TuiyanPushedOutlineEntry[]): TreeNode[] {
  const byId = new Map<string, TreeNode>()
  for (const e of entries) byId.set(e.id, { ...e, children: [] })
  const roots: TreeNode[] = []
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }
  const sortRec = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.order - b.order)
    for (const n of nodes) sortRec(n.children)
  }
  sortRec(roots)
  return roots
}

function planningTreeDisplayTitle(title: string) {
  const trimmed = (title ?? "").trim()
  const [head] = trimmed.split(/[：:]/, 1)
  return (head?.trim() || trimmed || "未命名").slice(0, 32)
}

const LEVEL_DOT_COLOR: Record<TuiyanPlanningLevel, string> = {
  master_outline: "bg-primary",
  outline: "bg-primary/80",
  volume: "bg-amber-400",
  chapter_outline: "bg-sky-400",
  chapter_detail: "bg-muted-foreground",
}

export type PushedOutlineTreeProps = {
  entries: TuiyanPushedOutlineEntry[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export function PushedOutlineTree({ entries, selectedId, onSelect }: PushedOutlineTreeProps) {
  const tree = useMemo(() => buildTree(entries), [entries])
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const toggle = (id: string) => setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }))

  if (entries.length === 0) {
    return (
      <div className="px-3 py-8 text-center text-xs text-muted-foreground">
        暂无推演章纲。
        <br />
        请在「推演」页点击右侧「推送到写作章纲」。
      </div>
    )
  }

  return (
    <div className="px-1 py-2 text-sm text-foreground">
      <div className="mb-1 px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        推演章纲快照（只读）
      </div>
      {tree.map((root) => (
        <Row
          key={root.id}
          node={root}
          depth={0}
          collapsed={collapsed}
          toggle={toggle}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

function Row({
  node,
  depth,
  collapsed,
  toggle,
  selectedId,
  onSelect,
}: {
  node: TreeNode
  depth: number
  collapsed: Record<string, boolean>
  toggle: (id: string) => void
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const isCollapsed = !!collapsed[node.id]
  const hasChildren = node.children.length > 0
  const isSelected = selectedId === node.id
  const display = planningTreeDisplayTitle(node.title)
  return (
    <div>
      <button
        type="button"
        className={cn(
          "group flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-xs transition-colors",
          isSelected ? "bg-primary/15 text-foreground" : "hover:bg-muted/30 text-foreground/85",
        )}
        style={{ paddingLeft: depth * 12 + 4 }}
        onClick={() => onSelect(node.id)}
      >
        {hasChildren ? (
          <span
            role="button"
            aria-label={isCollapsed ? "展开" : "折叠"}
            onClick={(e) => {
              e.stopPropagation()
              toggle(node.id)
            }}
            className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
          >
            {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </span>
        ) : (
          <span className="inline-block h-4 w-4 shrink-0" />
        )}
        <span className={cn("inline-block h-1.5 w-1.5 shrink-0 rounded-full", LEVEL_DOT_COLOR[node.level])} />
        <span className="min-w-0 flex-1 truncate">{display}</span>
        <span className="shrink-0 rounded-full border border-border/40 bg-background/30 px-1.5 py-[1px] text-[9px] text-muted-foreground">
          {PLANNING_LEVEL_LABEL[node.level]}
        </span>
      </button>
      {hasChildren && !isCollapsed && (
        <div>
          {node.children.map((child) => (
            <Row
              key={child.id}
              node={child}
              depth={depth + 1}
              collapsed={collapsed}
              toggle={toggle}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
}
