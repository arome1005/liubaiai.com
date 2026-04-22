import { useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Flame,
  MessageSquare,
  Star,
  Trash2,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import type { GlobalPromptTemplate, PromptType } from "../../db/types";
import { PROMPT_TYPE_LABELS } from "../../db/types";

const TYPE_COLOR: Record<PromptType, string> = {
  continue:       "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  outline:        "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  volume:         "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  scene:          "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  style:          "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
  opening:        "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  character:      "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  worldbuilding:  "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  article_summary: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
};

function formatDate(ts: number): string {
  try {
    return new Date(ts).toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return "—";
  }
}

export type PersonalPromptCardProps = {
  item: GlobalPromptTemplate;
  /** 展示用作者名（当前登录用户） */
  authorLabel: string;
  /** 本地统计的使用次数 */
  heat: number;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onAssemble: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
};

/**
 * 个人中心专用卡片：用户名、热度、最近更新、关联标签（参考星月式信息密度）
 */
export function PersonalPromptCard(props: PersonalPromptCardProps) {
  const {
    item,
    authorLabel,
    heat,
    isFavorite,
    onToggleFavorite,
    onEdit,
    onDelete,
    onAssemble,
    onMoveUp,
    onMoveDown,
    isFirst,
    isLast,
  } = props;

  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const initial = authorLabel.slice(0, 1).toUpperCase() || "?";
  const preview =
    item.body.length > 120 && !expanded ? item.body.slice(0, 120) + "…" : item.body;

  const handleCopy = () => {
    void navigator.clipboard.writeText(item.body).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  const isRejected = item.status === "rejected";

  return (
    <div
      className={cn(
        "group flex flex-col gap-2.5 rounded-xl border p-4 shadow-sm transition-shadow",
        "border-border/60 bg-gradient-to-b from-card to-card/80 hover:border-primary/25 hover:shadow-md",
        "dark:border-zinc-800 dark:from-zinc-900/90 dark:to-zinc-950/90",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "inline-flex max-w-[85%] items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
            TYPE_COLOR[item.type],
          )}
        >
          {PROMPT_TYPE_LABELS[item.type]}
        </span>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            title={isFavorite ? "取消收藏" : "收藏"}
            onClick={onToggleFavorite}
            className={cn(
              "rounded p-1 transition-colors hover:bg-muted",
              isFavorite ? "text-amber-500" : "text-muted-foreground",
            )}
          >
            <Star className="h-4 w-4" fill={isFavorite ? "currentColor" : "none"} />
          </button>
          {onMoveUp && !isFirst && (
            <button
              type="button"
              title="上移"
              onClick={onMoveUp}
              className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
          )}
          {onMoveDown && !isLast && (
            <button
              type="button"
              title="下移"
              onClick={onMoveDown}
              className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <h3 className="text-sm font-semibold leading-snug text-foreground">{item.title}</h3>

      <div className="flex items-center gap-2.5">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary"
          aria-hidden
        >
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-foreground">{authorLabel}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-0.5 text-orange-600/90 dark:text-orange-400">
              <Flame className="h-3 w-3" />
              热度 {heat > 0 ? heat : "—"}
            </span>
            <span className="text-muted-foreground/80">·</span>
            <span>更新 {formatDate(item.updatedAt)}</span>
          </p>
        </div>
      </div>

      {isRejected && item.reviewNote && (
        <div className="flex items-start gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{item.reviewNote}</span>
        </div>
      )}

      <p className="line-clamp-none whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">
        {preview}
      </p>
      {item.body.length > 120 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="self-start text-[11px] text-primary hover:underline"
        >
          {expanded ? "收起" : "展开全部"}
        </button>
      )}

      <div>
        <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
          关联标签（{item.tags.length}）
        </p>
        {item.tags.length === 0 ? (
          <p className="text-[11px] text-muted-foreground/70">暂无标签</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {item.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:text-emerald-300"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-1.5 border-t border-border/40 pt-2 dark:border-zinc-800">
        <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={handleCopy}>
          {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "已复制" : "复制"}
        </Button>
        <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={onAssemble}>
          <MessageSquare className="h-3.5 w-3.5" />
          装配
        </Button>
        <div className="ml-auto flex items-center gap-1">
          {onEdit && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={onEdit}>
              编辑
            </Button>
          )}
          {onDelete && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
