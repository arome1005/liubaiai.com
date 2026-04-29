import { Sparkles, X } from "lucide-react";
import { Button } from "../ui/button";
import type { ShengHuiGenerationCompletePayload } from "../../hooks/useShengHuiGenerationCompleteCard";
import { cn } from "../../lib/utils";

export function ShengHuiGenerationCompleteCard(props: {
  payload: ShengHuiGenerationCompletePayload;
  onDismiss: () => void;
  onRerun: () => void;
}) {
  const { payload, onDismiss, onRerun } = props;
  const outStr =
    payload.outTokApprox != null ? `~${(payload.outTokApprox / 1000).toFixed(1)}k` : "—";
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-xl border border-border/50 bg-gradient-to-br from-amber-500/10 via-card/80 to-emerald-500/8 p-2.5 shadow-sm",
        "sheng-hui-gen-complete sheng-hui-status-oklch",
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-foreground">
          <Sparkles className="size-3.5 shrink-0 text-amber-500/90" aria-hidden />
          <span>本段生成完成</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={onDismiss}
          aria-label="关闭"
        >
          <X className="size-3.5" />
        </Button>
      </div>
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        新增 <span className="font-medium text-foreground tabular-nums">{payload.newCharCount}</span> 字 · 用时{" "}
        <span className="tabular-nums">{payload.seconds}</span>s
        {payload.outTokApprox != null ? (
          <>
            {" "}
            · 估输出 {outStr} tok
          </>
        ) : null}
        {payload.totalTokApprox != null ? (
          <>
            {" "}
            · 本请求合计约 <span className="tabular-nums">{(payload.totalTokApprox / 1000).toFixed(1)}k</span> tok
          </>
        ) : null}
        {payload.illustrativeYuan !== "—" ? (
          <>
            {" "}
            · 示意 ¥{payload.illustrativeYuan}
          </>
        ) : null}
      </p>
      <div className="flex flex-wrap gap-1.5">
        <Button type="button" size="sm" variant="secondary" className="h-7 text-xs" onClick={onRerun}>
          再来一稿
        </Button>
      </div>
    </div>
  );
}
