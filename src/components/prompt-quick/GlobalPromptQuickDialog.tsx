import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ExternalLink, Pencil, Search, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import type { GlobalPromptTemplate, PromptSlot, PromptType } from "../../db/types";
import {
  filterCreatedInLastWeek,
  loadGlobalPromptTemplatesMergedByTypes,
  listMinePromptTemplatesByTypes,
} from "../../util/article-summary-prompt-templates";
import { loadPromptFavoriteIds } from "../../util/prompt-favorites";
import { bumpPromptHeat, getPromptHeat } from "../../util/prompt-usage-heat";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";

export type GlobalPromptQuickDialogLabels = {
  mineEmpty?: string;
  popularEmpty?: string;
};

export type GlobalPromptQuickDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 提示词类型（如文章概括 / 文风 / 要求等） */
  filterTypes: PromptType[];
  /** 与 PromptPicker 一致：写作侧栏传 writer 槽位等 */
  filterSlots?: PromptSlot[];
  selectedId?: string | null;
  /** 外部当前生效模板（用于「编辑」与高亮） */
  activeTemplate?: GlobalPromptTemplate | null;
  onSelect: (template: GlobalPromptTemplate | null) => void;
  onOpenBrowse: () => void;
  labels?: GlobalPromptQuickDialogLabels;
};

type QuickSourceTab = "favorites" | "mine" | "popular";

/**
 * 通用「快捷选项」：已收藏 / 我的 / 人气 + 最近 7 天新建（与文章概要批量选词同交互）
 */
