import React from "react";
import {
  Book,
  Upload,
  Star,
  Eye,
  Reply,
  Edit3,
  Wand2,
  Bookmark,
  Tag,
  Trash2,
  MoreVertical,
} from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Progress } from "../../../components/ui/progress";
import { Badge } from "../../../components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import { cn } from "../../../lib/utils";
import type { ReferenceLibraryEntry, ReferenceChapterHead } from "../../../db/types";

interface ReferenceLibraryListProps {
  items: ReferenceLibraryEntry[];
  filteredItems: ReferenceLibraryEntry[];
  viewMode: "grid" | "list";
  favoriteIds: Set<string>;
  exportSelection: Set<string>;
  extractCountById: Record<string, number>;
  refChapterHeadsById: Record<string, ReferenceChapterHead[]>;
  filterEmptyHint: string;
  openPicker: () => void;
  setCategoryFilter: (v: string) => void;
  setFavoriteScope: (v: any) => void;
  refCoverHue: (id: string) => number;
  loadReaderPos: (id: string) => number | null;
  toggleReferenceFavorite: (id: string, e?: React.MouseEvent) => void;
  setExportSelection: React.Dispatch<React.SetStateAction<Set<string>>>;
  openReader: (entry: ReferenceLibraryEntry, ordinal: number, highlight: any) => Promise<void>;
  openWorkbench: (id: string) => void;
  setExtractPanelOpen: (open: boolean) => void;
  openPromptExtractFromEntry: (entry: ReferenceLibraryEntry) => void;
  prompt: (message: string, defaultValue?: string) => Promise<string | null>;
  updateReferenceLibraryEntry: (id: string, data: Partial<ReferenceLibraryEntry>) => Promise<void>;
  refreshLibrary: () => Promise<any>;
  handleDelete: (id: string, title: string) => void;
  listReferenceChapterHeads: (id: string) => Promise<ReferenceChapterHead[]>;
  setRefChapterHeadsById: React.Dispatch<React.SetStateAction<Record<string, ReferenceChapterHead[]>>>;
}

