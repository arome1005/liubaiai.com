/**
 * 编辑页作品加载：
 * - 切作品时拉取作品/章节/卷/推演章纲，回填 chapters 缓存与 lastPersistedRef
 * - 选中上次会话章 / 第一章
 * - 检测本地草稿（异常关闭后），通过 imperativeDialog 询问是否覆盖
 *
 * 行为与原 `EditorPage.tsx` 内 `load` + 触发 effect 完全一致。
 */
import { useCallback, useEffect } from "react";
import {
  getTuiyanState,
  getWork,
  listChapters,
  listVolumes,
} from "../db/repo";
import type { Chapter, TuiyanPushedOutlineEntry, Volume, Work } from "../db/types";
import { warmChapterNoteCache } from "../util/chapter-notes-storage";
import { LAST_CHAPTER_SESSION_KEY_PREFIX } from "../util/last-chapter-session";
import { clearDraft, readDraft } from "../util/draftRecovery";

interface ImperativeDialogLike {
  confirm: (msg: string) => Promise<boolean>;
}

export interface UseEditorWorkLoaderParams {
  workId: string | null;
  imperativeDialog: ImperativeDialogLike;
  lastPersistedRef: React.RefObject<Map<string, string>>;
  setWork: React.Dispatch<React.SetStateAction<Work | null>>;
  setChapters: React.Dispatch<React.SetStateAction<Chapter[]>>;
  setVolumes: React.Dispatch<React.SetStateAction<Volume[]>>;
  setPushedOutlines: React.Dispatch<React.SetStateAction<TuiyanPushedOutlineEntry[]>>;
  setActiveId: React.Dispatch<React.SetStateAction<string | null>>;
  setContent: React.Dispatch<React.SetStateAction<string>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
}

export interface UseEditorWorkLoaderReturn {
  /** 主动重载（如把孤儿章并入首卷后刷新） */
  load: () => Promise<void>;
}

export function useEditorWorkLoader({
  workId,
  imperativeDialog,
  lastPersistedRef,
  setWork,
  setChapters,
  setVolumes,
  setPushedOutlines,
  setActiveId,
  setContent,
  setLoading,
}: UseEditorWorkLoaderParams): UseEditorWorkLoaderReturn {
  const load = useCallback(async () => {
    if (!workId) return;
    setLoading(true);
    try {
      const w = await getWork(workId);
      if (!w) {
        setWork(null);
        setChapters([]);
        setPushedOutlines([]);
        setActiveId(null);
        setContent("");
        return;
      }
      setWork(w);
      const list = await listChapters(workId);
      setChapters(list);
      void warmChapterNoteCache(list.map((c) => c.id));
      const vols = await listVolumes(workId);
      setVolumes(vols);
      try {
        const tuiyanState = await getTuiyanState(workId);
        setPushedOutlines(tuiyanState?.planningPushedOutlines ?? []);
      } catch {
        setPushedOutlines([]);
      }
      lastPersistedRef.current?.clear();
      for (const c of list) {
        lastPersistedRef.current?.set(c.id, c.content);
      }
      const stored = sessionStorage.getItem(LAST_CHAPTER_SESSION_KEY_PREFIX + workId);
      const pick =
        (stored && list.some((c) => c.id === stored) && stored) ||
        list[0]?.id ||
        null;
      setActiveId(pick);
      const first = list.find((c) => c.id === pick);
      const initial = first?.content ?? "";
      setContent(initial);
      if (workId && pick && first) {
        const dr = readDraft(workId, pick);
        if (dr && dr.savedAt > first.updatedAt && dr.content !== initial) {
          const ok = await imperativeDialog.confirm(
            "检测到未同步的本地草稿（如异常关闭前）。是否用草稿覆盖当前正文？",
          );
          if (ok) {
            setContent(dr.content);
            lastPersistedRef.current?.set(pick, first.content);
          } else {
            clearDraft(workId, pick);
          }
        }
      }
    } finally {
      setLoading(false);
    }
  }, [
    workId,
    imperativeDialog,
    lastPersistedRef,
    setWork,
    setChapters,
    setVolumes,
    setPushedOutlines,
    setActiveId,
    setContent,
    setLoading,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  return { load };
}
