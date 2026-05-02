import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Spinner } from "../components/ui/spinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { cn } from "../lib/utils";
import {
  addReferenceExcerpt,
  clearAllReferenceLibraryData,
  deleteReferenceExcerpt,
  deleteReferenceLibraryEntry,
  deleteReferenceTag,
  getWork,
  listChapters,
  listReferenceExcerptsWithTagIds,
  listReferenceChapterHeads,
  listReferenceExtracts,
  updateReferenceLibraryEntry,
} from "../db/repo";
import type {
  Chapter,
  ReferenceChapterHead,
  ReferenceExcerpt,
  ReferenceSearchHit,
} from "../db/types";


import { workPathSegmentForId } from "../util/work-url";

import {
  Book,
  Download,
  X,
} from "lucide-react";
import { PromptExtractDialog } from "../components/PromptExtractDialog";
import { ReferenceAiChatDialog } from "../components/ReferenceAiChatDialog";




import { ReferenceSearchHitShengHuiRow } from "../components/reference/ReferenceSearchHitShengHuiRow";
import { useReferenceSearchShengHuiHandoff } from "../hooks/useReferenceSearchShengHuiHandoff";
import * as HandoffActions from "../actions/reference-handoff";
import { useReferenceLibrary, loadReaderPos } from "./reference/hooks/useReferenceLibrary";
import { useReferenceImport } from "./reference/hooks/useReferenceImport";
import { useReferenceReader } from "./reference/hooks/useReferenceReader";
import { useReferenceSearch } from "./reference/hooks/useReferenceSearch";
import { useReferenceExtract } from "./reference/hooks/useReferenceExtract";
import { useExcerptEditForm } from "./reference/hooks/useExcerptEditForm";
import { useReferenceWorkbench } from "./reference/hooks/useReferenceWorkbench";
import { ReferenceToolbar } from "./reference/components/ReferenceToolbar";
import { ImportConfigDialog } from "./reference/components/ImportConfigDialog";
import { useImperativeDialog } from "../components/ImperativeDialog";
import { ReferenceLibraryList } from "./reference/components/ReferenceLibraryList";
import { ReferenceReaderPanel } from "./reference/components/ReferenceReaderPanel";
import { ReferenceExcerptFilters, ReferenceExcerptList } from "./reference/components/ReferenceExcerptList";
import { ReferenceExtractPanel } from "./reference/components/ReferenceExtractPanel";
import { ReferenceWorkbenchPanel } from "./reference/components/ReferenceWorkbenchPanel";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import { 
  countNonPunctuation, 
  isLinkedChapterBeforeProgress 
} from "./reference/utils/reference-utils";

const LS_REF_PROGRESS_FILTER = "liubai-ref3_8-progress-filter";
const LS_REF_PROGRESS_WORK = "liubai-ref3_8-progress-work";






function loadProgressFilterEnabled(): boolean {
  try {
    return localStorage.getItem(LS_REF_PROGRESS_FILTER) === "1";
  } catch {
    return false;
  }
}

function loadProgressFilterWorkId(): string {
  try {
    return localStorage.getItem(LS_REF_PROGRESS_WORK) ?? "";
  } catch {
    return "";
  }
}





