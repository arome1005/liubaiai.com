import { useEffect } from "react";
import {
  backfillLocalAiUsageToCloud,
  pullAiUsageEventsFromCloudAndMerge,
} from "../storage/ai-usage-cloud";

const BACKFILL_SESSION_KEY = "liubai:aiUsageBackfillDone";

/**
 * 登录后：从云端拉取用量事件合并至本机，并将本机历史回填上传（每个浏览器会话仅回填一次）。
 */
export function useAiUsageAccountSync(authUserId: string | undefined) {
  useEffect(() => {
    if (!authUserId) return;
    let cancelled = false;
    const backfillKey = `${BACKFILL_SESSION_KEY}:${authUserId}`;

    void (async () => {
      await pullAiUsageEventsFromCloudAndMerge();
      if (cancelled) return;

      let skipBackfill = false;
      try {
        skipBackfill = sessionStorage.getItem(backfillKey) === "1";
      } catch {
        skipBackfill = false;
      }

      if (!skipBackfill) {
        await backfillLocalAiUsageToCloud();
        try {
          sessionStorage.setItem(backfillKey, "1");
        } catch {
          /* ignore */
        }
      }

      if (cancelled) return;
      try {
        window.dispatchEvent(new CustomEvent("liubai:ai-usage-log-updated"));
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authUserId]);
}
