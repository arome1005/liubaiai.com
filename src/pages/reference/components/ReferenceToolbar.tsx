import React from "react";
import { Link } from "react-router-dom";
import { Input } from "../../../components/ui/input";
import { Button } from "../../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import { cn } from "../../../lib/utils";
import {
  Search,
  X,
  Filter,
  ChevronDown,
  SortAsc,
  Clock,
  BarChart3,
  TrendingUp,
  Star,
  Book,
  FileText,
  Bookmark,
  Sparkles,
  Download,
  Upload,
  Grid3X3,
  List,
  Reply,
} from "lucide-react";
import type { ReferenceLibraryEntry, ReferenceSearchHit } from "../../../db/types";

function countNonPunctuation(s: string): number {
  return s.replace(/[\s\p{P}\p{S}]/gu, "").length;
}

export interface ReferenceToolbarProps {
  searchQ: string;
  setSearchQ: (val: string) => void;
  runSearch: () => void;
  searchLoading: boolean;
  setSearchHits: (hits: ReferenceSearchHit[]) => void;
  setSearchDialogOpen: (open: boolean) => void;
  searchScopeRefId: string | null;
  setSearchScopeRefId: (id: string | null) => void;
  refSearchMode: "strict" | "hybrid";
  switchRefSearchMode: (mode: "strict" | "hybrid") => void;
  categoryFilter: string;
  setCategoryFilter: (cat: string) => void;
  categoryOptions: string[];
  sortBy: string;
  setSortBy: (sort: "recent" | "words" | "progress") => void;
  favoriteScope: "all" | "favorites";
  setFavoriteScope: (scope: "all" | "favorites") => void;
  libraryTotals: { count: number; chars: number };
  totalExtracts: number;
  favoriteIds: Set<string>;
  activeRefId: string | null;
  activeTitle: string | null;
  items: ReferenceLibraryEntry[];
  openAiChat: (id: string, title: string) => void;
  busy: boolean;
  exportSelection: Set<string>;
  runExportZip: () => void;
  openPicker: () => void;
  importProgress: { current: number; total: number } | null;
  fileRef: React.RefObject<HTMLInputElement | null>;
  handleFiles: (e: React.ChangeEvent<HTMLInputElement>) => void;
  viewMode: string;
  setViewMode: (mode: "grid" | "list") => void;
}

