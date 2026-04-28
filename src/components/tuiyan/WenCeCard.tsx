import { Copy, Lightbulb, Milestone, MoreHorizontal, Pencil, Pin, PinOff, Sparkles, Target, Trash2, Link2 } from "lucide-react"
import { cn } from "../../lib/utils"
import { Badge } from "../ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu"
import type { TuiyanWenCeStored, TuiyanWenCeType } from "../../db/types"

/**
 * 文策日志条目（页面内存形式）：与 `TuiyanWenCeStored` 结构相同，
 * 但 `timestamp` 用 `Date` 实例方便 UI 直接 toLocaleString。
 */
export type WenCeEntry = Omit<TuiyanWenCeStored, "timestamp"> & { timestamp: Date }

const TYPE_CONFIG: Record<
  TuiyanWenCeType,
  { icon: typeof Target; color: string; bg: string; label: string }
> = {
  decision: { icon: Target, color: "text-primary", bg: "bg-primary/10", label: "决策" },
  revision: { icon: Pencil, color: "text-amber-400", bg: "bg-amber-500/10", label: "修订" },
  ai_suggestion: { icon: Sparkles, color: "text-purple-400", bg: "bg-purple-500/10", label: "AI建议" },
  user_note: { icon: Lightbulb, color: "text-emerald-400", bg: "bg-emerald-500/10", label: "灵感" },
  milestone: { icon: Milestone, color: "text-primary", bg: "bg-primary/10", label: "里程碑" },
}

export type WenCeCardProps = {
  entry: WenCeEntry
  onPin: (id: string) => void
  onCopy?: (id: string) => void
  onDelete?: (id: string) => void
  /** 当条目绑定到了某个五层规划节点时，可传入节点标题用于标签展示 */
  planningNodeTitle?: string | null
}

export function WenCeCard({ entry, onPin, onCopy, onDelete, planningNodeTitle }: WenCeCardProps) {
  const config = TYPE_CONFIG[entry.type]
  const TypeIcon = config.icon

  return (
    <div
      className={cn(
        "group relative rounded-xl border border-border/40 bg-card/30 p-4 transition-all hover:border-border/60",
        entry.isPinned && "ring-1 ring-primary/30",
      )}
    >
      {entry.isPinned && (
        <div className="absolute -top-2 -right-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Pin className="h-3 w-3" />
          </div>
        </div>
      )}

      <div className="flex items-start gap-3">
        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", config.bg)}>
          <TypeIcon className={cn("h-4 w-4", config.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className={cn("h-5 text-[10px]", config.bg, config.color)}>
              {config.label}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {entry.timestamp.toLocaleDateString("zh-CN")}{" "}
              {entry.timestamp.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
            </span>
            {planningNodeTitle && (
              <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                <Link2 className="h-3 w-3" />
                {planningNodeTitle}
              </span>
            )}
          </div>
          <h4 className="mt-1 font-medium text-foreground">{entry.title}</h4>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-6 w-6 items-center justify-center rounded opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
              aria-label="操作"
            >
              <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onPin(entry.id)}>
              {entry.isPinned ? (
                <>
                  <PinOff className="mr-2 h-4 w-4" />
                  取消置顶
                </>
              ) : (
                <>
                  <Pin className="mr-2 h-4 w-4" />
                  置顶
                </>
              )}
            </DropdownMenuItem>
            {onCopy && (
              <DropdownMenuItem onClick={() => onCopy(entry.id)}>
                <Copy className="mr-2 h-4 w-4" />
                复制内容
              </DropdownMenuItem>
            )}
            {onDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onClick={() => onDelete(entry.id)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  删除
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground leading-relaxed">
        {entry.content}
      </p>

      {entry.tags && entry.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {entry.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
