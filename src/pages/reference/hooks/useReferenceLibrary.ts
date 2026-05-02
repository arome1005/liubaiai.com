import { useState, useMemo, useEffect, useCallback } from "react";
import { listReferenceLibrary, listWorks, deleteReferenceLibraryEntry } from "../../../db/repo";
import type { ReferenceLibraryEntry, Work } from "../../../db/types";
import { downloadReferenceLibraryZip } from "../../../util/reference-batch-export";
import {
  loadReferenceFavoriteIds,
  loadReferenceFavoriteScope,
  saveReferenceFavoriteIds,
  saveReferenceFavoriteScope,
  type ReferenceFavoriteScope,
} from "../../../util/reference-favorites";
import { toast } from "sonner";

export type ReferenceViewMode = "grid" | "list";
export type ReferenceSortBy = "recent" | "words" | "progress";

const LS_REF_VIEW_MODE = "liubai:referenceViewMode";
const LS_REF_SORT_BY = "liubai:referenceSortBy";

// Used for "progress" sorting and resuming reader
export function loadReaderPos(refWorkId: string): number | null {
  try {
    const raw = localStorage.getItem("liubai-ref:readerPos:" + refWorkId);
    if (!raw) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function useReferenceLibrary(setBusy: (busy: boolean) => void) {
  const [items, setItems] = useState<ReferenceLibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => loadReferenceFavoriteIds());
  const [favoriteScope, setFavoriteScope] = useState<ReferenceFavoriteScope>(() => loadReferenceFavoriteScope());
  const [exportSelection, setExportSelection] = useState<Set<string>>(() => new Set());
  const [worksList, setWorksList] = useState<Work[]>([]);

  const [viewMode, setViewMode] = useState<ReferenceViewMode>(() => {
    try {
      const v = localStorage.getItem(LS_REF_VIEW_MODE);
      return v === "list" ? "list" : "grid";
    } catch {
      return "grid";
    }
  });

  const [sortBy, setSortBy] = useState<ReferenceSortBy>(() => {
    try {
      const v = localStorage.getItem(LS_REF_SORT_BY);
      if (v === "words" || v === "progress") return v;
      return "recent";
    } catch {
      return "recent";
    }
  });

  const refreshLibrary = useCallback(async () => {
    const list = await listReferenceLibrary();
    setItems(list);
    return list;
  }, []);

  const refreshWorks = useCallback(async () => {
    const list = await listWorks();
    setWorksList(list);
    return list;
  }, []);

  // Initial load
  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([refreshLibrary(), refreshWorks()]);
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshLibrary, refreshWorks]);

  // Sync favorites & export selection when items change
  useEffect(() => {
    const valid = new Set(items.map((i) => i.id));
    setFavoriteIds((prev) => {
      const next = new Set([...prev].filter((id) => valid.has(id)));
      if (next.size !== prev.size) saveReferenceFavoriteIds(next);
      return next;
    });
    setExportSelection((prev) => {
      const next = new Set([...prev].filter((id) => valid.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [items]);

  useEffect(() => {
    saveReferenceFavoriteScope(favoriteScope);
  }, [favoriteScope]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_REF_VIEW_MODE, viewMode);
    } catch {
      /* ignore */
    }
  }, [viewMode]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_REF_SORT_BY, sortBy);
    } catch {
      /* ignore */
    }
  }, [sortBy]);

  const categoryOptions = useMemo(() => {
    const s = new Set<string>();
    for (const it of items) {
      const c = (it.category ?? "").trim();
      if (c) s.add(c);
    }
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filteredItems = useMemo(() => {
    let list = items;
    if (categoryFilter) list = list.filter((it) => (it.category ?? "").trim() === categoryFilter);
    if (favoriteScope === "favorites") list = list.filter((it) => favoriteIds.has(it.id));
    list = [...list].sort((a, b) => {
      if (sortBy === "words") return b.totalChars - a.totalChars;
      if (sortBy === "progress") {
        const pctA = a.chunkCount > 1 ? (loadReaderPos(a.id) ?? 0) / (a.chunkCount - 1) : 0;
        const pctB = b.chunkCount > 1 ? (loadReaderPos(b.id) ?? 0) / (b.chunkCount - 1) : 0;
        return pctB - pctA;
      }
      return b.updatedAt - a.updatedAt;
    });
    return list;
  }, [items, categoryFilter, favoriteScope, favoriteIds, sortBy]);

  const libraryTotals = useMemo(() => {
    let chars = 0;
    for (const it of items) chars += it.totalChars;
    return { count: items.length, chars };
  }, [items]);

  const toggleReferenceFavorite = useCallback((id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveReferenceFavoriteIds(next);
      return next;
    });
  }, []);

  const selectAllFilteredForExport = useCallback(() => {
    setExportSelection(new Set(filteredItems.map((r) => r.id)));
  }, [filteredItems]);

  const clearExportSelection = useCallback(() => {
    setExportSelection(new Set());
  }, []);

  const runExportZip = useCallback(async () => {
    if (exportSelection.size === 0) return;
    setBusy(true);
    try {
      await downloadReferenceLibraryZip(items, [...exportSelection]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [exportSelection, items, setBusy]);

  const filterEmptyHint = useMemo(() => {
    if (items.length === 0) return "";
    if (filteredItems.length > 0) return "";
    if (favoriteScope === "favorites" && categoryFilter) {
      return "当前分类下没有已收藏的书目，可调整分类或改为「全部书目」。";
    }
    if (favoriteScope === "favorites") {
      return "暂无符合筛选的收藏书目。点击书目旁的星标可将原著加入收藏（仅本机）。";
    }
    if (categoryFilter) {
      return "当前分类下没有书目，请调整分类筛选。";
    }
    return "没有符合筛选的书目。";
  }, [items.length, filteredItems.length, favoriteScope, categoryFilter]);

  const deleteItem = useCallback(async (id: string) => {
    await deleteReferenceLibraryEntry(id);
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  return {
    items,
    filteredItems,
    loading,
    categoryFilter,
    setCategoryFilter,
    favoriteIds,
    favoriteScope,
    setFavoriteScope,
    exportSelection,
    setExportSelection,
    viewMode,
    setViewMode,
    sortBy,
    setSortBy,
    worksList,
    refreshLibrary,
    refreshWorks,
    deleteItem,
    categoryOptions,
    libraryTotals,
    toggleReferenceFavorite,
    selectAllFilteredForExport,
    clearExportSelection,
    runExportZip,
    filterEmptyHint,
  };
}
