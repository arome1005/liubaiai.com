import { BookOpen, CheckCircle, FileText, Layers } from "lucide-react"
import { cn } from "../../lib/utils"

export type TuiyanOutlineStatsInlineProps = {
  volumeCount: number
  chapterCount: number
  sceneCount: number
  finalizedCount: number
  className?: string
}

/**
 * 推演左栏顶栏用：卷/章/场景/已定，紧凑行内展示（风格对齐藏经顶栏统计）。
 */
export function TuiyanOutlineStatsInline({
  volumeCount,
  chapterCount,
  sceneCount,
  finalizedCount,
  className,
}: TuiyanOutlineStatsInlineProps) {
  const items = [
    { icon: BookOpen, n: volumeCount, unit: "卷", iconClass: "text-primary" },
    { icon: FileText, n: chapterCount, unit: "章", iconClass: "text-amber-400" },
    { icon: Layers, n: sceneCount, unit: "场景", iconClass: "text-muted-foreground" },
    { icon: CheckCircle, n: finalizedCount, unit: "已定", iconClass: "text-[oklch(0.7_0.15_145)]" },
  ] as const

  return (
    <div
      className={cn(
        "flex min-w-0 max-w-full flex-wrap items-center justify-end gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground",
        className,
      )}
      title="当前大纲：卷/章/场景/已定稿节点"
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