export function ReferenceToolbar({
  searchQ,
  setSearchQ,
  runSearch,
  searchLoading,
  setSearchHits,
  setSearchDialogOpen,
  searchScopeRefId,
  setSearchScopeRefId,
  refSearchMode,
  switchRefSearchMode,
  categoryFilter,
  setCategoryFilter,
  categoryOptions,
  sortBy,
  setSortBy,
  favoriteScope,
  setFavoriteScope,
  libraryTotals,
  totalExtracts,
  favoriteIds,
  activeRefId,
  activeTitle,
  items,
  openAiChat,
  busy,
  exportSelection,
  runExportZip,
  openPicker,
  importProgress,
  fileRef,
  handleFiles,
  viewMode,
  setViewMode,
}: ReferenceToolbarProps) {
  return (
    <header className="rounded-xl border border-black/5 dark:border-border/40 bg-white dark:bg-card/30 px-6 py-3 shadow-sm transition-all duration-300">
      <div className="flex flex-wrap items-center gap-3">
        {/* 全文搜索框 */}
        <div className="relative w-[160px] min-w-[120px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="reference-fulltext-search"
            type="search"
            placeholder="搜索全文…"
            value={searchQ}
            onChange={(e) => {
              const val = e.target.value;
              setSearchQ(val);
              if (countNonPunctuation(val) > 10) {
                setSearchDialogOpen(true);
              }
            }}
            onKeyDown={(e) => { if (e.key === "Enter") void runSearch(); }}
            className="pl-9 bg-background/50 border-border/50"
            autoComplete="off"
          />
          {searchQ && (
            <button
              type="button"
              onClick={() => { setSearchQ(""); setSearchHits([]); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <Button type="button" size="sm" disabled={searchLoading} onClick={() => void runSearch()}>
          {searchLoading ? "…" : "搜索"}
        </Button>
        <label className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground" title={!activeRefId ? "先打开一本书" : "仅在当前打开的书中搜索"}>
          <input
            type="checkbox"
            checked={searchScopeRefId !== null}
            onChange={(e) => {
              if (e.target.checked) {
                if (activeRefId) setSearchScopeRefId(activeRefId);
              } else setSearchScopeRefId(null);
            }}
            disabled={!activeRefId}
            className="h-3 w-3"
          />
          当前书
        </label>

        {/* 分类筛选 */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="h-4 w-4" />
              {categoryFilter || "全部分类"}
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuItem
              onClick={() => setCategoryFilter("")}
              className={cn(!categoryFilter && "bg-primary/10 text-primary")}
            >
              全部分类
            </DropdownMenuItem>
            {categoryOptions.length > 0 && <DropdownMenuSeparator />}
            {categoryOptions.map((c) => (
              <DropdownMenuItem
                key={c}
                onClick={() => setCategoryFilter(c)}
                className={cn(categoryFilter === c && "bg-primary/10 text-primary")}
              >
                {c}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 检索模式切换 */}
        <div className="flex items-center rounded-lg border border-border/50 p-0.5" role="group" aria-label="检索模式">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn("h-7 px-2.5 text-xs rounded-md", refSearchMode === "strict" && "bg-primary/20 text-primary")}
            aria-pressed={refSearchMode === "strict"}
            title="多词须同时出现，且整段查询需字面命中"
            onClick={() => void switchRefSearchMode("strict")}
          >
            精确
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn("h-7 px-2.5 text-xs rounded-md", refSearchMode === "hybrid" && "bg-primary/20 text-primary")}
            aria-pressed={refSearchMode === "hybrid"}
            title="多词任一命中即可参与排序；整句命中优先"
            onClick={() => void switchRefSearchMode("hybrid")}
          >
            扩展
          </Button>
        </div>

        {/* 排序 */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <SortAsc className="h-4 w-4" />
              {sortBy === "recent" ? "最近" : sortBy === "words" ? "字数" : "进度"}
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              onClick={() => setSortBy("recent")}
              className={cn(sortBy === "recent" && "bg-primary/10 text-primary")}
            >
              <Clock className="mr-2 h-4 w-4" />
              最近更新
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setSortBy("words")}
              className={cn(sortBy === "words" && "bg-primary/10 text-primary")}
            >
              <BarChart3 className="mr-2 h-4 w-4" />
              字数排序
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setSortBy("progress")}
              className={cn(sortBy === "progress" && "bg-primary/10 text-primary")}
            >
              <TrendingUp className="mr-2 h-4 w-4" />
              阅读进度
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 收藏筛选 */}
        <Button
          type="button"
          variant={favoriteScope === "favorites" ? "secondary" : "outline"}
          size="sm"
          className="gap-2"
          onClick={() => setFavoriteScope(favoriteScope === "favorites" ? "all" : "favorites")}
        >
          <Star className={cn("h-4 w-4", favoriteScope === "favorites" && "fill-current")} />
          收藏
        </Button>

        {/* 藏经统计概览 */}
        {libraryTotals.count > 0 && (
          <div className="group relative">
            <div className="flex h-8 w-8 cursor-default items-center justify-center rounded-lg border border-border/50 text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary">
              <Book className="h-4 w-4" />
            </div>
            <div className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border/60 bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg opacity-0 transition-opacity group-hover:opacity-100">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5"><Book className="h-3.5 w-3.5 text-primary" />{libraryTotals.count} 本</span>
                <span className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5 text-amber-500" />{Math.round(libraryTotals.chars / 10000)} 万字</span>
                <span className="flex items-center gap-1.5"><Bookmark className="h-3.5 w-3.5 text-purple-500" />{totalExtracts} 提炼</span>
                <span className="flex items-center gap-1.5"><Star className="h-3.5 w-3.5 text-amber-400" />{favoriteIds.size} 收藏</span>
              </div>
            </div>
          </div>
        )}

        {/* 导入与导出 */}
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => void openAiChat(activeRefId || "", activeTitle || "")}
            title={activeRefId ? "打开 AI 聊天提炼" : "打开 AI 聊天（可不选书）"}
          >
            <Sparkles className="h-4 w-4" />
            AI
          </Button>
          {items.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={busy || exportSelection.size === 0}
              onClick={() => void runExportZip()}
            >
              <Download className="h-4 w-4" />
              导出{exportSelection.size > 0 ? ` (${exportSelection.size})` : ""}
            </Button>
          )}
          <Button type="button" size="sm" className="gap-2" disabled={busy} onClick={openPicker}>
            <Upload className="h-4 w-4" />
            {busy
              ? importProgress
                ? `导入 ${importProgress.current}/${importProgress.total}…`
                : "导入中…"
              : "导入"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            multiple
            className="visually-hidden"
            onChange={(ev) => void handleFiles(ev)}
          />
        </div>

        {/* 视图切换 */}
        <div className="flex items-center gap-1 rounded-lg border border-border/50 p-1" role="group" aria-label="书目视图">
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            aria-pressed={viewMode === "grid"}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
              viewMode === "grid" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground",
            )}
            title="网格视图"
          >
            <Grid3X3 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode("list")}
            aria-pressed={viewMode === "list"}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
              viewMode === "list" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground",
            )}
            title="列表视图"
          >
            <List className="h-4 w-4" />
          </button>
        </div>

        <Link
          to="/library"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/50 text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
          title="返回作品库"
        >
          <Reply className="h-4 w-4" />
        </Link>
      </div>
    </header>
  );
}
