import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { AiSettings } from "../ai/types";
import { runShengHuiStyleFeatureExtract } from "../ai/sheng-hui-style-extract";
import { isAbortError } from "../util/is-abort-error";

const SS_PREFIX = "liubai:shengHuiRagStyleFeatures:v1:";

function storageKey(workId: string) {
  return `${SS_PREFIX}${workId}`;
}

function loadMapFromSession(workId: string): Map<string, string> {
  try {
    const raw = sessionStorage.getItem(storageKey(workId));
    if (!raw) return new Map();
    const o = JSON.parse(raw) as unknown;
    if (o && typeof o === "object" && !Array.isArray(o)) {
      return new Map(Object.entries(o as Record<string, string>).filter(([, v]) => typeof v === "string"));
    }
  } catch {
    /* ignore */
  }
  return new Map();
}

function saveMapToSession(workId: string, map: Map<string, string>) {
  try {
    const o = Object.fromEntries(map);
    sessionStorage.setItem(storageKey(workId), JSON.stringify(o));
  } catch {
    /* quota */
  }
}

/**
 * 生辉 RAG：chunkId → 已提炼的笔法特征（替代原文注入）；`sessionStorage` 按 `workId` 桶持久化，刷新可复用。
 * 新一次「搜索」应调用 `clearForNewRagSearch`（与升级计划：新搜索 → 旧提炼失效 一致）。
 */
export function useShengHuiRagStyleFeatures(workId: string | null) {
  const [styleFeatures, setStyleFeatures] = useState<Map<string, string>>(() => (workId ? loadMapFromSession(workId) : new Map()));
  const [extractingFeatureIds, setExtractingFeatureIds] = useState<Set<string>>(() => new Set());
  const extractingRef = useRef<Set<string>>(new Set());
  const abortByChunkIdRef = useRef<Map<string, AbortController>>(new Map());

  useEffect(() => {
    if (!workId) {
      setStyleFeatures(new Map());
      return;
    }
    setStyleFeatures(loadMapFromSession(workId));
  }, [workId]);

  useEffect(() => {
    if (!workId) return;
    saveMapToSession(workId, styleFeatures);
  }, [workId, styleFeatures]);

  const clearForNewRagSearch = useCallback(() => {
    setStyleFeatures(new Map());
    if (workId) {
      try {
        sessionStorage.removeItem(storageKey(workId));
      } catch {
        /* ignore */
      }
    }
  }, [workId]);

  const stopStyleFeatureExtract = useCallback((chunkId: string) => {
    abortByChunkIdRef.current.get(chunkId)?.abort();
  }, []);

  const runExtract = useCallback(
    async (settings: AiSettings, chunkId: string, sourceText: string, onAfterSuccess?: () => void) => {
      if (!sourceText.trim()) return;
      if (extractingRef.current.has(chunkId)) return;
      abortByChunkIdRef.current.get(chunkId)?.abort();
      const ac = new AbortController();
      abortByChunkIdRef.current.set(chunkId, ac);
      extractingRef.current.add(chunkId);
      setExtractingFeatureIds((prev) => new Set(prev).add(chunkId));
      try {
        const feature = await runShengHuiStyleFeatureExtract({
          settings,
          workId,
          sourceText,
          signal: ac.signal,
        });
        if (feature) {
          setStyleFeatures((prev) => new Map(prev).set(chunkId, feature));
          onAfterSuccess?.();
        }
      } catch (e) {
        if (!isAbortError(e)) toast.error("笔法提炼失败，请重试。");
      } finally {
        abortByChunkIdRef.current.delete(chunkId);
        extractingRef.current.delete(chunkId);
        setExtractingFeatureIds((prev) => {
          const next = new Set(prev);
          next.delete(chunkId);
          return next;
        });
      }
    },
    [workId],
  );

  return {
    styleFeatures,
    extractingFeatureIds,
    runExtract,
    stopStyleFeatureExtract,
    clearForNewRagSearch,
  };
}
