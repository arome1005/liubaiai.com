"use client";

import { Badge } from "../../ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { cn } from "../../../lib/utils";
import type { ContextBreakdown } from "../../../util/usage-types";

interface UsageSankeyChartProps {
  contextData: ContextBreakdown[];
  taskData: ContextBreakdown[];
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

const contextGradients = [
  "from-chart-1 to-chart-1/60",
  "from-chart-2 to-chart-2/60",
  "from-chart-3 to-chart-3/60",
  "from-chart-4 to-chart-4/60",
  "from-chart-5 to-chart-5/60",
];

const taskGradients = [
  "from-chart-2 to-chart-2/60",
  "from-chart-1 to-chart-1/60",
  "from-chart-4 to-chart-4/60",
  "from-chart-3 to-chart-3/60",
  "from-chart-5 to-chart-5/60",
];

export function UsageSankeyChart({ contextData, taskData }: UsageSankeyChartProps) {
  const totalTokens = contextData.reduce((sum, d) => sum + d.tokens, 0);

  return (
    <Card className="gap-3 border-border/50 bg-card/80 py-4 backdrop-blur-sm sm:gap-4 sm:py-5">
      <CardHeader className="pb-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium tracking-tight">消耗结构</CardTitle>
          <Badge variant="secondary" className="bg-muted/50 text-[10px] font-normal">
            需开启用量明细
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">上下文注入 → 输出任务</p>
      </CardHeader>
      <CardContent className="min-w-0">
        <div className="-mx-1 flex min-w-0 items-stretch gap-3 overflow-x-auto px-1 sm:gap-4">
          <div className="flex w-[min(7.25rem,28vw)] shrink-0 flex-col gap-1.5 sm:w-[7.5rem]">
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">上下文</p>
            {contextData.map((item, i) => (
              <div key={item.name} className="group flex items-center gap-2">
                <div
                  className={cn("h-5 rounded-sm bg-gradient-to-r transition-all", contextGradients[i % contextGradients.length])}
                  style={{ width: `${Math.max(item.percentage * 0.9, 12)}%` }}
                />
                <div className="flex-1 overflow-hidden">
                  <span className="block truncate text-xs">{item.name}</span>
                </div>
                <span className="number-display shrink-0 text-[10px] text-muted-foreground">{item.percentage}%</span>
              </div>
            ))}
          </div>

          <div className="relative flex min-h-[7.5rem] min-w-[8rem] flex-1 items-center justify-center sm:min-h-[8.5rem]">
            <div className="absolute inset-0 opacity-5">
              <svg className="size-full">
                <title>背景网格</title>
                <pattern id="usage-sankey-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" strokeWidth="0.5" />
                </pattern>
                <rect width="100%" height="100%" fill="url(#usage-sankey-grid)" />
              </svg>
            </div>

            <svg viewBox="0 0 160 140" className="relative h-28 w-full max-w-full sm:h-32" aria-hidden>
              <defs>
                <linearGradient id="flowGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.4" />
                  <stop offset="50%" stopColor="var(--chart-3)" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="var(--chart-2)" stopOpacity="0.4" />
                </linearGradient>
              </defs>
              {contextData.map((ctx, ci) => {
                const startY = 12 + ci * 22;
                return taskData.map((task, ti) => {
                  const endY = 15 + ti * 26;
                  const weight = (ctx.percentage * task.percentage) / 100;
                  if (weight < 1.5) return null;
                  return (
                    <path
                      key={`${ci}-${ti}`}
                      d={`M 0 ${startY} C 60 ${startY}, 100 ${endY}, 160 ${endY}`}
                      fill="none"
                      stroke="url(#flowGradient)"
                      strokeWidth={Math.max(weight * 0.2, 0.8)}
                      className="transition-opacity hover:opacity-100"
                      opacity={0.6}
                    />
                  );
                });
              })}
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="rounded-lg border border-border/30 bg-background/80 px-2.5 py-1.5 backdrop-blur-sm sm:px-3 sm:py-2">
                <span className="number-display text-base font-semibold sm:text-lg">{formatCompact(totalTokens)}</span>
                <span className="ml-1 text-xs text-muted-foreground">tokens</span>
              </div>
            </div>
          </div>

          <div className="flex w-[min(7.25rem,28vw)] shrink-0 flex-col gap-1.5 sm:w-[7.5rem]">
            <p className="mb-1 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground">任务</p>
            {taskData.map((item, i) => (
              <div key={item.name} className="group flex items-center gap-2">
                <span className="number-display shrink-0 text-[10px] text-muted-foreground">{item.percentage}%</span>
                <div className="flex-1 overflow-hidden">
                  <span className="block truncate text-right text-xs">{item.name}</span>
                </div>
                <div
                  className={cn("h-5 rounded-sm bg-gradient-to-l transition-all", taskGradients[i % taskGradients.length])}
                  style={{ width: `${Math.max(item.percentage * 0.9, 12)}%` }}
                />
              </div>
            ))}
          </div>
        </div>

        <p className="sr-only">
          上下文消耗结构摘要：{contextData.map((d) => `${d.name}占${d.percentage}%`).join("，")}。任务类型分布：
          {taskData.map((d) => `${d.name}占${d.percentage}%`).join("，")}。总消耗{formatCompact(totalTokens)}tokens。
        </p>
      </CardContent>
    </Card>
  );
}
