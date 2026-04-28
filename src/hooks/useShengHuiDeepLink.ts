import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import type { Chapter } from "../db/types";
import type { Work } from "../db/types";
import { SHENG_HUI_Q } from "../util/sheng-hui-deeplink";

const LS_LAST_WORK = "liubai:lastWorkId";

/**
 * 消费 `?work=<uuid>&chapter=<uuid>`：优先对齐作品/章节，成功后从地址栏 strip。
 */
export function useShengHuiDeepLink(
  loading: boolean,
  works: Work[],
  chapters: Chapter[],
  workId: string | null,
  chapterId: string | null,
  setWorkId: (v: string | null) => void,
  setChapterId: (v: string | null) => void,
) {
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (loading) return;
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
      if (chapterId !== cQ) {
        setChapterId(cQ);
        return;
      }
    }

    const n = new URLSearchParams(searchParams);
    n.delete(SHENG_HUI_Q.work);
    n.delete(SHENG_HUI_Q.chapter);
    setSearchParams(n, { replace: true });
  }, [loading, works, chapters, workId, chapterId, searchParams, setWorkId, setChapterId, setSearchParams]);
}
