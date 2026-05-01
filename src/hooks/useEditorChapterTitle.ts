/**
 * 章节标题内联编辑：
 * - 切章时复位「编辑中」状态与草稿
 * - `commitChapterTitle(id, title)`：写库（含乐观锁）+ 同步 ref/列表
 * - `saveChapterTitle()`：保存当前正在编辑的章节标题（trim、去抖、错误回退）
 *
 * 行为与原 `EditorPage.tsx` 内联实现完全一致；仅做模块化抽离。
 *
 * 注意：`commitChapterTitle` 也被章节列表「重命名」入口（`handleRename`）复用，
 * 所以暴露给页面层；不要内联进 `saveChapterTitle`。
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { updateChapter } from "../db/repo";
import type { Chapter } from "../db/types";

export interface UseEditorChapterTitleParams {
  activeChapter: Chapter | null;
  /** 与 `useEditorPersist` 同源；写库后写入新的服务端 updatedAt */
  chapterServerUpdatedAtRef: React.RefObject<Map<string, number>>;
  chapterTitleRef: React.RefObject<Map<string, string>>;
  setChapters: React.Dispatch<React.SetStateAction<Chapter[]>>;
}

export interface UseEditorChapterTitleReturn {
  chapterTitleEditing: boolean;
  setChapterTitleEditing: React.Dispatch<React.SetStateAction<boolean>>;
  chapterTitleDraft: string;
  setChapterTitleDraft: React.Dispatch<React.SetStateAction<string>>;
  /** 提交某章节标题（带乐观锁、同步 ref 与列表）。失败抛错由调用方处理。 */
  commitChapterTitle: (id: string, nextTitle: string) => Promise<boolean>;
  /** 保存当前正在编辑的章节标题；空/无变化静默退出，错误时 toast 并回退 */
  saveChapterTitle: () => Promise<void>;
}

export function useEditorChapterTitle({
  activeChapter,
  chapterServerUpdatedAtRef,
  chapterTitleRef,
  setChapters,
}: UseEditorChapterTitleParams): UseEditorChapterTitleReturn {
  const [chapterTitleEditing, setChapterTitleEditing] = useState(false);
  const [chapterTitleDraft, setChapterTitleDraft] = useState("");

  useEffect(() => {
    setChapterTitleEditing(false);
    setChapterTitleDraft(activeChapter?.title ?? "");
  }, [activeChapter?.id, activeChapter?.title]);

  const commitChapterTitle = useCallback(
    async (id: string, nextTitle: string): Promise<boolean> => {
      const exp = chapterServerUpdatedAtRef.current?.get(id);
      const t =
        (await updateChapter(
          id,
          { title: nextTitle },
          exp !== undefined ? { expectedUpdatedAt: exp } : undefined,
        )) ?? Date.now();
      chapterServerUpdatedAtRef.current?.set(id, t);
      chapterTitleRef.current?.set(id, nextTitle);
      setChapters((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: nextTitle, updatedAt: t } : c)),
      );
      return true;
    },
    [chapterServerUpdatedAtRef, chapterTitleRef, setChapters],
  );

  const saveChapterTitle = useCallback(async () => {
    if (!activeChapter) return;
    const next = chapterTitleDraft.trim();
    if (!next || next === activeChapter.title) {
      setChapterTitleEditing(false);
      setChapterTitleDraft(activeChapter.title);
      return;
    }
    try {
      await commitChapterTitle(activeChapter.id, next);
      setChapterTitleEditing(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "章节标题保存失败");
      setChapterTitleDraft(activeChapter.title);
      setChapterTitleEditing(false);
    }
  }, [activeChapter, chapterTitleDraft, commitChapterTitle]);

  return {
    chapterTitleEditing,
    setChapterTitleEditing,
    chapterTitleDraft,
    setChapterTitleDraft,
    commitChapterTitle,
    saveChapterTitle,
  };
}
