import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

/** 分组标题：悬停 ⓘ 图标显示说明 */
export function WritingSettingsGroupLabel(props: { children: ReactNode; hint: ReactNode }) {
  return (
    <span className="flex items-center gap-1">
      <p className="ws-group-label">{props.children}</p>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            className="inline-flex cursor-help items-center text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors outline-none [&:focus-visible]:ring-2 [&:focus-visible]:ring-ring"
            aria-label={`${typeof props.children === "string" ? props.children : ""}说明`}
          >
            <Info className="size-[0.65rem]" aria-hidden />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" align="start" sideOffset={6} className="max-w-[min(92vw,18rem)] text-xs leading-relaxed">
          {props.hint}
        </TooltipContent>
      </Tooltip>
    </span>
  );
}
