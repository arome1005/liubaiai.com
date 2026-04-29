import { Loader2, Maximize2, Minimize2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import type { ShengHuiParagraphToolbarAction } from "../../ai/sheng-hui-paragraph-toolbar-messages";

type Props = {
  paragraphIndex: number;
  disabled: boolean;
  isBusy: boolean;
  onAction: (action: ShengHuiParagraphToolbarAction) => void;
  className?: string;
};

const ACTION_META: { action: ShengHuiParagraphToolbarAction; label: string; Icon: typeof RefreshCw }[] = [
  { action: "rewrite", label: "重写此段", Icon: RefreshCw },
  { action: "expand", label: "扩展", Icon: Maximize2 },
  { action: "tighten", label: "收紧", Icon: Minimize2 },
  { action: "style_scan", label: "风格扫描", Icon: Sparkles },
];

/**
 * 阅读态段落左侧悬浮：重写 / 扩展 / 收紧 / 风格扫描（N2）。
 */
export function ShengHuiManuscriptParagraphToolbar(props: Props) {
  const { paragraphIndex, disabled, isBusy, onAction, className } = props;
  return (
    <div
      className={cn(
        "sheng-hui-para-toolbar pointer-events-none absolute left-0 top-0.5 z-10 flex -translate-x-[calc(100%+0.25rem)] flex-col gap-0.5 pr-1 opacity-0 transition-opacity duration-150 group-hover/para:pointer-events-auto group-hover/para:opacity-100 group-focus-within/para:pointer-events-auto group-focus-within/para:opacity-100 sm:opacity-0 sm:group-hover/para:opacity-100 sm:group-focus-within/para:opacity-100",
        "max-sm:pointer-events-auto max-sm:static max-sm:translate-x-0 max-sm:translate-y-0 max-sm:opacity-100",
        className,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {isBusy ? (
        <div
          className="pointer-events-auto flex items-center gap-1 rounded-md border border-border/50 bg-background/95 px-1.5 py-1 text-[10px] text-muted-foreground shadow-sm"
          aria-live="polite"
        >
          <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
          处理中
        </div>
      ) : (
        ACTION_META.map(({ action, label, Icon }) => (
          <Button
            key={action}
            type="button"
            variant="secondary"
            size="icon"
            disabled={disabled}
            className="pointer-events-auto size-7 border border-border/50 bg-background/95 shadow-sm"
            title={label}
            aria-label={`${label}，第 ${paragraphIndex + 1} 段`}
            onClick={() => onAction(action)}
          >
            <Icon className="size-3.5" aria-hidden />
          </Button>
        ))
      )}
    </div>
  );
}
