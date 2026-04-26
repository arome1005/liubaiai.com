import { useEffect, useMemo, useState } from "react"
import { Button } from "../ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog"
import { ScrollArea } from "../ui/scroll-area"
import { cn } from "../../lib/utils"
import type { TuiyanPlanningLevel, TuiyanPushedOutlineEntry } from "../../db/types"
import { PLANNING_LEVEL_LABEL } from "../../util/tuiyan-planning"
import { ChevronDown, ChevronRight } from "lucide-react"
import { StructuredMetaPreview } from "./StructuredMetaPreview"

type TreeNode = TuiyanPushedOutlineEntry & { children: TreeNode[] }

function buildTree(entries: TuiyanPushedOutlineEntry[]): TreeNode[] {
  const byId = new Map<string, TreeNode>()
  for (const e of entries) byId.set(e.id, { ...e, children: [] })
  const roots: TreeNode[] = []
  for (const n of byId.values()) {
    if (n.parentId && byId.has(n.parentId)) byId.get(n.parentId)!.children.push(n)
    else roots.push(n)
  }
  const sortRec = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.order - b.order)
    for (const n of nodes) sortRec(n.children)
  }
  sortRec(roots)
  return roots
}

const LEVEL_DOT: Record<TuiyanPlanningLevel, string> = {
  master_outline: "bg-primary",
  outline: "bg-primary/80",
  volume: "bg-amber-400",
  chapter_outline: "bg-sky-400",
  chapter_detail: "bg-muted-foreground",
}

function planningDisplayTitle(title: string) {
  const trimmed = (title ?? "").trim()
  const [head] = trimmed.split(/[：:]/, 1)
  return (head?.trim() || trimmed || "未命名").slice(0, 48)
}

export type PullOutlineDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  entries: TuiyanPushedOutlineEntry[]
  /** 初始选中；通常传写作编辑页左侧章纲树里当前选中的节点 id */
  initialSelectedId?: string | null
  onConfirm: (entry: TuiyanPushedOutlineEntry) => void
  /** 是否已打开写作章节；false 时确认按钮禁用并提示 */
  hasActiveChapter?: boolean
}

export function PullOutlineDialog({
  open,
  onOpenChange,
  entries,
  initialSelectedId,
  onConfirm,
  hasActiveChapter = true,
}: PullOutlineDialogProps) {
  const tree = useMemo(() => buildTree(entries), [entries])
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!open) return
    setSelectedId(initialSelectedId ?? null)
    setCollapsed({})
  }, [open, initialSelectedId])

  const selected = useMemo(
    () => entries.find((e) => e.id === selectedId) ?? null,
    [entries, selectedId],
  )

  const toggle = (id: string) => setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }))

  const confirm = () => {
    if (!selected) return
    onConfirm(selected)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(86vh,780px)] w-[min(96vw,1080px)] max-w-none flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border/40 px-6 py-4 text-left">
          <DialogTitle>从章纲拉取内容 → 本章细纲 / 剧情构思</DialogTitle>
          <DialogDescription>
            在左侧五层树里点任一节点，右侧查看内容，确认后把该节点内容灌到右侧 AI 面板「本章细纲 / 剧情构思」输入框。推荐选「详细细纲」（约 500–1200 字）。
          </DialogDescription>
        </DialogHeader>
        {entries.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-10 text-sm text-muted-foreground">
            章纲树为空。请先到「推演」页生成规划并推送到写作章纲。
          </div>
        ) : (
          <div className="flex min-h-0 flex-1">
            <div className="flex w-[40%] min-w-[260px] flex-col border-r border-border/40">
              <div className="shrink-0 border-b border-border/40 px-4 py-2 text-xs text-muted-foreground">
                章纲树
              </div>
              <ScrollArea className="min-h-0 flex-1">
                <div className="p-2">
                  {tree.map((root) => (
                    <Row
                      key={root.id}
                      node={root}
                      depth={0}
                      collapsed={collapsed}
                      toggle={toggle}
                      selectedId={selectedId}
                      onSelect={setSelectedId}
                    />
                  ))}
                </div>
              </ScrollArea>
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="shrink-0 border-b border-border/40 px-4 py-2 text-xs text-muted-foreground">
                节点预览
              </div>
              <ScrollArea className="min-h-0 flex-1">
                <div className="p-5">
                  {selected ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center rounded-full border border-border/40 bg-background/40 px-2 py-0.5 text-[11px] text-muted-foreground">
                          {PLANNING_LEVEL_LABEL[selected.level]}
                        </span>
                        <span className="text-base font-medium text-foreground">
                          {selected.title || "未命名"}
                        </span>
                        <span className="ml-auto text-[11px] text-muted-foreground">
                          {(selected.content ?? "").length.toLocaleString()} 字
                        </span>
                      </div>
                      {(selected.content ?? "").trim() ? (
                        <pre className="whitespace-pre-wrap rounded-lg border border-border/40 bg-background/30 p-3 font-sans text-[13px] leading-relaxed text-foreground/90">
                          {selected.content}
                        </pre>
                      ) : (
                        <div className="rounded-lg border border-dashed border-border/40 p-4 text-center text-xs text-muted-foreground">
                          该节点暂无内容，换一个试试。
                        </div>
                      )}
                      {selected.structuredMeta && (
                        <StructuredMetaPreview meta={selected.structuredMeta} level={selected.level} />
                      )}
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-center p-10 text-sm text-muted-foreground">
                      请在左侧选一个节点
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        )}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/40 px-6 py-4">
          <div className="text-xs text-muted-foreground">
            {!hasActiveChapter
              ? "请先在「章节正文」里打开一个章节，再拉取内容"
              : selected
                ? `已选：${PLANNING_LEVEL_LABEL[selected.level]}｜${planningDisplayTitle(selected.title)}`
                : "尚未选择任何节点"}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button
              type="button"
              onClick={confirm}
              disabled={!hasActiveChapter || !selected || !(selected.content ?? "").trim()}
            >
              确认拉取到本章细纲
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
  const hasChildren = node.children.length > 0
  const isCollapsed = !!collapsed[node.id]
  const isSelected = selectedId === node.id
  const display = planningDisplayTitle(node.title)
  return (
    <div>
      <button
        type="button"
        className={cn(
          "group flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-xs transition-colors",
          isSelected ? "bg-primary/20 text-foreground" : "hover:bg-muted/30 text-foreground/85",
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
        <span className={cn("inline-block h-1.5 w-1.5 shrink-0 rounded-full", LEVEL_DOT[node.level])} />
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
