/**
 * PromptPicker — 通用提示词选择器（Sprint 3/4）
 *
 * 用法：弹出一个 Dialog，列出可用的 GlobalPromptTemplate，
 * 支持按类型筛选，用户点击后回调 onPick(template)；点「清除」回调 onPick(null)。
 *
 * - 推演页：filterTypes = ["outline","volume","scene"]（默认）
 * - 写作页：filterTypes = ["continue","opening","style","character","worldbuilding","universal_entry"]
 * - 章节概要批量：filterTypes = PROMPT_PICKER_ARTICLE_SUMMARY_TYPES（文章概括）
 */

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  Layers,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import {
  listGlobalPromptTemplates,
  listApprovedPromptTemplates,
} from "../db/repo";
import {
  PROMPT_SCOPE_SLOTS,
  PROMPT_TYPE_LABELS,
  type GlobalPromptTemplate,
  type PromptSlot,
  type PromptType,
} from "../db/types";
import {
  matchesPromptListSearchWithBody,
  promptLibraryListPreview,
} from "../util/prompt-template-display";

// ── 槽位常量（供调用方 import，避免硬编码字符串） ────────────────────────────────
/** 写作侧栏可用槽位 */
export const PROMPT_PICKER_WRITER_SLOTS: PromptSlot[] = PROMPT_SCOPE_SLOTS["writer"]!;
/** 推演页可用槽位 */
export const PROMPT_PICKER_TUIYAN_SLOTS: PromptSlot[] = PROMPT_SCOPE_SLOTS["tuiyan"]!;
/** 落笔页可用槽位 */
export const PROMPT_PICKER_LUOBI_SLOTS: PromptSlot[] = PROMPT_SCOPE_SLOTS["luobi"]!;

// 各场景默认类型
const TUIYAN_TYPES: PromptType[] = ["outline", "volume", "scene"];
const WRITING_TYPES: PromptType[] = ["continue", "opening", "style", "character", "worldbuilding", "universal_entry"];
const ARTICLE_SUMMARY_TYPES: PromptType[] = ["article_summary"];

/** 默认 filterTypes（推演页用） */
export const PROMPT_PICKER_TUIYAN_TYPES = TUIYAN_TYPES;
/** 写作页 filterTypes */
export const PROMPT_PICKER_WRITING_TYPES = WRITING_TYPES;
/** 写作侧栏「文风」快捷选：仅写作风格类 */
export const PROMPT_PICKER_WRITING_STYLE_TYPES: PromptType[] = ["style"];
/** 写作侧栏「要求」快捷选：续写/开篇/人设/世界观（不含文风） */
export const PROMPT_PICKER_WRITING_REQUIREMENT_TYPES: PromptType[] = [
  "continue",
  "opening",
  "character",
  "worldbuilding",
  "universal_entry",
];
/** 章节概要 / 文章概括类提示词（提示词库「文章概括」分类） */
export const PROMPT_PICKER_ARTICLE_SUMMARY_TYPES = ARTICLE_SUMMARY_TYPES;

// 简化标签（覆盖 PROMPT_TYPE_LABELS 中文过长的情况）
const TYPE_LABEL: Partial<Record<PromptType, string>> = {
  outline:       "大纲",
  volume:        "卷纲",
  scene:         "细纲",
  continue:      "续写",
  opening:       "黄金开篇",
  style:         "写作风格",
  character:      "人设",
  worldbuilding:  "世界观",
  book_split:     "重塑",
  universal_entry: "万能词条",
  article_summary: "文章概括",
};

// ── 对外接口 ──────────────────────────────────────────────────────────────────

export interface PromptPickerProps {
  /** 当前已选模板 id（null / undefined = 未选） */
  selectedId?: string | null;
  /**
   * 已选提示词标题（用于未打开弹窗时展示；弹窗内列表未加载时 `selected` 可能为空）
   * 一般由父组件传入当前 `GlobalPromptTemplate.title`
   */
  selectedLabel?: string | null;
  /** 未选择时触发区占位文案 */
  emptyPlaceholder?: string;
  /**
   * 默认触发器外观：`button` 为原小按钮；`field` 为整行输入框式（长方形 + 占位/已选名）
   */
  triggerVariant?: "button" | "field";
  /** 选中回调；传 null 表示清除 */
  onPick: (template: GlobalPromptTemplate | null) => void;
  /** 触发器渲染函数 */
  trigger?: (opts: { open: () => void; selected: GlobalPromptTemplate | null }) => React.ReactNode;
  /**
   * 仅展示这些类型的模板（默认：推演页类型 outline/volume/scene）。
   * 写作页传 PROMPT_PICKER_WRITING_TYPES。
   */
  filterTypes?: PromptType[];
  /**
   * 按槽位收窄可选范围（可选）。
   * 规则：模板 slots 为空/未设置 → 通用，始终展示；
   *       模板 slots 非空 → 至少一个槽位与 filterSlots 有交集才展示。
   * 写作侧栏传 PROMPT_PICKER_WRITER_SLOTS；推演页传 PROMPT_PICKER_TUIYAN_SLOTS。
   * 不传则不做槽位过滤（向后兼容）。
   */
  filterSlots?: PromptSlot[];
}

// ── 主组件 ────────────────────────────────────────────────────────────────────

