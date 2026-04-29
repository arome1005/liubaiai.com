import { Link } from "react-router-dom";
import { formatShengHuiIllustrativeYuan } from "../../util/sheng-hui-ui-display";
import { cn } from "../../lib/utils";

type Rough = { totalApprox: number } | null;

/**
 * 顶栏第二行：生成中状态芯片 + 今日 token / 日预算 + 进设置查看用量（第三节·布局层）。
 */
export function ShengHuiTopBarMetricsRow(props: {
  busy: boolean;
  genElapsedSec: number;
  lastRoughEstimate: Rough;
  todayTokensSnapshot: number;
  /** 日 token 预算；0 表示未设或不限 */
  dailyTokenBudget: number;
}) {
  const { busy, genElapsedSec, lastRoughEstimate, todayTokensSnapshot, dailyTokenBudget } = props;
  const totK =
    lastRoughEstimate && lastRoughEstimate.totalApprox > 0
      ? `~${(lastRoughEstimate.totalApprox / 1000).toFixed(1)}k`
      : null;
  const todayYen = formatShengHuiIllustrativeYuan(todayTokensSnapshot);
  return (
    <div
      className={cn(
        "flex min-h-5 w-full flex-wrap items-center gap-2 border-t border-border/30 px-2 py-0.5 text-[10px] sm:px-3",
        "shrink-0",
      )}
    >
      {busy ? (
        <output
          className="sheng-hui-zen-badge inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/8 px-2 py-0.5 font-medium text-primary"
          aria-live="polite"
        >
          <span className="size-1.5 animate-pulse rounded-full bg-primary" />
          <span>生成中</span>
          {genElapsedSec > 0 ? <span className="tabular-nums text-muted-foreground">· {genElapsedSec}s</span> : null}
          {totK ? <span className="tabular-nums text-muted-foreground">· {totK} tok</span> : null}
        </output>
      ) : null}

      <div className="ml-auto flex flex-wrap items-center gap-1.5 sm:ml-0">
        <span className="text-muted-foreground/80">今日</span>
        <span className="sheng-hui-usage-oklch font-medium tabular-nums" title="本机粗估示意">
          {todayTokensSnapshot.toLocaleString()} tok
        </span>
        <span className="text-muted-foreground/70">≈</span>
        <span className="tabular-nums">¥{todayYen}</span>
        {dailyTokenBudget > 0 ? (
          <span className="text-muted-foreground">
            <span> / 预算 </span>
            <span className="tabular-nums font-medium text-foreground">{dailyTokenBudget.toLocaleString()}</span>
            <span> tok</span>
          </span>
        ) : null}
        <Link
          to="/settings"
          className="rounded-md px-1.5 py-0.5 text-muted-foreground hover:bg-accent/80 hover:text-foreground"
          title="在设置中查看日累计粗估、隐私与费用说明"
        >
          设置
        </Link>
      </div>
    </div>
  );
}
