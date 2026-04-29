import { Flame, Snowflake, Circle } from "lucide-react";
import { cn } from "../../lib/utils";
import {
  clampShengHuiEmotionTemperature,
  shengHuiEmotionTemperaturePromptLine,
  type ShengHuiEmotionTemperature,
} from "../../ai/sheng-hui-generate";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

/**
 * 参数区：目标字数旁的情绪温度条（1=克制 … 5=热烈）。
 */
export function ShengHuiEmotionTemperatureRow(props: {
  value: ShengHuiEmotionTemperature;
  onChange: (n: ShengHuiEmotionTemperature) => void;
  busy: boolean;
}) {
  const { value, onChange, busy } = props;
  const tierHint = shengHuiEmotionTemperaturePromptLine(value);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help text-[12px] text-muted-foreground underline decoration-dotted underline-offset-2">
            情绪温度
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[20rem] text-left text-xs leading-relaxed">
          控制叙述「冷热」：低档位偏克制、少铺陈；高档位可更饱满意象与感官。与右侧「设置」里模型温度不同。
        </TooltipContent>
      </Tooltip>
      <span className="text-[10px] text-muted-foreground/70">克制</span>
      <Snowflake className="size-3.5 shrink-0 text-sky-400/90" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:max-w-[8.5rem]">
        <Tooltip>
          <TooltipTrigger asChild>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={value}
              disabled={busy}
              onChange={(e) => onChange(clampShengHuiEmotionTemperature(Number(e.target.value)))}
              className="h-1.5 w-full min-w-0 cursor-help accent-primary"
              aria-label="情绪温度"
              aria-valuetext={tierHint}
            />
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[20rem] text-left text-xs leading-relaxed">
            当前档位 {value}/5：{tierHint}
          </TooltipContent>
        </Tooltip>
        <div
          className="flex w-full max-w-full justify-between text-[8px] leading-none text-muted-foreground/75"
          aria-hidden
        >
          {([1, 2, 3, 4, 5] as const).map((n) => (
            <span
              key={n}
              className={cn(
                "inline-flex w-3 flex-col items-center gap-0.5",
                n === value ? "font-semibold text-primary" : "opacity-70",
              )}
            >
              {n === 1 ? <Snowflake className="size-2.5 text-sky-400" /> : null}
              {n === 3 ? <Circle className="size-2.5" /> : null}
              {n === 5 ? <Flame className="size-2.5 text-orange-400" /> : null}
              {![1, 3, 5].includes(n) ? <span className="h-2.5 w-1" /> : null}
              <span className="tabular-nums">{n}</span>
            </span>
          ))}
        </div>
      </div>
      <Flame className="size-3.5 shrink-0 text-orange-400/90" aria-hidden />
      <span className="text-[10px] text-muted-foreground/70">热烈</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex cursor-help items-center gap-0.5 text-[11px] text-muted-foreground">
            <Circle
              className={cn("size-2.5", value === 3 ? "text-primary" : "text-muted-foreground/40")}
              aria-hidden
            />
            <span className="tabular-nums">{value}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[20rem] text-left text-xs leading-relaxed">
          {tierHint}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
