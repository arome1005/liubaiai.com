import type { ReferenceSearchHit } from "../../db/types";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

export function ReferenceSearchHitShengHuiRow({
  hit,
  chapterLabel,
  shengHuiDisabled,
  onOpenInReader,
  onShengHui,
}: {
  hit: ReferenceSearchHit;
  /** 已算好的章标题/卷或空 */
  chapterLabel: string;
  shengHuiDisabled: boolean;
  onOpenInReader: () => void;
  onShengHui: () => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-0 overflow-hidden rounded-lg border border-black/5 dark:border-border/40 bg-slate-50 dark:bg-background/50 transition-all duration-300",
        "hover:border-primary/30 hover:bg-white dark:hover:bg-card/80 hover:shadow-sm",
      )}
    >
      <div className="flex flex-1 flex-col min-[520px]:flex-row min-[520px]:items-stretch">
        <button
          type="button"
          className="min-w-0 flex-1 p-3 text-left"
          onClick={onOpenInReader}
        >
          <span className="text-sm font-medium text-foreground">{hit.refTitle}</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {chapterLabel ? `${chapterLabel} · ` : ""}段 {hit.ordinal + 1} · {hit.matchCount} 处命中
          </span>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {hit.snippetBefore}
            <mark className="rounded bg-primary/20 px-0.5 text-primary">{hit.snippetMatch}</mark>
            {hit.snippetAfter}
          </p>
        </button>
        <div className="flex shrink-0 items-center justify-end border-t border-border/30 bg-background/30 px-2 py-2 min-[520px]:w-[11.5rem] min-[520px]:flex-col min-[520px]:justify-center min-[520px]:border-t-0 min-[520px]:border-l min-[520px]:border-border/30 min-[520px]:py-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-8 w-full gap-0.5 text-xs font-medium shadow-none min-[520px]:px-2"
            disabled={shengHuiDisabled}
            title={
              shengHuiDisabled
                ? "请先在顶栏选择要仿写的作品"
                : "以本段为「当前主稿」、续写模式打开生辉，可再补大纲与文策后生成"
            }
            onClick={(e) => {
              e.stopPropagation();
              onShengHui();
            }}
          >
            以此段开始仿写
            <span aria-hidden className="ml-0.5">
              →
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
}
