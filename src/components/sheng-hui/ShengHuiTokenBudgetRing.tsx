import { cn } from "../../lib/utils";

const INPUT_CAP = 32_000;
const OUT_CAP = 8_000;

/** 右栏粗估 token 占窗口的示意条（仅展示）。 */
export function ShengHuiTokenBudgetRing(props: {
  inputApprox: number | null;
  outputEstimateApprox: number | null;
  className?: string;
}) {
  const { inputApprox, outputEstimateApprox, className } = props;
  const inP =
    inputApprox != null && inputApprox > 0 ? Math.min(100, (inputApprox / INPUT_CAP) * 100) : 0;
  const outP =
    outputEstimateApprox != null && outputEstimateApprox > 0
      ? Math.min(100, (outputEstimateApprox / OUT_CAP) * 100)
      : 0;

  return (
    <div
      className={cn("rounded-lg border border-border/40 bg-background/30 px-2 py-1.5", className)}
      title="相对默认窗口宽度的粗估占比，仅作参考"
    >
      <p className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">粗估</p>
      <div className="mt-1 space-y-1">
        <div>
          <div className="mb-0.5 flex justify-between text-[9px] text-muted-foreground">
            <span>输入</span>
            <span>
              {inputApprox != null ? `~${(inputApprox / 1000).toFixed(1)}k` : "—"} / 32k
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted/60">
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
          <div className="h-1.5 overflow-hidden rounded-full bg-muted/60">
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
