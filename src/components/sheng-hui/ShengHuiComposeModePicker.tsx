import { ChevronDown } from "lucide-react";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { cn } from "../../lib/utils";
import {
  MODE_DESCS,
  MODE_LABELS,
  SHENG_HUI_ADVANCED_MODE_SHORT_LABEL,
  SHENG_HUI_ADVANCED_MODES,
  SHENG_HUI_MAIN_MODES,
  shengHuiIsAdvancedGenerateMode,
  type ShengHuiGenerateMode,
} from "../../ai/sheng-hui-generate";

export function ShengHuiComposeModePicker(props: {
  generateMode: ShengHuiGenerateMode;
  onGenerateModeChange: (m: ShengHuiGenerateMode) => void;
  onResetTwoStep: () => void;
  className?: string;
}) {
  const { generateMode, onGenerateModeChange, onResetTwoStep, className } = props;
  const isAdvanced = shengHuiIsAdvancedGenerateMode(generateMode);
  const mainValue = isAdvanced ? "" : generateMode;

  return (
    <div className={cn("flex flex-col gap-1.5 sm:flex-row sm:items-stretch sm:gap-1.5", className)}>
      <ToggleGroup
        type="single"
        value={mainValue}
        onValueChange={(v) => {
          if (!v) return;
          onGenerateModeChange(v as ShengHuiGenerateMode);
          onResetTwoStep();
        }}
        variant="default"
        size="sm"
        className="inline-flex h-auto w-full min-w-0 flex-1 gap-0.5 rounded-lg border border-border/30 bg-muted/50 p-0.5"
        role="group"
        aria-label="主模式"
      >
        {SHENG_HUI_MAIN_MODES.map((m) => (
          <Tooltip key={m}>
            <TooltipTrigger asChild>
              <ToggleGroupItem
                value={m}
                className={cn(
                  "min-w-0 flex-1 basis-0 rounded-md px-1.5 py-1.5 text-[10px] font-medium data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm data-[state=off]:text-muted-foreground data-[state=off]:hover:bg-background/60 data-[state=off]:hover:text-foreground sm:text-[11px]",
                )}
              >
                {MODE_LABELS[m]}
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[16rem] text-xs">
              {MODE_DESCS[m]}
            </TooltipContent>
          </Tooltip>
        ))}
      </ToggleGroup>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-full min-h-0 shrink-0 justify-between text-[11px] font-normal sm:max-w-[12rem] sm:min-w-0"
          >
            <span>
              {isAdvanced
                ? `高级：${SHENG_HUI_ADVANCED_MODE_SHORT_LABEL[generateMode] ?? generateMode}`
                : "高级模式（骨架 / 接龙…）"}
            </span>
            <ChevronDown className="size-3.5 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[min(20rem,90vw)]">
          <DropdownMenuLabel>高级模式</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {SHENG_HUI_ADVANCED_MODES.map((m) => (
            <DropdownMenuItem
              key={m}
              onClick={() => {
                onGenerateModeChange(m);
                onResetTwoStep();
              }}
            >
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">{SHENG_HUI_ADVANCED_MODE_SHORT_LABEL[m]}</span>
                <span className="text-[11px] text-muted-foreground">{MODE_DESCS[m]}</span>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