export function PromptPicker({
  selectedId,
  selectedLabel,
  emptyPlaceholder = "选择提示词",
  triggerVariant = "button",
  onPick,
  trigger,
  filterTypes = TUIYAN_TYPES,
  filterSlots,
}: PromptPickerProps) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<GlobalPromptTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState<PromptType | "all">("all");
  const [query, setQuery] = useState("");

  // 加载：合并我的 + 精选，去重，只保留推演相关类型
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const [mine, approved] = await Promise.all([
          listGlobalPromptTemplates(),
          listApprovedPromptTemplates(),
        ]);
        if (cancelled) return;
        // 合并去重（mine 优先）
        const seen = new Set<string>();
        const merged: GlobalPromptTemplate[] = [];
        for (const t of [...mine, ...approved]) {
          if (!seen.has(t.id)) {
            seen.add(t.id);
            merged.push(t);
          }
        }
        const usable = merged.filter((t) => t.status !== "rejected");
        const byType = usable.filter((t) => (filterTypes as string[]).includes(t.type));
        // 槽位过滤：无 slots 的模板视为通用，始终保留；有 slots 则需与 filterSlots 有交集
        const bySlot = filterSlots && filterSlots.length > 0
          ? byType.filter((t) =>
              !t.slots || t.slots.length === 0 ||
              t.slots.some((s) => (filterSlots as string[]).includes(s)),
            )
          : byType;
        setTemplates(bySlot);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, filterSlots]);

  const displayed = useMemo(() => {
    let list = templates;
    if (typeFilter !== "all") list = list.filter((t) => t.type === typeFilter);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((t) => matchesPromptListSearchWithBody(t, q));
    }
    return list;
  }, [templates, typeFilter, query]);

  const selected = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId],
  );
  const displayTitle = (selectedLabel?.trim() || selected?.title || "").trim() || null;

  const handlePick = (t: GlobalPromptTemplate | null) => {
    onPick(t);
    setOpen(false);
  };

  // 触发器（默认样式）
  const defaultTrigger =
    triggerVariant === "field" ? (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm shadow-sm transition-colors",
          "hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          displayTitle ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">
            {displayTitle ?? emptyPlaceholder}
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground/70" />
      </button>
    ) : (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(
          "h-7 gap-1.5 px-2.5 text-xs",
          displayTitle ? "border-primary/60 bg-primary/5 text-primary" : "text-muted-foreground",
        )}
        onClick={() => setOpen(true)}
      >
        <Sparkles className="h-3.5 w-3.5" />
        {displayTitle ? (
          <span className="max-w-[12rem] truncate">{displayTitle}</span>
        ) : (
          emptyPlaceholder
        )}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </Button>
    );

  return (
    <>
      {trigger ? trigger({ open: () => setOpen(true), selected }) : defaultTrigger}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80dvh] w-full max-w-lg overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>选择提示词模板</DialogTitle>
          </DialogHeader>

          {/* 搜索 + 类型筛选 */}
          <div className="flex flex-col gap-2 shrink-0">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-8 pl-8 pr-8 text-sm"
                placeholder="搜索标题、介绍或标签…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {(["all", ...filterTypes] as const).map((pt) => (
                <button
                  key={pt}
                  type="button"
                  onClick={() => setTypeFilter(pt)}
                  className={cn(
                    "shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                    typeFilter === pt
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:border-primary/40",
                  )}
                >
                  {pt === "all" ? "全部" : TYPE_LABEL[pt] ?? PROMPT_TYPE_LABELS[pt]}
                </button>
              ))}
            </div>
          </div>

          {/* 列表 */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {loading ? (
              <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                加载中…
              </div>
            ) : displayed.length === 0 ? (
              <div className="flex h-32 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                <Layers className="h-8 w-8 opacity-30" />
                <p>{templates.length === 0 ? "暂无可用提示词，可前往提示词库添加" : "没有符合条件的提示词"}</p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 py-1">
                {displayed.map((t) => {
                  const isSelected = t.id === selectedId;
                  const listPv = promptLibraryListPreview(t);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handlePick(isSelected ? null : t)}
                      className={cn(
                        "flex flex-col items-start gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors",
                        isSelected
                          ? "border-primary/60 bg-primary/5"
                          : "border-border/50 bg-card/60 hover:border-primary/30 hover:bg-muted/40",
                      )}
                    >
                      <div className="flex w-full items-center gap-2">
                        <span className={cn(
                          "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                          "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
                        )}>
                          {TYPE_LABEL[t.type] ?? PROMPT_TYPE_LABELS[t.type]}
                        </span>
                        <span className="flex-1 truncate text-xs font-medium text-foreground">
                          {t.title}
                        </span>
                        {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                      </div>
                      <p
                        className={cn(
                          "line-clamp-2 text-[11px] leading-relaxed",
                          listPv.isPlaceholder
                            ? "text-muted-foreground/80 italic"
                            : "text-muted-foreground",
                        )}
                      >
                        {listPv.text}
                      </p>
                      {t.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {t.tags.slice(0, 4).map((tag) => (
                            <span key={tag} className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 底栏：清除按钮 */}
          {selectedId && (
            <div className="shrink-0 border-t border-border/40 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => handlePick(null)}
              >
                <X className="mr-1 h-3.5 w-3.5" />
                清除当前选择
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}