export function ReferenceLibraryList({
  items,
  filteredItems,
  viewMode,
  favoriteIds,
  exportSelection,
  extractCountById,
  refChapterHeadsById,
  filterEmptyHint,
  openPicker,
  setCategoryFilter,
  setFavoriteScope,
  refCoverHue,
  loadReaderPos,
  toggleReferenceFavorite,
  setExportSelection,
  openReader,
  openWorkbench,
  setExtractPanelOpen,
  openPromptExtractFromEntry,
  prompt,
  updateReferenceLibraryEntry,
  refreshLibrary,
  handleDelete,
  listReferenceChapterHeads,
  setRefChapterHeadsById,
}: ReferenceLibraryListProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-black/10 dark:border-border/60 bg-white/50 dark:bg-transparent py-16 shadow-sm">
        <Book className="h-12 w-12 text-muted-foreground/40" />
        <p className="mt-4 text-muted-foreground">暂无参考书目</p>
        <p className="mt-1 text-sm text-muted-foreground/60">导入 .txt、.pdf 或 .docx 文件开始搭建参考书库</p>
        <Button type="button" className="mt-4 gap-2" onClick={openPicker}>
          <Upload className="h-4 w-4" />
          导入书籍
        </Button>
      </div>
    );
  }

  if (filteredItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 py-12">
        <Book className="h-10 w-10 text-muted-foreground/40" />
        <p className="mt-3 text-muted-foreground">{filterEmptyHint}</p>
        <Button
          variant="link"
          className="mt-2"
          onClick={() => {
            setCategoryFilter("");
            setFavoriteScope("all");
          }}
        >
          清除筛选条件
        </Button>
      </div>
    );
  }

  if (viewMode === "grid") {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {filteredItems.map((r) => {
          const hue = refCoverHue(r.id);
          const chCount = r.chapterHeadCount ?? 0;
          const isFav = favoriteIds.has(r.id);
          const isSelected = exportSelection.has(r.id);
          const readPos = loadReaderPos(r.id);
          const readPct =
            r.chunkCount > 1 && readPos !== null
              ? Math.round((readPos / (r.chunkCount - 1)) * 100)
              : readPos !== null
                ? 100
                : 0;

          return (
            <div
              key={r.id}
              className="group relative flex flex-col overflow-hidden rounded-xl border border-black/5 dark:border-border/40 bg-white dark:bg-card/50 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-black/10 dark:hover:border-primary/30 hover:shadow-md hover:shadow-black/5 dark:hover:shadow-primary/5"
            >
              {/* 书籍封面 */}
              <div
                className="relative aspect-[3/4] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)]"
                style={{
                  background: `linear-gradient(135deg, hsl(${hue} 40% 42%), hsl(${(hue + 42) % 360} 36% 26%))`,
                }}
              >
                <div className="absolute inset-0 flex items-center justify-center px-4 text-center">
                  <div>
                    <div className="text-base font-semibold leading-tight text-white/90">{r.title}</div>
                    {r.sourceName && (
                      <div className="mt-1 max-w-[8rem] truncate text-[10px] text-white/50">{r.sourceName}</div>
                    )}
                  </div>
                </div>

                {/* 导出选中角标 */}
                <label
                  className="absolute left-2 top-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-black/30 backdrop-blur-sm transition-opacity"
                  title="选中以批量导出"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    className="sr-only"
                    onChange={(e) => {
                      e.stopPropagation();
                      setExportSelection((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(r.id);
                        else next.delete(r.id);
                        return next;
                      });
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span className={cn("text-[10px] font-bold", isSelected ? "text-primary" : "text-white/50")}>
                    {isSelected ? "✓" : "○"}
                  </span>
                </label>

                {/* 收藏星 */}
                <button
                  type="button"
                  className="absolute right-2 top-2 transition-colors"
                  title={isFav ? "取消收藏" : "加入收藏（仅本机）"}
                  onClick={(e) => toggleReferenceFavorite(r.id, e)}
                >
                  <Star
                    className={cn(
                      "h-4 w-4",
                      isFav ? "fill-amber-400 text-amber-400" : "text-white/40 hover:text-amber-300",
                    )}
                  />
                </button>

                {/* 阅读进度条 */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3 pt-8">
                  <div className="flex items-center justify-between text-[10px] text-white/70">
                    <span>阅读进度</span>
                    <span>{readPct}%</span>
                  </div>
                  <Progress value={readPct} className="mt-1 h-1 bg-white/20" />
                </div>

                {/* 悬浮操作层 */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 backdrop-blur-sm transition-opacity p-4 group-hover:opacity-100">
                  <div className="grid w-full grid-cols-2 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="w-full gap-1.5 text-xs"
                      onClick={() => void openReader(r, 0, null)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      阅读
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="w-full gap-1.5 text-xs"
                      onClick={() => openWorkbench(r.id)}
                    >
                      <Reply className="h-3.5 w-3.5" />
                      工作台
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="w-full gap-1.5 text-xs"
                      onClick={async () => {
                        await openReader(r, 0, null);
                        setExtractPanelOpen(true);
                      }}
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      提炼
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="w-full gap-1.5 text-xs"
                      onClick={() => void openPromptExtractFromEntry(r)}
                    >
                      <Wand2 className="h-3.5 w-3.5" />
                      提示词
                    </Button>
                  </div>
                </div>
              </div>

              {/* 书目信息 */}
              <div className="flex flex-col gap-1.5 p-3">
                {(r.category ?? "").trim() && (
                  <Badge variant="secondary" className="w-fit h-5 bg-primary/10 px-1.5 text-[10px] font-normal text-primary">
                    {(r.category ?? "").trim()}
                  </Badge>
                )}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{chCount > 0 ? `${chCount} 章` : `${r.chunkCount} 段`}</span>
                  {r.totalChars > 0 && <span>{Math.round(r.totalChars / 10000)} 万字</span>}
                </div>
                {(extractCountById[r.id] ?? 0) > 0 && (
                  <div className="flex items-center gap-1 text-xs text-purple-400">
                    <Bookmark className="h-3 w-3" />
                    <span>已提炼 {extractCountById[r.id]} 条</span>
                  </div>
                )}
                {/* 分类编辑 & 删除（悬浮显示） */}
                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5 text-[10px]"
                    onClick={async (e) => {
                      e.stopPropagation();
                      const c = await prompt("分类（可空）", (r.category ?? "").trim());
                      if (c !== null) {
                        await updateReferenceLibraryEntry(r.id, { category: c.trim() || undefined });
                        await refreshLibrary();
                      }
                    }}
                  >
                    <Tag className="mr-0.5 h-3 w-3" />
                    分类
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5 text-[10px] text-destructive hover:text-destructive"
                    onClick={() => void handleDelete(r.id, r.title)}
                  >
                    <Trash2 className="mr-0.5 h-3 w-3" />
                    删除
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  /* 列表视图 */
  return (
    <div className="space-y-2">
      {filteredItems.map((r) => {
        const hue = refCoverHue(r.id);
        const chCount = r.chapterHeadCount ?? 0;
        const isFav = favoriteIds.has(r.id);
        const isSelected = exportSelection.has(r.id);
        const readPos = loadReaderPos(r.id);
        const readPct =
          r.chunkCount > 1 && readPos !== null
            ? Math.round((readPos / (r.chunkCount - 1)) * 100)
            : readPos !== null
              ? 100
              : 0;

        return (
          <div
            key={r.id}
            className="group flex items-center gap-4 rounded-xl border border-black/5 dark:border-border/40 bg-white dark:bg-card/30 p-4 transition-all duration-300 shadow-sm hover:-translate-y-1 hover:border-black/10 dark:hover:border-primary/30 hover:shadow-md hover:shadow-black/5 dark:hover:shadow-primary/5"
          >
            {/* 缩略封面 */}
            <div
              className="relative flex h-20 w-14 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)]"
              style={{
                background: `linear-gradient(135deg, hsl(${hue} 40% 42%), hsl(${(hue + 42) % 360} 36% 26%))`,
              }}
              onClick={() => void openReader(r, 0, null)}
            >
              <span className="px-1 text-center text-sm font-medium leading-tight text-white/80">
                {r.title.slice(0, 4)}
              </span>
              {isFav && <Star className="absolute right-1 top-1 h-3 w-3 fill-amber-400 text-amber-400" />}
            </div>

            {/* 书目内容 */}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="truncate font-medium text-foreground transition-colors hover:text-primary"
                  onClick={() => void openReader(r, 0, null)}
                >
                  {r.title}
                </button>
                {(r.category ?? "").trim() && (
                  <Badge variant="secondary" className="h-5 shrink-0 bg-primary/10 px-1.5 text-[10px] font-normal text-primary">
                    {(r.category ?? "").trim()}
                  </Badge>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                {r.sourceName && <span className="max-w-[14rem] truncate">{r.sourceName}</span>}
                <span>{chCount > 0 ? `${chCount} 章` : `${r.chunkCount} 段`}</span>
                {r.totalChars > 0 && <span>{r.totalChars.toLocaleString()} 字</span>}
              </div>
              {r.chunkCount > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">进度</span>
                  <Progress value={readPct} className="h-1.5 w-20" />
                  <span className="text-xs text-muted-foreground">{readPct}%</span>
                </div>
              )}
              {(extractCountById[r.id] ?? 0) > 0 && (
                <div className="mt-1.5 flex items-center gap-1 text-xs text-purple-400">
                  <Bookmark className="h-3 w-3" />
                  <span>已提炼 {extractCountById[r.id]} 条</span>
                </div>
              )}
              {/* 章节列表折叠 */}
              {chCount > 0 && (
                <details
                  className="mt-1"
                  onToggle={(e) => {
                    const el = e.currentTarget;
                    if (!el.open || refChapterHeadsById[r.id]) return;
                    void listReferenceChapterHeads(r.id).then((list) =>
                      setRefChapterHeadsById((prev) => ({ ...prev, [r.id]: list })),
                    );
                  }}
                >
                  <summary className="cursor-pointer text-xs text-muted-foreground transition-colors hover:text-foreground">
                    章节列表（{chCount}）
                  </summary>
                  <ul className="ml-3 mt-1 space-y-0.5">
                    {(refChapterHeadsById[r.id] ?? []).map((h, idx) => (
                      <li key={h.id}>
                        <button
                          type="button"
                          className="text-left text-xs text-muted-foreground transition-colors hover:text-primary"
                          onClick={() => void openReader(r, h.ordinal, null)}
                        >
                          {idx + 1}. {h.title}
                          <span className="ml-1 text-muted-foreground/50">· 段 {h.ordinal + 1}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>

            {/* 操作区（悬浮显示） */}
            <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <label
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-accent"
                title="选中以批量导出"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  className="sr-only"
                  onChange={(e) => {
                    e.stopPropagation();
                    setExportSelection((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(r.id);
                      else next.delete(r.id);
                      return next;
                    });
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
                <span className={cn("text-sm font-bold", isSelected ? "text-primary" : "text-muted-foreground")}>
                  {isSelected ? "✓" : "○"}
                </span>
              </label>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                title={isFav ? "取消收藏" : "加入收藏"}
                onClick={(e) => toggleReferenceFavorite(r.id, e)}
              >
                <Star className={cn("h-4 w-4", isFav && "fill-amber-400 text-amber-400")} />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                title="阅读"
                onClick={() => void openReader(r, 0, null)}
              >
                <Eye className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                title="提炼要点"
                onClick={async () => {
                  await openReader(r, 0, null);
                  setExtractPanelOpen(true);
                }}
              >
                <Edit3 className="h-4 w-4" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => void openPromptExtractFromEntry(r)}>
                    <Wand2 className="mr-2 h-4 w-4 text-primary" />
                    <span className="text-primary">提炼提示词</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={async (e) => {
                      e.stopPropagation();
                      const c = await prompt("分类（可空）", (r.category ?? "").trim());
                      if (c !== null) {
                        await updateReferenceLibraryEntry(r.id, { category: c.trim() || undefined });
                        await refreshLibrary();
                      }
                    }}
                  >
                    <Tag className="mr-2 h-4 w-4" />
                    编辑分类
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => void handleDelete(r.id, r.title)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    删除
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        );
      })}
    </div>
  );
}
