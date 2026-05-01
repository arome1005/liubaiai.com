import { useState } from "react";
import { toast } from "sonner";
import { isChapterSaveConflictError, updateChapter } from "../db/repo";
import type { Chapter } from "../db/types";

export interface UseEditorSummarySaveParams {
  activeId: string | null;
  activeChapter: Chapter | null;
  summaryDraft: string;
  chapterServerUpdatedAtRef: React.MutableRefObject<Map<string, number>>;
  setChapters: React.Dispatch<React.SetStateAction<Chapter[]>>;
  setSummaryOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSummaryDraft: React.Dispatch<React.SetStateAction<string>>;
}

export function useEditorSummarySave({
  activeId,
  activeChapter,
  summaryDraft,
  chapterServerUpdatedAtRef,
  setChapters,
  setSummaryOpen,
  setSummaryDraft,
}: UseEditorSummarySaveParams) {
  const [batchSummaryOpen, setBatchSummaryOpen] = useState(false);

  async function saveSummary(closeAfter: boolean) {
    if (!activeChapter) return;
    try {
      const exp = chapterServerUpdatedAtRef.current.get(activeChapter.id);
      const st = Date.now();
      const newAt = await updateChapter(
        activeChapter.id,
        {
          summary: summaryDraft,
          summaryUpdatedAt: st,
          summaryScopeFromOrder: activeChapter.summaryScopeFromOrder ?? activeChapter.order,
          summaryScopeToOrder: activeChapter.summaryScopeToOrder ?? activeChapter.order,
        },
        exp !== undefined ? { expectedUpdatedAt: exp } : undefined,
      );
      const t = newAt ?? st;
      setChapters((prev) =>
        prev.map((c) =>
          c.id === activeChapter.id
            ? {
                ...c,
                summary: summaryDraft,
                summaryUpdatedAt: st,
                summaryScopeFromOrder: c.summaryScopeFromOrder ?? c.order,
                summaryScopeToOrder: c.summaryScopeToOrder ?? c.order,
                updatedAt: t,
              }
            : c,
        ),
      );
      if (closeAfter) setSummaryOpen(false);
    } catch (e) {
      if (isChapterSaveConflictError(e)) {
        toast.error("概要保存冲突：请关闭弹窗后「重新载入本章」再试。");
      }
    }
  }

  async function onChapterSummarySaved(
    chapterId: string,
    summary: string,
    summaryUpdatedAt: number,
    order: number,
  ) {
    const exp = chapterServerUpdatedAtRef.current.get(chapterId);
    const newAt = await updateChapter(
      chapterId,
      {
        summary,
        summaryUpdatedAt,
        summaryScopeFromOrder: order,
        summaryScopeToOrder: order,
      },
      exp !== undefined ? { expectedUpdatedAt: exp } : undefined,
    );
    const uAt = newAt ?? summaryUpdatedAt;
    setChapters((prev) =>
      prev.map((c) =>
        c.id === chapterId
          ? {
              ...c,
              summary,
              summaryUpdatedAt,
              summaryScopeFromOrder: order,
              summaryScopeToOrder: order,
              updatedAt: uAt,
            }
          : c,
      ),
    );
    if (activeId === chapterId) {
      setSummaryDraft(summary);
    }
  }

  return {
    batchSummaryOpen,
    setBatchSummaryOpen,
    saveSummary,
    onChapterSummarySaved,
  };
}
