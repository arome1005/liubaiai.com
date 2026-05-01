import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  createChapter,
  createVolume,
  deleteChapter,
  deleteVolume,
  reorderChapters,
  updateChapter,
  updateWork,
  updateVolume,
} from "../db/repo";
import type { Chapter, Volume, Work } from "../db/types";

interface ImperativeDialog {
  confirm: (message: string) => Promise<boolean>;
  prompt: (label: string, defaultValue?: string) => Promise<string | null>;
}

export interface UseEditorChapterMutationsParams {
  workId: string | null;
  activeId: string | null;
  activeChapter: Chapter | null;
  content: string;
  chapters: Chapter[];
  setChapters: React.Dispatch<React.SetStateAction<Chapter[]>>;
  volumes: Volume[];
  setVolumes: React.Dispatch<React.SetStateAction<Volume[]>>;
  setActiveId: React.Dispatch<React.SetStateAction<string | null>>;
  setContent: React.Dispatch<React.SetStateAction<string>>;
  setWork: React.Dispatch<React.SetStateAction<Work | null>>;
  setChapterListMutating: React.Dispatch<React.SetStateAction<boolean>>;
  lastPersistedRef: React.MutableRefObject<Map<string, string>>;
  chapterServerUpdatedAtRef: React.MutableRefObject<Map<string, number>>;
  chapterTitleRef: React.MutableRefObject<Map<string, string>>;
  chapterOrderRef: React.MutableRefObject<Map<string, number>>;
  commitChapterTitle: (id: string, title: string) => Promise<void>;
  enqueueChapterPersist: (task: () => Promise<unknown>) => Promise<unknown>;
  runPersistChapter: (chapterId: string, text: string, mode: "active" | "silent") => Promise<boolean>;
  imperativeDialog: ImperativeDialog;
  load: () => Promise<void>;
}