export function GlobalPromptQuickDialog(props: GlobalPromptQuickDialogProps) {
  const {
    open,
    onOpenChange,
    filterTypes,
    filterSlots,
    selectedId,
    activeTemplate,
    onSelect,
    onOpenBrowse,
    labels,
  } = props;

  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<GlobalPromptTemplate[]>([]);
  const [mineList, setMineList] = useState<GlobalPromptTemplate[]>([]);
  const [sourceTab, setSourceTab] = useState<QuickSourceTab>("favorites");
  const [query, setQuery] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [favIds, setFavIds] = useState<Set<string>>(() => loadPromptFavoriteIds());
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filterKey = useMemo(
    () => JSON.stringify({ t: filterTypes, s: filterSlots ?? [] }),
    [filterTypes, filterSlots],
  );

  useEffect(() => {
    if (!open) {
      setQuery("");
      setInputValue("");
      return;
    }
    setFavIds(loadPromptFavoriteIds());
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const [merged, mineRows] = await Promise.all([
          loadGlobalPromptTemplatesMergedByTypes(filterTypes, filterSlots),
          listMinePromptTemplatesByTypes(filterTypes, filterSlots),
        ]);
        if (cancelled) return;
        setList(merged);
        setMineList(mineRows);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, filterKey]);

  const favorites = useMemo(
    () => list.filter((t) => favIds.has(t.id)),
    [list, favIds],
  );

  const popularList = useMemo(
    () =>
      [...list].sort((a, b) => {
        const hb = getPromptHeat(b.id);
        const ha = getPromptHeat(a.id);
        if (hb !== ha) return hb - ha;
        return b.updatedAt - a.updatedAt;
      }),
    [list],
  );

  const recentWeek = useMemo(() => filterCreatedInLastWeek(list), [list]);

  const sourceRows = useMemo(() => {
    switch (sourceTab) {
      case "favorites":
        return favorites;
      case "mine":
        return mineList;
      case "popular":
        return popularList;
      default:
        return favorites;
    }
  }, [favorites, mineList, popularList, sourceTab]);

  const filteredSource = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sourceRows;
    return sourceRows.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.body.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q)),
    );
  }, [sourceRows, query]);

  const pickTemplate = (next: GlobalPromptTemplate | null) => {
    if (next) bumpPromptHeat(next.id);
    onSelect(next);
  };

  const mineEmpty = labels?.mineEmpty ?? "暂无自建提示词。";
  const popularEmpty = labels?.popularEmpty ?? "暂无可用提示词。";

  const emptyLeftMessage = useMemo(() => {
    const q = query.trim();
    if (q && sourceRows.length > 0 && filteredSource.length === 0) return "无匹配结果";
    if (q && sourceRows.length === 0) return "无匹配结果";
    if (sourceTab === "favorites" && favorites.length === 0) {
      return "暂无收藏，提示词库中点星即可收藏。";
    }
    if (sourceTab === "mine" && mineList.length === 0) {
      return mineEmpty;
    }
    if (sourceTab === "popular" && list.length === 0) {
      return popularEmpty;
    }
    return "无匹配结果";
  }, [
    filteredSource.length,
    favorites.length,
    list.length,
    mineEmpty,
    mineList.length,
    popularEmpty,
    query,
    sourceRows.length,
    sourceTab,
  ]);

  const selectedInList = useMemo(
    () => list.find((t) => t.id === selectedId) ?? null,
    [list, selectedId],
  );
  const editTarget = activeTemplate ?? selectedInList;

  const handleMorePrompts = () => {
    onOpenChange(false);
    onOpenBrowse();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        overlayClassName="z-[228]"
        className={cn(
          "z-[229] flex max-h-[min(90dvh,780px)] w-full max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl",
          "border-zinc-200 bg-white text-zinc-900 shadow-2xl",
          "dark:border-zinc-700/80 dark:bg-zinc-950 dark:text-zinc-100",
        )}
      >
        <DialogHeader className="shrink-0 border-b border-zinc-200 px-5 py-4 text-left dark:border-zinc-800">
          <DialogTitle className="text-base font-semibold">快捷选项</DialogTitle>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 md:grid-cols-[1fr_220px]">
          <div className="flex min-h-0 flex-col border-b border-zinc-200 md:border-b-0 md:border-r md:border-zinc-200 dark:border-zinc-800 dark:md:border-zinc-800">
            <div className="shrink-0 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <div className="mb-2.5 flex flex-wrap gap-1.5">
                {(
                  [
                    ["favorites", "已收藏"],
                    ["mine", "我的"],
                    ["popular", "人气"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSourceTab(id)}
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                      sourceTab === id
                        ? "border-emerald-500/60 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
                        : "border-zinc-300 bg-zinc-100/80 text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-700/80 dark:bg-zinc-900/50 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-zinc-200",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  setQuery(inputValue);
                  searchInputRef.current?.blur();
                }}
              >
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
                  <Input
                    ref={searchInputRef}
                    className="h-9 border-zinc-300 bg-zinc-50 pl-8 text-xs text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-600"
                    placeholder="搜索提示词…"
                    value={inputValue}
                    onChange={(e) => {
                      setInputValue(e.target.value);
                      setQuery(e.target.value);
                    }}
                  />
                </div>
                <Button
                  type="submit"
                  size="sm"
                  className="h-9 shrink-0 bg-emerald-600 px-3 text-xs text-white hover:bg-emerald-700"
                >
                  搜索
                </Button>
              </form>
            </div>
            <div className="min-h-[240px] flex-1 overflow-y-auto px-3 py-3 md:max-h-[min(55dvh,460px)]">
              {loading ? (
                <p className="py-10 text-center text-sm text-zinc-400 dark:text-zinc-500">加载中…</p>
              ) : filteredSource.length === 0 ? (
                <p className="py-10 text-center text-sm text-zinc-400 dark:text-zinc-600">{emptyLeftMessage}</p>
              ) : (
                <ul className="space-y-1.5">
                  {filteredSource.map((t) => {
                    const sel = t.id === selectedId || t.id === activeTemplate?.id;
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => pickTemplate(sel ? null : t)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                            sel
                              ? "border-emerald-500/60 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100"
                              : "border-transparent bg-zinc-50 hover:border-zinc-300 hover:text-zinc-900 dark:bg-zinc-900/40 dark:hover:border-zinc-700 dark:hover:text-zinc-100",
                          )}
                        >
                          <span className={cn("min-w-0 flex-1 leading-snug", sel ? "font-medium text-emerald-700 dark:text-emerald-200" : "text-zinc-600 dark:text-zinc-300")}>
                            {t.title}
                          </span>
                          {sel && <Check className="h-4 w-4 shrink-0 text-emerald-500 dark:text-emerald-400" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          <aside className="flex min-h-0 flex-col bg-zinc-50/80 dark:bg-zinc-900/30">
            <p className="shrink-0 border-b border-zinc-200 px-3 py-2.5 text-xs leading-snug text-zinc-500 dark:border-zinc-800 dark:text-zinc-500">
              最新
              <span className="block text-[11px] text-zinc-400 dark:text-zinc-600">（最近 7 天创建）</span>
            </p>
            <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2.5">
              {recentWeek.length === 0 ? (
                <p className="py-8 text-center text-xs text-zinc-400 dark:text-zinc-600">暂无</p>
              ) : (
                <ul className="space-y-1.5">
                  {recentWeek.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => pickTemplate(t)}
                        className="w-full rounded-md border border-transparent px-2 py-2 text-left text-xs hover:border-zinc-300 hover:bg-zinc-100 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
                      >
                        <span className="line-clamp-2 text-zinc-600 dark:text-zinc-300">{t.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="shrink-0 border-t border-zinc-200 px-2 py-2 text-center text-[11px] text-zinc-400 dark:border-zinc-800 dark:text-zinc-600">
              {recentWeek.length === 0 ? "—" : "已显示全部"}
            </p>
          </aside>
        </div>

        <DialogFooter className="shrink-0 flex-row flex-wrap items-center justify-between gap-2 border-t border-zinc-200 px-4 py-4 sm:justify-between dark:border-zinc-800">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              asChild
            >
              <Link to="/prompts" target="_blank" rel="noreferrer">
                <ExternalLink className="mr-1 h-3.5 w-3.5" />
                创建
              </Link>
            </Button>
            {editTarget ? (
              <Button type="button" size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" asChild>
                <Link to="/prompts" target="_blank" rel="noreferrer">
                  <Pencil className="mr-1 h-3.5 w-3.5" />
                  编辑
                </Link>
              </Button>
            ) : (
              <Button type="button" size="sm" className="bg-emerald-600/40 text-white" disabled>
                <Pencil className="mr-1 h-3.5 w-3.5" />
                编辑
              </Button>
            )}
          </div>
          <Button
            type="button"
            size="sm"
            className="bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-800/90 dark:text-amber-50 dark:hover:bg-amber-700"
            onClick={handleMorePrompts}
          >
            <Sparkles className="mr-1 h-3.5 w-3.5" />
            更多提示词
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
