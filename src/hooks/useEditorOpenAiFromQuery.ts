import { useEffect } from "react";
import type { RightRailTabId } from "../components/RightRailContext";

/**
 * 消费「一次性」`?ai=1`：打开右栏并切到 AI（与生辉/流光等 deep link 对齐，合并侧栏草稿时更顺）。
 */
export function useEditorOpenAiFromQuery(
  workId: string | null,
  activeChapterId: string | null,
  setOpen: (open: boolean) => void,
  setActiveTab: (id: RightRailTabId) => void,
) {
  useEffect(() => {
    if (!workId || !activeChapterId) return;
    let hit = false;
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.get("ai") !== "1") return;
      u.searchParams.delete("ai");
      window.history.replaceState({}, "", u.toString());
      hit = true;
    } catch {
      return;
    }
    if (!hit) return;
    queueMicrotask(() => {
      setOpen(true);
      setActiveTab("ai");
    });
  }, [workId, activeChapterId, setOpen, setActiveTab]);
}