export function useEditorChapterMutations({
  workId,
  activeId,
  activeChapter,
  content,
  chapters,
  setChapters,
  volumes,
  setVolumes,
  setActiveId,
  setContent,
  setWork,
  setChapterListMutating,
  lastPersistedRef,
  chapterServerUpdatedAtRef,
  chapterTitleRef,
  chapterOrderRef,
  commitChapterTitle,
  enqueueChapterPersist,
  runPersistChapter,
  imperativeDialog,
  load,
}: UseEditorChapterMutationsParams) {
  const [dragChapterId, setDragChapterId] = useState<string | null>(null);

  const volumeIdSet = useMemo(() => new Set(volumes.map((v) => v.id)), [volumes]);
  const orphanChapters = useMemo(
    () => [...chapters].filter((c) => !volumeIdSet.has(c.volumeId)).sort((a, b) => a.order - b.order),
    [chapters, volumeIdSet],
  );

  async function handleNewChapter() {
    if (!workId) return;
    try {
      if (activeId) {
        void enqueueChapterPersist(() => runPersistChapter(activeId, content, "silent"));
      }
      setChapterListMutating(true);
      let vid = activeChapter?.volumeId ?? volumes[0]?.id;
      if (!vid) {
        const v = await createVolume(workId, "第一卷");
        vid = v.id;
        setVolumes((prev) => [...prev, v].sort((a, b) => a.order - b.order));
      }
      const ch = await createChapter(workId, undefined, vid);
      chapterServerUpdatedAtRef.current.set(ch.id, ch.updatedAt);
      chapterTitleRef.current.set(ch.id, ch.title);
      chapterOrderRef.current.set(ch.id, ch.order);
      setChapters((prev) => [...prev, ch].sort((a, b) => a.order - b.order));
      setActiveId(ch.id);
      setContent("");
      lastPersistedRef.current.set(ch.id, "");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "创建新章失败");
    } finally {
      setChapterListMutating(false);
    }
  }

  /** 保持 ref 同步，确保快捷键 effect 拿到最新闭包 */
  const handleNewChapterRef = useRef<() => Promise<void>>(handleNewChapter);
  handleNewChapterRef.current = handleNewChapter;

  async function handleNewVolume() {
    if (!workId) return;
    const t = await imperativeDialog.prompt("新卷标题", "新卷");
    if (t === null) return;
    try {
      setChapterListMutating(true);
      const v = await createVolume(workId, t.trim() || "新卷");
      setVolumes((prev) => [...prev, v].sort((a, b) => a.order - b.order));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "新建卷失败");
    } finally {
      setChapterListMutating(false);
    }
  }

  async function handleRenameVolume(volId: string) {
    const vol = volumes.find((v) => v.id === volId);
    const t = await imperativeDialog.prompt("卷名", vol?.title ?? "");
    if (t === null) return;
    if (!vol) return;
    const nextTitle = t.trim() || vol.title;
    if (nextTitle === vol.title) return;
    const prevVolumes = volumes;
    try {
      setChapterListMutating(true);
      setVolumes((prev) => prev.map((v) => (v.id === volId ? { ...v, title: nextTitle } : v)));
      await updateVolume(volId, { title: nextTitle });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "重命名卷失败");
      setVolumes(prevVolumes);
    } finally {
      setChapterListMutating(false);
    }
  }

  async function handleDeleteVolumeUi(volId: string) {
    try {
      setChapterListMutating(true);
      await deleteVolume(volId);
      setVolumes((prev) => prev.filter((v) => v.id !== volId).sort((a, b) => a.order - b.order));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "无法删除该卷");
    } finally {
      setChapterListMutating(false);
    }
  }

  async function handleMoveChapterToVolume(chapterId: string) {
    if (volumes.length < 2) return;
    const lines = volumes.map((v, i) => `${i + 1}. ${v.title}`).join("\n");
    const n = await imperativeDialog.prompt(`移到哪一卷？\n${lines}`, "1");
    if (n === null) return;
    const idx = Number.parseInt(n, 10) - 1;
    if (idx < 0 || idx >= volumes.length) return;
    const ch = chapters.find((c) => c.id === chapterId);
    if (!ch) return;
    const nextVid = volumes[idx].id;
    if (ch.volumeId === nextVid) return;
    const prevChapters = chapters;
    try {
      setChapterListMutating(true);
      setChapters((prev) => prev.map((c) => (c.id === chapterId ? { ...c, volumeId: nextVid } : c)));
      const exp = chapterServerUpdatedAtRef.current.get(chapterId) ?? ch.updatedAt;
      const newAt = await updateChapter(
        chapterId,
        { volumeId: nextVid },
        exp !== undefined ? { expectedUpdatedAt: exp } : undefined,
      );
      const tNow = newAt ?? Date.now();
      chapterServerUpdatedAtRef.current.set(chapterId, tNow);
      setChapters((prev) => prev.map((c) => (c.id === chapterId ? { ...c, updatedAt: tNow } : c)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "移动章节失败");
      setChapters(prevChapters);
    } finally {
      setChapterListMutating(false);
    }
  }

  async function handleAttachOrphansToFirstVolume() {
    if (!workId || volumes.length === 0 || orphanChapters.length === 0) return;
    const firstVol = volumes[0]!;
    const ok = await imperativeDialog.confirm(
      `将 ${orphanChapters.length} 个未匹配到当前卷的章节并入「${firstVol.title}」？`,
    );
    if (!ok) return;
    await Promise.all(
      orphanChapters.map((c) => {
        const exp = c.updatedAt;
        return updateChapter(
          c.id,
          { volumeId: firstVol.id },
          exp !== undefined ? { expectedUpdatedAt: exp } : undefined,
        );
      }),
    );
    await load();
  }

  async function handleDropChapter(targetId: string) {
    if (!workId || !dragChapterId || dragChapterId === targetId) {
      setDragChapterId(null);
      return;
    }
    const prev = chapters;
    const from = chapters.findIndex((c) => c.id === dragChapterId);
    const to = chapters.findIndex((c) => c.id === targetId);
    if (from < 0 || to < 0) {
      setDragChapterId(null);
      return;
    }
    const ids = chapters.map((c) => c.id);
    const [removed] = ids.splice(from, 1);
    ids.splice(to, 0, removed);
    try {
      setChapterListMutating(true);
      const byId = new Map(prev.map((c) => [c.id, c] as const));
      const next = ids
        .map((id, i) => {
          const c = byId.get(id);
          return c ? { ...c, order: i } : null;
        })
        .filter(Boolean) as typeof prev;
      setChapters(next);
      for (const c of next) chapterOrderRef.current.set(c.id, c.order);
      setDragChapterId(null);
      await reorderChapters(workId, ids);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "章节排序失败");
      setChapters(prev);
    } finally {
      setChapterListMutating(false);
    }
  }

  async function handleRename(id: string) {
    const ch = chapters.find((c) => c.id === id);
    const t = await imperativeDialog.prompt("章节标题", ch?.title ?? "");
    if (t === null || !ch) return;
    const nextTitle = t.trim() || ch.title;
    if (nextTitle === ch.title) return;
    const prevChapters = chapters;
    try {
      setChapterListMutating(true);
      await commitChapterTitle(id, nextTitle);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "重命名失败");
      setChapters(prevChapters);
      chapterTitleRef.current.set(id, ch.title);
    } finally {
      setChapterListMutating(false);
    }
  }

  async function handleDeleteChapter(id: string) {
    if (!(await imperativeDialog.confirm("删除本章？（可先从设置导出备份）"))) return;
    if (!workId) return;
    const prevChapters = chapters;
    const wasActive = activeId === id;
    try {
      setChapterListMutating(true);
      const nextList = prevChapters.filter((c) => c.id !== id).sort((a, b) => a.order - b.order);
      setChapters(nextList);
      if (wasActive) {
        const delIdx = prevChapters.sort((a, b) => a.order - b.order).findIndex((c) => c.id === id);
        const pick = nextList[Math.min(Math.max(delIdx, 0), Math.max(0, nextList.length - 1))] ?? nextList[nextList.length - 1] ?? null;
        setActiveId(pick?.id ?? null);
        setContent(pick?.content ?? "");
        if (pick) lastPersistedRef.current.set(pick.id, pick.content);
      }
      await deleteChapter(id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除章节失败");
      setChapters(prevChapters);
      if (wasActive) {
        const back = prevChapters.find((c) => c.id === id) ?? prevChapters[0] ?? null;
        setActiveId(back?.id ?? null);
        setContent(back?.content ?? "");
        if (back) lastPersistedRef.current.set(back.id, back.content);
      }
    } finally {
      setChapterListMutating(false);
    }
  }

  async function moveChapter(id: string, dir: -1 | 1) {
    if (!workId) return;
    const idx = chapters.findIndex((c) => c.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= chapters.length) return;
    const prev = chapters;
    const ids = chapters.map((c) => c.id);
    const t = ids[idx];
    ids[idx] = ids[j];
    ids[j] = t;
    try {
      setChapterListMutating(true);
      const byId = new Map(prev.map((c) => [c.id, c] as const));
      const next = ids
        .map((cid, i) => {
          const c = byId.get(cid);
          return c ? { ...c, order: i } : null;
        })
        .filter(Boolean) as typeof prev;
      setChapters(next);
      for (const c of next) chapterOrderRef.current.set(c.id, c.order);
      await reorderChapters(workId, ids);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "章节排序失败");
      setChapters(prev);
    } finally {
      setChapterListMutating(false);
    }
  }

  async function setProgressChapter(id: string) {
    if (!workId) return;
    setWork((prev) => (prev ? { ...prev, progressCursor: id } : prev));
    await updateWork(workId, { progressCursor: id });
  }

  return {
    dragChapterId,
    setDragChapterId,
    handleNewChapterRef,
    handleNewChapter,
    handleNewVolume,
    handleRenameVolume,
    handleDeleteVolumeUi,
    handleMoveChapterToVolume,
    handleAttachOrphansToFirstVolume,
    handleDropChapter,
    handleRename,
    handleDeleteChapter,
    moveChapter,
    setProgressChapter,
  };
}
