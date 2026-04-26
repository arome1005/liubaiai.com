import type { PlanningNodeStructuredMeta, TuiyanPlanningLevel } from "../../db/types"
import { STRUCTURED_FIELDS_BY_LEVEL } from "../../util/tuiyan-planning"
import { cn } from "../../lib/utils"

type Props = {
  meta: PlanningNodeStructuredMeta
  level: TuiyanPlanningLevel
}

/** 哪些字段是逗号分隔的名称列表，需要渲染成 chip 样式 */
const CHIP_FIELD_KEYS = new Set([
  "coreCharacters",
  "appearedCharacters",
  "mainCharacters",
  "characterAllocation",
  "locations",
  "keyLocations",
  "mainFactions",
  "coreFactions",
  "keyItems",
  "worldSettingTerms",
  "tags",
  "conflictPoints",
])

/** 每类字段对应的颜色风格 */
const FIELD_COLOR: Record<string, string> = {
  coreCharacters:    "bg-violet-500/15 text-violet-300 border-violet-500/25",
  appearedCharacters:"bg-violet-500/15 text-violet-300 border-violet-500/25",
  mainCharacters:    "bg-violet-500/15 text-violet-300 border-violet-500/25",
  characterAllocation:"bg-violet-500/15 text-violet-300 border-violet-500/25",
  locations:         "bg-cyan-500/15   text-cyan-300   border-cyan-500/25",
  keyLocations:      "bg-cyan-500/15   text-cyan-300   border-cyan-500/25",
  mainFactions:      "bg-rose-500/15   text-rose-300   border-rose-500/25",
  coreFactions:      "bg-rose-500/15   text-rose-300   border-rose-500/25",
  keyItems:          "bg-amber-500/15  text-amber-300  border-amber-500/25",
  worldSettingTerms: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
  tags:              "bg-sky-500/15    text-sky-300    border-sky-500/25",
  conflictPoints:    "bg-red-500/15    text-red-300    border-red-500/25",
}

function parseList(raw: string): string[] {
  return raw
    .split(/[,，\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
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
      {fields.map(({ key, label }) => {
        const raw = (meta as Record<string, string>)[key]
        const isChip = CHIP_FIELD_KEYS.has(key)
        const colorClass =
          FIELD_COLOR[key] ?? "bg-muted/40 text-muted-foreground border-border/30"

        return (
          <div key={key} className="space-y-1">
            <div className="text-[11px] text-muted-foreground/70">{label}</div>
            {isChip ? (
              <div className="flex flex-wrap gap-1">
                {parseList(raw).map((item) => (
                  <span
                    key={item}
                    className={cn(
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] leading-tight",
                      colorClass,
                    )}
                  >
                    {item}
                  </span>
                ))}
              </div>
            ) : (
              <pre className="whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-foreground/85">
                {raw}
              </pre>
            )}
          </div>
        )
      })}
    </div>
  )
}
