import { useEffect, useMemo, useState } from "react";
import { Search, Sparkles } from "lucide-react";
import {
  listApprovedPromptTemplates,
} from "../../db/repo";
import type { GlobalPromptTemplate } from "../../db/types";
import { PROMPT_SCOPE_SLOTS } from "../../db/types";
import { loadGlobalPromptTemplatesMergedByTypes, sortByLatest, sortByPopularity } from "../../util/article-summary-prompt-templates";
import { cn } from "../../lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";

const WRITER_SLOTS = PROMPT_SCOPE_SLOTS.writer;

type SortTab = "popular" | "featured" | "latest";

const TAB_LABEL: Record<SortTab, string> = {
  popular: "人气",
  featured: "精选",
  latest: "最新",
};

export type CharacterPromptBrowseModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedId?: string | null;
  onSelect: (template: GlobalPromptTemplate) => void;
};

/**
 * 人设类提示词浏览（与批量概要浏览同构，数据改为人设 + 写作槽位）
 */
export function CharacterPromptBrowseModal(props: CharacterPromptBrowseModalProps) {
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
        const [m, approved] = await Promise.all([
          loadGlobalPromptTemplatesMergedByTypes(["character"], WRITER_SLOTS),
          listApprovedPromptTemplates(),
        ]);
        if (cancelled) return;
        setMerged(m);
        setFeaturedOnly(approved.filter((t) => t.type === "character" && t.status !== "rejected"));
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
        overlayClassName="z-[232]"
        className={cn(
          "z-[233] flex max-h-[min(88dvh,720px)] w-full max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-lg",
          "border-border bg-[var(--surface)] text-foreground shadow-2xl",
        )}
      >
        <DialogHeader className="shrink-0 border-b border-border px-4 py-3 text-left">
          <DialogTitle className="text-base font-semibold tracking-tight">浏览人设类提示词</DialogTitle>
          <p className="text-xs font-normal text-muted-foreground">
            提示词库 · 类型「人设」、适用于写作侧栏；选一条作为本次生成的 system 指令
          </p>
        </DialogHeader>

        <div className="flex shrink-0 gap-0 border-b border-border px-2">
          {(Object.keys(TAB_LABEL) as SortTab[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={cn(
                "relative flex-1 py-2.5 text-center text-sm font-medium transition-colors",
                tab === k ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {TAB_LABEL[k]}
              {tab === k && (
                <span className="bg-primary/80 absolute bottom-0 left-3 right-3 h-0.5 rounded-full" />
              )}
            </button>
          ))}
        </div>

        <div className="shrink-0 border-b border-border px-3 py-2">
          <div className="relative min-w-0">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
            <Input
              className="h-9 pl-8 text-sm"
              placeholder="搜索提示词…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {loading ? (
            <div className="text-muted-foreground flex h-40 items-center justify-center text-sm">加载中…</div>
          ) : displayed.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
              <Sparkles className="h-10 w-10 opacity-30" />
              <p>暂无人设类提示词</p>
              <p className="text-muted-foreground max-w-[240px] text-xs">
                请到「提示词库」新建，类型选「人设」，并勾选写作适用范围。
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
                        "hover:border-primary/30 w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
                        sel ? "border-primary/50 bg-primary/5" : "border-border bg-card/40 hover:bg-muted/30",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="line-clamp-2 text-sm font-medium">{t.title}</span>
                        {sel && (
                          <span className="bg-primary/15 text-primary shrink-0 rounded px-1.5 py-0.5 text-[10px]">当前</span>
                        )}
                      </div>
                      <p className="text-muted-foreground mt-1 line-clamp-2 text-[11px] leading-relaxed">{t.body}</p>
                      <p className="text-muted-foreground mt-1 text-[10px]">
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
