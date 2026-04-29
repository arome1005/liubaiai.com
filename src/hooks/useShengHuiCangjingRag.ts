import { useCallback, useState } from "react";
import type { Chapter, ReferenceSearchHit } from "../db/types";
import type { AiSettings } from "../ai/types";
import { searchWritingRagMerged } from "../util/work-rag-runtime";
import { useShengHuiRagStyleFeatures } from "./useShengHuiRagStyleFeatures";

const RAG_LIMIT = 8;

/**
 * 生辉右栏「藏经」：检索、勾选、笔法提炼 + 与 {@link useShengHuiRagStyleFeatures} 联动（新搜索清空旧提炼）。
 */
export function useShengHuiCangjingRag(workId: string | null, chapters: Chapter[], settings: AiSettings) {
  const { styleFeatures, extractingFeatureIds, runExtract, stopStyleFeatureExtract, clearForNewRagSearch } =
    useShengHuiRagStyleFeatures(workId);
  const [ragQuery, setRagQuery] = useState("");
  const [ragResults, setRagResults] = useState<ReferenceSearchHit[]>([]);
  const [ragSearching, setRagSearching] = useState(false);
  const [selectedExcerptIds, setSelectedExcerptIds] = useState<Set<string>>(new Set());

  const searchRag = useCallback(async () => {
    if (!ragQuery.trim() || ragSearching) return;
    setRagSearching(true);
    setRagResults([]);
    setSelectedExcerptIds(new Set());
    clearForNewRagSearch();
    try {
      const hits = await searchWritingRagMerged({
        workId: workId ?? "",
        query: ragQuery.trim(),
        limit: RAG_LIMIT,
        sources: { referenceLibrary: true, workBibleExport: false, workManuscript: false },
        chapters,
      });
      setRagResults(hits);
      setSelectedExcerptIds(new Set(hits.map((h) => h.chunkId)));
    } finally {
      setRagSearching(false);
    }
  }, [chapters, clearForNewRagSearch, ragQuery, ragSearching, workId]);

  const toggleExcerpt = useCallback((chunkId: string) => {
    setSelectedExcerptIds((prev) => {
      const next = new Set(prev);
      if (next.has(chunkId)) next.delete(chunkId);
      else next.add(chunkId);
      return next;
    });
  }, []);

  const onExtractStyleFeature = useCallback(
    (chunkId: string, text: string) => {
      void runExtract(settings, chunkId, text, () => {
        setSelectedExcerptIds((prev) => new Set(prev).add(chunkId));
      });
    },
    [runExtract, settings],
  );

  return {
    ragQuery,
    setRagQuery,
    ragResults,
    ragSearching,
    searchRag,
    selectedExcerptIds,
    styleFeatures,
    extractingFeatureIds,
    onExtractStyleFeature,
    onStopExtractStyleFeature: stopStyleFeatureExtract,
    onToggleExcerpt: toggleExcerpt,
  };
}
