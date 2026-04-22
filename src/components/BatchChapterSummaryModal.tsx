import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Play, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { generateChapterSummaryWithRetry } from "../ai/chapter-summary-generate";
import { loadAiSettings, type AiSettings } from "../ai/storage";
import type { AiProviderId } from "../ai/types";
import type { Chapter } from "../db/types";
import type { GlobalPromptTemplate } from "../db/types";
import { listSummaryPromptHotlist } from "../util/summary-prompt-hotlist";
import { aiModelIdToProvider, aiProviderToModelId } from "../util/ai-ui-model-map";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Spinner } from "./ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { AI_MODELS } from "./ai-model-selector";
import { UnifiedAIModelSelector as AIModelSelector } from "./ai-model-selector-unified";
import { ArticleSummaryPromptBrowseModal } from "./article-summary-prompts/ArticleSummaryPromptBrowseModal";
import { ArticleSummaryPromptQuickDialog } from "./article-summary-prompts/ArticleSummaryPromptQuickDialog";
import {
  BatchChapterSummaryProgressModal,
  type BatchChapterTask,
  type BatchTaskStatus,
} from "./BatchChapterSummaryProgressModal";

export type BatchChapterSummaryModalProps = {
  open: boolean;
  onClose: () => void;
  workTitle: string;
  chapters: Chapter[];
  /** 每章写库成功后回调（用于父级 setChapters） */
  onChapterSummarySaved: (
    chapterId: string,
    summary: string,
    summaryUpdatedAt: number,
    order: number,
  ) => Promise<void> | void;
  /** 批量成功结束后打开「编辑章节概要」（按章节序号最先成功的一章） */
  onNavigateToSummaryEditor?: (chapterId: string, summary: string) => void;
};

