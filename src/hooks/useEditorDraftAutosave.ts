/**
 * 正文草稿防抖落盘（异常关闭后可恢复）：
 * 内容变化 450 ms 后写入 `writeDraftDebounced`。
 *
 * 行为与原 `EditorPage.tsx` 内联实现完全一致。
 */
import { useEffect } from "react";
import { writeDraftDebounced } from "../util/draftRecovery";

const DRAFT_DEBOUNCE_MS = 450;

export function useEditorDraftAutosave(
  workId: string | null,
  activeId: string | null,
  content: string,
): void {
  useEffect(() => {
    if (!workId || !activeId) return;
    const t = window.setTimeout(() => {
      writeDraftDebounced(workId, activeId, content);
    }, DRAFT_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [content, workId, activeId]);
}
