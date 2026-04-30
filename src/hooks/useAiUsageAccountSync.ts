import { useEffect } from "react";
import {
  backfillLocalAiUsageToCloud,
  pullAiUsageEventsFromCloudAndMerge,
} from "../storage/ai-usage-cloud";

const BACKFILL_SESSION_KEY = "liubai:aiUsageBackfillDone";

/** 从其它浏览器/标签页推送的事件：仅靠首次加载拉一次不够，需在切回前台或定时再拉 */
const PULL_DEBOUNCE_MS = 400;
const PULL_INTERVAL_MS = 90_000;

function dispatchUsageUpdated() {
  try {
    window.dispatchEvent(new CustomEvent("liubai:ai-usage-log-updated"));
  } catch {
    /* ignore */
  }
}

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
      dispatchUsageUpdated();
    })();

    return () => {
      cancelled = true;
    };
  }, [authUserId]);

  /** 多标签 / 多浏览器：其它端写入云端后，本页须周期性或回到前台时再 pull */
  useEffect(() => {
    if (!authUserId) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const runPull = () => {
      void pullAiUsageEventsFromCloudAndMerge().then(() => {
        dispatchUsageUpdated();
      });
    };

    const schedulePull = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        runPull();
      }, PULL_DEBOUNCE_MS);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") schedulePull();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", schedulePull);

    intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") runPull();
    }, PULL_INTERVAL_MS);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", schedulePull);
      if (debounceTimer) clearTimeout(debounceTimer);
      if (intervalId) clearInterval(intervalId);
    };
  }, [authUserId]);
}
