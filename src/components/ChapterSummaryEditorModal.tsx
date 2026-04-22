import { Check, RefreshCw, Wand2, X } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "../lib/utils";
import { formatSummaryScope, formatSummaryUpdatedAt } from "../util/summary-meta";

export type ChapterSummaryEditorModalProps = {
  open: boolean;
  onCancelGenerate?: () => void;
  chapterTitle: string;
  summaryDraft: string;
  onSummaryDraftChange: (next: string) => void;
  summaryUpdatedAt?: number | null;
  summaryScopeFromOrder?: number | null;
  summaryScopeToOrder?: number | null;
  summaryAiBusy: boolean;
  onClose: () => void;
  /** 从章节已保存概要刷新到编辑框 */
  onRefreshFromSaved: () => void;
  /** 保存并关闭 */
  onSaveAndClose: () => void | Promise<void>;
  /** 一键生成：最近使用模型 + 约 200～500 字 */
  onOneClickGenerate: () => void;
  /** 生成概要：设置页当前默认模型 + 内置要点提示 */
  onDefaultGenerate: () => void;
  onOpenBatch: () => void;
  /** 仅保存当前编辑框 */
  onSaveDraft: () => void | Promise<void>;
};

export function ChapterSummaryEditorModal(props: ChapterSummaryEditorModalProps) {
  const {
    open,
    onCancelGenerate,
    chapterTitle,
    summaryDraft,
    onSummaryDraftChange,
    summaryUpdatedAt,
    summaryScopeFromOrder,
    summaryScopeToOrder,
    summaryAiBusy,
    onClose,
    onRefreshFromSaved,
    onSaveAndClose,
    onOneClickGenerate,
    onDefaultGenerate,
    onOpenBatch,
    onSaveDraft,
  } = props;

  if (!open) return null;

  const wc = summaryDraft.length;

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className={cn(
          "modal-card modal-card--wide chapter-summary-editor-modal",
          "flex max-h-[min(90dvh,920px)] flex-col gap-3",
        )}
        role="dialog"
        aria-labelledby="chapter-summary-editor-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/50 pb-2">
          <h3 id="chapter-summary-editor-title" className="m-0 text-base font-semibold tracking-tight">
            编辑章节概要
            <span className="ml-2 font-normal text-muted-foreground">· {chapterTitle}</span>
          </h3>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              className="icon-btn rounded-md border border-border/60 bg-background/80 px-2 py-1.5 text-xs hover:bg-accent/40"
              title="从已保存概要刷新到编辑框"
              disabled={summaryAiBusy}
              onClick={onRefreshFromSaved}
            >
              <RefreshCw className="size-4" aria-hidden />
              <span className="sr-only sm:not-sr-only sm:ml-1">刷新</span>
            </button>
            <button
              type="button"
              className="icon-btn rounded-md border border-border/60 bg-background/80 px-2 py-1.5 text-xs hover:bg-accent/40"
              title="保存并关闭"
              disabled={summaryAiBusy}
              onClick={() => void onSaveAndClose()}
            >
              <Check className="size-4 text-emerald-600" aria-hidden />
            </button>
            <button
              type="button"
              className="icon-btn rounded-md border border-border/60 bg-background/80 px-2 py-1.5 text-xs hover:bg-accent/40"
              title="关闭"
              disabled={summaryAiBusy}
              onClick={onClose}
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </div>

        {formatSummaryUpdatedAt(summaryUpdatedAt ?? null) ? (
          <p className="m-0 text-xs text-muted-foreground">
            概要上次更新：{formatSummaryUpdatedAt(summaryUpdatedAt ?? null)}
          </p>
        ) : null}
        {formatSummaryScope(summaryScopeFromOrder ?? null, summaryScopeToOrder ?? null) ? (
          <p className="m-0 text-xs text-muted-foreground">
            {formatSummaryScope(summaryScopeFromOrder ?? null, summaryScopeToOrder ?? null)}
          </p>
        ) : null}

        <div className="relative min-h-0 flex-1">
          <textarea
            value={summaryDraft}
            onChange={(e) => onSummaryDraftChange(e.target.value)}
            rows={14}
            className="h-full min-h-[220px] w-full resize-y rounded-md border border-border/60 bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="请输入章节概要"
            disabled={summaryAiBusy}
            spellCheck={false}
          />
          <span className="pointer-events-none absolute bottom-2 right-2 rounded bg-background/90 px-1.5 py-0.5 text-[0.7rem] text-muted-foreground tabular-nums">
            {wc}
          </span>
        </div>

        <p className="m-0 text-[0.72rem] leading-relaxed text-muted-foreground">
          生成时会向所选模型上传本章节选；云端请在隐私中允许。计费以提供方为准。
        </p>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn inline-flex items-center gap-1.5 border border-sky-500/35 bg-sky-500/10 text-sky-900 dark:text-sky-100"
              disabled={summaryAiBusy}
              onClick={onOneClickGenerate}
            >
              <Wand2 className="size-4 shrink-0" aria-hidden />
              {summaryAiBusy ? "生成中…" : "一键生成"}
            </button>
            <button
              type="button"
              className="btn inline-flex items-center gap-1.5 border border-teal-500/35 bg-teal-500/10 text-teal-900 dark:text-teal-100"
              disabled={summaryAiBusy}
              onClick={onOpenBatch}
            >
              批量生成
            </button>
            <button
              type="button"
              className="btn border border-amber-500/30 bg-amber-500/10 text-amber-950 dark:text-amber-100"
              disabled={summaryAiBusy}
              onClick={onDefaultGenerate}
            >
              生成概要
            </button>
            {summaryAiBusy && onCancelGenerate ? (
              <button type="button" className="btn ghost" onClick={onCancelGenerate}>
                取消生成
              </button>
            ) : null}
          </div>
          <button
            type="button"
            className="btn primary"
            disabled={summaryAiBusy}
            onClick={() => void onSaveDraft()}
          >
            保存
          </button>
        </div>
        <p className="m-0 text-center text-[0.65rem] text-muted-foreground">
          管理提示词请前往{" "}
          <Link to="/prompts" className="text-primary underline-offset-2 hover:underline">
            提示词库
          </Link>
        </p>
      </div>
    </div>
  );
}
