import { useCallback } from "react";
import type { NavigateFunction } from "react-router-dom";
import { toast } from "sonner";
import { listChapters } from "../db/repo";
import type { ReferenceSearchHit } from "../db/types";
import { buildShengHuiUrl } from "../util/sheng-hui-deeplink";
import { writeShengHuiEditorHandoff, SHENG_HUI_EDITOR_HANDOFF_MAX_CHARS } from "../util/sheng-hui-editor-handoff";
import { getReferenceRagHitFullText } from "../util/tuiyan-reference-inject-text";

/**
 * 藏经全文检索：将当前命中段作为「主稿」种子、续写模式带入生辉（W3，与写作台手传同一条 session key）。
 */
export function useReferenceSearchShengHuiHandoff(
  navigate: NavigateFunction,
  importWorkId: string,
  progressCursor: string | null,
) {
  return useCallback(
    async (hit: ReferenceSearchHit) => {
      if (!importWorkId) {
        toast.error("请先在顶栏选择要用于仿写的作品。");
        return;
      }
      const chapters = await listChapters(importWorkId);
      if (chapters.length === 0) {
        toast.error("该作品还没有章节，请先在写作页创建章节。");
        return;
      }
      const sorted = [...chapters].sort((a, b) => a.order - b.order);
      const chapterId =
        (progressCursor && sorted.some((c) => c.id === progressCursor) ? progressCursor : null) ?? sorted[0]!.id;
      const raw = getReferenceRagHitFullText(hit);
      const text =
        raw.length > SHENG_HUI_EDITOR_HANDOFF_MAX_CHARS
          ? raw.slice(0, SHENG_HUI_EDITOR_HANDOFF_MAX_CHARS)
          : raw;
      writeShengHuiEditorHandoff({
        workId: importWorkId,
        chapterId,
        outputSeed: text,
        generateMode: "continue",
      });
      navigate(buildShengHuiUrl(importWorkId, chapterId));
    },
    [navigate, importWorkId, progressCursor],
  );
}
