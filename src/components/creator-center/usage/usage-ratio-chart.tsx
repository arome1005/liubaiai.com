"use client";

import { ArrowDown, ArrowRight, ArrowUp, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import { cn } from "../../../lib/utils";
import type { UsageStats } from "../../../util/usage-types";

interface UsageRatioChartProps {
  stats: UsageStats;
}

function formatNumber(n: number): string {
  return n.toLocaleString("zh-CN");
}

export function UsageRatioChart({ stats }: UsageRatioChartProps) {
  const { avgInputRatio, avgOutputRatio, avgPerCall } = stats;
  const inputPercent = Math.round(avgInputRatio * 100);
  const outputPercent = Math.round(avgOutputRatio * 100);
  const isOutputHeavy = outputPercent > 35;
  const isInputHeavy = inputPercent > 85;

  return (
    <Card className="gap-3 border-border/50 bg-card/80 py-4 backdrop-blur-sm sm:gap-4 sm:py-5">
      <CardHeader className="pb-0">
        <CardTitle className="flex items-center gap-2 text-sm font-medium tracking-tight">
          输入 / 输出占比
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground/60 transition-colors hover:text-muted-foreground"
              >
                <Info className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-[220px] border-border/50 bg-popover text-popover-foreground shadow-md">
              <p className="text-xs leading-relaxed">
                <strong>Input</strong>：发送给模型的 prompt
                <br />
                <strong>Output</strong>：模型生成的 completion
              </p>
            </TooltipContent>
          </Tooltip>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-4 sm:px-6">
        <div className="flex items-center justify-center">
          <div className="relative">
            <svg viewBox="0 0 100 100" className="size-28 sm:size-32">
              <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="10" className="text-muted/30" />
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke="var(--chart-1)"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={`${inputPercent * 2.51} 251`}
                transform="rotate(-90 50 50)"
                className="transition-all duration-700"
              />
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke="var(--chart-2)"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={`${outputPercent * 2.51} 251`}
                transform={`rotate(${inputPercent * 3.6 - 90} 50 50)`}
                className="transition-all duration-700"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="number-display text-2xl font-semibold">{inputPercent}</span>
              <span className="text-[10px] text-muted-foreground">Input %</span>
            </div>
          </div>
        </div>

        <div className="flex justify-center gap-6">
          <div className="flex items-center gap-2">
            <div className="size-2.5 rounded-full bg-chart-1" />
            <span className="text-xs text-muted-foreground">Input</span>
            <span className="number-display text-xs font-medium">{inputPercent}%</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="size-2.5 rounded-full bg-chart-2" />
            <span className="text-xs text-muted-foreground">Output</span>
            <span className="number-display text-xs font-medium">{outputPercent}%</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/30 p-3">
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Avg In</p>
            <p className="number-display mt-0.5 text-sm font-medium">{formatNumber(avgPerCall.input)}</p>
          </div>
          <div className="flex flex-col items-center justify-center">
            <ArrowRight className="size-3 text-muted-foreground/50" />
          </div>
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Avg Out</p>
            <p className="number-display mt-0.5 text-sm font-medium">{formatNumber(avgPerCall.output)}</p>
          </div>
        </div>

        <div
          className={cn(
            "rounded-lg border p-3 transition-colors",
            isOutputHeavy && "border-chart-2/30 bg-chart-2/5",
            isInputHeavy && "border-chart-1/30 bg-chart-1/5",
            !isOutputHeavy && !isInputHeavy && "border-border/30 bg-muted/20",
          )}
        >
          {isOutputHeavy ? (
            <p className="flex items-start gap-2 text-xs leading-relaxed">
              <ArrowUp className="mt-0.5 size-3.5 shrink-0 text-chart-2" />
              <span>
                <strong>Output 占比偏高</strong> — 长生成或多版本对比。可缩短单次生成长度控制成本。
              </span>
            </p>
          ) : isInputHeavy ? (
            <p className="flex items-start gap-2 text-xs leading-relaxed">
              <ArrowDown className="mt-0.5 size-3.5 shrink-0 text-chart-1" />
              <span>
                <strong>Input 占比偏高</strong> — 上下文可能过肥。检查锦囊注入策略或启用摘要压缩。
              </span>
            </p>
          ) : (
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              <span>输入/输出比例正常。</span>
            </p>
          )}
        </div>

        <p className="sr-only">
          输入占比{inputPercent}%，输出占比{outputPercent}%。平均每次调用：输入{formatNumber(avgPerCall.input)}tokens，输出{formatNumber(avgPerCall.output)}tokens。
        </p>
      </CardContent>
    </Card>
  );
}
