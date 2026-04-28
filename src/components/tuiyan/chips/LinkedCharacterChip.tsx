/**
 * 已入库人物 chip：trigger 是带名字的小药丸，点击弹出可编辑 popover。
 * popover 字段：性别、角色性格（voiceNotes）、角色信息（motivation）。
 * 编辑后通过 onUpdate(id, patch) 写回书斋。
 */
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { BibleCharacter } from "../../../db/types";
import { cn } from "../../../lib/utils";
import { CHARACTER_CONFIG } from "../../../util/entry-kind-icon";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";
import {
  GENDER_LABELS,
  POPOVER_LABEL,
  POPOVER_TEXTAREA,
  SAVE_BTN,
  type CharGender,
} from "./shared";

export type LinkedCharacterChipProps = {
  name: string;
  character: BibleCharacter;
  onRemove: () => void;
  disabled: boolean;
  onUpdate: (
    id: string,
    patch: Partial<Pick<BibleCharacter, "voiceNotes" | "motivation" | "gender">>,
  ) => Promise<void>;
};

export function LinkedCharacterChip({
  name,
  character,
  onRemove,
  disabled,
  onUpdate,
}: LinkedCharacterChipProps) {
  const { icon: Icon, colorClass } = CHARACTER_CONFIG;
  const [open, setOpen] = useState(false);
  const [voiceNotes, setVoiceNotes] = useState(character.voiceNotes ?? "");
  const [motivation, setMotivation] = useState(character.motivation ?? "");
  const [gender, setGender] = useState<CharGender>(character.gender ?? "unknown");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setVoiceNotes(character.voiceNotes ?? "");
    setMotivation(character.motivation ?? "");
    setGender(character.gender ?? "unknown");
  }, [character.id, open]);

  const isDirty =
    voiceNotes !== (character.voiceNotes ?? "") ||
    motivation !== (character.motivation ?? "") ||
    gender !== (character.gender ?? "unknown");

  const save = async () => {
    if (!isDirty || saving) return;
    setSaving(true);
    try {
      await onUpdate(character.id, { voiceNotes, motivation, gender });
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
            colorClass,
          )}
        >
          <Icon className="h-3 w-3 shrink-0" />
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
      <PopoverContent className="w-72 rounded-xl border-border/40 bg-popover/95 p-3 text-xs shadow-xl backdrop-blur" align="start">
        {/* 标题行 */}
        <div className="mb-3 flex items-center gap-1.5">
          <Icon className={cn("h-3.5 w-3.5 shrink-0", colorClass)} />
          <span className="font-medium text-foreground">{character.name}</span>
          <span className="ml-auto shrink-0 rounded-full border border-border/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            人物
          </span>
        </div>
        {/* 性别 */}
        <div className="mb-2">
          <p className={POPOVER_LABEL}>性别</p>
          <div className="flex gap-1">
            {(["male", "female", "unknown", "none"] as const).map((g) => (
              <button
                key={g}
                type="button"
                disabled={disabled}
                className={cn(
                  "rounded-md border px-2 py-0.5 text-[10px] transition-colors",
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
        {/* 角色性格 */}
        <div className="mb-2">
          <p className={POPOVER_LABEL}>
            角色性格
            <span className="ml-1 opacity-50">{voiceNotes.length}/300</span>
          </p>
          <textarea
            className={POPOVER_TEXTAREA}
            rows={2}
            maxLength={300}
            placeholder="输入角色性格…"
            value={voiceNotes}
            onChange={(e) => setVoiceNotes(e.target.value)}
            disabled={disabled}
          />
        </div>
        {/* 角色信息 */}
        <div className="mb-3">
          <p className={POPOVER_LABEL}>
            角色信息
            <span className="ml-1 opacity-50">{motivation.length}/1000</span>
          </p>
          <textarea
            className={POPOVER_TEXTAREA}
            rows={3}
            maxLength={1000}
            placeholder="输入角色信息（剧情用到的背景）…"
            value={motivation}
            onChange={(e) => setMotivation(e.target.value)}
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
