import { ArrowRight, FileText } from "lucide-react"
import type { ReferenceSearchHit, TuiyanReferenceBinding } from "../../db/types"
import { cn } from "../../lib/utils"
import {
  buildReferenceSummaryInjectBody,
  clampTuiyanReferenceInjectBody,
  getReferenceRagHitFullText,
  injectMaxCharsForTuiyanRefBook,
  safeApproxReferenceInjectDeltaTokens,
  TUIYAN_REF_INJECT_TOKEN_HEAVY,
  tokenBandClass,
} from "../../util/tuiyan-reference-inject-text"
import { Button } from "../ui/button"

export type TuiyanReferenceRagHitCardProps = {
  hit: ReferenceSearchHit
  onInjectToChat: (text: string) => void
  /** 与每书「引用范围」一致的上限；未传时与无 binding 的默认档一致 */
  referenceBindings?: TuiyanReferenceBinding[]
}

export function TuiyanReferenceRagHitCard({ hit, onInjectToChat, referenceBindings }: TuiyanReferenceRagHitCardProps) {
  const maxChars = injectMaxCharsForTuiyanRefBook(hit.refWorkId, referenceBindings)
  const { text: full, truncated: fullTruncated } = clampTuiyanReferenceInjectBody(
    getReferenceRagHitFullText(hit),
    maxChars,
  )
  const fullEst = safeApproxReferenceInjectDeltaTokens(full)
  const summaryBody = buildReferenceSummaryInjectBody(full, maxChars)
  const summaryEst = safeApproxReferenceInjectDeltaTokens(summaryBody)
  const fullDelta = fullEst.ok ? fullEst.tokens : 0
  const summaryDelta = summaryEst.ok ? summaryEst.tokens : 0
  const fullBand = fullEst.ok ? tokenBandClass(fullDelta) : "normal"
  const sumBand = summaryEst.ok ? tokenBandClass(summaryDelta) : "normal"
  const suggestSummary = fullEst.ok && fullDelta > TUIYAN_REF_INJECT_TOKEN_HEAVY
  const fullTokenTitle = fullEst.ok
    ? "粗估仅含「参考段落」块，不含原输入框内已有文字"
    : `Token 粗估失败，注入仍可用。原因：${fullEst.message}`
  const summaryTokenTitle = summaryEst.ok
    ? "粗估为「摘要」参考块"
    : `Token 粗估失败，注入仍可用。原因：${summaryEst.message}`

  return (
    <div className="rounded-lg border border-border/40 bg-card/30 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-foreground/70 truncate">《{hit.refTitle}》</span>
        <div className="flex flex-wrap items-center justify-end gap-1 shrink-0">
          <span
            className={cn(
              "text-[10px] tabular-nums",
              !fullEst.ok && "text-amber-800 dark:text-amber-400/90",
              fullEst.ok && fullBand === "normal" && "text-muted-foreground",
              fullEst.ok && fullBand === "warning" && "text-amber-600 dark:text-amber-500",
              fullEst.ok && fullBand === "danger" && "text-destructive",
            )}
            title={fullTokenTitle}
          >
            全量 {fullEst.ok ? `约+${fullDelta}` : "粗估失败"}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs shrink-0 gap-1 text-primary hover:text-primary"
            onClick={() => onInjectToChat(full)}
            type="button"
            title={
              fullTruncated
                ? "将片段以【参考段落】形式注入（已按当前书引用范围上限截断）"
                : "将完整片段以【参考段落】形式注入到 AI 对话输入"
            }
          >
            <ArrowRight className="h-3 w-3" />
            注入对话
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-1 border-t border-border/20 pt-1.5">
        <span
            className={cn(
              "text-[10px] tabular-nums",
              !summaryEst.ok && "text-amber-800 dark:text-amber-400/90",
              summaryEst.ok && sumBand === "normal" && "text-muted-foreground",
              summaryEst.ok && sumBand === "warning" && "text-amber-600 dark:text-amber-500",
              summaryEst.ok && sumBand === "danger" && "text-destructive",
            )}
            title={summaryTokenTitle}
          >
            摘要 {summaryEst.ok ? `约+${summaryDelta}` : "粗估失败"}
          </span>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-6 px-2 text-[10px] gap-1",
            suggestSummary && "ring-2 ring-amber-500/50 dark:ring-amber-400/40",
          )}
          type="button"
          onClick={() => onInjectToChat(summaryBody)}
          title="压缩为短要点后注入，减少上下文压力"
        >
          <FileText className="h-3 w-3" />
          摘要注入
        </Button>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">
        {hit.snippetBefore}
        <span className={cn("font-medium", hit.snippetMatch ? "text-primary" : "")}>
          {hit.snippetMatch}
        </span>
        {hit.snippetAfter}
      </p>
    </div>
  )
}
