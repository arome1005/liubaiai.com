import { useMemo, useState } from "react"
import { History, Pin, Plus } from "lucide-react"
import { cn } from "../../lib/utils"
import { Button } from "../ui/button"
import { ScrollArea } from "../ui/scroll-area"
import { WenCeCard, type WenCeEntry } from "./WenCeCard"
import type { TuiyanWenCeType } from "../../db/types"

type FilterValue = "all" | TuiyanWenCeType

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "decision", label: "决策" },
  { value: "revision", label: "修订" },
  { value: "ai_suggestion", label: "AI建议" },
  { value: "user_note", label: "灵感" },
  { value: "milestone", label: "里程碑" },
]

export type TuiyanWenceTabProps = {
  entries: WenCeEntry[]
  /** 当前选中的五层规划节点（用于「新建记录」时自动绑定 + 卡片展示标签） */
  planningSelectedNodeId?: string | null
  planningSelectedNodeTitle?: string | null
  /** 五层规划节点 id → 节点标题，用于在卡片上显示绑定关系；可不传 */
  planningNodeTitleById?: Map<string, string>
  onPin: (id: string) => void
  onCopy?: (id: string) => void
  onDelete?: (id: string) => void
  /** 新建记录；如果传了 `planningSelectedNodeId`，会自动绑定到当前节点 */
  onCreateEntry: (entry: WenCeEntry) => void
}

function makeId(): string {
  return `wc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function TuiyanWenceTab({
  entries,
  planningSelectedNodeId,
  planningSelectedNodeTitle,
  planningNodeTitleById,
  onPin,
  onCopy,
  onDelete,
  onCreateEntry,
}: TuiyanWenceTabProps) {
  const [filter, setFilter] = useState<FilterValue>("all")

  const filtered = useMemo(() => {
    return filter === "all" ? entries : entries.filter((e) => e.type === filter)
  }, [filter, entries])

  const pinned = useMemo(() => filtered.filter((e) => e.isPinned), [filtered])
  const timeline = useMemo(
    () => filtered.filter((e) => !e.isPinned).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()),
    [filtered],
  )

  const titleFor = (entry: WenCeEntry): string | null => {
    if (!entry.planningNodeId) return null
    return planningNodeTitleById?.get(entry.planningNodeId) ?? null
  }

  const handleCreate = () => {
    const ts = new Date()
    const titleSuffix = planningSelectedNodeTitle ? `：${planningSelectedNodeTitle}` : ""
    onCreateEntry({
      id: makeId(),
      timestamp: ts,
      type: "user_note",
      title: `新记录${titleSuffix}`,
      content: "",
      planningNodeId: planningSelectedNodeId ?? undefined,
      tags: [],
    })
  }

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-foreground">文策日志</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              记录创作决策、修订历史与 AI 建议，形成可追溯的写作脉络
            </p>
          </div>
          <Button size="sm" className="gap-2" type="button" onClick={handleCreate}>
            <Plus className="h-4 w-4" />
            新建记录
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg bg-muted/30 p-0.5">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                className={cn(
                  "rounded-md px-3 py-1 text-sm transition-colors",
                  filter === f.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          {filter !== "all" && (
            <span className="text-xs text-muted-foreground">
              共 {filtered.length} 条
            </span>
          )}
        </div>

        {pinned.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Pin className="h-4 w-4" />
              置顶记录
            </h3>
            {pinned.map((entry) => (
              <WenCeCard
                key={entry.id}
                entry={entry}
                onPin={onPin}
                onCopy={onCopy}
                onDelete={onDelete}
                planningNodeTitle={titleFor(entry)}
              />
            ))}
          </div>
        )}

        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <History className="h-4 w-4" />
            时间线
          </h3>
          {timeline.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border/40 bg-card/20 p-6 text-center text-xs text-muted-foreground">
              {filter === "all"
                ? "暂无文策记录。点击右上角「新建记录」开始记录决策与灵感。"
                : "当前筛选下暂无记录。"}
            </p>
          ) : (
            timeline.map((entry) => (
              <WenCeCard
                key={entry.id}
                entry={entry}
                onPin={onPin}
                onCopy={onCopy}
                onDelete={onDelete}
                planningNodeTitle={titleFor(entry)}
              />
            ))
          )}
        </div>
      </div>
    </ScrollArea>
  )
}
