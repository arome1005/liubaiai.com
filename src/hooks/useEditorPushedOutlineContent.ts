import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { upsertTuiyanState } from "../db/repo";
import type { TuiyanPushedOutlineEntry } from "../db/types";

/** 写作页中间栏编辑「推送章纲」正文的落库防抖（与章节自动保存节奏接近，避免每键击写库） */
export const EDITOR_PUSHED_OUTLINE_PERSIST_DEBOUNCE_MS = 450;

/**
 * 更新 `pushedOutlines` 中某节点的 `content`，并防抖写入 `upsertTuiyanState.planningPushedOutlines`。
 */
export function useEditorPushedOutlineContent(
  workId: string | null,
  setPushedOutlines: Dispatch<SetStateAction<TuiyanPushedOutlineEntry[]>>,
) {
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingListRef = useRef<TuiyanPushedOutlineEntry[] | null>(null);

  const flushPersist = useCallback(async () => {
    const list = pendingListRef.current;
    if (!workId || !list) return;
    pendingListRef.current = null;
    try {
      await upsertTuiyanState(workId, { planningPushedOutlines: list });
    } catch (e) {
      console.error("persist planningPushedOutlines failed", e);
    }
  }, [workId]);

  const schedulePersist = useCallback(
    (nextList: TuiyanPushedOutlineEntry[]) => {
      pendingListRef.current = nextList;
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      persistTimerRef.current = setTimeout(() => {
        persistTimerRef.current = null;
        void flushPersist();
      }, EDITOR_PUSHED_OUTLINE_PERSIST_DEBOUNCE_MS);
    },
    [flushPersist],
  );

  useEffect(() => {
    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      void flushPersist();
    };
  }, [flushPersist]);

  const setOutlineEntryContent = useCallback(
    (entryId: string, content: string) => {
      setPushedOutlines((prev) => {
        const next = prev.map((e) => (e.id === entryId ? { ...e, content } : e));
        schedulePersist(next);
        return next;
      });
    },
    [setPushedOutlines, schedulePersist],
  );

  return { setOutlineEntryContent };
}
