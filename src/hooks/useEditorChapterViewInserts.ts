import { useCallback, useLayoutEffect, useRef, type MutableRefObject } from "react";
import type { CodeMirrorEditorHandle } from "../components/CodeMirrorEditor";

type Pending =
  | { k: "insert"; text: string }
  | { k: "append"; text: string }
  | { k: "replace"; text: string };

const RAF_MAX = 40;

/**
 * 写作页左侧「章纲 / 章节」切换时，正文的 CodeMirror 会卸载，此时若立即 `insertTextAtCursor` 会
 * 因 `editorRef` 为空而静默失败。本 hook 在切到「章节正文」并完成挂载后再执行插入。
 */
export function useEditorChapterViewInserts(
  sidebarTab: "outline" | "chapter",
  setSidebarTab: (t: "outline" | "chapter") => void,
  activeId: string | null,
  editorRef: MutableRefObject<CodeMirrorEditorHandle | null>,
) {
  const pending = useRef<Pending | null>(null);

  const flushPending = useCallback((): boolean => {
    const p = pending.current;
    if (!p) return false;
    const v = editorRef.current;
    if (!v) return false;
    pending.current = null;
    if (p.k === "insert") v.insertTextAtCursor(p.text);
    else if (p.k === "append") v.appendTextToEnd(p.text);
    else v.replaceSelection(p.text);
    v.focus();
    return true;
  }, [editorRef]);

  const rafTryFlush = useCallback(() => {
    let n = 0;
    const tick = () => {
      if (flushPending()) return;
      n += 1;
      if (n < RAF_MAX) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [flushPending]);

  useLayoutEffect(() => {
    if (sidebarTab !== "chapter" || !activeId) return;
    if (!pending.current) return;
    rafTryFlush();
  }, [sidebarTab, activeId, rafTryFlush]);

  const insertAtCursor = useCallback(
    (text: string) => {
      if (sidebarTab !== "chapter") {
        pending.current = { k: "insert", text };
        setSidebarTab("chapter");
        return;
      }
      const v = editorRef.current;
      if (v) {
        v.insertTextAtCursor(text);
        v.focus();
      } else {
        pending.current = { k: "insert", text };
        rafTryFlush();
      }
    },
    [sidebarTab, setSidebarTab, editorRef, rafTryFlush],
  );

  const appendToEnd = useCallback(
    (text: string) => {
      if (sidebarTab !== "chapter") {
        pending.current = { k: "append", text };
        setSidebarTab("chapter");
        return;
      }
      const v = editorRef.current;
      if (v) {
        v.appendTextToEnd(text);
        v.focus();
      } else {
        pending.current = { k: "append", text };
        rafTryFlush();
      }
    },
    [sidebarTab, setSidebarTab, editorRef, rafTryFlush],
  );

  const replaceSelection = useCallback(
    (text: string) => {
      if (sidebarTab !== "chapter") {
        pending.current = { k: "replace", text };
        setSidebarTab("chapter");
        return;
      }
      const v = editorRef.current;
      if (v) {
        v.replaceSelection(text);
        v.focus();
      } else {
        pending.current = { k: "replace", text };
        rafTryFlush();
      }
    },
    [sidebarTab, setSidebarTab, editorRef, rafTryFlush],
  );

  const ensureChapterViewBeforeInsert = useCallback(() => {
    setSidebarTab("chapter");
  }, [setSidebarTab]);

  return { insertAtCursor, appendToEnd, replaceSelection, ensureChapterViewBeforeInsert };
}
