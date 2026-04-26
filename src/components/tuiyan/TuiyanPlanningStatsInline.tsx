import { BookOpen, FileText, Milestone, Sparkles } from "lucide-react"
import { cn } from "../../lib/utils"

export type TuiyanPlanningStatsInlineProps = {
  masterCount: number
  outlineCount: number
  volumeCount: number
  chapterOutlineCount: number
  className?: string
}

/** 推演左栏顶栏：规划树一级纲 / 卷 / 章细纲数量（与写作大纲卷章统计解耦）。 */
export function TuiyanPlanningStatsInline({
  masterCount,
  outlineCount,
  volumeCount,
  chapterOutlineCount,
  className,
}: TuiyanPlanningStatsInlineProps) {
  const items = [
    { icon: Sparkles, n: masterCount, unit: "总", iconClass: "text-primary" },
    { icon: Milestone, n: outlineCount, unit: "纲", iconClass: "text-primary" },
    { icon: BookOpen, n: volumeCount, unit: "卷", iconClass: "text-amber-400" },
    { icon: FileText, n: chapterOutlineCount, unit: "章", iconClass: "text-muted-foreground" },
  ] as const

  return (
    <div
      className={cn(
        "flex min-w-0 max-w-full flex-wrap items-center justify-end gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground",
        className,
      )}
      title="规划树：总纲 / 一级纲 / 卷 / 章细纲节点数"
    >
      {items.map((it) => {
        const Icon = it.icon
        return (
          <span key={it.unit} className="inline-flex items-center gap-0.5 whitespace-nowrap">
            <Icon className={cn("h-3 w-3 shrink-0", it.iconClass)} aria-hidden />
            <span className="tabular-nums text-foreground/90">{it.n}</span>
            {it.unit}
          </span>
        )
      })}
    </div>
  )
}
