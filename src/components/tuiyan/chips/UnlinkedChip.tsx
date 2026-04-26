/**
 * 未入库 chip：trigger 是带虚线边框的"待入库"小药丸；点击弹出创建表单 popover。
 * 根据 chipType 切换两套表单：
 *  - character：性别 + 角色性格 + 角色信息
 *  - glossaryTerm：类别 + 备注
 * 用户填写后点击"确认入库" → onAddToLibrary(extra)。
 */
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { BibleGlossaryTerm } from "../../../db/types";
import { cn } from "../../../lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";
import {
  CATEGORY_LABELS,
  GENDER_LABELS,
  POPOVER_LABEL,
  POPOVER_TEXTAREA,
  type CharGender,
} from "./shared";

export type UnlinkedChipExtra = {
  voiceNotes?: string;
  motivation?: string;
  gender?: CharGender;
  note?: string;
  category?: BibleGlossaryTerm["category"];
};

export type UnlinkedChipProps = {
  name: string;
  onRemove: () => void;
  disabled: boolean;
  onAddToLibrary: (extra: UnlinkedChipExtra) => Promise<void>;
  chipType: "character" | "glossaryTerm";
  fieldIcon: React.ElementType;
  fieldColor: string;
  defaultCategory?: BibleGlossaryTerm["category"];
};

export function UnlinkedChip({
  name,
  onRemove,
  disabled,
  onAddToLibrary,
  chipType,
  fieldIcon: FieldIcon,
  fieldColor,
  defaultCategory,
}: UnlinkedChipProps) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  // 人物字段
  const [voiceNotes, setVoiceNotes] = useState("");
  const [motivation, setMotivation] = useState("");
  const [gender, setGender] = useState<CharGender>("unknown");
  // 词条字段
  const [note, setNote] = useState("");
  const [category, setCategory] = useState<BibleGlossaryTerm["category"]>(
    defaultCategory ?? "term",
  );

  useEffect(() => {
    if (!open) {
      setVoiceNotes("");
      setMotivation("");
      setGender("unknown");
      setNote("");
      setCategory(defaultCategory ?? "term");
    }
  }, [open, defaultCategory]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      if (chipType === "character") {
        await onAddToLibrary({ voiceNotes, motivation, gender });
      } else {
        await onAddToLibrary({ note, category });
      }
      setOpen(false);
    } finally {
      setCreating(false);
    }
  };

  const typeLabel = chipType === "character" ? "人物" : CATEGORY_LABELS[category];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span
          className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-dashed border-border/40 bg-background/20 px-2 py-0.5 text-xs text-muted-foreground/70 hover:border-border/60 hover:text-muted-foreground/90"
          role="button"
        >
          <FieldIcon className={cn("h-3 w-3 shrink-0", fieldColor)} />
          <span>{name}</span>
          <span className="ml-0.5 rounded-full border border-border/30 px-1 py-0 text-[10px] opacity-60">
            入库
          </span>
          {!disabled && (
            <span
              role="button"
              aria-label="移除"
              className="ml-0.5 rounded-full p-0.5 opacity-40 hover:opacity-80"
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
            >
              <X className="h-2.5 w-2.5" />
            </span>
          )}
        </span>
      </PopoverTrigger>
      <PopoverContent
        className={cn("p-3 text-xs", chipType === "character" ? "w-72" : "w-64")}
        align="start"
      >
        <div className="mb-3 flex items-center gap-1.5">
          <FieldIcon className={cn("h-3.5 w-3.5 shrink-0", fieldColor)} />
          <span className="font-medium text-foreground">{name}</span>
          <span className="ml-auto shrink-0 rounded-full border border-dashed border-border/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {typeLabel} · 未入库
          </span>
        </div>

        {chipType === "character" ? (
          <>
            <div className="mb-2">
              <p className={POPOVER_LABEL}>性别</p>
              <div className="flex gap-1">
                {(["male", "female", "unknown", "none"] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    className={cn(
                      "rounded px-2 py-0.5 text-[10px] border transition-colors",
                      gender === g
                        ? "border-primary/50 bg-primary/15 text-primary"
                        : "border-border/30 bg-background/30 text-muted-foreground/70 hover:border-border/50",
                    )}
                    onClick={() => setGender(g)}
                  >
                    {GENDER_LABELS[g]}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-2">
              <p className={POPOVER_LABEL}>角色性格（可选）</p>
              <textarea
                className={POPOVER_TEXTAREA}
                rows={2}
                maxLength={300}
                placeholder="性格特点、口吻风格…"
                value={voiceNotes}
                onChange={(e) => setVoiceNotes(e.target.value)}
              />
            </div>
            <div className="mb-3">
              <p className={POPOVER_LABEL}>角色信息（可选）</p>
              <textarea
                className={POPOVER_TEXTAREA}
                rows={3}
                maxLength={1000}
                placeholder="背景、动机等剧情用得到的信息…"
                value={motivation}
                onChange={(e) => setMotivation(e.target.value)}
              />
            </div>
          </>
        ) : (
          <>
            <div className="mb-2">
              <p className={POPOVER_LABEL}>类别</p>
              <select
                className="w-full rounded border border-border/30 bg-background/40 px-2 py-1 text-xs outline-none focus:border-primary/40"
                value={category}
                onChange={(e) => setCategory(e.target.value as BibleGlossaryTerm["category"])}
              >
                <option value="name">人名·地名</option>
                <option value="term">术语</option>
                <option value="dead">死亡角色</option>
              </select>
            </div>
            <div className="mb-3">
              <p className={POPOVER_LABEL}>备注（可选）</p>
              <textarea
                className={POPOVER_TEXTAREA}
                rows={3}
                placeholder="释义、设定约束、与剧情相关的注意事项…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </>
        )}

        <button
          type="button"
          className="w-full rounded bg-primary/15 py-1 text-[11px] font-medium text-primary hover:bg-primary/25 disabled:opacity-50"
          onClick={handleCreate}
          disabled={creating}
        >
          {creating ? "入库中…" : "确认入库"}
        </button>
      </PopoverContent>
    </Popover>
  );
}
