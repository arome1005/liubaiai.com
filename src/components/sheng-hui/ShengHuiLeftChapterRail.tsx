import { BookOpen, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { Chapter, Work } from "../../db/types";
import { wordCount } from "../../util/wordCount";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

export function ShengHuiLeftChapterRail(props: {
  works: Work[];
  workId: string | null;
  onWorkIdChange: (id: string | null) => void;
  lastWorkStorageKey: string;
  chapters: Chapter[];
  chapterId: string | null;
  onChapterIdChange: (id: string | null) => void;
  isLg: boolean;
  leftExpanded: boolean;
  onSetLeftOpen: (open: boolean) => void;
  /** 仿写区目标字数，用于 v0 式 `current/target` 展示 */
  targetWords: number;
}) {
  const {
    works,
    workId,
    onWorkIdChange,
    lastWorkStorageKey,
    chapters,
    chapterId,
    onChapterIdChange,
    isLg,
    leftExpanded,
    onSetLeftOpen,
    targetWords,
  } = props;

  if (isLg && !leftExpanded) {
    return (
      <div className="order-2 hidden min-h-0 w-full flex-col items-center gap-2 rounded-2xl border border-border/50 bg-card/60 py-3 shadow-sm backdrop-blur-sm lg:order-1 lg:flex">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="size-9 shrink-0 shadow-sm"
          onClick={() => onSetLeftOpen(true)}
          title="展开章节目录"
          aria-label="展开左侧章节目录"
        >
          <PanelLeftOpen className="size-4" />
        </Button>
        <span className="select-none text-[10px] font-medium text-muted-foreground/80 [writing-mode:vertical-rl]">目录</span>
      </div>
    );
  }

  return (
    <aside
      className={cn(
        "sheng-hui-glass-panel order-2 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-card/65 shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_8px_24px_-12px_rgba(0,0,0,0.28)] backdrop-blur-md lg:order-1",
      )}
    >
      <div className="flex h-0.5 shrink-0 rounded-t-2xl bg-gradient-to-r from-primary/50 via-chart-2/40 to-primary/30" aria-hidden />
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/40 bg-card/30 px-2.5 py-2">
        <div className="min-w-0 flex items-center gap-1.5">
          <BookOpen className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0">
            <p className="sheng-hui-eyebrow">章节目录</p>
            <p className="text-[10px] text-muted-foreground/80">与写作页一致，点选切换当前章</p>
          </div>
        </div>
        {isLg ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            onClick={() => onSetLeftOpen(false)}
            title="收起侧栏"
            aria-label="收起章节目录"
          >
            <PanelLeftClose className="size-4" />
          </Button>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-2.5">
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-medium text-muted-foreground">作品</label>
          <select
            className="input wence-select text-sm"
            value={workId ?? ""}
            onChange={(e) => {
              const v = e.target.value || null;
              onWorkIdChange(v);
              try {
                if (v) localStorage.setItem(lastWorkStorageKey, v);
              } catch {
                /* ignore */
              }
            }}
          >
            {works.map((w) => (
              <option key={w.id} value={w.id}>
                {w.title.trim() || "未命名"}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1">
          <p className="shrink-0 text-[10px] font-medium text-muted-foreground">章节</p>
          {!chapters.length ? (
            <p className="text-[11px] text-muted-foreground/60">暂无章节</p>
          ) : (
            <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto" aria-label="章节目录">
              {chapters.map((c) => {
                const active = chapterId === c.id;
                const n = c.wordCountCache ?? wordCount(c.content ?? "");
                const has = n > 0;
                const tw = targetWords > 0 ? targetWords : 0;
                const hitTarget = tw > 0 && n >= tw;
                const partial = tw > 0 && has && n < tw;
                const statusTitle = !has
                  ? "正文为空"
                  : hitTarget
                    ? "已达本页目标字数"
                    : partial
                      ? "有正文，未达目标字数"
                      : "正文有字";
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onChapterIdChange(c.id)}
                    className={cn(
                      "flex shrink-0 items-start gap-1.5 rounded-lg px-2 py-1.5 text-left text-[12px] leading-snug transition-colors",
                      active
                        ? "bg-primary/12 font-medium text-primary"
                        : "text-muted-foreground hover:bg-accent/80 hover:text-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-1.5 size-1.5 shrink-0 rounded-full",
                        hitTarget
                          ? "bg-[oklch(0.72_0.14_155)] shadow-[0_0_0_1px_oklch(0.6_0.1_155_/_0.4)] sheng-hui-oklch-adopted"
                          : partial
                            ? "bg-amber-500/90 shadow-[0_0_0_1px_rgba(245,158,11,0.4)] sheng-hui-oklch-streaming"
                            : has
                              ? "bg-emerald-500/90 shadow-[0_0_0_1px_rgba(16,185,129,0.35)]"
                              : "sheng-hui-oklch-idle bg-muted-foreground/30",
                      )}
                      title={statusTitle}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-3 block">{c.title || "未命名章节"}</span>
                      <span className="mt-0.5 block text-[10px] text-muted-foreground/70 tabular-nums">
                        {tw > 0 ? `${n} / ${tw}` : n > 0 ? `${n} 字` : "空"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </nav>
          )}
        </div>
      </div>
    </aside>
  );
}
