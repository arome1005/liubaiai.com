import { useCallback, useEffect, useState } from "react";
import { listAllAiUsageEvents, type AiUsageEventRow } from "../storage/ai-usage-db";
import { loadAiSettings } from "../ai/storage";
import type { AiProviderId, PerspectiveMode, TimeRange } from "../util/usage-types";
import {
  buildInputSideContextBreakdown,
  buildTaskBreakdown,
  buildTimelineBuckets,
  buildUsageRecords,
  buildUsageStats,
  filterUsageEvents,
  listWorkOptionsFromEvents,
} from "../util/usage-aggregates";
import { shouldUseOwnerSidecar } from "../util/owner-mode";

export interface UseAiUsageInsightsParams {
  work: string;
  timeRange: TimeRange;
  provider: AiProviderId;
  perspective: PerspectiveMode;
}

export function useAiUsageInsights(params: UseAiUsageInsightsParams) {
  const [raw, setRaw] = useState<AiUsageEventRow[]>([]);
  const [tick, setTick] = useState(0);
  const [isOwnerMode, setIsOwnerMode] = useState(false);

  const reload = useCallback(async () => {
    const ev = await listAllAiUsageEvents();
    setRaw(ev);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, tick]);

  useEffect(() => {
    function onUpd() {
      setTick((x) => x + 1);
    }
    window.addEventListener("liubai:ai-usage-log-updated", onUpd);
    return () => window.removeEventListener("liubai:ai-usage-log-updated", onUpd);
  }, []);

  useEffect(() => {
    let ok = true;
    void (async () => {
      const o = await shouldUseOwnerSidecar();
      if (ok) setIsOwnerMode(o);
    })();
    return () => {
      ok = false;
    };
  }, [tick]);

  const settings = loadAiSettings();
  const filtered = filterUsageEvents(raw, params);
  const workOptions = listWorkOptionsFromEvents(raw);

  const records = buildUsageRecords(filtered);
  const taskBreakdown = buildTaskBreakdown(filtered, params.perspective);
  const contextBreakdown = buildInputSideContextBreakdown(filtered, params.perspective);
  const stats = buildUsageStats(raw, filtered, params.perspective, {
    dailyTokenLimit: settings.dailyTokenBudget,
    sessionTokenLimit: settings.aiSessionApproxTokenBudget,
  });
  const timelineData = buildTimelineBuckets(filtered, params.timeRange, params.perspective);

  const isEmpty = raw.length === 0;

  return {
    records,
    taskBreakdown,
    contextBreakdown,
    stats,
    timelineData,
    workOptions,
    isOwnerMode,
    isEmpty,
    refresh: reload,
  };
}
