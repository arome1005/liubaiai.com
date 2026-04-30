import { CircleHelp } from "lucide-react"
import { TUIYAN_PLANNING_THICKNESS_LS_KEY } from "../../util/tuiyan-planning-prefs-storage"
import { Button } from "../ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"

/** 高级设置：说明集中在此，主界面只保留控件与短标签 */
export function TuiyanPlanningAdvancedSettingsHelp() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-muted/80 hover:text-foreground"
          aria-label="说明"
        >
          <CircleHelp className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(92vw,22rem)] max-h-[min(72vh,28rem)] overflow-y-auto p-3.5 sm:p-4"
        align="end"
        sideOffset={6}
      >
        <div className="space-y-3.5 text-[11px] leading-relaxed text-muted-foreground">
          <p className="text-xs font-semibold text-foreground">推演 · 高级设置</p>

          <section className="space-y-1">
            <p className="font-medium text-foreground/90">规模</p>
            <p>未单独设置的新节点使用这里的默认卷数、每卷章数、一级大纲条数。短篇可将大纲条数设为 1–2。</p>
          </section>

          <section className="space-y-1">
            <p className="font-medium text-foreground/90">按大纲 / 按卷</p>
            <p>
              在左侧树选中「一级大纲」可改该段目标卷数；选中「卷纲」可改本卷章细纲条数，覆盖上面的默认值。
            </p>
          </section>

          <section className="space-y-1">
            <p className="font-medium text-foreground/90">建议生成字数</p>
            <p>
              与生成与校验一致（均含标点）；各层有不可低于的产品下限。改完可点失焦或底部「保存并关闭」；直接点右上角关闭也会在关窗前尽量提交当前正在编辑的字数。
            </p>
            <p className="font-mono text-[10px] text-muted-foreground/90">{TUIYAN_PLANNING_THICKNESS_LS_KEY}</p>
          </section>

          <section className="space-y-1">
            <p className="font-medium text-foreground/90">下一步与表格高亮</p>
            <p>当前树选中节点决定下一轮「下一步」优先卡哪一档字数；对应行在表中高亮。</p>
          </section>
        </div>
      </PopoverContent>
    </Popover>
  )
}
