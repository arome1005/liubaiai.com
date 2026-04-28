import { useMemo } from "react"
import { useTuiyanRefChapterHeads } from "../../hooks/useTuiyanRefChapterHeads"
import { Checkbox } from "../ui/checkbox"
import { ScrollArea } from "../ui/scroll-area"
import { Spinner } from "../ui/spinner"
import { cn } from "../../lib/utils"

export type TuiyanRefBookSectionPickerProps = {
  refWorkId: string
  selectedIds: string[]
  onChange: (ids: string[]) => void
  className?: string
}

/**
 * 指定章节：多选 `ReferenceChapterHead.id`，写入 `referenceBinding.sectionIds`。
 */
export function TuiyanRefBookSectionPicker({
  refWorkId,
  selectedIds,
  onChange,
  className,
}: TuiyanRefBookSectionPickerProps) {
  const { heads, loading, error } = useTuiyanRefChapterHeads(refWorkId, true)

  const byId = useMemo(() => new Map(heads.map((h) => [h.id, h])), [heads])
  const orphanSelected = useMemo(
    () => selectedIds.filter((id) => !byId.has(id)),
    [selectedIds, byId],
  )

  const toggle = (id: string) => {
    const has = selectedIds.includes(id)
    onChange(has ? selectedIds.filter((x) => x !== id) : [...selectedIds, id])
  }

  if (loading) {
    return (
      <div className={cn("flex items-center gap-2 py-1 text-[10px] text-muted-foreground", className)}>
        <Spinner className="h-3.5 w-3.5" />
        加载章节索引…
      </div>
    )
  }

  if (error) {
    return <p className={cn("text-[10px] text-destructive/90", className)}>{error}</p>
  }

  if (heads.length === 0) {
    return (
      <p className={cn("text-[10px] text-muted-foreground", className)}>
        未检测到章节标题。请先在藏经页为本书完成导入与章节索引，再勾选锚点。
      </p>
    )
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-muted-foreground">
        <span>
          已选 {selectedIds.length} / {heads.length}
        </span>
        {selectedIds.length > 0 && (
          <button
            type="button"
            className="underline-offset-2 hover:underline text-[10px] text-primary"
            onClick={() => onChange([])}
          >
            清空
          </button>
        )}
      </div>
      {orphanSelected.length > 0 && (
        <p className="text-[10px] text-amber-700/90 dark:text-amber-400/90">
          有 {orphanSelected.length} 个已选锚点与当前索引不一致，可重选以同步。
        </p>
      )}
      <ScrollArea className="max-h-40 rounded-md border border-border/30 pr-2">
        <div className="space-y-0.5 py-1">
          {heads.map((h) => {
            const checked = selectedIds.includes(h.id)
            const label = h.title?.trim() || `第 ${h.ordinal + 1} 处`
            return (
              <label
                key={h.id}
                className="flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 text-[11px] leading-snug hover:bg-muted/30"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggle(h.id)}
                  className="mt-0.5"
                />
                <span className="min-w-0 break-words text-left">{label}</span>
              </label>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
