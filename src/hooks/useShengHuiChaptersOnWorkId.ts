import { useEffect } from "react";
import { getWork, listChapters } from "../db/repo";
import type { Chapter } from "../db/types";
import { resolveDefaultChapterId } from "../util/resolve-default-chapter";
import type { Dispatch, SetStateAction } from "react";

/**
 * `workId` 变化时拉章表并解析默认 `chapterId`。
 */
export function useShengHuiChaptersOnWorkId(
  workId: string | null,
  setChapters: Dispatch<SetStateAction<Chapter[]>>,
  setChapterId: Dispatch<SetStateAction<string | null>>,
) {
  useEffect(() => {
    if (!workId) {
      setChapters([]);
      setChapterId(null);
      return;
    }
    const wId = workId;
    void (async () => {
      const [list, w] = await Promise.all([listChapters(wId), getWork(wId)]);
      setChapters(list);
      setChapterId((prev) => {
        if (prev && list.some((c) => c.id === prev)) return prev;
        return resolveDefaultChapterId(wId, list, w ?? undefined);
      });
    })();
  }, [workId, setChapters, setChapterId]);
}
