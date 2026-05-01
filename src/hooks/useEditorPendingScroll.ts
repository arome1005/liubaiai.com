/**
 * 全书搜索 / 跨模块命中跳转后的「滚到匹配 + 持久高亮」（P0-E）：
 * - 切章后若有 pendingScrollRef，等 60ms 让 CodeMirror 稳定文档再滚 + 高亮
 * - 切章本身会清掉上一章遗留高亮
 *
 * 行为与原 `EditorPage.tsx` 内两段 useEffect 完全一致。
 */
import { useEffect } from "react";
import type { CodeMirrorEditorHandle } from "../components/CodeMirrorEditor";

interface PendingScrollState {
  query: string;
  isRegex: boolean;
  offset: number;
}

export interface UseEditorPendingScrollParams {
  activeId: string | null;
  /** 仅作为切章后是否重跑的触发器（与正文内容无关） */
  content: string;
  editorRef: React.RefObject<CodeMirrorEditorHandle | null>;
  pendingScrollRef: React.MutableRefObject<PendingScrollState | null>;
}

export function useEditorPendingScroll({
  activeId,
  content,
  editorRef,
  pendingScrollRef,
}: UseEditorPendingScrollParams): void {
  // 全书搜索跳转后自动高亮定位
  useEffect(() => {
    const ps = pendingScrollRef.current;
    if (!ps || !activeId) return;
    pendingScrollRef.current = null;
    // setTimeout 给 CM 多一点时间稳定文档，避免内容更新 effect 与 scrollToMatch 竞争
    const t = window.setTimeout(() => {
      editorRef.current?.scrollToMatch(ps.query, ps.isRegex, ps.offset);
      editorRef.current?.highlight(ps.query, ps.isRegex);
    }, 60);
    return () => window.clearTimeout(t);
  }, [activeId, content, editorRef, pendingScrollRef]);

  // 切换章节时清除上一章的搜索高亮
  useEffect(() => {
    editorRef.current?.clearHighlight();
  }, [activeId, editorRef]);
}
