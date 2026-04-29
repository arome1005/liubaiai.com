import { cn } from "../../lib/utils";
import { SHENG_HUI_TOKEN_INPUT_CAP, SHENG_HUI_TOKEN_OUTPUT_CAP } from "../../util/sheng-hui-token-budget-constants";

function ArcRing(props: { pct: number; strokeClass: string; ariaLabel: string }) {
  const { pct, strokeClass, ariaLabel } = props;
  const r = 13;
  const c = 2 * Math.PI * r;
  const dash = Math.min(100, Math.max(0, pct)) / 100;
  return (
    <svg viewBox="0 0 36 36" className="size-9 shrink-0" aria-hidden>
      <title>{ariaLabel}</title>
      <circle cx="18" cy="18" r={r} fill="none" stroke="currentColor" className="text-muted/30" strokeWidth="3.5" />
      <circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        stroke="currentColor"
        className={strokeClass}
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray={`${dash * c} ${c}`}
        transform="rotate(-90 18 18)"
      />
    </svg>
  );
}

/** 右栏：粗估 token 双环（输入/输出预）+ 细条；与窗口宽度的粗估占比仅作参考。 */
export function ShengHuiTokenBudgetRing(props: {
  inputApprox: number | null;
  outputEstimateApprox: number | null;
  className?: string;
}) {
  const { inputApprox, outputEstimateApprox, className } = props;
  const inP =
    inputApprox != null && inputApprox > 0
      ? Math.min(100, (inputApprox / SHENG_HUI_TOKEN_INPUT_CAP) * 100)
      : 0;
  const outP =
    outputEstimateApprox != null && outputEstimateApprox > 0
      ? Math.min(100, (outputEstimateApprox / SHENG_HUI_TOKEN_OUTPUT_CAP) * 100)
      : 0;

  return (
    <div
      className={cn(
        "flex min-w-0 max-w-full flex-col gap-1.5 rounded-lg border border-border/40 bg-background/30 px-2 py-1.5 sm:max-w-[12rem] sm:flex-row sm:items-center",
        className,
      )}
      title="相对默认窗口宽度的粗估占比，仅作参考"
    >
      <div className="flex shrink-0 items-center gap-1.5">
        <ArcRing
          pct={inP}
          strokeClass="text-primary/85"
          ariaLabel={`输入约 ${inputApprox != null ? inputApprox : 0}，相对 ${SHENG_HUI_TOKEN_INPUT_CAP}`}
        />
        <ArcRing
          pct={outP}
          strokeClass="text-amber-500/90 dark:text-amber-400/85"
          ariaLabel={`输出预约 ${outputEstimateApprox != null ? outputEstimateApprox : 0}，相对 ${SHENG_HUI_TOKEN_OUTPUT_CAP}`}
        />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">粗估</p>
        <div>
          <div className="mb-0.5 flex justify-between text-[9px] text-muted-foreground">
            <span>输入</span>
            <span>
              {inputApprox != null ? `~${(inputApprox / 1000).toFixed(1)}k` : "—"} / 32k
            </span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-muted/60">
            <div
              className="h-full rounded-full bg-primary/70 transition-[width] duration-300"
              style={{ width: `${inP}%` }}
            />
          </div>
        </div>
        <div>
          <div className="mb-0.5 flex justify-between text-[9px] text-muted-foreground">
            <span>输出预</span>
            <span>
              {outputEstimateApprox != null ? `~${(outputEstimateApprox / 1000).toFixed(1)}k` : "—"} / 8k
            </span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-muted/60">
            <div
              className="h-full rounded-full bg-amber-500/80 transition-[width] duration-300 dark:bg-amber-400/70"
              style={{ width: `${outP}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
