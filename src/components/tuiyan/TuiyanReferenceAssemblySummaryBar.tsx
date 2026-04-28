import { Info } from "lucide-react"
import { cn } from "../../lib/utils"

export type TuiyanReferenceAssemblySummaryBarProps = {
  lines: string[]
  className?: string
}

/** 五层规划主生成按钮上方：只读「本次参考装配」摘要 */
export function TuiyanReferenceAssemblySummaryBar({ lines, className }: TuiyanReferenceAssemblySummaryBarProps) {
  if (!lines.length) return null
  return (
    <div
      className={cn(
        "rounded-lg border border-border/40 bg-muted/15 px-2.5 py-2 text-[10px] leading-snug text-muted-foreground",
        className,
      )}
    >
      <div className="mb-1 flex items-center gap-1 font-medium text-foreground/80">
        <Info className="h-3 w-3 shrink-0" />
        <span>本次参考装配（预检）</span>
      </div>
      <ul className="list-inside list-disc space-y-0.5 pl-0.5">
        {lines.map((line, i) => (
          <li key={i} className="[text-wrap:pretty]">
            {line}
          </li>
        ))}
      </ul>
    </div>
  )
}