export function BatchChapterSummaryModal(props: BatchChapterSummaryModalProps) {
  const { open, onClose, workTitle, chapters, onChapterSummarySaved, onNavigateToSummaryEditor } =
    props;

  const [hotList, setHotList] = useState<GlobalPromptTemplate[]>([]);
  const [selectedHotId, setSelectedHotId] = useState<string | null>(null);
  const [pickerTemplate, setPickerTemplate] = useState<GlobalPromptTemplate | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string>(() =>
    aiProviderToModelId(loadAiSettings().provider),
  );
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [extraNote, setExtraNote] = useState("");
  const [running, setRunning] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);

  const providerId = useMemo<AiProviderId>(
    () => aiModelIdToProvider(selectedModelId),
    [selectedModelId],
  );
  const currentModel = useMemo(
    () => AI_MODELS.find((m) => m.id === selectedModelId) ?? AI_MODELS[0],
    [selectedModelId],
  );

  const [progressOpen, setProgressOpen] = useState(false);
  const [batchPhase, setBatchPhase] = useState<"running" | "done" | "cancelled">("done");
  const [batchTasks, setBatchTasks] = useState<BatchChapterTask[]>([]);
  const [batchOk, setBatchOk] = useState(0);
  const [batchFail, setBatchFail] = useState(0);
  const [batchSkipped, setBatchSkipped] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const bestNavRef = useRef<{ chapterId: string; summary: string; order: number } | null>(null);

  const settings = useMemo(() => loadAiSettings(), [open]);

  useEffect(() => {
    if (!open) {
      setQuickOpen(false);
      setBrowseOpen(false);
      setProgressOpen(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setSelectedModelId(aiProviderToModelId(settings.provider));
    void listSummaryPromptHotlist(5).then((list) => {
      setHotList(list);
      if (list[0]) setSelectedHotId(list[0].id);
    });
  }, [open, settings.provider]);

  const sortedChapters = useMemo(
    () => [...chapters].sort((a, b) => a.order - b.order),
    [chapters],
  );

  const activeTemplate = useMemo(() => {
    const fromPicker = pickerTemplate;
    if (fromPicker) return fromPicker;
    return hotList.find((h) => h.id === selectedHotId) ?? null;
  }, [hotList, pickerTemplate, selectedHotId]);

  const toggleId = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectOnlyEmpty = useCallback(() => {
    const next = new Set<string>();
    for (const c of sortedChapters) {
      if (!(c.summary ?? "").trim()) next.add(c.id);
    }
    setSelectedIds(next);
    toast.message(`已选仅空概要：${next.size} 章`);
  }, [sortedChapters]);

  const selectFirstN = useCallback(
    (n: number) => {
      const next = new Set<string>();
      for (const c of sortedChapters.slice(0, n)) {
        next.add(c.id);
      }
      setSelectedIds(next);
    },
    [sortedChapters],
  );

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(sortedChapters.map((c) => c.id)));
  }, [sortedChapters]);

  const runBatch = useCallback(async () => {
    if (selectedIds.size === 0) {
      toast.error("请先选择至少一章");
      return;
    }
    if (!activeTemplate?.body?.trim()) {
      toast.error("请选择或拾取一条提示词作为 system 指令");
      return;
    }
    const sFull = loadAiSettings();
    const merged: AiSettings = { ...sFull, provider: providerId };

    const ordered = sortedChapters.filter((c) => selectedIds.has(c.id));
    if (ordered.length === 0) {
      toast.error("所选章节无效");
      return;
    }

    const initialTasks: BatchChapterTask[] = ordered.map((c) => ({
      chapterId: c.id,
      title: c.title,
      order: c.order,
      status: "pending",
    }));

    bestNavRef.current = null;
    abortRef.current = new AbortController();
    setBatchTasks(initialTasks);
    setBatchOk(0);
    setBatchFail(0);
    setBatchSkipped(0);
    setBatchPhase("running");
    setProgressOpen(true);
    setRunning(true);

    let ok = 0;
    let fail = 0;
    let skipped = 0;
    let stopped = false;

    const mark = (id: string, status: BatchTaskStatus) => {
      setBatchTasks((prev) => prev.map((t) => (t.chapterId === id ? { ...t, status } : t)));
    };

    for (const ch of ordered) {
      mark(ch.id, "running");
      const body = (ch.content ?? "").trim();
      if (!body) {
        toast.error(`「${ch.title}」无正文，已跳过`);
        mark(ch.id, "skipped");
        skipped++;
        continue;
      }
      try {
        const text = await generateChapterSummaryWithRetry({
          workTitle,
          chapterTitle: ch.title,
          chapterContent: body,
          settings: merged,
          providerOverride: providerId,
          systemPromptOverride: activeTemplate.body,
          extraUserNote: extraNote.trim() || undefined,
          lengthHint200to500: false,
          signal: abortRef.current?.signal,
        });
        const t = Date.now();
        await onChapterSummarySaved(ch.id, text, t, ch.order);
        mark(ch.id, "done");
        ok++;
        const cur = bestNavRef.current;
        if (!cur || ch.order < cur.order) {
          bestNavRef.current = { chapterId: ch.id, summary: text, order: ch.order };
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          mark(ch.id, "skipped");
          stopped = true;
          break;
        }
        mark(ch.id, "failed");
        fail++;
        toast.error(`「${ch.title}」失败：${e instanceof Error ? e.message : "未知错误"}`);
      }
    }

    setBatchOk(ok);
    setBatchFail(fail);
    setBatchSkipped(skipped);
    setRunning(false);
    abortRef.current = null;

    if (stopped) {
      setBatchPhase("cancelled");
      toast.message("已停止批量生成");
    } else {
      setBatchPhase("done");
      toast.success(`批量完成：成功 ${ok}，失败 ${fail}${skipped ? `，跳过 ${skipped}` : ""}`);
    }
  }, [activeTemplate, extraNote, onChapterSummarySaved, providerId, selectedIds, sortedChapters, workTitle]);

  const handleStopBatch = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleOpenSummaryFromBatch = useCallback(() => {
    const b = bestNavRef.current;
    if (!b || !onNavigateToSummaryEditor) return;
    setProgressOpen(false);
    onClose();
    onNavigateToSummaryEditor(b.chapterId, b.summary);
  }, [onClose, onNavigateToSummaryEditor]);

  const handleDismissProgress = useCallback(() => {
    setProgressOpen(false);
  }, []);

  const batchFinishedCount = useMemo(
    () =>
      batchTasks.filter((t) => t.status === "done" || t.status === "failed" || t.status === "skipped")
        .length,
    [batchTasks],
  );

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => !v && !running && onClose()}>
      <DialogContent
        showCloseButton={false}
        /* 须高于 `.modal-overlay`（z-index:200），否则叠在章节概要弹窗之下并产生双重模糊感 */
        overlayClassName="z-[220]"
        className="z-[221] flex max-h-[min(92dvh,900px)] w-full max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl"
      >
        <DialogHeader className="shrink-0 border-b border-border/50 px-4 py-3 text-left">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="text-base">批量生成章节概要</DialogTitle>
            <button
              type="button"
              className="rounded-md p-1.5 hover:bg-accent"
              disabled={running}
              onClick={onClose}
              aria-label="关闭"
            >
              <X className="size-4" />
            </button>
          </div>
          <p className="text-xs font-normal text-muted-foreground">
            作品：{workTitle} · 按提示词库正文作为 system 指令逐章调用模型
          </p>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 md:grid-cols-[minmax(0,220px)_1fr]">
          <aside className="border-b border-border/50 bg-muted/20 p-3 md:border-b-0 md:border-r">
            <div className="mb-2 text-xs font-medium text-muted-foreground">热门 · 概述向提示词</div>
            <ul className="max-h-[40dvh] space-y-2 overflow-auto md:max-h-[min(60dvh,520px)]">
              {hotList.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    disabled={running}
                    onClick={() => {
                      setPickerTemplate(null);
                      setSelectedHotId(t.id);
                    }}
                    className={cn(
                      "w-full rounded-md border px-2 py-1.5 text-left text-xs leading-snug transition-colors",
                      selectedHotId === t.id && !pickerTemplate
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-transparent hover:bg-accent/50",
                    )}
                  >
                    <span className="line-clamp-3 font-medium">{t.title}</span>
                  </button>
                </li>
              ))}
            </ul>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 w-full text-xs"
              disabled={running}
              onClick={() => {
                setQuickOpen(false);
                setBrowseOpen(true);
              }}
            >
              更多提示词
            </Button>
          </aside>

          <div className="flex min-h-0 flex-col gap-3 overflow-auto p-4">
            <div className="space-y-1">
              <label className="text-xs font-medium">AI 模型</label>
              <button
                type="button"
                disabled={running}
                onClick={() => setModelSelectorOpen(true)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md border border-border/60 bg-background px-3 py-2 text-left text-sm transition-colors",
                  "hover:border-primary/50 hover:bg-accent/30",
                  running && "cursor-not-allowed opacity-60",
                )}
              >
                <span className="shrink-0 scale-90">{currentModel.icon}</span>
                <span className="flex-1">
                  <span className="font-medium text-foreground">{currentModel.name}</span>
                  <span className="ml-1.5 text-xs text-muted-foreground">{currentModel.subtitle}</span>
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
              <p className="text-[0.7rem] text-muted-foreground">
                与全局设置共用各提供方 Base URL / Key；可到「设置 → AI」修改。
              </p>
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium">选择章节（可多选）</span>
                <button type="button" className="text-[0.7rem] text-primary underline" disabled={running} onClick={selectOnlyEmpty}>
                  仅空概要
                </button>
                <button type="button" className="text-[0.7rem] text-primary underline" disabled={running} onClick={() => selectFirstN(3)}>
                  前3章
                </button>
                <button type="button" className="text-[0.7rem] text-primary underline" disabled={running} onClick={() => selectFirstN(5)}>
                  前5章
                </button>
                <button type="button" className="text-[0.7rem] text-primary underline" disabled={running} onClick={selectAll}>
                  全选（{sortedChapters.length}）
                </button>
              </div>
              <div className="max-h-36 overflow-auto rounded-md border border-border/50 bg-background/50 p-2 text-xs">
                {sortedChapters.map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-start gap-2 py-1">
                    <input
                      type="checkbox"
                      disabled={running}
                      checked={selectedIds.has(c.id)}
                      onChange={() => toggleId(c.id)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="text-muted-foreground">#{c.order}</span> {c.title}
                      {(c.summary ?? "").trim() ? (
                        <span className="ml-1 text-[0.65rem] text-muted-foreground">（已有概要）</span>
                      ) : (
                        <span className="ml-1 text-[0.65rem] text-amber-600/90">（空）</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium">提示词（提示词库）</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={running}
                  className={cn(
                    "h-7 gap-1.5 px-2.5 text-xs",
                    activeTemplate
                      ? "border-primary/60 bg-primary/5 text-primary"
                      : "text-muted-foreground",
                  )}
                  onClick={() => setQuickOpen(true)}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span className="max-w-[14rem] truncate">
                    {activeTemplate ? activeTemplate.title : "选择提示词"}
                  </span>
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
              </div>
              {activeTemplate ? (
                <p className="rounded-md border border-border/40 bg-muted/30 p-2 text-[0.72rem] leading-relaxed text-muted-foreground">
                  当前：<strong className="text-foreground">{activeTemplate.title}</strong>
                </p>
              ) : (
                <p className="text-xs text-destructive">请从左侧热门或上方「选择提示词」指定一条</p>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium">备注（可选）</label>
              <textarea
                value={extraNote}
                onChange={(e) => setExtraNote(e.target.value)}
                rows={3}
                disabled={running}
                placeholder="补充要求（可选）"
                className="w-full resize-y rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm"
              />
            </div>

          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border/50 px-4 py-3">
          <p className="m-0 max-w-[60%] text-[0.65rem] text-muted-foreground">
            以上内容均由 AI 生成，请人工核对后再依赖其剧情记忆。
          </p>
          <Button type="button" disabled={running} onClick={() => void runBatch()} className="gap-1.5">
            {running ? <Spinner className="size-4" /> : <Play className="size-4" />}
            {running ? "生成中…" : "开始批量生成"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    <AIModelSelector
      open={modelSelectorOpen && open}
      onOpenChange={setModelSelectorOpen}
      selectedModelId={selectedModelId}
      onSelectModel={(id) => {
        setSelectedModelId(id);
        setModelSelectorOpen(false);
      }}
      title="选择模型"
      overlayClassName="z-[222]"
      contentClassName="z-[223]"
    />

    <ArticleSummaryPromptQuickDialog
      open={quickOpen && open}
      onOpenChange={setQuickOpen}
      selectedId={activeTemplate?.id ?? null}
      activeTemplate={activeTemplate}
      onSelect={(t) => {
        setPickerTemplate(t);
        if (t) setSelectedHotId(null);
      }}
      onOpenBrowse={() => setBrowseOpen(true)}
    />

    <ArticleSummaryPromptBrowseModal
      open={browseOpen && open}
      onOpenChange={setBrowseOpen}
      selectedId={activeTemplate?.id ?? null}
      onSelect={(t) => {
        setPickerTemplate(t);
        setSelectedHotId(null);
      }}
    />

    <BatchChapterSummaryProgressModal
      open={progressOpen}
      phase={batchPhase}
      tasks={batchTasks}
      finishedCount={batchFinishedCount}
      okCount={batchOk}
      failCount={batchFail}
      skippedCount={batchSkipped}
      allowAutoNavigate={Boolean(onNavigateToSummaryEditor)}
      onStop={handleStopBatch}
      onOpenSummaryEditor={handleOpenSummaryFromBatch}
      onDismissProgress={handleDismissProgress}
    />
    </>
  );
}
