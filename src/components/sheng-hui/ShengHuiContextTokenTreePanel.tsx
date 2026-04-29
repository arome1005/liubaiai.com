import type { ShengHuiContextTokenTreeState } from "../../hooks/useShengHuiContextTokenTree";
import { cn } from "../../lib/utils";

type Props = {
  state: ShengHuiContextTokenTreeState;
};

/**
 * N5：素材侧展示各装配块粗估 token 与是否经 `clampContextText` 截断。
 */
export function ShengHuiContextTokenTreePanel(props: Props) {
  const { state } = props;

  if (state.status === "loading") {
    return (
      <section className="flex flex-col gap-1.5 rounded-xl border border-border/40 bg-card/40 p-2.5">
        <p className="sheng-hui-eyebrow">上下文 token 粗估</p>
        <p className="text-[10px] text-muted-foreground/80">正在按当前开关与正文计算…</p>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="flex flex-col gap-1 rounded-xl border border-border/40 bg-card/40 p-2.5">
        <p className="sheng-hui-eyebrow">上下文 token 粗估</p>
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          当前无法生成装配预览：{state.error}
        </p>
      </section>
    );
  }

  const { systemApprox, blocks, userTotalApprox, totalApprox } = state;
  const maxTok = Math.max(systemApprox, ...blocks.map((b) => b.approxTokens), 1);

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-border/40 bg-card/40 p-2.5" aria-label="上下文 token 粗估">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="sheng-hui-eyebrow">上下文 token 粗估</p>
        <p className="text-[10px] tabular-nums text-muted-foreground">
          合计约 {totalApprox.toLocaleString()}（系统 {systemApprox} + 用户 {userTotalApprox}）
        </p>
      </div>
      <p className="text-[10px] leading-relaxed text-muted-foreground/80">
        与即将发送的 `buildShengHuiChatMessages` 一致；带「截断」的块已按上限收缩并带「…（已截断）」标记。
      </p>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-[10px]">
          <span className="w-24 shrink-0 truncate text-muted-foreground">系统提示</span>
          <div className="min-w-0 flex-1">
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary/50"
                style={{ width: `${Math.min(100, (systemApprox / maxTok) * 100)}%` }}
              />
            </div>
          </div>
          <span className="w-12 shrink-0 text-right tabular-nums text-foreground/90">~{systemApprox}</span>
        </div>

        {blocks.map((b) => (
          <div key={b.id} className="flex items-center gap-2 text-[10px]">
            <span className="w-24 shrink-0 truncate text-muted-foreground" title={b.label}>
              {b.label}
            </span>
            <div className="min-w-0 flex-1">
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full", b.truncated ? "bg-amber-500/60" : "bg-chart-2/55")}
                  style={{ width: `${Math.min(100, (b.approxTokens / maxTok) * 100)}%` }}
                />
              </div>
            </div>
            <span className="w-20 shrink-0 text-right">
              <span className="tabular-nums text-foreground/90">~{b.approxTokens}</span>
              {b.truncated ? (
                <span className="ml-0.5 text-[9px] text-amber-700 dark:text-amber-300" title="相对原始内容已截断">
                  截断
                </span>
              ) : null}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
