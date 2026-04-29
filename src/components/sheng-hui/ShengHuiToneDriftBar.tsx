import { Loader2, Sparkles } from "lucide-react";
import { cn } from "../../lib/utils";

type Props = {
  enabled: boolean;
  mainBusy: boolean;
  ruleHints: string[];
  embedHint: string | null;
  embedBusy: boolean;
  embedErr: string | null;
  /** 主稿过短，向量轨不会跑，避免空白占高 */
  hasProse: boolean;
};

/**
 * N4：调性/禁用套话/标杆段向量距离，与设置「调性漂移提示」联动。
 */
export function ShengHuiToneDriftBar(props: Props) {
  const { enabled, mainBusy, ruleHints, embedHint, embedBusy, embedErr, hasProse } = props;
  if (!enabled) return null;

  if (mainBusy) {
    return (
      <div
        className="flex min-w-0 items-start gap-2 rounded-lg border border-border/30 bg-muted/20 px-2.5 py-1.5 text-[11px] text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary/80" aria-hidden />
        <span>主稿生成中；流式结束后会按笔感卡自动做调性/标杆段检测。</span>
      </div>
    );
  }

  if (!hasProse) return null;

  if (!ruleHints.length && !embedHint && !embedErr && !embedBusy) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-lg border border-border/30 bg-card/50 px-2.5 py-1.5 text-[11px]",
        "leading-relaxed",
      )}
      role="region"
      aria-label="调性检测"
    >
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Sparkles className="size-3.5 shrink-0 text-primary/80" aria-hidden />
        <span className="font-medium text-foreground/90">调性</span>
        {embedBusy ? (
          <span className="ml-auto inline-flex items-center gap-1 tabular-nums text-muted-foreground">
            <Loader2 className="size-3 animate-spin" aria-hidden />
            标杆比对中
          </span>
        ) : null}
      </div>
      {embedErr ? <p className="text-destructive">{embedErr}</p> : null}
      {embedHint ? <p className="text-amber-700 dark:text-amber-200/90">{embedHint}</p> : null}
      {ruleHints.length > 0 ? (
        <ul className="list-inside list-disc text-muted-foreground">
          {ruleHints.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