export function ReferenceLibraryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { prompt } = useImperativeDialog();
  const [busy, setBusy] = useState(false);
  const { confirmState, confirmBusy, confirmOnce, onConfirmAction, onCancel, handleConfirm } = useConfirmDialog();

  const {
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
    
    
    categoryOptions,
    libraryTotals,
    toggleReferenceFavorite,
    selectAllFilteredForExport,
    clearExportSelection,
    runExportZip,
    filterEmptyHint,
    extractCountById,
    totalExtracts,
  } = useReferenceLibrary(setBusy);

  const chunkAnchorRef = useRef<HTMLDivElement | null>(null);

  const {
    activeRefId,
    activeTitle,
    activeChunkCount,
    loadedChunks,
    focusOrdinal,
    setFocusOrdinal,
    highlight,
    setHighlight,
    activeChapterHeads,
    currentChapterIndex,
    currentChapterTitle,
    openReader,
    closeReader,
  } = useReferenceReader({ 
    chunkAnchorRef,
    onOpen: async (entry) => {
      setReaderCollapsed(false);
      await loadExcerpts(entry.id);
    }
  });

  const {
    importProgress,
    heavyJob,
    setHeavyJob,
    pendingImportFiles,
    importAbortRef,
    fileRef,
    openPicker,
    handleFiles,
    cancelImport,
    confirmImport,
  } = useReferenceImport({
    refreshLibrary,
    openReader,
    confirmOnce,
    setBusy,
  });

  const [maintainBusy, setMaintainBusy] = useState(false);

  const {
    searchQ,
    setSearchQ,
    searchHits,
    setSearchHits,
    searchLoading,
    refSearchMode,
    searchScopeRefId,
    setSearchScopeRefId,
    searchDialogOpen,
    setSearchDialogOpen,
    searchDialogRef,
    runSearch,
    switchRefSearchMode,
    chapterLabelForHit,
    rebuildIndex,
  } = useReferenceSearch({
    activeRefId,
    setBusy,
    setMaintainBusy,
    setHeavyJob,
    refreshLibrary,
  });



  const [readerCollapsed, setReaderCollapsed] = useState(false);
  const [excerpts, setExcerpts] = useState<Array<ReferenceExcerpt & { tagIds: string[] }>>([]);

  const [excerptTagFilterId, setExcerptTagFilterId] = useState<string>("");
  const [progressFilterEnabled, setProgressFilterEnabled] = useState(loadProgressFilterEnabled);
  const [progressFilterWorkId, setProgressFilterWorkId] = useState(loadProgressFilterWorkId);
  const [progressChapters, setProgressChapters] = useState<Chapter[]>([]);
  const [progressCursor, setProgressCursor] = useState<string | null>(null);
  const refWorkPathSeg = useCallback(
    (internalId: string) => workPathSegmentForId(worksList, internalId),
    [worksList],
  );
  /** 书目 id → 检测到的章节标题行（展开时懒加载） */
  const [refChapterHeadsById, setRefChapterHeadsById] = useState<Record<string, ReferenceChapterHead[]>>({});




  // ── 提炼要点（P1-03）状态 ──────────────────────────────────────────────
  // ── 提炼提示词 Dialog 状态 ──────────────────────────────────────────────────
  const [importWorkId, setImportWorkId] = useState<string>("");
  const [importBusy, setImportBusy] = useState<Record<string, boolean>>({});

  const {
    extractPanelOpen,
    setExtractPanelOpen,
    extractType,
    setExtractType,
    extractStreaming,
    extractLoading,
    extractError,
    savedExtracts,
    setSavedExtracts,
    extractAbortRef,
    promptExtractDialogOpen,
    setPromptExtractDialogOpen,
    promptExtractSource,
    setPromptExtractSource,
    promptExtractChunksRef,
    aiChatDialogOpen,
    setAiChatDialogOpen,
    aiChatBookChunks,
    handleStartExtract,
    handleImportExtract,
    applyKeyCardToWork,
    openPromptExtractFromExcerpt,
    openPromptExtractFromBook,
    openPromptExtractFromEntry,
    openAiChat,
    deleteExtract,
  } = useReferenceExtract({
    activeRefId,
    activeTitle,
    importWorkId,
    navigate,
    refWorkPathSeg,
    setImportBusy,
  });



  // ── 书籍详情工作台（P2-1） ───────────────────────────────────────────────
  const {
    workbenchOpen,
    workbenchEntry,
    workbenchHeads,
    workbenchExcerpts,
    workbenchExtracts,
    workbenchTab,
    setWorkbenchTab,
    openWorkbench,
    closeWorkbench,
  } = useReferenceWorkbench({ items });


  const loadExcerpts = useCallback(async (refId: string) => {
    setExcerpts(await listReferenceExcerptsWithTagIds(refId));
  }, []);

  const {
    editingExcerptId,
    setEditingExcerptId,
    editNote,
    setEditNote,
    editTagIds,
    setEditTagIds,
    editLinkedWorkId,
    setEditLinkedWorkId,
    editLinkedChapterId,
    setEditLinkedChapterId,
    editChapters,
    allTags,
    newTagName,
    setNewTagName,
    beginEditExcerpt,
    saveExcerptEdit,
    cancelEditExcerpt,
    handleCreateTag,
    refreshTags,
  } = useExcerptEditForm({ activeRefId, loadExcerpts });

  useEffect(() => {
    if (!progressFilterWorkId) {
      setProgressChapters([]);
      setProgressCursor(null);
      return;
    }
    void (async () => {
      const w = await getWork(progressFilterWorkId);
      const ch = await listChapters(progressFilterWorkId);
      setProgressCursor(w?.progressCursor ?? null);
      setProgressChapters([...ch].sort((a, b) => a.order - b.order));
    })();
  }, [progressFilterWorkId]);





  /** 从编辑器「在参考库打开」等深链进入：?ref=&ord=&hs=&he= */
  const deepLinkKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (loading) return;
    const refId = searchParams.get("ref");
    if (!refId) {
      deepLinkKeyRef.current = null;
      return;
    }
    const key = searchParams.toString();
    if (deepLinkKeyRef.current === key) return;
    if (items.length === 0) return;
    const entry = items.find((x) => x.id === refId);
    if (!entry) {
      deepLinkKeyRef.current = key;
      toast.error("地址栏中的参考书目不存在或已删除。");
      setSearchParams({}, { replace: true });
      return;
    }
    deepLinkKeyRef.current = key;
    const ord = parseInt(searchParams.get("ord") ?? "0", 10);
    const hs = searchParams.get("hs");
    const he = searchParams.get("he");
    const hl =
      hs !== null && he !== null && hs !== "" && he !== ""
        ? { start: parseInt(hs, 10), end: parseInt(he, 10) }
        : null;
    void openReader(entry, Number.isFinite(ord) ? ord : 0, hl).then(() => {
      setSearchParams({}, { replace: true });
      deepLinkKeyRef.current = null;
    });
  }, [loading, items, searchParams, openReader, setSearchParams]);

  // ── 提炼要点：加载已保存条目 ─────────────────────────────────────────
  useEffect(() => {
    if (!activeRefId || !extractPanelOpen) return;
    void listReferenceExtracts(activeRefId).then(setSavedExtracts);
  }, [activeRefId, extractPanelOpen]);









  const handoffCtx: HandoffActions.HandoffContext = {
    importWorkId,
    activeRefId,
    activeTitle,
    progressCursor,
    navigate,
    refWorkPathSeg,
  };

  // ── 打开「提炼提示词」Dialog ───────────────────────────────────────────────



  const jumpExcerptToReader = useCallback(
    async (ex: ReferenceExcerpt) => {
      const entry = items.find((x) => x.id === ex.refWorkId);
      if (!entry) {
        toast.error("该参考书目已不存在，无法跳转。");
        return;
      }
      await openReader(entry, ex.ordinal, { start: ex.startOffset, end: ex.endOffset });
    },
    [items, openReader],
  );

  useEffect(() => {
    if (chunkAnchorRef.current && highlight) {
      chunkAnchorRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [focusOrdinal, highlight, activeRefId]);







  async function handleDelete(id: string, title: string) {
    if (await confirmOnce({
      title: "删除参考库",
      description: `删除参考库「${title}」？分块、索引与摘录会一并删除（不可撤销）。`,
      actionText: "确定删除",
      destructive: true,
    })) {
      await onConfirmAction(async () => {
        await deleteReferenceLibraryEntry(id);
        if (activeRefId === id) {
          closeReader();
          setExcerpts([]);
          setHighlight(null);
        }
        if (searchScopeRefId === id) setSearchScopeRefId(null);
        await refreshLibrary();
      });
    }
  }

  async function onHitClick(hit: ReferenceSearchHit) {
    const entry = items.find((x) => x.id === hit.refWorkId);
    if (!entry) return;
    await openReader(entry, hit.ordinal, {
      start: hit.highlightStart,
      end: hit.highlightEnd,
    });
  }

  const openSearchHitInShengHui = useReferenceSearchShengHuiHandoff(navigate, importWorkId, progressCursor);

  async function saveSelectionAsExcerpt() {
    if (!activeRefId) return;
    const ch = loadedChunks.curr;
    if (!ch) return;
    const sel = window.getSelection();
    const t = sel?.toString() ?? "";
    if (!t.trim()) {
      toast.error("请先在阅读器中划选要保存的文字。");
      return;
    }
    const start = ch.content.indexOf(t);
    if (start < 0) {
      toast.error("无法定位选区，请缩短选区或避免跨段选择。");
      return;
    }
    const end = start + t.length;
    const note = await prompt("摘录备注（可空）", "");
    if (note === null) return;
    await addReferenceExcerpt({
      refWorkId: activeRefId,
      chunkId: ch.id,
      ordinal: ch.ordinal,
      startOffset: start,
      endOffset: end,
      text: t,
      note: note.trim(),
    });
    await loadExcerpts(activeRefId);
    sel?.removeAllRanges();
  }

  async function removeExcerpt(id: string) {
    if (await confirmOnce({
      title: "删除摘录",
      description: "删除这条摘录？（不可撤销）",
      actionText: "确定删除",
      destructive: true,
    })) {
      await onConfirmAction(async () => {
        await deleteReferenceExcerpt(id);
        if (activeRefId) await loadExcerpts(activeRefId);
        if (editingExcerptId === id) setEditingExcerptId(null);
      });
    }
  }



  const currentChunk = loadedChunks.curr;
  const prevChunk = loadedChunks.prev;
  const nextChunk = loadedChunks.next;

  const visibleExcerpts = useMemo(() => {
    let list = excerpts;
    if (excerptTagFilterId) {
      list = list.filter((e) => e.tagIds.includes(excerptTagFilterId));
    }
    if (progressFilterEnabled && progressFilterWorkId) {
      list = list.filter((e) =>
        isLinkedChapterBeforeProgress(progressChapters, progressCursor, e.linkedChapterId ?? null),
      );
    }
    return list;
  }, [excerpts, excerptTagFilterId, progressFilterEnabled, progressFilterWorkId, progressChapters, progressCursor]);

  if (loading) {
    return (
      <div className={cn("page reference-page flex flex-col gap-4")}>
        <div className="flex flex-col items-center justify-center py-16">
          <Book className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground">加载中…</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("page reference-page reference-page--split flex flex-col gap-4")}>

      <ReferenceToolbar
        searchQ={searchQ}
        setSearchQ={setSearchQ}
        runSearch={runSearch}
        searchLoading={searchLoading}
        setSearchHits={setSearchHits}
        setSearchDialogOpen={setSearchDialogOpen}
        searchScopeRefId={searchScopeRefId}
        setSearchScopeRefId={setSearchScopeRefId}
        refSearchMode={refSearchMode}
        switchRefSearchMode={switchRefSearchMode}
        categoryFilter={categoryFilter}
        setCategoryFilter={setCategoryFilter}
        categoryOptions={categoryOptions}
        sortBy={sortBy}
        setSortBy={setSortBy}
        favoriteScope={favoriteScope}
        setFavoriteScope={setFavoriteScope}
        libraryTotals={libraryTotals}
        totalExtracts={totalExtracts}
        favoriteIds={favoriteIds}
        activeRefId={activeRefId}
        activeTitle={activeTitle}
        items={items}
        openAiChat={openAiChat}
        busy={busy}
        exportSelection={exportSelection}
        runExportZip={runExportZip}
        openPicker={openPicker}
        importProgress={importProgress}
        fileRef={fileRef}
        handleFiles={handleFiles}
        viewMode={viewMode}
        setViewMode={setViewMode}
      />

      {/* 主内容区（分栏布局） */}
      <div className="reference-page-layout">
        <main className="reference-main">

          {/* 搜索结果 */}
          {searchHits.length > 0 && (
            <div className="mb-4 rounded-xl border border-black/5 dark:border-border/40 bg-white dark:bg-card/30 p-4 shadow-sm">
              <div className="mb-3 text-sm font-medium text-foreground">
                搜索结果 · {searchHits.length} 处
              </div>
              <ul className="space-y-2">
                {searchHits.map((h) => (
                  <li key={`${h.chunkId}-${h.ordinal}-${h.highlightStart}-${h.snippetMatch}`}>
                    <ReferenceSearchHitShengHuiRow
                      hit={h}
                      chapterLabel={chapterLabelForHit(h.refWorkId, h.ordinal) ?? ""}
                      shengHuiDisabled={!importWorkId}
                      onOpenInReader={() => void onHitClick(h)}
                      onShengHui={() => void openSearchHitInShengHui(h)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ReferenceLibraryList
            items={items}
            filteredItems={filteredItems}
            viewMode={viewMode as "grid" | "list"}
            favoriteIds={favoriteIds}
            exportSelection={exportSelection}
            extractCountById={extractCountById}
            refChapterHeadsById={refChapterHeadsById}
            filterEmptyHint={filterEmptyHint}
            openPicker={openPicker}
            setCategoryFilter={setCategoryFilter}
            setFavoriteScope={setFavoriteScope}
            loadReaderPos={loadReaderPos}
            toggleReferenceFavorite={toggleReferenceFavorite}
            setExportSelection={setExportSelection}
            openReader={openReader}
            openWorkbench={openWorkbench}
            setExtractPanelOpen={setExtractPanelOpen}
            openPromptExtractFromEntry={openPromptExtractFromEntry}
            prompt={prompt}
            updateReferenceLibraryEntry={updateReferenceLibraryEntry}
            refreshLibrary={refreshLibrary}
            handleDelete={handleDelete}
            listReferenceChapterHeads={listReferenceChapterHeads}
            setRefChapterHeadsById={setRefChapterHeadsById}
          />

          {/* 摘录、标签与进度过滤（折叠面板） */}
          <details className="mt-4">
            <summary className="cursor-pointer rounded-xl border border-border/40 bg-card/30 px-4 py-3 text-sm font-medium text-muted-foreground transition-all hover:bg-card/50 hover:text-foreground">
              摘录、标签与进度过滤
            </summary>
            <div className="mt-2 space-y-5 rounded-xl border border-border/40 bg-card/30 p-5 shadow-sm">
              {/* 摘录与进度 */}
              <ReferenceExcerptFilters
                allTags={allTags}
                excerptTagFilterId={excerptTagFilterId}
                setExcerptTagFilterId={setExcerptTagFilterId}
                progressFilterEnabled={progressFilterEnabled}
                setProgressFilterEnabled={setProgressFilterEnabled}
                progressFilterWorkId={progressFilterWorkId}
                setProgressFilterWorkId={setProgressFilterWorkId}
                worksList={worksList}
                lsRefProgressFilterKey={LS_REF_PROGRESS_FILTER}
                lsRefProgressWorkKey={LS_REF_PROGRESS_WORK}
              />

              {/* 摘录标签 */}
              <section aria-labelledby="ref-panel-tags">
                <h2 id="ref-panel-tags" className="mb-3 text-sm font-medium text-foreground">摘录标签</h2>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      className="flex-1"
                      placeholder="新标签名称"
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={!newTagName.trim()}
                      onClick={() => {
                        void (async () => {
                          try {
                            await handleCreateTag();
                            await refreshLibrary();
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "创建失败");
                          }
                        })();
                      }}
                    >
                      添加
                    </Button>
                  </div>
                  {allTags.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {allTags.map((t) => (
                        <div key={t.id} className="flex items-center gap-1 rounded-full border border-border/50 bg-primary/10 px-2.5 py-0.5">
                          <span className="text-xs text-primary">{t.name}</span>
                          <button
                            type="button"
                            className="text-muted-foreground transition-colors hover:text-destructive"
                            onClick={async () => {
                              if (await confirmOnce({
                                title: "删除标签",
                                description: `删除标签「${t.name}」？摘录上的该标签会一并移除（不可撤销）。`,
                                actionText: "确定删除",
                                destructive: true,
                              })) {
                                await onConfirmAction(async () => {
                                  await deleteReferenceTag(t.id);
                                  if (excerptTagFilterId === t.id) setExcerptTagFilterId("");
                                  await refreshLibrary();
                                  await refreshTags();
                                  if (activeRefId) await loadExcerpts(activeRefId);
                                });
                              }
                            }}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">暂无标签；添加后可在侧栏摘录上勾选。</p>
                  )}
                </div>
              </section>

              {/* 批量导出 */}
              {items.length > 0 && (
                <section>
                  <h2 className="mb-3 text-sm font-medium text-foreground">批量导出</h2>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">全文导出为 ZIP（每部一个 .txt，不上传）</span>
                    <Button type="button" variant="outline" size="sm" disabled={busy || filteredItems.length === 0} onClick={selectAllFilteredForExport}>全选当前</Button>
                    <Button type="button" variant="outline" size="sm" disabled={busy || exportSelection.size === 0} onClick={clearExportSelection}>清空选择</Button>
                    <Button type="button" size="sm" disabled={busy || exportSelection.size === 0} onClick={() => void runExportZip()}>
                      <Download className="mr-1.5 h-4 w-4" />
                      导出 ZIP
                    </Button>
                    <span className="text-xs text-muted-foreground">已选 {exportSelection.size} 部</span>
                  </div>
                </section>
              )}
            </div>
          </details>

          {/* 参考库维护（折叠面板） */}
          <details className="mt-2">
            <summary className="cursor-pointer rounded-xl border border-border/40 bg-card/30 px-4 py-3 text-sm font-medium text-muted-foreground transition-all hover:bg-card/50 hover:text-foreground">
              参考库维护
            </summary>
            <div className="mt-2 rounded-xl border border-border/40 bg-card/30 p-5 shadow-sm">
              <p className="mb-3 text-xs text-muted-foreground">
                以下仅影响<strong>参考库</strong>（导入原著与摘录索引），<strong>不会</strong>删除作品正文。升级 Schema 后若检索异常，可先试「重建索引」。
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={maintainBusy || busy}
                  onClick={rebuildIndex}
                >
                  重建参考库索引
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={maintainBusy || busy}
                  onClick={async () => {
                    if (await confirmOnce({
                      title: "清空参考库",
                      description:
                        "将清空全部参考库（原著、索引、摘录），不影响作品与章节正文。此操作不可撤销，确定继续？",
                      actionText: "确定清空",
                      destructive: true,
                    })) {
                      await onConfirmAction(async () => {
                        setMaintainBusy(true);
                        try {
                          await clearAllReferenceLibraryData();
                          closeReader();
                          setExcerpts([]);
                          setSearchHits([]);
                          await refreshLibrary();
                        } finally {
                          setMaintainBusy(false);
                        }
                      });
                    }
                  }}
                >
                  清空参考库
                </Button>
              </div>
            </div>
          </details>

        </main>

        <aside className={`reference-reader-aside ${readerCollapsed ? "collapsed" : ""}`}>
          <button
            type="button"
            className="reference-reader-collapse-toggle"
            title={readerCollapsed ? "展开阅读器" : "折叠阅读器"}
            aria-expanded={!readerCollapsed}
            onClick={() => setReaderCollapsed((c) => !c)}
          >
            {readerCollapsed ? "⟨" : "⟩"}
          </button>
          {!readerCollapsed && (
            <div className="reference-reader-inner card">
                <ReferenceReaderPanel
                  activeRefId={activeRefId}
                  activeTitle={activeTitle}
                  activeChunkCount={activeChunkCount}
                  activeChapterHeads={activeChapterHeads}
                  currentChunk={currentChunk}
                  prevChunk={prevChunk}
                  nextChunk={nextChunk}
                  focusOrdinal={focusOrdinal}
                  setFocusOrdinal={setFocusOrdinal}
                  currentChapterIndex={currentChapterIndex}
                  currentChapterTitle={currentChapterTitle}
                  highlight={highlight}
                  setHighlight={setHighlight}
                  saveSelectionAsExcerpt={saveSelectionAsExcerpt}
                  chunkAnchorRef={chunkAnchorRef}
                />

                <ReferenceExcerptList
                  excerpts={excerpts}
                  visibleExcerpts={visibleExcerpts}
                  allTags={allTags}
                  editingExcerptId={editingExcerptId}
                  editNote={editNote}
                  setEditNote={setEditNote}
                  editTagIds={editTagIds}
                  setEditTagIds={setEditTagIds}
                  editLinkedWorkId={editLinkedWorkId}
                  setEditLinkedWorkId={setEditLinkedWorkId}
                  editLinkedChapterId={editLinkedChapterId}
                  setEditLinkedChapterId={setEditLinkedChapterId}
                  worksList={worksList}
                  editChapters={editChapters}
                  beginEditExcerpt={beginEditExcerpt}
                  saveExcerptEdit={saveExcerptEdit}
                  cancelEditExcerpt={cancelEditExcerpt}
                  removeExcerpt={removeExcerpt}
                  jumpExcerptToReader={jumpExcerptToReader}
                  sendExcerptToWritingAsRef={(ex: ReferenceExcerpt) => HandoffActions.sendExcerptToWritingAsRef(ex, handoffCtx)}
                  openPromptExtractFromExcerpt={openPromptExtractFromExcerpt}
                />

                  {/* ── 提炼要点面板 ──────────────────────────────────── */}
                  <ReferenceExtractPanel
                    activeRefId={activeRefId}
                    extractPanelOpen={extractPanelOpen}
                    setExtractPanelOpen={setExtractPanelOpen}
                    extractType={extractType}
                    setExtractType={setExtractType}
                    extractStreaming={extractStreaming}
                    extractLoading={extractLoading}
                    extractError={extractError}
                    savedExtracts={savedExtracts}
                    extractAbortRef={extractAbortRef}
                    importWorkId={importWorkId}
                    setImportWorkId={setImportWorkId}
                    importBusy={importBusy}
                    worksList={worksList}
                    handleStartExtract={handleStartExtract}
                    handleImportExtract={handleImportExtract}
                    openPromptExtractFromBook={openPromptExtractFromBook}
                    openConfirmDeleteExtract={async (id) => {
                      if (await confirmOnce({
                        title: "删除提炼结果",
                        description: "删除此条提炼结果？（不可撤销）",
                        actionText: "确定删除",
                        destructive: true,
                      })) {
                        await onConfirmAction(() => deleteExtract(id));
                      }
                    }}
                    applyKeyCardToWenceRefs={(card) => HandoffActions.applyKeyCardToWenceRefs(card, handoffCtx)}
                    jumpKeyCardToWritingHit={(card) => HandoffActions.jumpKeyCardToWritingHit(card, handoffCtx)}
                    applyKeyCardToAiDraft={(card) => HandoffActions.applyKeyCardToAiDraft(card, handoffCtx)}
                    applyKeyCardToWork={applyKeyCardToWork}
                  />
            </div>
          )}
        </aside>
      </div>

      {/* 书籍详情工作台（P2-1） */}
      <ReferenceWorkbenchPanel
        open={workbenchOpen}
        onClose={closeWorkbench}
        entry={workbenchEntry}
        heads={workbenchHeads}
        excerpts={workbenchExcerpts}
        extracts={workbenchExtracts}
        tab={workbenchTab}
        setTab={setWorkbenchTab}
        importWorkId={importWorkId}
        refWorkPathSeg={refWorkPathSeg}
        openReader={openReader}
        openPromptExtractFromEntry={openPromptExtractFromEntry}
        openPromptExtractFromExcerpt={openPromptExtractFromExcerpt}
        jumpExcerptToReader={jumpExcerptToReader}
        applyKeyCardToWenceRefs={(card) => HandoffActions.applyKeyCardToWenceRefs(card, handoffCtx)}
        jumpKeyCardToWritingHit={(card) => HandoffActions.jumpKeyCardToWritingHit(card, handoffCtx)}
        applyKeyCardToAiDraft={(card) => HandoffActions.applyKeyCardToAiDraft(card, handoffCtx)}
        applyKeyCardToWork={applyKeyCardToWork}
      />

      {/* 扩展搜索弹窗（输入超过10字自动弹出） */}
      <Dialog open={searchDialogOpen} onOpenChange={setSearchDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>扩展搜索</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <textarea
              ref={searchDialogRef}
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  setSearchDialogOpen(false);
                  void runSearch();
                }
              }}
              placeholder="输入更长的搜索关键词…"
              rows={4}
              className="w-full resize-none rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              autoFocus
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {countNonPunctuation(searchQ)} 字 · Enter 搜索，Shift+Enter 换行
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => { setSearchQ(""); setSearchHits([]); setSearchDialogOpen(false); }}
                >
                  清空
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={searchLoading || !searchQ.trim()}
                  onClick={() => { setSearchDialogOpen(false); void runSearch(); }}
                >
                  {searchLoading ? "搜索中…" : "搜索"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 提炼提示词弹窗 */}
      {promptExtractDialogOpen && promptExtractSource && (
        promptExtractSource.kind === "excerpt" ? (
          <PromptExtractDialog
            open={promptExtractDialogOpen}
            onClose={() => { setPromptExtractDialogOpen(false); setPromptExtractSource(null); }}
            bookTitle={promptExtractSource.bookTitle ?? activeTitle}
            source="excerpt"
            excerptText={promptExtractSource.excerptText}
            excerptNote={promptExtractSource.excerptNote}
            excerptId={promptExtractSource.excerptId}
          />
        ) : (
          <PromptExtractDialog
            open={promptExtractDialogOpen}
            onClose={() => { setPromptExtractDialogOpen(false); setPromptExtractSource(null); }}
            bookTitle={promptExtractSource.bookTitle ?? activeTitle}
            source="book"
            chunkTexts={promptExtractChunksRef.current}
            chunkCount={promptExtractSource.chunkCount}
          />
        )
      )}

      <ReferenceAiChatDialog
        open={aiChatDialogOpen}
        onClose={() => setAiChatDialogOpen(false)}
        bookTitle={activeTitle || undefined}
        bookChunks={aiChatBookChunks}
        refWorkId={activeRefId}
      />

      <AlertDialog
        open={confirmState.open}
        onOpenChange={(o) => {
          if (!o) onCancel();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmState.open ? confirmState.title : "确认操作"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmState.open ? confirmState.description : "请确认是否继续。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={confirmBusy}
              onClick={onCancel}
            >
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmBusy}
              className={
                confirmState.open && confirmState.destructive
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : undefined
              }
              onClick={(e) => {
                e.preventDefault();
                void handleConfirm();
              }}
            >
              {confirmState.open ? (confirmBusy ? "处理中…" : confirmState.actionText) : "确定"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {(importProgress || heavyJob) ? (
        <div
          className="fixed inset-0 z-[var(--z-blocking-layer)] flex items-center justify-center bg-black/25 backdrop-blur-sm"
          role="alertdialog"
          aria-busy="true"
          aria-live="polite"
        >
          <div className="w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-border/40 bg-background/90 p-6 shadow-xl">
            <div className="flex items-center gap-4">
              <div className="relative grid h-14 w-14 place-items-center">
                <Spinner className="size-14 text-primary" />
                <div className="absolute inset-0 grid place-items-center text-sm font-semibold tabular-nums text-foreground">
                  {Math.round(
                    heavyJob
                      ? heavyJob.percent
                      : Math.min(100, (importProgress!.current / Math.max(1, importProgress!.total)) * 100),
                  )}
                  %
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-base font-semibold text-foreground">
                  {heavyJob ? "正在处理" : `正在导入 ${importProgress!.current} / ${importProgress!.total}`}
                </div>
                <div className="mt-0.5 text-sm text-muted-foreground">
                  {heavyJob
                    ? (heavyJob.label ?? "…")
                    : (importProgress!.fileName ? importProgress!.fileName : "…")}
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-border/40 bg-card/40 px-4 py-3 text-sm text-muted-foreground">
              <div className="font-medium text-foreground">经书存于心，不留于云。</div>
              <div className="mt-1">（您的书籍仅存于本地，不上传服务器）</div>
            </div>

            <div className="mt-4 flex justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  importAbortRef.current?.abort();
                }}
              >
                取消导入
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <ImportConfigDialog
        pendingImportFiles={pendingImportFiles}
        onConfirm={confirmImport}
        onCancel={cancelImport}
      />
    </div>
  );
}
