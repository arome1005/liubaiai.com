import type { TuiyanReferenceBinding } from "../../db/types"
import { TUIYAN_REFERENCE_ASPECT_OPTIONS, TUIYAN_REFERENCE_RANGE_OPTIONS } from "../../util/tuiyan-reference-policy"
import { Button } from "../ui/button"
import { Checkbox } from "../ui/checkbox"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select"
import { cn } from "../../lib/utils"
import { TuiyanRefBookSectionPicker } from "./TuiyanRefBookSectionPicker"

export type TuiyanRefBookConfigBlockProps = {
  binding: TuiyanReferenceBinding
  onSetPrimary: () => void
  onToggleAspect: (aspect: TuiyanReferenceBinding["aspects"][number]) => void
  onRangeChange: (rangeMode: TuiyanReferenceBinding["rangeMode"]) => void
  onNoteChange: (note: string) => void
  /** 指定章节 `sectionIds`：与 `ReferenceChapterHead.id` 对应；未传时「指定章节」下仍显示占位说明。 */
  onSectionIdsChange?: (sectionIds: string[]) => void
  className?: string
}

/** 单本参考书：主/辅、作用维度、引用范围、备注 */
export function TuiyanRefBookConfigBlock({
  binding,
  onSetPrimary,
  onToggleAspect,
  onRangeChange,
  onNoteChange,
  onSectionIdsChange,
  className,
}: TuiyanRefBookConfigBlockProps) {
  return (
    <div className={cn("space-y-2.5 pt-1 border-t border-border/30", className)}>
      <div className="flex flex-wrap gap-1.5 items-center">
        <span className="text-[11px] text-muted-foreground shrink-0">角色</span>
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant={binding.role === "primary" ? "default" : "outline"}
            className="h-7 px-2 text-[11px]"
            onClick={onSetPrimary}
            title="将本书设为主参考，其余书为辅"
          >
            主参考
          </Button>
          <Button
            type="button"
            size="sm"
            variant={binding.role === "secondary" ? "default" : "outline"}
            className="h-7 px-2 text-[11px]"
            disabled={binding.role === "primary"}
            title={
              binding.role === "primary"
                ? "将其他关联书点「主参考」后，本书自动为辅"
                : "当前为辅参考"
            }
          >
            辅参考
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[11px] text-muted-foreground">作用维度</Label>
        <div className="grid grid-cols-2 gap-2">
          {TUIYAN_REFERENCE_ASPECT_OPTIONS.map((opt) => {
            const checked = binding.aspects.includes(opt.value)
            return (
              <label
                key={opt.value}
                className="flex items-center gap-2 rounded-md border border-border/30 px-2 py-1.5 text-[11px] cursor-pointer hover:bg-muted/30"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => onToggleAspect(opt.value)}
                />
                <span>{opt.label}</span>
              </label>
            )
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[11px] text-muted-foreground">引用范围</Label>
        <Select
          value={binding.rangeMode}
          onValueChange={(v) => onRangeChange(v as TuiyanReferenceBinding["rangeMode"])}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TUIYAN_REFERENCE_RANGE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {binding.rangeMode === "selected_sections" &&
          (onSectionIdsChange ? (
            <TuiyanRefBookSectionPicker
              refWorkId={binding.refWorkId}
              selectedIds={binding.sectionIds ?? []}
              onChange={onSectionIdsChange}
            />
          ) : (
            <p className="text-[10px] text-muted-foreground">
              指定章节：后续在藏经/检索侧勾选章节后再写入策略。
            </p>
          ))}
      </div>

      <div className="space-y-1.5">
        <Label className="text-[11px] text-muted-foreground" htmlFor={`tuiyan-ref-note-${binding.refWorkId}`}>
          备注（可选）
        </Label>
        <Input
          id={`tuiyan-ref-note-${binding.refWorkId}`}
          value={binding.note ?? ""}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder="短句，如：学对话节奏不学设定"
          className="h-8 text-xs"
        />
      </div>
    </div>
  )
}
