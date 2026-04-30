import { BookOpen, Library, Loader2, Sparkles, User } from "lucide-react"
import type { TuiyanPlanningLevel } from "../../db/types"
import { PLANNING_LEVEL_LABEL } from "../../util/tuiyan-planning"
import { Button } from "../ui/button"
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog"
import { cn } from "../../lib/utils"

type Props = {
  open: boolean
  busy: boolean
  /** 当前刚完成生成的是哪一层；弹窗关闭时可为 null */
  level: TuiyanPlanningLevel | null
  onOpenChange: (open: boolean) => void
  onSkip: () => void
  onEnrich: () => void
}

/**
 * 各层规划生成结束后：问是否用模型为人物/词条卡补简要信息（性格、释义等）。
 * 一旦写入：规划页 chip 自动从「未入库」切换为「已入库 · 自动带卡片信息」，
 * 写作页书斋人物库/词条库立即可见。
 *
 * 视觉：精简卡片式 dialog（标题 + 三条要点 + 双按钮），替换原长篇说明 AlertDialog。
 */
export function TuiyanPostPlanningKnowledgeDialog({
  open,
  busy,
  level,
  onOpenChange,
  onSkip,
  onEnrich,
}: Props) {
  const label = level ? PLANNING_LEVEL_LABEL[level] : "本层"
  const isMultiNode = level === "chapter_outline"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="overflow-hidden border border-border/40 bg-gradient-to-b from-card/95 via-card/85 to-card/75 p-0 shadow-[0_28px_70px_-30px_rgba(0,0,0,0.65)] backdrop-blur sm:max-w-md"
      >
        {/* 顶部光晕 + 图标徽章 */}
        <div className="relative overflow-hidden px-6 pt-6 pb-3">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-16 right-0 left-0 h-32 bg-gradient-to-b from-primary/15 via-primary/5 to-transparent blur-2xl"
          />
          <div className="relative flex items-center gap-3">
            <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full border border-primary/30 bg-primary/10 shadow-[0_0_0_4px_rgba(255,255,255,0.02)]">
              <Sparkles className="h-4 w-4 text-primary" aria-hidden />
              <span
                aria-hidden
                className="absolute inset-0 rounded-full ring-1 ring-primary/15"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-medium tracking-wide text-primary/85">
                  {label}
                </span>
                <span className="text-[11px] text-muted-foreground/70">已生成</span>
              </div>
              <DialogTitle className="mt-1 text-base font-semibold leading-snug text-foreground">
                要为人物 / 词条卡补全简要信息吗？
              </DialogTitle>
            </div>
          </div>
        </div>

        {/* 要点列表 */}
        <div className="px-6 pb-3">
          <ul className="space-y-2 text-[12.5px] leading-relaxed text-foreground/85">
            <FeatureRow
              icon={User}
              colorClass="text-sky-400"
              title="人物卡"
              desc="性格、动机、关系等"
            />
            <FeatureRow
              icon={BookOpen}
              colorClass="text-emerald-400"
              title="词条卡"
              desc="简短释义（备注）"
            />
            <FeatureRow
              icon={Library}
              colorClass="text-violet-400"
              title="同步可见"
              desc="规划页 chip 自动带出 · 写作页书斋同步可见"
              footnote="合并已有，已有内容不覆盖"
            />
          </ul>

          {isMultiNode ? (
            <p className="mt-3 rounded-md border border-amber-500/20 bg-amber-500/5 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-400/85">
              本层节点较多，将按节点串行抽取，耗时与用量随节点数增加。
            </p>
          ) : null}
        </div>

        {/* 操作区 */}
        <div className="flex items-center justify-end gap-2 border-t border-border/30 bg-background/30 px-6 py-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={onSkip}
            className="h-8 px-3 text-[12px] text-muted-foreground hover:text-foreground"
          >
            先不生成
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={onEnrich}
            className="h-8 gap-1.5 px-3.5 text-[12px] font-medium"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
            )}
            {busy ? "生成中…" : "写入书斋"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** 弹窗内的一行要点：左侧小图标 + 标题 + 一行说明 + 可选脚注 */
function FeatureRow({
  icon: Icon,
  colorClass,
  title,
  desc,
  footnote,
}: {
  icon: React.ElementType
  colorClass: string
  title: string
  desc: string
  footnote?: string
}) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        aria-hidden
        className={cn(
          "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border border-border/40 bg-background/50",
        )}
      >
        <Icon className={cn("h-3.5 w-3.5", colorClass)} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[12.5px] font-medium text-foreground">{title}</span>
          <span className="text-[12px] text-muted-foreground">{desc}</span>
        </div>
        {footnote ? (
          <span className="mt-0.5 block text-[10.5px] text-muted-foreground/65">{footnote}</span>
        ) : null}
      </div>
    </li>
  )
}
