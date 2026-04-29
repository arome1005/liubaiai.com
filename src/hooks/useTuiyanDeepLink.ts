import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import type { Chapter, Work } from "../db/types";
import { SHENG_HUI_Q } from "../util/sheng-hui-deeplink";
import type { V0OutlineNode } from "../util/v0-tuiyan-outline";

const LS_LAST_WORK = "liubai:lastWorkId";

function findChapterOutlineNodeId(nodes: V0OutlineNode[], targetChapterId: string): string | null {
  for (const n of nodes) {
    if (n.type === "chapter" && n.id === targetChapterId) return n.id;
    if (n.children?.length) {
      const x = findChapterOutlineNodeId(n.children, targetChapterId);
      if (x) return x;
    }
  }
  return null;
}

/**
 * 消费 `/logic?work=&chapter=`（与生辉 `buildTuiyanWorkbenchUrl` 一致），对齐作品并选中写作大纲中对应章节点，成功后自地址栏 strip。
 */
export function useTuiyanDeepLink(
  pageLoading: boolean,
  works: Work[],
  outline: V0OutlineNode[],
  chapters: Chapter[],
  workId: string | null,
  selectedOutlineId: string | null,
  setWorkId: (v: string | null) => void,
  setSelectedOutlineId: (v: string | null) => void,
) {
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (pageLoading) return;
    const wQ = searchParams.get(SHENG_HUI_Q.work)?.trim() || null;
    const cQ = searchParams.get(SHENG_HUI_Q.chapter)?.trim() || null;
    if (!wQ && !cQ) return;

    if (cQ && !wQ && !workId) {
      const n = new URLSearchParams(searchParams);
      n.delete(SHENG_HUI_Q.chapter);
      setSearchParams(n, { replace: true });
      return;
    }

    if (wQ && !works.some((w) => w.id === wQ)) {
      const n = new URLSearchParams(searchParams);
      n.delete(SHENG_HUI_Q.work);
      n.delete(SHENG_HUI_Q.chapter);
      setSearchParams(n, { replace: true });
      return;
    }

    if (wQ && workId !== wQ) {
      setWorkId(wQ);
      try {
        localStorage.setItem(LS_LAST_WORK, wQ);
      } catch {
        /* ignore */
      }
      return;
    }

    if (cQ) {
      if (!workId) return;
      if (chapters.length === 0) return;
      if (!chapters.some((c) => c.id === cQ)) {
        const n = new URLSearchParams(searchParams);
        n.delete(SHENG_HUI_Q.chapter);
        setSearchParams(n, { replace: true });
        return;
      }
      if (outline.length === 0) return;
      const nodeId = findChapterOutlineNodeId(outline, cQ);
      if (!nodeId) {
        const n = new URLSearchParams(searchParams);
        n.delete(SHENG_HUI_Q.chapter);
        setSearchParams(n, { replace: true });
        return;
      }
      if (selectedOutlineId !== nodeId) {
        setSelectedOutlineId(nodeId);
        return;
      }
    }

    const n = new URLSearchParams(searchParams);
    n.delete(SHENG_HUI_Q.work);
    n.delete(SHENG_HUI_Q.chapter);
    setSearchParams(n, { replace: true });
  }, [
    pageLoading,
    works,
    outline,
    chapters,
    workId,
    selectedOutlineId,
    searchParams,
    setWorkId,
    setSelectedOutlineId,
    setSearchParams,
  ]);
}
