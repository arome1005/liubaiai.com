import { BookOpen, Check, PenLine, Sparkles, X } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

const STEPS: { n: 1 | 2 | 3; title: string; detail: string; icon: typeof PenLine }[] = [
  {
    n: 1,
    title: "选对作品与章节",
    detail: "仿写结果会对应到这一章，写回也在此章。",
    icon: BookOpen,
  },
  {
    n: 2,
    title: "写大纲或从推演导入",
    detail: "说清这章发生什么；需要时可点「从推演导入」。",
    icon: PenLine,
  },
  {
    n: 3,
    title: "生成、改到满意、写回",
    detail: "中间是主稿；左侧选章，右侧是仿写、素材与各版快照。",
    icon: Sparkles,
  },
];

interface ShengHuiStepHintProps {
  className?: string;
  onDismiss: () => void;
}

export function ShengHuiStepHint({ className, onDismiss }: ShengHuiStepHintProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.06] via-card/80 to-card/50 p-3 shadow-sm backdrop-blur-sm",
        className,
      )}
    >
      <div className="pointer-events-none absolute -right-6 -top-6 size-24 rounded-full bg-chart-1/20 blur-2xl" />
      <div className="relative">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium text-foreground/90 sm:text-sm">仿写台怎么用（三步）</p>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 text-muted-foreground"
            onClick={onDismiss}
            title="不再显示"
            aria-label="关闭三步说明"
          >
            <X className="size-3.5" />
          </Button>
        </div>
        <ul className="mt-2.5 grid gap-2 sm:grid-cols-3 sm:gap-2">
          {STEPS.map(({ n, title, detail, icon: Icon }) => (
            <li
              key={n}
              className="flex min-w-0 gap-2 rounded-lg border border-border/40 bg-background/50 px-2.5 py-2"
            >
              <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon className="size-3" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-medium text-muted-foreground sm:text-xs">
                  <span className="text-primary">0{n}</span> {title}
                </p>
                <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground/90">{detail}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground/80">
          <Check className="size-3 shrink-0 text-primary" aria-hidden />
          需要更多空间时，可收起左侧「章节目录」或右侧工具栏，让中间稿面更宽。
        </p>
      </div>
    </div>
  );
}
