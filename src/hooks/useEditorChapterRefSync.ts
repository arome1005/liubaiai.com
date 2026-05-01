/**
 * 把 chapters 列表与作品标题中的关键字段同步到外部 ref：
 * - `chapterServerUpdatedAtRef`：步 25 乐观锁
 * - `chapterTitleRef`：保存出错时回退展示
 * - `chapterOrderRef`：自动概要队列写回时使用
 * - `workTitleRef`：保存路径需要书名上下文
 *
 * 行为与原 `EditorPage.tsx` 内两段同步 useEffect 完全一致。
 */
import { useEffect } from "react";
import type { Chapter, Work } from "../db/types";

export interface UseEditorChapterRefSyncParams {
  chapters: Chapter[];
  work: Work | null;
  chapterServerUpdatedAtRef: React.RefObject<Map<string, number>>;
  chapterTitleRef: React.RefObject<Map<string, string>>;
  chapterOrderRef: React.RefObject<Map<string, number>>;
  workTitleRef: React.MutableRefObject<string>;
}

export function useEditorChapterRefSync({
  chapters,
  work,
  chapterServerUpdatedAtRef,
  chapterTitleRef,
  chapterOrderRef,
  workTitleRef,
}: UseEditorChapterRefSyncParams): void {
  useEffect(() => {
    for (const c of chapters) {
      chapterServerUpdatedAtRef.current?.set(c.id, c.updatedAt);
      chapterTitleRef.current?.set(c.id, c.title);
      chapterOrderRef.current?.set(c.id, c.order);
    }
  }, [chapters, chapterServerUpdatedAtRef, chapterTitleRef, chapterOrderRef]);

  useEffect(() => {
    workTitleRef.current = work?.title ?? "";
  }, [work?.title, workTitleRef]);
}
