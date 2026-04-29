import { useEffect } from "react";
import { getWork, getWorkStyleCard } from "../db/repo";
import type { Work, WorkStyleCard } from "../db/types";
import type { Dispatch, SetStateAction } from "react";

/**
 * `workId` 变化时拉取 `Work` 与 `WorkStyleCard`。
 */
export function useShengHuiWorkAndStyleOnWorkId(
  workId: string | null,
  setWork: Dispatch<SetStateAction<Work | null>>,
  setStyleCard: Dispatch<SetStateAction<WorkStyleCard | undefined>>,
) {
  useEffect(() => {
    if (!workId) {
      setWork(null);
      setStyleCard(undefined);
      return;
    }
    const wId = workId;
    void (async () => {
      const [w, sc] = await Promise.all([getWork(wId), getWorkStyleCard(wId)]);
      setWork(w ?? null);
      setStyleCard(sc);
    })();
  }, [workId, setWork, setStyleCard]);
}
