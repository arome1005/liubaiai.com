import { Link } from "react-router-dom";
import { Button } from "../ui/button";
import { ShengHuiStepHint } from "./ShengHuiStepHint";
import { buildWorkEditorUrl } from "../../util/sheng-hui-deeplink";
import type { Work } from "../../db/types";

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
  } = props;

  return (
    <section className="order-1 flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden px-0.5 sm:px-1 lg:order-2">
      {showStepHint ? <ShengHuiStepHint onDismiss={onDismissStepHint} /> : null}

      <div className="sheng-hui-desk flex min-h-0 flex-1 flex-col gap-2 rounded-2xl border border-primary/10 bg-gradient-to-b from-card/80 to-card/50 p-3 shadow-md">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">主稿</span>
          {busy ? <span className="animate-pulse text-[11px] text-primary">生成中…</span> : null}
          {output.trim() && !busy ? (
            <span className="text-[11px] text-muted-foreground/60">{wordCount} 字</span>
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
          className="sheng-hui-paper min-h-0 min-h-[50vh] flex-1 resize-none rounded-xl border border-border/40 bg-background/80 p-4 text-foreground placeholder:text-muted-foreground/40 focus:border-primary/35 focus:outline-none focus:ring-2 focus:ring-primary/15"
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
