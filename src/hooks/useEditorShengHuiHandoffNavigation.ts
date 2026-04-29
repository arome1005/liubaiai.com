import { useCallback } from "react";
import type { NavigateFunction } from "react-router-dom";
import { toast } from "sonner";
import { buildShengHuiUrl } from "../util/sheng-hui-deeplink";
import { writeShengHuiEditorHandoff } from "../util/sheng-hui-editor-handoff";

/**
 * 将写作台当前选区写入 session 后导航至生辉，供「润色/重写本段」使用（W2）。
 */
export function useEditorShengHuiHandoffNavigation(
  navigate: NavigateFunction,
  workId: string | null,
  chapterId: string | null,
  getSelectedText: () => string,
) {
  return useCallback(
    (mode: "polish" | "rewrite") => {
      if (!workId || !chapterId) {
        toast.error("请先选择作品与章节。");
        return;
      }
      const raw = getSelectedText();
      const text = raw.trim();
      if (!text) {
        toast.error("请先在本章正文中选中要处理的一段。");
        return;
      }
      writeShengHuiEditorHandoff({ workId, chapterId, outputSeed: raw, generateMode: mode });
      navigate(buildShengHuiUrl(workId, chapterId));
    },
    [navigate, workId, chapterId, getSelectedText],
  );
}
