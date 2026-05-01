/**
 * 关闭/刷新页面时若正文未持久化或正在保存，弹原生确认对话框。
 *
 * 与原 `EditorPage.tsx` 内联实现完全一致；用 ref 而非 state，避免无意义的
 * 监听器重新注册。
 */
import { useEffect } from "react";

export interface UseEditorBeforeUnloadGuardParams {
  activeIdRef: React.RefObject<string | null>;
  contentRef: React.RefObject<string>;
  lastPersistedRef: React.RefObject<Map<string, string>>;
  persistInFlightRef: React.RefObject<boolean>;
}

export function useEditorBeforeUnloadGuard({
  activeIdRef,
  contentRef,
  lastPersistedRef,
  persistInFlightRef,
}: UseEditorBeforeUnloadGuardParams): void {
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      const id = activeIdRef.current;
      if (!id) return;
      const persisted = lastPersistedRef.current?.get(id) ?? "";
      const cur = contentRef.current ?? "";
      if (cur !== persisted || persistInFlightRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
    // 与原内联实现一致：依赖空数组，监听器内部读 ref 始终拿最新值
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
