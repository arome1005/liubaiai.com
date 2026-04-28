import { Link } from "react-router-dom";
import { ChevronDown, Maximize2, Minimize2, Undo2 } from "lucide-react";
import type { Chapter, Work } from "../../db/types";
import { formatShengHuiIllustrativeYuan } from "../../util/sheng-hui-ui-display";
import { buildWorkEditorUrl } from "../../util/sheng-hui-deeplink";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { ShengHuiModelTrigger } from "./ShengHuiModelTrigger";
import type { AiSettings } from "../../ai/types";
import { cn } from "../../lib/utils";

export function ShengHuiWorkspaceTopBar(props: {
  works: Work[];
  workId: string | null;
  onWorkIdChange: (id: string | null) => void;
  lastWorkStorageKey: string;
  chapters: Chapter[];
  chapterId: string | null;
  onChapterIdChange: (id: string | null) => void;
  work: Work | null;
  selectedChapter: Chapter | undefined;
  settings: AiSettings;
  onOpenModelPicker: () => void;
  loading: boolean;
  busy: boolean;
  genElapsedSec: number;
  lastTotalApprox: number | null;
  todayTokensSnapshot: number;
  focusMode: boolean;
  onToggleFocus: () => void;
}) {
  const {
    works,
    workId,
    onWorkIdChange,
    lastWorkStorageKey,
    chapters,
    chapterId,
    onChapterIdChange,
    work,
    selectedChapter,
    settings,
    onOpenModelPicker,
    loading,
    busy,
    genElapsedSec,
    lastTotalApprox,
    todayTokensSnapshot,
    focusMode,
    onToggleFocus,
  } = props;

  const workLabel = (work?.title ?? "").trim() || "未命名作品";
  const chapterLabel = (selectedChapter?.title ?? "").trim() || "未选章节";
  const approxStr =
    lastTotalApprox != null && lastTotalApprox > 0
      ? `~${(lastTotalApprox / 1000).toFixed(1)}k`
      : "—";
  const yen = formatShengHuiIllustrativeYuan(todayTokensSnapshot);

  return (
    <header className="relative z-10 flex min-h-12 shrink-0 flex-col gap-1.5 border-b border-border/40 bg-card/45 px-2 py-1.5 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:px-4 sm:py-0">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 sm:gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" asChild title="返回作品库" aria-label="返回作品库">
          <Link to="/library">
            <Undo2 className="size-4" />
          </Link>
        </Button>

        <nav
          className="flex min-w-0 max-w-full items-center gap-0.5 text-[11px] text-muted-foreground sm:text-xs"
          aria-label="作品与章节"
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex max-w-[40vw] min-w-0 items-center gap-0.5 truncate rounded-md px-1.5 py-0.5 font-medium text-foreground hover:bg-accent/80 sm:max-w-[12rem]"
              >
                <span className="truncate">{workLabel}</span>
                <ChevronDown className="size-3 shrink-0 opacity-50" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-72 w-[min(20rem,90vw)]">
              <DropdownMenuLabel>切换作品</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {works.map((w) => (
                <DropdownMenuItem
                  key={w.id}
                  onClick={() => {
                    onWorkIdChange(w.id);
                    try {
                      if (w.id) localStorage.setItem(lastWorkStorageKey, w.id);
                    } catch {
                      /* ignore */
                    }
                  }}
                  className={cn(w.id === workId && "bg-primary/10")}
                >
                  {w.title.trim() || "未命名"}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <span className="shrink-0 text-muted-foreground/50">›</span>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex max-w-[40vw] min-w-0 items-center gap-0.5 truncate rounded-md px-1.5 py-0.5 font-medium text-foreground hover:bg-accent/80 sm:max-w-[12rem]"
                disabled={!chapters.length}
              >
                <span className="truncate">{chapterLabel}</span>
                <ChevronDown className="size-3 shrink-0 opacity-50" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-72 w-[min(20rem,90vw)]">
              <DropdownMenuLabel>切换章节</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {chapters.map((c) => (
                <DropdownMenuItem
                  key={c.id}
                  onClick={() => onChapterIdChange(c.id)}
                  className={cn(c.id === chapterId && "bg-primary/10")}
                >
                  {c.title || "未命名章节"}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>

        {busy ? (
          <output
            className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2 py-0.5 text-[10px] text-primary sm:text-[11px]"
            aria-live="polite"
          >
            <span className="inline-block size-1.5 shrink-0 animate-pulse rounded-full bg-primary" />
            <span>生成中</span>
            <span className="text-muted-foreground">· {genElapsedSec}s</span>
            <span className="text-muted-foreground">· {approxStr} tok</span>
          </output>
        ) : null}
      </div>

      <div className="flex w-full min-w-0 items-center justify-between gap-2 sm:w-auto sm:justify-end">
        <div className="flex items-center gap-1">
          <span
            className="hidden rounded-md border border-border/50 bg-background/50 px-2 py-0.5 text-[10px] text-muted-foreground md:inline"
            title="本机粗估 token，¥ 为示意换算"
          >
            今日 ≈{todayTokensSnapshot.toLocaleString()} tok · ¥{yen}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant={focusMode ? "secondary" : "ghost"}
                size="icon"
                className="h-8 w-8"
                onClick={onToggleFocus}
                aria-pressed={focusMode}
                aria-label={focusMode ? "退出专注" : "专注主稿"}
              >
                {focusMode ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">专注主稿：仅顶栏与主稿（⌘\\）</TooltipContent>
          </Tooltip>
        </div>
        <div className="flex min-w-0 items-center justify-end gap-1">
          <ShengHuiModelTrigger settings={settings} onOpen={onOpenModelPicker} disabled={loading} className="max-w-[8.5rem] sm:max-w-[15rem]" />
          {workId ? (
            <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" asChild>
              <Link to={work ? buildWorkEditorUrl(work, chapterId, true) : `/work/${workId}`}>写作</Link>
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" className="hidden h-8 px-2 text-xs sm:inline-flex" asChild>
            <Link to="/logic">推演</Link>
          </Button>
          <Button variant="ghost" size="sm" className="hidden h-8 px-2 text-xs md:inline-flex" asChild>
            <Link to="/reference">藏经</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
