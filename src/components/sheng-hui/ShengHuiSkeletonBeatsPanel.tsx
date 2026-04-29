import { useMemo } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "../ui/button";
import { parseShengHuiSkeletonBeats } from "../../util/sheng-hui-skeleton-beats";

/**
 * 场景骨架：将「序号. 描述」节拍解析为节点，并支持单条重生（W7）。
 */
export function ShengHuiSkeletonBeatsPanel(props: {
  listText: string;
  busy: boolean;
  regenBeatIndex: number | null;
  onRegenerateBeat: (index1Based: number) => void;
}) {
  const { listText, busy, regenBeatIndex, onRegenerateBeat } = props;

  const beats = useMemo(() => parseShengHuiSkeletonBeats(listText), [listText]);
  const hasText = listText.trim().length > 0;

  if (!hasText) return null;

  return (
    <div className="sheng-hui-glass-section rounded-2xl border border-white/[0.05] bg-card/50 p-2.5 shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset]">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div className="h-0.5 flex-1 rounded-full bg-gradient-to-r from-chart-2/40 to-transparent" aria-hidden />
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          情节节拍
        </span>
      </div>
      {beats.length === 0 ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          未识别到「序号. 描述」格式的行。请保持每行以「1. / 2. …」开头，或先手工整理骨架稿。
        </p>
      ) : (
        <ul className="flex max-h-[14rem] flex-col gap-1.5 overflow-y-auto pr-0.5" aria-label="情节节拍列表">
          {beats.map((b) => {
            const regenThis = regenBeatIndex === b.index1Based;
            return (
              <li
                key={`${b.index1Based}-${b.rawLine.slice(0, 24)}`}
                className="flex items-start gap-1.5 rounded-lg border border-border/30 bg-background/40 px-2 py-1.5 text-left"
              >
                <p className="min-w-0 flex-1 text-[11px] leading-snug text-foreground">
                  <span className="tabular-nums text-muted-foreground">{b.index1Based}.</span> {b.body}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 gap-1 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                  disabled={busy || regenBeatIndex != null}
                  title="仅重生这一条节拍"
                  onClick={() => onRegenerateBeat(b.index1Based)}
                >
                  {regenThis ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <RefreshCw className="size-3.5" aria-hidden />
                  )}
                  重生
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
