/**
 * §11 步 20（可选增强）：保存正文后后台自动生成章节概要的队列接线。
 *
 * 行为与原 `EditorPage.tsx` 中两段 useEffect 完全一致：
 * 1. 挂载时创建队列并 subscribe；on "ok" 时回写 chapter（含乐观锁字段）
 * 2. 切章时取消队列、复位状态
 *
 * 注：本 hook 与 `useEditorPersist` 共享 `autoSummaryQueueRef`——`useEditorPersist`
 * 只读 ref 用以入队，不应反向写。
 */
import { useEffect, useState } from "react";
import { createAutoSummaryQueue, type AutoSummaryStatus } from "../ai/chapter-summary-auto";
import type { Chapter } from "../db/types";

export interface UseEditorAutoSummaryQueueParams {
  activeId: string | null;
  autoSummaryQueueRef: React.RefObject<ReturnType<typeof createAutoSummaryQueue> | null>;
  chapterServerUpdatedAtRef: React.RefObject<Map<string, number>>;
  chapterOrderRef: React.RefObject<Map<string, number>>;
  setChapters: React.Dispatch<React.SetStateAction<Chapter[]>>;
}

export function useEditorAutoSummaryQueue({
  activeId,
  autoSummaryQueueRef,
  chapterServerUpdatedAtRef,
  chapterOrderRef,
  setChapters,
}: UseEditorAutoSummaryQueueParams): { autoSummaryStatus: AutoSummaryStatus } {
  const [autoSummaryStatus, setAutoSummaryStatus] = useState<AutoSummaryStatus>({ kind: "idle" });

  useEffect(() => {
    const q = createAutoSummaryQueue();
    autoSummaryQueueRef.current = q;
    const off = q.subscribe((s) => {
      setAutoSummaryStatus(s);
      if (s.kind === "ok") {
        chapterServerUpdatedAtRef.current?.set(s.chapterId, s.at);
        chapterOrderRef.current?.set(s.chapterId, chapterOrderRef.current?.get(s.chapterId) ?? 0);
        setChapters((prev) =>
          prev.map((c) =>
            c.id === s.chapterId
              ? {
                  ...c,
                  summary: s.summary,
                  summaryUpdatedAt: s.at,
                  summaryScopeFromOrder: c.summaryScopeFromOrder ?? c.order,
                  summaryScopeToOrder: c.summaryScopeToOrder ?? c.order,
                  updatedAt: s.at,
                }
              : c,
          ),
        );
      }
    });
    return () => {
      off();
      q.cancel();
      autoSummaryQueueRef.current = null;
    };
    // 与原内联实现一致：仅在挂载/卸载时建队，依赖空数组
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // 切章时取消后台概要生成，避免"上一章概要写回"带来的扰动感
    autoSummaryQueueRef.current?.cancel();
    setAutoSummaryStatus({ kind: "idle" });
  }, [activeId, autoSummaryQueueRef]);

  return { autoSummaryStatus };
}
