import { useEffect, useMemo, useState } from "react";
import { Search, Sparkles } from "lucide-react";
import type { GlobalPromptTemplate } from "../../db/types";
import {
  loadArticleSummaryFeatured,
  loadArticleSummaryTemplatesMerged,
  sortByLatest,
  sortByPopularity,
} from "../../util/article-summary-prompt-templates";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";

export type ArticleSummaryPromptBrowseModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 当前已选（高亮） */
  selectedId?: string | null;
  onSelect: (template: GlobalPromptTemplate) => void;
};

type SortTab = "popular" | "featured" | "latest";

const TAB_LABEL: Record<SortTab, string> = {
  popular: "人气",
  featured: "精选",
  latest: "最新",
};

/**
 * 文章概要提示词浏览（批量概要「更多提示词」/ 快捷选项内「更多」）— 人气 / 精选 / 最新
 */
export function ArticleSummaryPromptBrowseModal(props: ArticleSummaryPromptBrowseModalProps) {
  const { open, onOpenChange, selectedId, onSelect } = props;
  const [tab, setTab] = useState<SortTab>("popular");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [merged, setMerged] = useState<GlobalPromptTemplate[]>([]);
  const [featuredOnly, setFeaturedOnly] = useState<GlobalPromptTemplate[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const [m, f] = await Promise.all([
          loadArticleSummaryTemplatesMerged(),
          loadArticleSummaryFeatured(),
        ]);
        if (!cancelled) {
          setMerged(m);
          setFeaturedOnly(f);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const baseList = useMemo(() => {
    if (tab === "featured") return featuredOnly;
    if (tab === "latest") return sortByLatest(merged);
    return sortByPopularity(merged);
  }, [tab, merged, featuredOnly]);

  const displayed = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return baseList;
    return baseList.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.body.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q)),
    );
  }, [baseList, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        overlayClassName="z-[230]"
        className={cn(
          "z-[231] flex max-h-[min(88dvh,720px)] w-full max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-lg",
          "border-zinc-700/80 bg-zinc-950 text-zinc-100 shadow-2xl dark:border-border",
        )}
      >
        <DialogHeader className="shrink-0 border-b border-zinc-800 px-4 py-3 text-left">
          <DialogTitle className="text-base font-semibold tracking-tight">批量概要</DialogTitle>
          <p className="text-xs font-normal text-zinc-400">
            文章概括类提示词 · 人气 / 精选 / 最新；选一条作为 system 指令
          </p>
        </DialogHeader>

        {/* 分类 Tab */}
        <div className="flex shrink-0 gap-0 border-b border-zinc-800 px-2">
          {(Object.keys(TAB_LABEL) as SortTab[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={cn(
                "relative flex-1 py-2.5 text-center text-sm font-medium transition-colors",
                tab === k ? "text-emerald-400" : "text-zinc-500 hover:text-zinc-300",
              )}
            >
              {TAB_LABEL[k]}
              {tab === k && (
                <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-emerald-500" />
              )}
            </button>
          ))}
        </div>

        {/* 搜索 */}
        <div className="shrink-0 border-b border-zinc-800 px-3 py-2">
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
              <Input
                className="h-9 border-zinc-700 bg-zinc-900 pl-8 text-sm text-zinc-100 placeholder:text-zinc-600"
                placeholder="搜索提示词…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <Button
              type="button"
              size="sm"
              className="h-9 shrink-0 bg-emerald-600 px-3 text-xs text-white hover:bg-emerald-700"
              onClick={() => {}}
            >
              搜索
            </Button>
          </div>
        </div>

        {/* 列表 */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-sm text-zinc-500">加载中…</div>
          ) : displayed.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-zinc-500">
              <Sparkles className="h-10 w-10 opacity-30" />
              <p>暂无文章概括类提示词</p>
              <p className="max-w-[240px] text-xs text-zinc-600">
                请到提示词库新建，类型选「文章概括」，保存后即可在此出现。
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {displayed.map((t) => {
                const sel = t.id === selectedId;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(t);
                        onOpenChange(false);
                      }}
                      className={cn(
                        "w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
                        sel
                          ? "border-emerald-500/50 bg-emerald-950/40"
                          : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-600 hover:bg-zinc-900",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="line-clamp-2 text-sm font-medium text-zinc-100">{t.title}</span>
                        {sel && (
                          <span className="shrink-0 rounded bg-emerald-600/30 px-1.5 py-0.5 text-[10px] text-emerald-300">
                            当前
                          </span>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-zinc-500">
                        {t.body}
                      </p>
                      <p className="mt-1 text-[10px] text-zinc-600">
                        更新 {new Date(t.updatedAt).toLocaleDateString("zh-CN")}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
