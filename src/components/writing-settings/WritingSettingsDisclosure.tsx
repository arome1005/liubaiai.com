import type { ReactNode } from "react";
import { useId } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";
import { ChevronDown, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

export function WritingSettingsDisclosure(props: {
  title: string;
  description: string;
  badge: string;
  icon: ReactNode;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  children: ReactNode;
}) {
  const { title, description, badge, icon, open, onOpenChange, children } = props;
  const descriptionId = useId();

  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <div className="ws-disclosure-shell overflow-hidden rounded-lg border border-border/80 bg-muted/25 shadow-sm">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="ws-disclosure-trigger flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-expanded={open}
            aria-describedby={descriptionId}
          >
            <span className="ws-disclosure-icon mt-0.5 shrink-0 text-muted-foreground [&_svg]:size-4" aria-hidden>
              {icon}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-center gap-1 leading-snug">
                <span className="text-sm font-semibold text-foreground">{title}</span>
                <Tooltip delayDuration={300}>
                  <TooltipTrigger asChild>
                    <span
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      className="inline-flex shrink-0 cursor-help items-center text-muted-foreground/45 hover:text-muted-foreground/75 transition-colors"
                      aria-label={`${title}说明`}
                    >
                      <Info className="size-3" aria-hidden />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" align="start" sideOffset={6} className="max-w-[min(92vw,18rem)] text-xs leading-relaxed">
                    {description}
                  </TooltipContent>
                </Tooltip>
              </span>
              <span className="min-[380px]:hidden text-[10px] font-medium text-muted-foreground/90 tabular-nums">{badge}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="hidden max-w-[9rem] truncate rounded-md border border-border/60 bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums min-[380px]:inline">
                {badge}
              </span>
              <ChevronDown
                className={
                  "size-4 shrink-0 text-muted-foreground transition-transform duration-200 " + (open ? "rotate-180" : "")
                }
                aria-hidden
              />
            </span>
            <span id={descriptionId} className="sr-only">
              {description}
            </span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="ws-disclosure-content overflow-hidden">
          <div className="border-t border-border/60 bg-background/40 px-3 py-3">{children}</div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
