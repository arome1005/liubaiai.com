import { AlertCircle, X } from "lucide-react"
import { Button } from "../ui/button"
import { cn } from "../../lib/utils"

export type TuiyanReferenceRagSearchErrorBannerProps = {
  message: string
  onDismiss: () => void
  className?: string
}

/** 参考 Tab RAG 检索失败时的轻量提示条（显式降级，不静默） */
export function TuiyanReferenceRagSearchErrorBanner({
  message,
  onDismiss,
  className,
}: TuiyanReferenceRagSearchErrorBannerProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-lg border border-destructive/35 bg-destructive/5 px-2.5 py-2 text-destructive",
        className,
      )}
    >
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-xs font-medium leading-snug">无法检索参考片段</p>
        <p className="text-[11px] leading-relaxed text-destructive/90">{message}</p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0 text-destructive hover:bg-destructive/10 -mr-0.5"
        onClick={onDismiss}
        aria-label="关闭提示"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
