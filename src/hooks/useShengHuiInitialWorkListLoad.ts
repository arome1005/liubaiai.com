import { useEffect } from "react";
import type { Work } from "../db/types";
import { LS_SHENG_HUI_LAST_WORK } from "../util/sheng-hui-workspace-constants";

/**
 * 生辉首屏：拉 `listWorks` 结果、从 localStorage 恢复上次 `workId` 或默认第一本。
 */
export function useShengHuiInitialWorkListLoad(
  refreshWorks: () => Promise<Work[]>,
  setWorkId: (id: string | null) => void,
  setLoading: (loading: boolean) => void,
) {
  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const list = await refreshWorks();
        let wid: string | null = null;
        try {
          wid = localStorage.getItem(LS_SHENG_HUI_LAST_WORK);
        } catch {
          wid = null;
        }
        if (wid && !list.some((w) => w.id === wid)) wid = null;
        if (!wid) wid = list[0]?.id ?? null;
        setWorkId(wid);
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshWorks, setWorkId, setLoading]);
}
