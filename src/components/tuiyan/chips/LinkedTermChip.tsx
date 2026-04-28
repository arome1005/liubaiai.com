/**
 * 已入库词条 chip：trigger 是带名字的小药丸，点击弹出可编辑 popover。
 * popover 字段：类别（name/term/dead）、备注。
 * 编辑后通过 onUpdate(id, patch) 写回书斋。
 */
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { BibleGlossaryTerm } from "../../../db/types";
import { cn } from "../../../lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";
import {
  CATEGORY_LABELS,
  POPOVER_LABEL,
  POPOVER_TEXTAREA,
  SAVE_BTN,
} from "./shared";

export type LinkedTermChipProps = {
  name: string;
  term: BibleGlossaryTerm;
  onRemove: () => void;
  disabled: boolean;
  onUpdate: (
    id: string,
    patch: Partial<Pick<BibleGlossaryTerm, "note" | "category">>,
  ) => Promise<void>;
  fieldIcon: React.ElementType;
  fieldColor: string;
};

export function LinkedTermChip({
  name,
  term,
  onRemove,
  disabled,
  onUpdate,
  fieldIcon: FieldIcon,
  fieldColor,
}: LinkedTermChipProps) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(term.note ?? "");
  const [category, setCategory] = useState<BibleGlossaryTerm["category"]>(term.category);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNote(term.note ?? "");
    setCategory(term.category);
  }, [term.id, open]);

  const isDirty = note !== (term.note ?? "") || category !== term.category;

  const save = async () => {
    if (!isDirty || saving) return;
    setSaving(true);
    try {
      await onUpdate(term.id, { note, category });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex cursor-pointer items-center gap-1 rounded-full border border-border/45",
            "bg-background/65 px-2.5 py-1 text-xs shadow-sm backdrop-blur transition hover:-translate-y-[1px] hover:border-border/70 hover:bg-background/85 hover:shadow",
            fieldColor,
          )}
        >
          <FieldIcon className="h-3 w-3 shrink-0" />
          <span>{name}</span>
          {!disabled && (
            <span
              role="button"
              aria-label="移除"
              className="ml-0.5 rounded-full p-0.5 opacity-50 hover:bg-muted/60 hover:opacity-100"
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
            >
              <X className="h-2.5 w-2.5" />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 rounded-xl border-border/40 bg-popover/95 p-3 text-xs shadow-xl backdrop-blur" align="start">
        <div className="mb-3 flex items-center gap-1.5">
          <FieldIcon className={cn("h-3.5 w-3.5 shrink-0", fieldColor)} />
          <span className="font-medium text-foreground">{term.term}</span>
          <span className="ml-auto shrink-0 rounded-full border border-border/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {CATEGORY_LABELS[term.category]}
          </span>
        </div>
        <div className="mb-2">
          <p className={POPOVER_LABEL}>类别</p>
          <select
            className="w-full rounded-md border border-border/35 bg-background/70 px-2.5 py-1.5 text-xs shadow-inner outline-none transition focus:border-primary/45 focus:ring-2 focus:ring-primary/15 disabled:opacity-50"
            value={category}
            onChange={(e) => setCategory(e.target.value as BibleGlossaryTerm["category"])}
            disabled={disabled}
          >
            <option value="name">人名·地名</option>
            <option value="term">术语</option>
            <option value="dead">死亡角色</option>
          </select>
        </div>
        <div className="mb-3">
          <p className={POPOVER_LABEL}>备注</p>
          <textarea
            className={POPOVER_TEXTAREA}
            rows={3}
            placeholder="释义、设定约束、与剧情相关的注意事项…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={disabled}
          />
        </div>
        {!disabled && (
          <div className="flex items-center justify-end gap-2">
            {isDirty && (
              <span className="text-[10px] text-amber-400/80">有未保存更改</span>
            )}
            <button
              type="button"
              className={SAVE_BTN}
              onClick={save}
              disabled={!isDirty || saving}
            >
              {saving ? "保存中…" : isDirty ? "保存到书斋" : "已同步"}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
