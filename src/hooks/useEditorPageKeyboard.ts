import { useEffect } from "react";
import type { RightRailTabId } from "../components/RightRailContext";

export interface UseEditorPageKeyboardParams {
  /** Ctrl/Cmd+Shift+N 新建章节，调用方一般传入 ref.current 调用 */
  onNewChapter: () => void;
  toggleSidebar: () => void;
  toggleChapterList: () => void;
  toggleRightRailTab: (tab: RightRailTabId) => void;
  /** Alt+S 与 Ctrl/Cmd+S 共用 */
  handleManualSnapshot: () => Promise<void> | void;
}

/**
 * 编辑页全局快捷键：
 * - Ctrl/Cmd+Shift+N：新建章节（在所有上下文都可用，不论焦点是否在编辑区）
 * - Ctrl/Cmd+Shift+[/]：切左/右栏
 * - Alt+S：手动快照
 * - Alt+1/2/3/4：切右栏 Tab（AI / 章纲 / 圣经 / 引用）
 * - Ctrl/Cmd+S：手动快照（独立监听，避免与编辑器原生 Save 冲突）
 *
 * 已知限制：上述非 N 的组合键在 input/textarea/contentEditable 焦点时会被忽略，与原始行为一致。
 */
export function useEditorPageKeyboard({
  onNewChapter,
  toggleSidebar,
  toggleChapterList,
  toggleRightRailTab,
  handleManualSnapshot,
}: UseEditorPageKeyboardParams): void {
  useEffect(() => {
    function onEditorHotkey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const isEditable =
        tag === "input" || tag === "textarea" || (e.target as HTMLElement)?.isContentEditable;

      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const alt = e.altKey;

      if (ctrl && shift && e.key === "N") {
        e.preventDefault();
        onNewChapter();
        return;
      }
      if (isEditable) return;

      if (ctrl && shift && e.key === "[") {
        e.preventDefault();
        toggleChapterList();
        return;
      }
      if (ctrl && shift && e.key === "]") {
        e.preventDefault();
        toggleSidebar();
        return;
      }
      if (alt && e.key === "s") {
        e.preventDefault();
        void handleManualSnapshot();
        return;
      }
      if (alt && e.key === "1") {
        e.preventDefault();
        toggleRightRailTab("ai");
        return;
      }
      if (alt && e.key === "2") {
        e.preventDefault();
        toggleRightRailTab("summary");
        return;
      }
      if (alt && e.key === "3") {
        e.preventDefault();
        toggleRightRailTab("bible");
        return;
      }
      if (alt && e.key === "4") {
        e.preventDefault();
        toggleRightRailTab("ref");
        return;
      }
    }
    window.addEventListener("keydown", onEditorHotkey);
    return () => window.removeEventListener("keydown", onEditorHotkey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleManualSnapshot]);

  useEffect(() => {
    function onSaveShortcut(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        void handleManualSnapshot();
      }
    }
    window.addEventListener("keydown", onSaveShortcut);
    return () => window.removeEventListener("keydown", onSaveShortcut);
  }, [handleManualSnapshot]);
}
