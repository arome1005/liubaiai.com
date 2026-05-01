/**
 * 章节概要编辑弹窗：
 * - 状态：`summaryOpen` / `summaryDraft` / `summaryAiBusy`
 * - 打开弹窗时同步草稿
 * - `runChapterSummaryAi`：手动触发 AI 生成 → 写库 → 回写 chapters（含乐观锁）
 *
 * 行为与原 `EditorPage.tsx` 内联实现一致；导出 abort ref 以便页面在卸载时主动 abort。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { isFirstAiGateCancelledError } from "../ai/client";
import { generateChapterSummaryWithRetry } from "../ai/chapter-summary-generate";
import { rememberLastUsedAiProvider } from "../ai/last-used-provider";
import { loadAiSettings } from "../ai/storage";
import type { AiProviderId } from "../ai/types";
import { updateChapter } from "../db/repo";
import type { Chapter, Work } from "../db/types";

export interface UseEditorChapterSummaryModalParams {
  activeChapter: Chapter | null;
  work: Work | null;
  /** 当前编辑器内的正文（与 chapters 列表中可能存在差异，须以编辑器为准） */
  content: string;
  chapterServerUpdatedAtRef: React.RefObject<Map<string, number>>;
  setChapters: React.Dispatch<React.SetStateAction<Chapter[]>>;
}

export interface RunChapterSummaryAiOpts {
  providerOverride?: AiProviderId;
  lengthHint200to500?: boolean;
  rememberLast?: AiProviderId;
}

export interface UseEditorChapterSummaryModalReturn {
  summaryOpen: boolean;
  setSummaryOpen: React.Dispatch<React.SetStateAction<boolean>>;
  summaryDraft: string;
  setSummaryDraft: React.Dispatch<React.SetStateAction<string>>;
  summaryAiBusy: boolean;
  /** 直接暴露给「取消生成」按钮使用 */
  setSummaryAiBusy: React.Dispatch<React.SetStateAction<boolean>>;
  /** 暴露给页面 abort，比如卸载/退出弹窗时 */
  summaryAiAbortRef: React.MutableRefObject<AbortController | null>;
  runChapterSummaryAi: (opts: RunChapterSummaryAiOpts) => Promise<void>;
}

export function useEditorChapterSummaryModal({
  activeChapter,
  work,
  content,
  chapterServerUpdatedAtRef,
  setChapters,
}: UseEditorChapterSummaryModalParams): UseEditorChapterSummaryModalReturn {
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [summaryAiBusy, setSummaryAiBusy] = useState(false);
  const summaryAiAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!summaryOpen || !activeChapter) return;
    setSummaryDraft(activeChapter.summary ?? "");
  }, [summaryOpen, activeChapter]);

  const runChapterSummaryAi = useCallback(
    async (opts: RunChapterSummaryAiOpts) => {
      if (!activeChapter || !work) return;
      summaryAiAbortRef.current?.abort();
      const ac = new AbortController();
      summaryAiAbortRef.current = ac;
      setSummaryAiBusy(true);
      try {
        const base = loadAiSettings();
        const text = await generateChapterSummaryWithRetry({
          workTitle: work.title || "未命名作品",
          chapterTitle: activeChapter.title,
          chapterContent: content,
          settings: base,
          providerOverride: opts.providerOverride,
          lengthHint200to500: opts.lengthHint200to500,
          signal: ac.signal,
        });
        setSummaryDraft(text);
        const exp = chapterServerUpdatedAtRef.current?.get(activeChapter.id);
        const summaryTs = Date.now();
        const newAt = await updateChapter(
          activeChapter.id,
          {
            summary: text,
            summaryUpdatedAt: summaryTs,
            summaryScopeFromOrder: activeChapter.order,
            summaryScopeToOrder: activeChapter.order,
          },
          exp !== undefined ? { expectedUpdatedAt: exp } : undefined,
        );
        const t = newAt ?? summaryTs;
        setChapters((prev) =>
          prev.map((c) =>
            c.id === activeChapter.id
              ? {
                  ...c,
                  summary: text,
                  summaryUpdatedAt: summaryTs,
                  summaryScopeFromOrder: activeChapter.order,
                  summaryScopeToOrder: activeChapter.order,
                  updatedAt: t,
                }
              : c,
          ),
        );
        if (opts.rememberLast) rememberLastUsedAiProvider(opts.rememberLast);
      } catch (e) {
        if (isFirstAiGateCancelledError(e)) return;
        if (e instanceof DOMException && e.name === "AbortError") return;
        toast.error(e instanceof Error ? e.message : "生成失败");
      } finally {
        setSummaryAiBusy(false);
        summaryAiAbortRef.current = null;
      }
    },
    [activeChapter, content, work, chapterServerUpdatedAtRef, setChapters],
  );

  return {
    summaryOpen,
    setSummaryOpen,
    summaryDraft,
    setSummaryDraft,
    summaryAiBusy,
    setSummaryAiBusy,
    summaryAiAbortRef,
    runChapterSummaryAi,
  };
}
