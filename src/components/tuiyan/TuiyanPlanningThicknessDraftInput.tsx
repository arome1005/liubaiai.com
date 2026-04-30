import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { cn } from "../../lib/utils"
import type { PlanningScale } from "../../util/tuiyan-planning"
import { clampPlanningThicknessField, type PlanningThicknessKey } from "../../util/tuiyan-planning-thickness"
import { Input } from "../ui/input"

export type TuiyanPlanningThicknessDraftInputProps = {
  tKey: PlanningThicknessKey
  label: ReactNode
  committed: number
  min: number
  max: number
  highlighted: boolean
  dialogOpen: boolean
  onCommit: (key: PlanningThicknessKey, n: number) => void
  variant?: "card" | "row"
  compact?: boolean
  planningScale?: PlanningScale
  /** 父级点击「保存」时递增，用于在不失焦的情况下提交当前草稿 */
  flushSignal?: number
}

/**
 * 各层最低字数：编辑中用字符串草稿，失焦/Enter 再钳位并提交，避免 onChange 立刻 normalize 导致无法键入多位数等。
 * 关闭弹窗或点「保存」时也会提交未失焦的草稿，避免只关窗导致未写入。
 */
export function TuiyanPlanningThicknessDraftInput({
  tKey,
  label,
  committed,
  min,
  max,
  highlighted,
  dialogOpen,
  onCommit,
  variant = "card",
  compact = false,
  planningScale,
  flushSignal = 0,
}: TuiyanPlanningThicknessDraftInputProps) {
  const autoId = useId()
  const id = `tthick-${tKey}-${autoId}`

  const [draft, setDraft] = useState<string | null>(null)
  const prevDialogOpenRef = useRef(dialogOpen)

  const commitDraftString = useCallback(
    (raw: string) => {
      const t = raw.trim()
      if (t === "") {
        setDraft(null)
        return
      }
      const n = Number(t)
      if (!Number.isFinite(n)) {
        setDraft(null)
        return
      }
      onCommit(tKey, clampPlanningThicknessField(tKey, n, planningScale))
      setDraft(null)
    },
    [onCommit, tKey, planningScale],
  )

  /** 弹窗由开→关：提交当前输入框内未 blur 的草稿 */
  useLayoutEffect(() => {
    if (prevDialogOpenRef.current && !dialogOpen && draft !== null) {
      commitDraftString(draft)
    }
    prevDialogOpenRef.current = dialogOpen
  }, [dialogOpen, draft, commitDraftString])

  /** 父级「保存」：强制提交本行 */
  useEffect(() => {
    if (flushSignal === 0) return
    if (draft !== null) {
      commitDraftString(draft)
    }
  }, [flushSignal, draft, commitDraftString])

  const display = draft !== null ? draft : String(committed)

  const commitFromInputValue = (raw: string) => {
    commitDraftString(raw)
  }

  const isRow = variant === "row"

  return (
    <div
      className={cn(
        "flex flex-col transition-colors sm:flex-row sm:items-center sm:justify-between",
        compact ? "gap-1 px-2 py-1.5 sm:gap-2" : "gap-1.5 px-3 py-2.5 sm:gap-3",
        !isRow && "rounded-lg border",
        !isRow &&
          (highlighted
            ? "border-primary/30 bg-primary/[0.06]"
            : "border-border/40 bg-muted/15 hover:border-border/60"),
        isRow &&
          (highlighted ? "bg-primary/[0.06]" : "bg-transparent hover:bg-muted/25"),
      )}
    >
      <label
        className={cn(
          "min-w-0 flex-1 leading-snug text-foreground/90",
          compact ? "text-[10px]" : "text-[11px]",
        )}
        htmlFor={id}
      >
        {label}
      </label>
      <div className={cn("flex shrink-0 items-center sm:max-w-[42%]", compact ? "gap-1.5" : "gap-2")}>
        <Input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          aria-describedby={`${id}-hint`}
          className={cn(
            "w-full min-w-[4.75rem] border-border/50 bg-background/80 text-right tabular-nums font-medium tracking-tight",
            compact ? "h-7 text-[11px]" : "h-8 min-w-[5.5rem] text-xs",
            "focus-visible:border-primary/50 focus-visible:ring-primary/20",
          )}
          value={display}
          onChange={(e) => {
            const next = e.target.value
            if (next === "") {
              setDraft("")
              return
            }
            if (!/^\d+$/.test(next)) return
            setDraft(next)
          }}
          onFocus={() => setDraft(String(committed))}
          onBlur={(e) => commitFromInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              ;(e.target as HTMLInputElement).blur()
            }
          }}
        />
        <span
          id={`${id}-hint`}
          className={cn(
            "shrink-0 tabular-nums text-muted-foreground/90",
            compact ? "text-[9px]" : "text-[10px]",
          )}
        >
          {min}–{max}
        </span>
      </div>
    </div>
  )
}
