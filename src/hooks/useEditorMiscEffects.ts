import { useEffect } from "react";
import { EDITOR_AUTO_WIDTH_KEY } from "../util/editor-layout-prefs";
import {
  EDITOR_TYPOGRAPHY_EVENT,
  type EditorPaperTint,
  loadEditorTypography,
} from "../util/editor-typography";
import { CHAPTER_SORT_DIR_KEY_PREFIX } from "../util/editor-page-keys";
import type { CodeMirrorEditorHandle } from "../components/CodeMirrorEditor";
import type { TuiyanPushedOutlineEntry } from "../db/types";

/** 偏好：纸色（响应同窗口 / 跨标签页 storage 事件） */
export function useEditorPaperTintSync(setPaperTint: (v: EditorPaperTint) => void): void {
  useEffect(() => {
    const sync = () => setPaperTint(loadEditorTypography().paperTint);
    window.addEventListener(EDITOR_TYPOGRAPHY_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EDITOR_TYPOGRAPHY_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [setPaperTint]);
}

/** 偏好：自动宽度持久化 */
export function useEditorAutoWidthPersist(editorAutoWidth: boolean): void {
  useEffect(() => {
    try {
      localStorage.setItem(EDITOR_AUTO_WIDTH_KEY, editorAutoWidth ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [editorAutoWidth]);
}

/** 偏好：章节列表升降序持久化（按作品 id 区分） */
export function useEditorChapterSortPersist(
  workId: string | null,
  routeParam: string | null | undefined,
  chapterListSortDir: "asc" | "desc",
): void {
  useEffect(() => {
    try {
      const key = `${CHAPTER_SORT_DIR_KEY_PREFIX}${workId ?? routeParam ?? ""}`;
      localStorage.setItem(key, chapterListSortDir);
    } catch {
      /* ignore */
    }
  }, [chapterListSortDir, workId, routeParam]);
}

/** 章切后将焦点还给正文（§E.2.3）；模态打开时不抢焦点 */
export function useEditorFocusReturnOnActive(
  activeId: string | null,
  editorRef: React.MutableRefObject<CodeMirrorEditorHandle | null>,
): void {
  useEffect(() => {
    if (!activeId) return;
    const t = window.requestAnimationFrame(() => {
      const el = document.activeElement as HTMLElement | null;
      if (el?.closest?.(".modal-overlay")) return;
      editorRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(t);
  }, [activeId, editorRef]);
}

/** 进入沉浸写作模式时聚焦正文（双 raf 等待 layout） */
export function useEditorFocusReturnOnZen(
  zenWrite: boolean,
  editorRef: React.MutableRefObject<CodeMirrorEditorHandle | null>,
): void {
  useEffect(() => {
    if (!zenWrite) return;
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => editorRef.current?.focus());
    });
    return () => cancelAnimationFrame(id);
  }, [zenWrite, editorRef]);
}

/** 大纲选中项失效兜底 + 进入大纲 Tab 自动选第一根节点 */
export function useEditorOutlineSelection(args: {
  sidebarTab: "outline" | "chapter";
  pushedOutlines: TuiyanPushedOutlineEntry[];
  selectedOutlineEntryId: string | null;
  setSelectedOutlineEntryId: (v: string | null) => void;
}): void {
  const {
    sidebarTab,
    pushedOutlines,
    selectedOutlineEntryId,
    setSelectedOutlineEntryId,
  } = args;

  useEffect(() => {
    if (selectedOutlineEntryId && !pushedOutlines.some((e) => e.id === selectedOutlineEntryId)) {
      setSelectedOutlineEntryId(null);
    }
  }, [pushedOutlines, selectedOutlineEntryId, setSelectedOutlineEntryId]);

  useEffect(() => {
    if (sidebarTab !== "outline") return;
    if (selectedOutlineEntryId) return;
    if (pushedOutlines.length === 0) return;
    const firstRoot = pushedOutlines.find((e) => !e.parentId) ?? pushedOutlines[0];
    if (firstRoot) setSelectedOutlineEntryId(firstRoot.id);
  }, [sidebarTab, selectedOutlineEntryId, pushedOutlines, setSelectedOutlineEntryId]);
}

/** 邻近章节摘要池同步：把候选章节 id 集合喂给 useWorkAiContext 的 sync 函数 */
export function useEditorNeighborPoolSync(
  poolIds: string[],
  syncFn: (ids: string[]) => void,
): void {
  // 依赖 poolIds 引用稳定（caller 用 useMemo 算出）
  useEffect(() => {
    syncFn(poolIds);
  }, [poolIds, syncFn]);
}
