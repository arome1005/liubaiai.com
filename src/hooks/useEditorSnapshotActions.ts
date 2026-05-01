import { useEffect, useState } from "react";
import {
  addChapterSnapshot,
  deleteChapterSnapshot,
  listChapterSnapshots,
  updateChapter,
} from "../db/repo";
import type { Chapter, ChapterSnapshot } from "../db/types";
import { wordCount } from "../util/wordCount";

interface ImperativeDialog {
  confirm: (message: string) => Promise<boolean>;
}

export interface UseEditorSnapshotActionsParams {
  activeId: string | null;
  activeChapter: Chapter | null;
  content: string;
  persistContent: (chapterId: string, text: string) => Promise<unknown>;
  chapterServerUpdatedAtRef: React.MutableRefObject<Map<string, number>>;
  lastPersistedRef: React.MutableRefObject<Map<string, string>>;
  setContent: React.Dispatch<React.SetStateAction<string>>;
  setChapters: React.Dispatch<React.SetStateAction<Chapter[]>>;
  imperativeDialog: ImperativeDialog;
}

export function useEditorSnapshotActions({
  activeId,
  activeChapter,
  content,
  persistContent,
  chapterServerUpdatedAtRef,
  lastPersistedRef,
  setContent,
  setChapters,
  imperativeDialog,
}: UseEditorSnapshotActionsParams) {
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [snapshotList, setSnapshotList] = useState<ChapterSnapshot[]>([]);

  useEffect(() => {
    if (!snapshotOpen || !activeId) return;
    void listChapterSnapshots(activeId).then(setSnapshotList);
  }, [snapshotOpen, activeId]);

  async function handleRestoreSnapshot(snap: ChapterSnapshot) {
    if (!activeChapter || snap.chapterId !== activeChapter.id) return;
    if (!(await imperativeDialog.confirm("用此历史版本覆盖当前正文？"))) return;
    await persistContent(activeChapter.id, content);
    await addChapterSnapshot(activeChapter.id, content);
    setContent(snap.content);
    const wc = wordCount(snap.content);
    const exp = chapterServerUpdatedAtRef.current.get(activeChapter.id);
    const newAt = await updateChapter(
      activeChapter.id,
      { content: snap.content },
      exp !== undefined ? { expectedUpdatedAt: exp } : undefined,
    );
    const rt = newAt ?? Date.now();
    chapterServerUpdatedAtRef.current.set(activeChapter.id, rt);
    lastPersistedRef.current.set(activeChapter.id, snap.content);
    setChapters((prev) =>
      prev.map((c) =>
        c.id === activeChapter.id
          ? { ...c, content: snap.content, updatedAt: rt, wordCountCache: wc }
          : c,
      ),
    );
    void listChapterSnapshots(activeChapter.id).then(setSnapshotList);
    setSnapshotOpen(false);
  }

  async function handleDeleteSnapshot(id: string) {
    await deleteChapterSnapshot(id);
    if (activeId) void listChapterSnapshots(activeId).then(setSnapshotList);
  }

  /** 手动快照后刷新列表（供 handleManualSnapshot 调用） */
  function refreshSnapshotList(chapterId: string) {
    if (snapshotOpen) void listChapterSnapshots(chapterId).then(setSnapshotList);
  }

  return {
    snapshotOpen,
    setSnapshotOpen,
    snapshotList,
    handleRestoreSnapshot,
    handleDeleteSnapshot,
    refreshSnapshotList,
  };
}
