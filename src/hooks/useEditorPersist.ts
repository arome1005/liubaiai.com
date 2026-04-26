/**
 * Encapsulates the chapter-persist pipeline:
 * serial queue, conflict resolution, background-save errors, and auto-debounce save.
 *
 * All behavior is identical to the previous inline implementation —
 * this is a pure structural extraction with zero semantic change.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  isChapterSaveConflictError,
  listChapters,
  updateChapter,
} from "../db/repo";
import type { Chapter } from "../db/types";
import { addDailyWordsFromDelta } from "../util/dailyWords";
import { clearDraft } from "../util/draftRecovery";
import { wordCount } from "../util/wordCount";
import type { createAutoSummaryQueue } from "../ai/chapter-summary-auto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SaveState = "idle" | "saving" | "saved" | "error" | "conflict";

export interface BgSaveIssue {
  chapterId: string;
  title: string;
  kind: "conflict" | "error";
}

export interface UseEditorPersistParams {
  workId: string | null;
  lastPersistedRef: React.RefObject<Map<string, string>>;
  chapterServerUpdatedAtRef: React.RefObject<Map<string, number>>;
  chapterTitleRef: React.RefObject<Map<string, string>>;
  chapterOrderRef: React.RefObject<Map<string, number>>;
  workTitleRef: React.RefObject<string>;
  autoSummaryQueueRef: React.RefObject<ReturnType<typeof createAutoSummaryQueue> | null>;
  setChapters: React.Dispatch<React.SetStateAction<Chapter[]>>;
}

export interface UseEditorPersistReturn {
  saveState: SaveState;
  setSaveState: React.Dispatch<React.SetStateAction<SaveState>>;
  bgSaveIssue: BgSaveIssue | null;
  setBgSaveIssue: React.Dispatch<React.SetStateAction<BgSaveIssue | null>>;
  persistInFlightRef: React.RefObject<boolean>;
  persistQueueRef: React.RefObject<Promise<void>>;
  resolveSaveConflict: (
    activeId: string | null,
    onResolved?: (chapter: Chapter | undefined) => void,
  ) => Promise<void>;
  enqueueChapterPersist: (task: () => Promise<unknown>) => Promise<unknown>;
  runPersistChapter: (
    chapterId: string,
    text: string,
    mode: "active" | "silent",
  ) => Promise<boolean>;
  persistContent: (chapterId: string, text: string) => Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useEditorPersist({
  workId,
  lastPersistedRef,
  chapterServerUpdatedAtRef,
  chapterTitleRef,
  chapterOrderRef,
  workTitleRef,
  autoSummaryQueueRef,
  setChapters,
}: UseEditorPersistParams): UseEditorPersistReturn {
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [bgSaveIssue, setBgSaveIssue] = useState<BgSaveIssue | null>(null);
  const persistInFlightRef = useRef(false);
  const persistQueueRef = useRef(Promise.resolve());

  const resolveSaveConflict = useCallback(
    async (
      activeId: string | null,
      onResolved?: (chapter: Chapter | undefined) => void,
    ) => {
      if (!workId || !activeId) return;
      setSaveState("saving");
      try {
        const list = await listChapters(workId);
        setChapters(list);
        const c = list.find((x) => x.id === activeId);
        if (c) {
          lastPersistedRef.current.set(c.id, c.content);
          clearDraft(workId, c.id);
        }
        onResolved?.(c);
        setSaveState("saved");
        setBgSaveIssue((cur) => (cur?.chapterId === activeId ? null : cur));
      } catch {
        setSaveState("error");
      }
    },
    [workId, setChapters, lastPersistedRef],
  );

  const enqueueChapterPersist = useCallback(
    (task: () => Promise<unknown>) => {
      const p = persistQueueRef.current.then(task);
      persistQueueRef.current = p.then(
        () => {},
        () => {},
      );
      return p;
    },
    [],
  );

  const runPersistChapter = useCallback(
    async (
      chapterId: string,
      text: string,
      mode: "active" | "silent",
    ): Promise<boolean> => {
      if (!workId) return false;
      persistInFlightRef.current = true;
      const showUi = mode === "active";
      if (showUi) setSaveState("saving");
      let ok = false;
      try {
        const prev = lastPersistedRef.current.get(chapterId) ?? "";
        addDailyWordsFromDelta(prev, text);
        const expected = chapterServerUpdatedAtRef.current.get(chapterId);
        const newAt = await updateChapter(
          chapterId,
          { content: text },
          expected !== undefined ? { expectedUpdatedAt: expected } : undefined,
        );
        lastPersistedRef.current.set(chapterId, text);
        clearDraft(workId, chapterId);
        const t = newAt ?? Date.now();
        chapterServerUpdatedAtRef.current.set(chapterId, t);
        setChapters((prevCh) =>
          prevCh.map((c) =>
            c.id === chapterId
              ? { ...c, content: text, updatedAt: t, wordCountCache: wordCount(text) }
              : c,
          ),
        );
        const chTitle = chapterTitleRef.current.get(chapterId) ?? "未命名章节";
        const chOrder = chapterOrderRef.current.get(chapterId) ?? 0;
        const wTitle = workTitleRef.current.trim();
        if (wTitle) {
          autoSummaryQueueRef.current?.enqueue({
            workId,
            workTitle: wTitle,
            chapterId,
            chapterTitle: chTitle,
            chapterOrder: chOrder,
            chapterContent: text,
            expectedUpdatedAt: t,
          });
        }
        if (showUi) {
          setSaveState("saved");
        }
        setBgSaveIssue((cur) =>
          cur?.chapterId === chapterId ? null : cur,
        );
        ok = true;
      } catch (e) {
        if (showUi) {
          if (isChapterSaveConflictError(e)) setSaveState("conflict");
          else setSaveState("error");
        } else {
          const title =
            chapterTitleRef.current.get(chapterId) ?? "未命名章节";
          setBgSaveIssue({
            chapterId,
            title,
            kind: isChapterSaveConflictError(e) ? "conflict" : "error",
          });
        }
      } finally {
        persistInFlightRef.current = false;
      }
      return ok;
    },
    [
      workId,
      lastPersistedRef,
      chapterServerUpdatedAtRef,
      chapterTitleRef,
      chapterOrderRef,
      workTitleRef,
      autoSummaryQueueRef,
      setChapters,
    ],
  );

  const persistContent = useCallback(
    async (chapterId: string, text: string) => {
      return enqueueChapterPersist(() =>
        runPersistChapter(chapterId, text, "active"),
      );
    },
    [enqueueChapterPersist, runPersistChapter],
  );

  return {
    saveState,
    setSaveState,
    bgSaveIssue,
    setBgSaveIssue,
    persistInFlightRef,
    persistQueueRef,
    resolveSaveConflict,
    enqueueChapterPersist,
    runPersistChapter,
    persistContent,
  };
}

// ---------------------------------------------------------------------------
// Auto-debounce save effect — use alongside the hook
// ---------------------------------------------------------------------------

export function useAutoSave(
  content: string,
  activeId: string | null,
  persistContent: (chapterId: string, text: string) => Promise<unknown>,
) {
  useEffect(() => {
    if (!activeId) return;
    const t = window.setTimeout(() => {
      void persistContent(activeId, content);
    }, 700);
    return () => window.clearTimeout(t);
  }, [content, activeId, persistContent]);
}
