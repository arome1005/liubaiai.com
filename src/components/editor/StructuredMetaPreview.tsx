import type { PlanningNodeStructuredMeta, TuiyanPlanningLevel } from "../../db/types"
import { STRUCTURED_FIELDS_BY_LEVEL } from "../../util/tuiyan-planning"

type Props = {
  meta: PlanningNodeStructuredMeta
  level: TuiyanPlanningLevel
}

/** 只读展示推送节点的结构化元数据，用于 PullOutlineDialog 预览面板。 */
export function StructuredMetaPreview({ meta, level }: Props) {
  const fields = STRUCTURED_FIELDS_BY_LEVEL[level].filter(
    ({ key }) => !!(meta as Record<string, string | undefined>)[key]?.trim(),
  )
  if (!fields.length) return null

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-border/40 bg-background/20 p-3">
      <div className="text-[11px] font-medium text-muted-foreground">结构化元数据</div>
      {fields.map(({ key, label }) => (
        <div key={key} className="space-y-0.5">
          <div className="text-[11px] text-muted-foreground/70">{label}</div>
          <pre className="whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-foreground/85">
            {(meta as Record<string, string>)[key]}
          </pre>
        </div>
      ))}
    </div>
  )
}
