import { AiInlineErrorNotice } from "../AiInlineErrorNotice";
import { Button } from "../ui/button";
import { formatShengHuiIllustrativeYuan } from "../../util/sheng-hui-ui-display";
import { cn } from "../../lib/utils";

export type ShengHuiStatusRough = {
  inputApprox: number;
  outputEstimateApprox: number;
  totalApprox: number;
} | null;

/**
 * W4：主稿区顶部统一状态条（错误、生成进度、字数/目标、本请求与今日 token 粗估），避免与顶栏/仿写 Tab 重复堆叠同逻辑。
 */
export function ShengHuiManuscriptStatusBar(props: {
  generateError: string | null;
  onDismissGenerateError: () => void;
  busy: boolean;
  genElapsedSec: number;
  wordCount: number;
  targetWords: number;
  lastRoughEstimate: ShengHuiStatusRough;
  todayTokensSnapshot: number;
}) {
  const {
    generateError,
    onDismissGenerateError,
    busy,
    genElapsedSec,
    wordCount,
    targetWords,
    lastRoughEstimate,
    todayTokensSnapshot,
  } = props;

  const progressPct =
    targetWords > 0 && wordCount > 0 ? Math.min(100, Math.round((wordCount / targetWords) * 100)) : null;
  const totalTokStr =
    lastRoughEstimate && lastRoughEstimate.totalApprox > 0
      ? `~${(lastRoughEstimate.totalApprox / 1000).toFixed(1)}k`
      : null;
  const yen = formatShengHuiIllustrativeYuan(todayTokensSnapshot);

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {generateError ? (
        <div
          className="flex shrink-0 items-start gap-2 rounded-lg border border-destructive/35 bg-destructive/5 px-2.5 py-1.5 text-destructive"
          role="alert"
        >
          <div className="min-w-0 flex-1">
            <AiInlineErrorNotice
              message={generateError}
              className="text-[11px] leading-relaxed text-destructive"
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 shrink-0 px-1.5 text-[10px] text-destructive hover:bg-destructive/10"
            onClick={onDismissGenerateError}
          >
            关闭
          </Button>
        </div>
      ) : null}

      <div
        className={cn(
          "flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg border border-border/35 bg-background/50 px-2.5 py-1.5 text-[11px]",
          "tabular-nums text-muted-foreground",
        )}
        aria-label="主稿与生成状态"
      >
        {busy ? (
          <output className="inline-flex flex-wrap items-center gap-1 text-primary" aria-live="polite">
            <span className="inline-block size-1.5 animate-pulse rounded-full bg-primary" />
            <span>生成中</span>
            <span className="text-muted-foreground">· {genElapsedSec}s</span>
            {totalTokStr ? <span className="text-muted-foreground">· 粗估 {totalTokStr} tok</span> : null}
          </output>
        ) : (
          <span className="text-muted-foreground/90">待生成</span>
        )}

        <span className="h-3 w-px bg-border/60" aria-hidden />

        <span className="text-foreground/90">
          主稿 <span className="font-medium">{wordCount.toLocaleString()}</span> 字
        </span>

        {targetWords > 0 && progressPct != null ? (
          <>
            <span className="h-3 w-px bg-border/60" aria-hidden />
            <span>
              目标 {targetWords.toLocaleString()} 字
              <span className="text-muted-foreground/80"> · {progressPct}%</span>
            </span>
          </>
        ) : null}

        {lastRoughEstimate && lastRoughEstimate.totalApprox > 0 ? (
          <>
            <span className="h-3 w-px bg-border/60" aria-hidden />
            <span
              className="min-w-0 max-w-[min(100%,22rem)] truncate"
              title={`本请求粗估：输入 + 输出（云端示意；见生成前弹窗同口径）`}
            >
              本请求：~{lastRoughEstimate.inputApprox.toLocaleString()} + ~
              {lastRoughEstimate.outputEstimateApprox.toLocaleString()} ≈ ~
              {lastRoughEstimate.totalApprox.toLocaleString()} tok
            </span>
          </>
        ) : null}

        <span className="h-3 w-px bg-border/60" aria-hidden />
        <span
          className="text-[10px] sm:text-[11px]"
          title="本机累计粗估，¥ 为示意"
        >
          今日 ≈{todayTokensSnapshot.toLocaleString()} tok · ¥{yen}
        </span>
      </div>
    </div>
  );
}
