import { Link } from "react-router-dom";
import { Button } from "../ui/button";
import { ShengHuiStepHint } from "./ShengHuiStepHint";
import { buildWorkEditorUrl } from "../../util/sheng-hui-deeplink";
import type { Work } from "../../db/types";
import { cn } from "../../lib/utils";
import type { ShengHuiEmotionTemperature } from "../../ai/sheng-hui-generate";

export function ShengHuiCenterManuscriptColumn(props: {
  showStepHint: boolean;
  onDismissStepHint: () => void;
  output: string;
  onOutputChange: (v: string) => void;
  busy: boolean;
  modeDesc: string;
  wordCount: number;
  onCopy: () => void;
  onWriteBack: () => void;
  writeBackStatus: null | "ok" | "error";
  writeBackError: string;
  canWriteBack: boolean;
  work: Work | null;
  workId: string | null;
  chapterId: string | null;
  /** 1–5 情绪档，影响主稿纸色微差 */
  emotionTemperature: ShengHuiEmotionTemperature;
  /** 仅顶栏+主稿，放大衬线区 */
  focusMode: boolean;
  targetWords: number;
}) {
  const {
    showStepHint,
    onDismissStepHint,
    output,
    onOutputChange,
    busy,
    modeDesc,
    wordCount,
    onCopy,
    onWriteBack,
    writeBackStatus,
    writeBackError,
    canWriteBack,
    work,
    workId,
    chapterId,
    emotionTemperature,
    focusMode,
    targetWords,
  } = props;

  const paperTint =
    emotionTemperature <= 2
      ? "sheng-hui-paper--cool"
      : emotionTemperature >= 4
        ? "sheng-hui-paper--warm"
        : "sheng-hui-paper--neutral";
  const progressPct =
    targetWords > 0 && wordCount > 0 ? Math.min(100, Math.round((wordCount / targetWords) * 100)) : null;

  return (
    <section
      className={cn(
        "order-1 flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden px-0.5 sm:px-1 lg:order-2",
        focusMode && "lg:mx-auto lg:max-w-[min(100%,48rem)]",
      )}
    >
      {showStepHint ? <ShengHuiStepHint onDismiss={onDismissStepHint} /> : null}

      <div
        className={cn(
          "sheng-hui-desk sheng-hui-glass-panel flex min-h-0 flex-1 flex-col gap-2 rounded-2xl border border-white/[0.06] bg-gradient-to-b from-card/80 to-card/50 p-3 shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_8px_24px_-12px_rgba(0,0,0,0.22)]",
          focusMode && "min-h-0",
        )}
      >
        <div className="flex h-0.5 shrink-0 rounded-full bg-gradient-to-r from-primary/40 to-chart-2/35" aria-hidden />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium leading-none tracking-tight text-foreground">主稿</span>
          {busy ? <span className="animate-pulse text-[11px] text-primary">生成中…</span> : null}
          {output.trim() && !busy ? (
            <span className="text-[11px] text-muted-foreground/60 tabular-nums">{wordCount} 字</span>
          ) : null}
          {progressPct != null && targetWords > 0 ? (
            <span className="text-[10px] text-muted-foreground/70 tabular-nums">目标 {targetWords} · 约 {progressPct}%</span>
          ) : null}
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={onCopy}
              disabled={!output.trim() || busy}
            >
              复制
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={onWriteBack}
              disabled={!canWriteBack}
              title={!chapterId ? "需选择章节才能写回侧栏" : "写入写作侧栏草稿，在写作页合并到正文"}
            >
              写回侧栏草稿
            </Button>
          </div>
        </div>

        {writeBackStatus === "ok" ? (
          <div className="flex flex-col gap-2">
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
              ✓ 已写入侧栏草稿。可在写作页 AI 侧栏草稿区合并到正文。
            </p>
            {workId && work ? (
              <Button variant="outline" size="sm" className="h-7 w-fit text-xs" asChild>
                <Link to={buildWorkEditorUrl(work, chapterId, true)}>去写作页并打开 AI 侧栏</Link>
              </Button>
            ) : null}
          </div>
        ) : null}
        {writeBackStatus === "error" ? <p className="text-[11px] text-destructive">{writeBackError}</p> : null}

        <textarea
          className={cn(
            "sheng-hui-paper sheng-hui-paper-typography min-h-0 min-h-[50vh] flex-1 resize-none rounded-xl border border-border/40 p-4 text-foreground placeholder:text-muted-foreground/40 focus:border-primary/35 focus:outline-none focus:ring-2 focus:ring-primary/15",
            paperTint,
            focusMode && "min-h-[60vh] text-[17px] leading-[1.9] sm:text-[18px]",
            !focusMode && "bg-background/80",
            focusMode && "bg-background/90",
          )}
          placeholder={busy ? "生成中…" : `在此编辑正文…\n（${modeDesc}）`}
          value={output}
          onChange={(e) => onOutputChange(e.target.value)}
          aria-label="生辉主稿"
          disabled={busy}
        />
      </div>
    </section>
  );
}
