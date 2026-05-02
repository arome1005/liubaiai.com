import { useState, useCallback, useEffect } from "react";
import {
  listReferenceChapterHeads,
  listReferenceExcerptsWithTagIds,
  listReferenceExtracts,
} from "../../../db/repo";
import type {
  ReferenceChapterHead,
  ReferenceExcerpt,
  ReferenceExtract,
  ReferenceLibraryEntry,
} from "../../../db/types";

type WorkbenchTab = "overview" | "excerpts" | "extracts";

interface UseReferenceWorkbenchProps {
  /** 当前库中全部书目列表（用于通过 id 查找 entry） */
  items: ReferenceLibraryEntry[];
}

export function useReferenceWorkbench({ items }: UseReferenceWorkbenchProps) {
  const [workbenchOpen, setWorkbenchOpen] = useState(false);
  const [workbenchRefId, setWorkbenchRefId] = useState<string | null>(null);
  const [workbenchEntry, setWorkbenchEntry] = useState<ReferenceLibraryEntry | null>(null);
  const [workbenchHeads, setWorkbenchHeads] = useState<ReferenceChapterHead[]>([]);
  const [workbenchExcerpts, setWorkbenchExcerpts] = useState<Array<ReferenceExcerpt & { tagIds: string[] }>>([]);
  const [workbenchExtracts, setWorkbenchExtracts] = useState<ReferenceExtract[]>([]);
  const [workbenchTab, setWorkbenchTab] = useState<WorkbenchTab>("overview");

  // ── 工作台数据加载（按 workbenchRefId）────────────────────────────────────
  useEffect(() => {
    if (!workbenchOpen || !workbenchRefId) return;
    let cancelled = false;
    void (async () => {
      const entry = items.find((x) => x.id === workbenchRefId) ?? null;
      const [heads, excerpts, extracts] = await Promise.all([
        listReferenceChapterHeads(workbenchRefId),
        listReferenceExcerptsWithTagIds(workbenchRefId),
        listReferenceExtracts(workbenchRefId),
      ]);
      if (cancelled) return;
      setWorkbenchEntry(entry);
      setWorkbenchHeads(heads);
      setWorkbenchExcerpts(excerpts);
      setWorkbenchExtracts(extracts);
    })();
    return () => {
      cancelled = true;
    };
  }, [items, workbenchOpen, workbenchRefId]);

  // ── 打开工作台 ──────────────────────────────────────────────────────────
  const openWorkbench = useCallback((refId: string) => {
    setWorkbenchRefId(refId);
    setWorkbenchTab("overview");
    setWorkbenchOpen(true);
  }, []);

  // ── 关闭工作台（重置全部状态） ──────────────────────────────────────────
  const closeWorkbench = useCallback(() => {
    setWorkbenchOpen(false);
    setWorkbenchRefId(null);
    setWorkbenchEntry(null);
    setWorkbenchHeads([]);
    setWorkbenchExcerpts([]);
    setWorkbenchExtracts([]);
  }, []);

  return {
    workbenchOpen,
    setWorkbenchOpen,
    workbenchRefId,
    workbenchEntry,
    workbenchHeads,
    workbenchExcerpts,
    workbenchExtracts,
    workbenchTab,
    setWorkbenchTab,
    openWorkbench,
    closeWorkbench,
  };
}
