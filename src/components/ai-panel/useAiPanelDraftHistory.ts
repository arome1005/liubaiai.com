import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import {
  aiPanelDraftStorageKey,
  pushDraftHistory,
  readDraftHistory,
  type AiDraftHistoryEntry,
} from "../../util/ai-panel-draft";

interface UseAiPanelDraftHistoryArgs {
  workId: string;
  chapterId: string | null;
}

export function useAiPanelDraftHistory(args: UseAiPanelDraftHistoryArgs) {
  const { workId, chapterId } = args;
  const [draftHistory, setDraftHistory] = useState<AiDraftHistoryEntry[]>([]);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);

  const draftStorageKey = useMemo(
    () => (workId && chapterId ? aiPanelDraftStorageKey(workId, chapterId) : null),
    [workId, chapterId],
  );

  const reloadDraftHistory = useCallback(() => {
    if (!workId || !chapterId) {
      setDraftHistory([]);
      return;
    }
    setDraftHistory(readDraftHistory(workId, chapterId));
  }, [workId, chapterId]);

  const pushGeneratedDraftHistory = useCallback(
    (content: string) => {
      if (!workId || !chapterId || !content.trim()) return;
      pushDraftHistory(workId, chapterId, content.trim());
      setDraftHistory(readDraftHistory(workId, chapterId));
    },
    [workId, chapterId],
  );

  useLayoutEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) reloadDraftHistory();
    });
    return () => {
      cancelled = true;
    };
  }, [reloadDraftHistory]);

  return {
    draftStorageKey,
    draftHistory,
    setDraftHistory,
    historyDialogOpen,
    setHistoryDialogOpen,
    pushGeneratedDraftHistory,
  };
}
