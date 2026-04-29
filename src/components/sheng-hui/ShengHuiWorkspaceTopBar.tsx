import { Link } from "react-router-dom";
import { Maximize2, Minimize2, Undo2 } from "lucide-react";
import type { Work } from "../../db/types";
import { buildTuiyanWorkbenchUrl, buildWorkEditorUrl } from "../../util/sheng-hui-deeplink";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { ShengHuiModelTrigger } from "./ShengHuiModelTrigger";
import { ShengHuiTopBarMetricsRow } from "./ShengHuiTopBarMetricsRow";
import type { AiSettings } from "../../ai/types";

export function ShengHuiWorkspaceTopBar(props: {
  workId: string | null;
  chapterId: string | null;
  work: Work | null;
  settings: AiSettings;
  onOpenModelPicker: () => void;
  loading: boolean;
  focusMode: boolean;
  onToggleFocus: () => void;
  busy: boolean;
  genElapsedSec: number;
  lastRoughEstimate: { totalApprox: number } | null;
  todayTokensSnapshot: number;
  dailyTokenBudget: number;
}) {
  const {
    workId,
    chapterId,
    work,
    settings,
    onOpenModelPicker,
    loading,
    focusMode,
    onToggleFocus,
    busy,
    genElapsedSec,
    lastRoughEstimate,
    todayTokensSnapshot,
    dailyTokenBudget,
  } = props;

  return (
    <header className="relative z-10 flex min-h-0 shrink-0 flex-col border-b border-border/40 bg-card/45 backdrop-blur">
      <div className="flex min-h-12 flex-col gap-1.5 px-2 py-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:px-4 sm:py-0">
        <div className="flex min-w-0 min-h-0 flex-1 items-center gap-1.5 sm:gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" asChild title="返回作品库" aria-label="返回作品库">
            <Link to="/library">
              <Undo2 className="size-4" />
            </Link>
          </Button>
        </div>

        <div className="flex w-full min-w-0 min-h-0 shrink-0 items-center justify-end gap-1 sm:w-auto sm:gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant={focusMode ? "secondary" : "ghost"}
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={onToggleFocus}
                aria-pressed={focusMode}
                aria-label={focusMode ? "退出专注" : "专注主稿"}
              >
                {focusMode ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">专注主稿：仅顶栏与主稿（F11 或 ⌘\\）</TooltipContent>
          </Tooltip>
          <ShengHuiModelTrigger settings={settings} onOpen={onOpenModelPicker} disabled={loading} className="max-w-[8.5rem] sm:max-w-[15rem]" />
          {workId ? (
            <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" asChild>
              <Link to={work ? buildWorkEditorUrl(work, chapterId, true) : `/work/${workId}`}>写作</Link>
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" className="hidden h-8 px-2 text-xs sm:inline-flex" asChild>
            <Link to={workId ? buildTuiyanWorkbenchUrl(workId, chapterId) : "/logic"}>推演</Link>
          </Button>
          <Button variant="ghost" size="sm" className="hidden h-8 px-2 text-xs md:inline-flex" asChild>
            <Link to="/reference">藏经</Link>
          </Button>
        </div>
      </div>
      <ShengHuiTopBarMetricsRow
        busy={busy}
        genElapsedSec={genElapsedSec}
        lastRoughEstimate={lastRoughEstimate}
        todayTokensSnapshot={todayTokensSnapshot}
        dailyTokenBudget={dailyTokenBudget}
      />
    </header>
  );
}
