import type { TuiyanReferencePolicy } from "../../db/types"
import { TUIYAN_IMITATION_MODE_OPTIONS } from "../../util/tuiyan-reference-policy"
import { Label } from "../ui/label"
import { Switch } from "../ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select"
import { Textarea } from "../ui/textarea"

export type TuiyanReferenceGlobalPolicySectionProps = {
  policy: TuiyanReferencePolicy
  onUpdatePolicy: (patch: Partial<TuiyanReferencePolicy>) => void
}

/** 全局参考策略：仿写模式、构思优先、反向约束（推演参考 Tab） */
export function TuiyanReferenceGlobalPolicySection({
  policy,
  onUpdatePolicy,
}: TuiyanReferenceGlobalPolicySectionProps) {
  return (
    <div className="rounded-xl border border-border/40 bg-muted/20 p-3 space-y-3">
      <p className="text-xs font-medium text-muted-foreground">本次参考（全局）</p>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">仿写模式</Label>
        <Select
          value={policy.imitationMode}
          onValueChange={(v) =>
            onUpdatePolicy({ imitationMode: v as TuiyanReferencePolicy["imitationMode"] })
          }
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TUIYAN_IMITATION_MODE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs" title={`${o.label}：${o.hint}`}>
                {o.label}（{o.hint}）
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="tuiyan-ref-concept-first" className="text-xs text-muted-foreground cursor-pointer">
          构思优先
        </Label>
        <Switch
          id="tuiyan-ref-concept-first"
          checked={policy.conceptFirst}
          onCheckedChange={(checked) => onUpdatePolicy({ conceptFirst: checked })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="tuiyan-ref-anti" className="text-xs text-muted-foreground">
          反向约束（可选）
        </Label>
        <Textarea
          id="tuiyan-ref-anti"
          value={policy.antiPatterns ?? ""}
          onChange={(e) => onUpdatePolicy({ antiPatterns: e.target.value })}
          placeholder="例如：不要赛博义体；不要第一人称"
          className="min-h-[56px] text-xs resize-y"
        />
      </div>
    </div>
  )
}
