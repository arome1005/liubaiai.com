import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  Loader2,
  OctagonPause,
  X,
} from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

export type BatchTaskStatus = "pending" | "running" | "done" | "failed" | "skipped";

export type BatchChapterTask = {
  chapterId: string;
  title: string;
  order: number;
  status: BatchTaskStatus;
};

export type BatchChapterSummaryProgressModalProps = {
  open: boolean;
  phase: "running" | "done" | "cancelled";
  tasks: BatchChapterTask[];
  /** 已结束（成功+失败+跳过）条数，用于进度条 */
  finishedCount: number;
  okCount: number;
  failCount: number;
  skippedCount: number;
  /** 为 false 时不显示「立即打开」与 5 秒自动跳转（例如父级未接跳转回调） */
  allowAutoNavigate?: boolean;
  onStop: () => void;
  /** 完成且至少一章成功时：立即打开概要编辑 */
  onOpenSummaryEditor: () => void;
  /** 仅关闭进度层（不关批量窗） */
  onDismissProgress: () => void;
};

/**
 * 批量章节概要生成进度（叠在批量配置弹窗之上）
 */
export function BatchChapterSummaryProgressModal(props: BatchChapterSummaryProgressModalProps) {
  const {
    open,
    phase: phase,
    tasks,
    finishedCount,
    okCount,
    failCount,
    skippedCount,
    allowAutoNavigate = true,
    onStop,
    onOpenSummaryEditor,
    onDismissProgress,
  } = props;

  const total = tasks.length;
  const pct = total > 0 ? Math.round((finishedCount / total) * 100) : 0;

  const counts = useMemo(() => {
    let done = 0,
      running = 0,
      failed = 0,
      pending = 0,
      skipped = 0;
    for (const t of tasks) {
      if (t.status === "done") done++;
      else if (t.status === "running") running++;
      else if (t.status === "failed") failed++;
      else if (t.status === "skipped") skipped++;
      else if (t.status === "pending") pending++;
    }
    return { done, running, failed, pending, skipped };
  }, [tasks]);

  const [autoSec, setAutoSec] = useState(5);
  const autoNavDoneRef = useRef(false);
  const showAuto = phase === "done" && okCount > 0 && allowAutoNavigate;

  useEffect(() => {
    autoNavDoneRef.current = false;
  }, [open, phase, okCount]);

  useEffect(() => {
    if (!open || !showAuto) {
      setAutoSec(5);
      return;
    }
    let sec = 5;
    setAutoSec(5);
    let cancelled = false;
    const id = window.setInterval(() => {
      if (cancelled) return;
      sec -= 1;
      setAutoSec(sec);
      if (sec <= 0) {
        window.clearInterval(id);
        if (!cancelled && !autoNavDoneRef.current) {
          autoNavDoneRef.current = true;
          onOpenSummaryEditor();
        }
      }
    }, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [open, showAuto, onOpenSummaryEditor]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && phase !== "running" && onDismissProgress()}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="z-[224]"
        className="z-[225] flex max-h-[min(88dvh,640px)] w-full max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        <DialogHeader className="shrink-0 border-b border-border/50 px-4 py-3 text-left">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="text-base">批量生成进度</DialogTitle>
            {phase !== "running" && (
              <button
                type="button"
                className="rounded-md p-1.5 hover:bg-accent"
                onClick={onDismissProgress}
                aria-label="关闭"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <p className="text-xs font-normal text-muted-foreground">
            {phase === "running"
              ? "总体进度 · 任务进行中…"
              : phase === "cancelled"
                ? "已停止"
                : "任务已结束"}
          </p>
        </DialogHeader>

        <div className="space-y-3 px-4 py-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {finishedCount}/{total} · {pct}%
            </span>
            {phase === "running" && (
              <span className="flex items-center gap-1 text-primary">
                <Loader2 className="size-3.5 animate-spin" />
                生成中
              </span>
            )}
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                已完成 {counts.done}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-amber-400" />
                处理中 {counts.running}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-red-500" />
                失败 {counts.failed}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-zinc-400" />
                待处理 {counts.pending}
              </span>
              {counts.skipped > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <span className="size-1.5 rounded-full bg-slate-500" />
                  跳过 {counts.skipped}
                </span>
              ) : null}
            </div>
            <p className="mb-1.5 text-xs font-medium text-foreground">章节处理状态</p>
            <ul className="max-h-[min(40dvh,280px)] space-y-1.5 overflow-y-auto pr-1">
              {tasks.map((t) => (
                <li
                  key={t.chapterId}
                  className={cn(
                    "rounded-lg border px-2.5 py-2 text-xs transition-colors",
                    t.status === "running" && "border-amber-500/50 bg-amber-500/5",
                    t.status === "done" && "border-emerald-500/40 bg-emerald-500/5",
                    t.status === "failed" && "border-red-500/40 bg-red-500/5",
                    t.status === "skipped" && "border-slate-500/40 bg-slate-500/5",
                    t.status === "pending" && "border-border/50 bg-muted/20",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium leading-snug">
                      <span className="text-muted-foreground">#{t.order}</span> {t.title}
                    </span>
                    <TaskStatusIcon status={t.status} />
                  </div>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {t.status === "pending" && "待处理"}
                    {t.status === "running" && "处理中"}
                    {t.status === "done" && "已完成"}
                    {t.status === "failed" && "失败"}
                    {t.status === "skipped" && (phase === "cancelled" ? "已停止" : "跳过（无正文）")}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t border-border/50 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>点「停止生成」将中止后续章节；当前章若已在请求中，可能仍会跑完。</span>
            {phase === "running" && <span className="shrink-0 text-primary/80">实时更新</span>}
          </div>

          {phase === "done" && okCount > 0 && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-200">
              <p className="m-0 font-medium">
                成功 {okCount} 章
                {skippedCount > 0 ? `，跳过 ${skippedCount} 章` : ""}
                {failCount > 0 ? `，失败 ${failCount} 章` : ""}
                {allowAutoNavigate
                  ? "。将打开「编辑章节概要」查看按章节序号最先成功的一章。"
                  : "。"}
              </p>
              {allowAutoNavigate && autoSec > 0 && (
                <p className="mt-1 text-[11px] opacity-90">{autoSec} 秒后自动打开…</p>
              )}
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            {phase === "running" && (
              <Button type="button" variant="secondary" className="gap-1.5" onClick={onStop}>
                <OctagonPause className="size-4" />
                停止生成
              </Button>
            )}
            {phase === "done" && okCount > 0 && allowAutoNavigate && (
              <Button
                type="button"
                className="gap-1.5"
                onClick={() => {
                  autoNavDoneRef.current = true;
                  onOpenSummaryEditor();
                }}
              >
                立即打开章节概要
              </Button>
            )}
            {phase === "done" && (
              <Button type="button" variant="outline" onClick={onDismissProgress}>
                关闭
              </Button>
            )}
            {phase === "cancelled" && (
              <Button type="button" variant="outline" onClick={onDismissProgress}>
                关闭
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TaskStatusIcon({ status }: { status: BatchTaskStatus }) {
  switch (status) {
    case "running":
      return <Loader2 className="size-4 shrink-0 animate-spin text-amber-500" />;
    case "done":
      return <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />;
    case "failed":
      return <AlertCircle className="size-4 shrink-0 text-red-500" />;
    case "skipped":
      return <CircleDashed className="size-4 shrink-0 text-muted-foreground" />;
    default:
      return <CircleDashed className="size-4 shrink-0 text-zinc-400" />;
  }
}
