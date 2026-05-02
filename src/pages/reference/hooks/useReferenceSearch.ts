import { useState, useEffect, useCallback, useRef } from "react";
import { searchReferenceLibrary, listReferenceChapterHeads, rebuildAllReferenceSearchIndex } from "../../../db/repo";
import type { ReferenceSearchHit, ReferenceChapterHead } from "../../../db/types";

export type ReferenceSearchMode = "strict" | "hybrid";
const LS_REF_SEARCH_MODE = "liubai:referenceSearchMode";

function loadReferenceSearchMode(): ReferenceSearchMode {
  try {
    return localStorage.getItem(LS_REF_SEARCH_MODE) === "hybrid" ? "hybrid" : "strict";
  } catch {
    return "strict";
  }
}

interface UseReferenceSearchProps {
  activeRefId: string | null;
  setBusy: (busy: boolean) => void;
  setMaintainBusy: (busy: boolean) => void;
  setHeavyJob: (job: { phase: "chunks" | "index"; percent: number; label?: string; fileName?: string } | null) => void;
  refreshLibrary: () => Promise<any>;
}

export function useReferenceSearch({
  activeRefId,
  setMaintainBusy,
  setHeavyJob,
  refreshLibrary,
}: UseReferenceSearchProps) {
  const [searchQ, setSearchQ] = useState("");
  const [searchHits, setSearchHits] = useState<ReferenceSearchHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [refSearchMode, setRefSearchMode] = useState<ReferenceSearchMode>(loadReferenceSearchMode);
  /** 仅搜当前打开的书；null = 全库 */
  const [searchScopeRefId, setSearchScopeRefId] = useState<string | null>(null);
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const searchDialogRef = useRef<HTMLTextAreaElement>(null);
  
  // 书目 id -> 章节标题列表（用于搜索结果显示章节名）
  const [refHeadsForHits, setRefHeadsForHits] = useState<Record<string, ReferenceChapterHead[]>>({});

  // Sync search mode to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(LS_REF_SEARCH_MODE, refSearchMode);
    } catch {
      /* ignore */
    }
  }, [refSearchMode]);

  // Sync searchScopeRefId with activeRefId if scoped search is active
  useEffect(() => {
    if (searchScopeRefId !== null && activeRefId) {
      setSearchScopeRefId(activeRefId);
    }
  }, [activeRefId, searchScopeRefId]);

  useEffect(() => {
    if (searchScopeRefId && !activeRefId) setSearchScopeRefId(null);
  }, [activeRefId, searchScopeRefId]);

  const runSearch = useCallback(async () => {
    const q = searchQ.trim();
    if (!q) {
      setSearchHits([]);
      return;
    }
    setSearchLoading(true);
    try {
      const hits = await searchReferenceLibrary(q, {
        refWorkId: searchScopeRefId ?? undefined,
        limit: 80,
        mode: refSearchMode,
      });
      setSearchHits(hits);
    } finally {
      setSearchLoading(false);
    }
  }, [searchQ, searchScopeRefId, refSearchMode]);

  const switchRefSearchMode = useCallback(async (next: ReferenceSearchMode) => {
    setRefSearchMode(next);
    const q = searchQ.trim();
    if (!q) return;
    setSearchLoading(true);
    try {
      const hits = await searchReferenceLibrary(q, {
        refWorkId: searchScopeRefId ?? undefined,
        limit: 80,
        mode: next,
      });
      setSearchHits(hits);
    } finally {
      setSearchLoading(false);
    }
  }, [searchQ, searchScopeRefId]);

  // 加载搜索结果对应的章节标题
  useEffect(() => {
    const ids = [...new Set(searchHits.map((h) => h.refWorkId))].slice(0, 12);
    if (ids.length === 0) {
      setRefHeadsForHits({});
      return;
    }
    let cancelled = false;
    void Promise.all(ids.map((id) => listReferenceChapterHeads(id).then((list) => [id, list] as const))).then(
      (pairs) => {
        if (cancelled) return;
        const map: Record<string, ReferenceChapterHead[]> = {};
        for (const [id, list] of pairs) map[id] = list;
        setRefHeadsForHits(map);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [searchHits]);

  const chapterLabelForHit = useCallback((refWorkId: string, ordinal: number): string => {
    const heads = refHeadsForHits[refWorkId];
    if (!heads || heads.length === 0) return "";
    let idx = -1;
    for (let i = 0; i < heads.length; i++) {
      if (heads[i]!.ordinal <= ordinal) idx = i;
      else break;
    }
    if (idx < 0) return "";
    return heads[idx]?.title ?? "";
  }, [refHeadsForHits]);

  const rebuildIndex = useCallback(async () => {
    setMaintainBusy(true);
    setHeavyJob({ phase: "index", percent: 0, label: "准备重建…" });
    try {
      await rebuildAllReferenceSearchIndex((p) =>
        setHeavyJob({ phase: "index", percent: p.percent, label: p.label }),
      );
    } finally {
      setHeavyJob(null);
      setMaintainBusy(false);
      await refreshLibrary();
    }
  }, [setMaintainBusy, setHeavyJob, refreshLibrary]);

  return {
    searchQ,
    setSearchQ,
    searchHits,
    setSearchHits,
    searchLoading,
    refSearchMode,
    setRefSearchMode,
    searchScopeRefId,
    setSearchScopeRefId,
    searchDialogOpen,
    setSearchDialogOpen,
    searchDialogRef,
    runSearch,
    switchRefSearchMode,
    chapterLabelForHit,
    rebuildIndex,
  };
}
