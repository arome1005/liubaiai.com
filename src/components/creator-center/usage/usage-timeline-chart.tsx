"use client";

import { useId } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { cn } from "../../../lib/utils";
import type { DailyUsage, TimeRange } from "../../../util/usage-types";

interface UsageTimelineChartProps {
  data: DailyUsage[];
  timeRange: TimeRange;
}

const LEGEND_LABELS: Record<string, string> = {
  apiTotal: "API 计费",
  approxTotal: "粗估",
  calls: "调用次数",
};

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return n.toString();
}

function formatXAxis(value: string | number, timeRange: TimeRange): string {
  if (timeRange === "today" || timeRange === "session") {
    return `${value}:00`;
  }
  if (typeof value === "string" && value.includes("-")) {
    const parts = value.split("-");
    return `${parts[1]}/${parts[2]}`;
  }
  return String(value);
}

type TooltipPayload = {
  dataKey?: string;
  name?: string;
  value?: number;
  color?: string;
};

function TimelineTooltip(props: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string | number;
  timeRange: TimeRange;
}) {
  const { active, payload, label, timeRange } = props;
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border/50 bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md">
      <p className="mb-1 font-medium text-foreground">{formatXAxis(label ?? "", timeRange)}</p>
      <div className="grid gap-1">
        {payload.map((item) => {
          const key = String(item.dataKey ?? item.name ?? "");
          const name = LEGEND_LABELS[key] ?? key;
          const v = item.value;
          return (
            <div key={key} className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">{name}</span>
              <span className="number-display font-medium tabular-nums">
                {typeof v === "number" ? formatCompact(v) : v}
                {key === "calls" ? " 次" : ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function UsageTimelineChart({ data, timeRange }: UsageTimelineChartProps) {
  const uid = useId().replace(/:/g, "");
  const gradApi = `timeline-api-${uid}`;
  const gradApprox = `timeline-approx-${uid}`;

  const xKey = timeRange === "today" || timeRange === "session" ? "hour" : "date";
  const totalTokens = data.reduce((sum, d) => sum + d.total, 0);
  const totalCalls = data.reduce((sum, d) => sum + d.calls, 0);
  const avgPerPoint = Math.round(totalTokens / data.length);

  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
      <CardHeader className="space-y-2 pb-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm font-medium tracking-tight">
              <TrendingUp className="size-4 text-chart-1" />
              时间序列
            </CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {timeRange === "today" && "今日按小时"}
              {timeRange === "session" && "本会话"}
              {timeRange === "7d" && "近 7 天"}
              {timeRange === "30d" && "近 30 天"}
              {timeRange === "custom" && ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:gap-x-4">
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">总计</p>
              <p className="number-display text-sm font-medium">{formatCompact(totalTokens)}</p>
            </div>
            <div className="hidden h-6 w-px bg-border/50 sm:block" />
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">调用</p>
              <p className="number-display text-sm font-medium">{totalCalls}</p>
            </div>
            <div className="hidden h-6 w-px bg-border/50 sm:block" />
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">均值</p>
              <p className="number-display text-sm font-medium">{formatCompact(avgPerPoint)}</p>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div
          className={cn(
            "h-[200px] w-full text-xs sm:h-[230px]",
            "[&_.recharts-cartesian-axis-tick_text]:fill-[var(--app-color-muted-foreground)]",
            "[&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50",
            "[&_.recharts-legend-item-text]:text-muted-foreground",
          )}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradApi} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id={gradApprox} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-3)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" strokeOpacity={0.5} />
              <XAxis
                dataKey={xKey}
                tickLine={false}
                axisLine={false}
                tickMargin={10}
                tickFormatter={(v) => formatXAxis(v, timeRange)}
                tick={{ fontSize: 10 }}
              />
              <YAxis
                yAxisId="tokens"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={formatCompact}
                width={42}
                tick={{ fontSize: 10 }}
              />
              <YAxis
                yAxisId="calls"
                orientation="right"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                width={28}
                tick={{ fontSize: 10 }}
              />
              <Tooltip
                content={(tooltipProps) => <TimelineTooltip {...tooltipProps} timeRange={timeRange} />}
              />
              <Legend
                verticalAlign="bottom"
                wrapperStyle={{ paddingTop: 8 }}
                formatter={(value) => LEGEND_LABELS[String(value)] ?? String(value)}
              />
              <Bar
                yAxisId="calls"
                dataKey="calls"
                fill="var(--chart-2)"
                fillOpacity={0.12}
                radius={[3, 3, 0, 0]}
                name="calls"
              />
              <Area
                yAxisId="tokens"
                type="monotone"
                dataKey="apiTotal"
                name="apiTotal"
                stroke="var(--chart-1)"
                strokeWidth={2}
                fill={`url(#${gradApi})`}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--app-color-background)" }}
              />
              <Area
                yAxisId="tokens"
                type="monotone"
                dataKey="approxTotal"
                name="approxTotal"
                stroke="var(--chart-3)"
                strokeWidth={1.5}
                strokeDasharray="4 2"
                fill={`url(#${gradApprox})`}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <p className="sr-only">
          时间序列图表摘要：{timeRange === "today" ? "今日按小时统计" : `${timeRange}统计`}，共{totalCalls}
          次调用，总计{formatCompact(totalTokens)}tokens。
        </p>
      </CardContent>
    </Card>
  );
}
