"use client";

import {
  BookOpen,
  FileText,
  Layers,
  PenLine,
  Scissors,
  ScrollText,
  Sparkles,
  Tag,
  Type,
  Users,
  Zap,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { PROMPT_TYPES, PROMPT_TYPE_LABELS, type PromptType } from "../../db/types";

const TYPE_ICONS: Record<PromptType, React.ReactNode> = {
  continue: <PenLine className="h-3.5 w-3.5" strokeWidth={1.6} />,
  outline: <Layers className="h-3.5 w-3.5" strokeWidth={1.6} />,
  volume: <BookOpen className="h-3.5 w-3.5" strokeWidth={1.6} />,
  scene: <FileText className="h-3.5 w-3.5" strokeWidth={1.6} />,
  style: <Type className="h-3.5 w-3.5" strokeWidth={1.6} />,
  opening: <Zap className="h-3.5 w-3.5" strokeWidth={1.6} />,
  character: <Users className="h-3.5 w-3.5" strokeWidth={1.6} />,
  worldbuilding: <Sparkles className="h-3.5 w-3.5" strokeWidth={1.6} />,
  book_split: <Scissors className="h-3.5 w-3.5" strokeWidth={1.6} />,
  universal_entry: <Tag className="h-3.5 w-3.5" strokeWidth={1.6} />,
  article_summary: <ScrollText className="h-3.5 w-3.5" strokeWidth={1.6} />,
};

export { TYPE_ICONS };

export const TYPE_COLOR_BADGE: Record<PromptType, string> = {
  continue: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  outline: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  volume: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  scene: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  style: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
  opening: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  character: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  worldbuilding: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  book_split: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200",
  universal_entry: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-200",
  article_summary: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
};

type Props = {
  value: PromptType;
  onChange: (t: PromptType) => void;
  disabled?: boolean;
};

export function PromptTypeGrid(props: Props) {
  const { value, onChange, disabled } = props;
  return (
    <div className="flex flex-wrap gap-2">
      {PROMPT_TYPES.map((pt) => (
        <button
          key={pt}
          type="button"
          disabled={disabled}
          onClick={() => onChange(pt)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
            value === pt
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-muted/50 text-muted-foreground hover:border-primary/40 hover:text-foreground",
            disabled && "pointer-events-none opacity-50",
          )}
        >
          {TYPE_ICONS[pt]}
          {PROMPT_TYPE_LABELS[pt]}
        </button>
      ))}
    </div>
  );
}
