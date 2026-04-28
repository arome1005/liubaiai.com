"use client";

import { HardDrive, Sparkles, TrendingUp, Zap } from "lucide-react";
import { Badge } from "../../ui/badge";
import { Card, CardContent } from "../../ui/card";
import { cn } from "../../../lib/utils";
import type { UsageStats } from "../../../util/usage-types";

interface UsageHeroCardsProps {
  stats: UsageStats;
  isOwnerMode?: boolean;
}

function formatNumber(n: number): string {
  return n.toLocaleString("zh-CN");
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

function getStatusColor(percentage: number, isOverBudget: boolean) {
  if (isOverBudget) return "text-destructive";
  if (percentage >= 80) return "text-amber-500";
  return "text-foreground";
}

export function UsageHeroCards({ stats, isOwnerMode = false }: UsageHeroCardsProps) {
  const { dailyBudget, sessionBudget, lifetimeTotal } = stats;

  return (
    <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
      <Card className="group relative overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm transition-all hover:border-border">
        <div
          className={cn(
            "absolute inset-x-0 top-0 h-px",
            dailyBudget.isOverBudget
              ? "bg-gradient-to-r from-transparent via-destructive to-transparent"
              : dailyBudget.isNearThreshold
                ? "bg-gradient-to-r from-transparent via-amber-500 to-transparent"
                : "bg-gradient-to-r from-transparent via-chart-1 to-transparent",
          )}
        />

        {isOwnerMode && (
          <Badge variant="outline" className="absolute right-3 top-3 border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Sparkles className="mr-1 size-3" />
            Owner
          </Badge>
        )}

        <CardContent className="p-4 sm:p-5">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">今日用量</p>
              <p className="text-[10px] text-muted-foreground/70">计费口径</p>
            </div>
            <div className="rounded-lg bg-chart-1/10 p-2">
              <Zap className="size-4 text-chart-1" />
            </div>
          </div>

          <div className="mt-4">
            {dailyBudget.limit > 0 ? (
              <>
                <div className="flex items-baseline gap-1.5">
                  <span
                    className={cn(
                      "number-display text-3xl font-semibold",
                      getStatusColor(dailyBudget.percentage, dailyBudget.isOverBudget),
                    )}
                  >
                    {formatCompact(dailyBudget.used)}
                  </span>
                  <span className="text-muted-foreground/60">/</span>
                  <span className="number-display text-base text-muted-foreground">
                    {formatCompact(dailyBudget.limit)}
                  </span>
                </div>

                <div className="mt-4">
                  <div className="relative h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "absolute inset-y-0 left-0 rounded-full transition-all duration-500",
                        dailyBudget.isOverBudget
                          ? "bg-destructive"
                          : dailyBudget.isNearThreshold
                            ? "bg-amber-500"
                            : "bg-chart-1",
                      )}
                      style={{ width: `${Math.min(dailyBudget.percentage, 100)}%` }}
                    />
                    <div
                      className={cn(
                        "absolute inset-y-0 left-0 rounded-full blur-sm transition-all duration-500",
                        dailyBudget.isOverBudget
                          ? "bg-destructive/50"
                          : dailyBudget.isNearThreshold
                            ? "bg-amber-500/50"
                            : "bg-chart-1/50",
                      )}
                      style={{ width: `${Math.min(dailyBudget.percentage, 100)}%` }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="number-display text-xs text-muted-foreground">
                      {dailyBudget.percentage.toFixed(1)}%
                    </span>
                    {dailyBudget.isOverBudget && (
                      <span className="text-xs font-medium text-destructive">超预算</span>
                    )}
                    {!dailyBudget.isOverBudget && dailyBudget.isNearThreshold && (
                      <span className="text-xs font-medium text-amber-600 dark:text-amber-400">接近阈值</span>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-baseline gap-1.5">
                  <span className="number-display text-3xl font-semibold">{formatCompact(dailyBudget.used)}</span>
                  <span className="text-sm text-muted-foreground">tokens</span>
                </div>
                <p className="mt-4 text-xs text-muted-foreground/70">未启用日预算 · 设置中开启</p>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="group relative overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm transition-all hover:border-border">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-chart-2 to-transparent" />

        <CardContent className="p-4 sm:p-5">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">本会话</p>
              <p className="text-[10px] text-muted-foreground/70">标签页</p>
            </div>
            <div className="rounded-lg bg-chart-2/10 p-2">
              <TrendingUp className="size-4 text-chart-2" />
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-baseline gap-1.5">
              <span className="number-display text-3xl font-semibold">{formatCompact(sessionBudget.used)}</span>
              {sessionBudget.limit > 0 && (
                <>
                  <span className="text-muted-foreground/60">/</span>
                  <span className="number-display text-base text-muted-foreground">
                    {formatCompact(sessionBudget.limit)}
                  </span>
                </>
              )}
              {sessionBudget.limit === 0 && <span className="text-sm text-muted-foreground">tokens</span>}
            </div>

            <div className="mt-4 flex h-8 items-end gap-[3px]">
              {[3, 5, 2, 7, 4, 6, 3, 8, 5, 2, 6, 4, 5, 7, 3].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-sm bg-chart-2/30 transition-all group-hover:bg-chart-2/50"
                  style={{ height: `${h * 3.5}px` }}
                />
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground/70">会话活动脉冲</p>
          </div>
        </CardContent>
      </Card>

      <Card className="group relative overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm transition-all hover:border-border sm:col-span-2 lg:col-span-1">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-chart-3 to-transparent" />

        <CardContent className="p-4 sm:p-5">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">终身累计</p>
              <p className="text-[10px] text-muted-foreground/70">本机 · 不上传</p>
            </div>
            <div className="rounded-lg bg-chart-3/10 p-2">
              <HardDrive className="size-4 text-chart-3" />
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-baseline gap-1.5">
              <span className="number-display text-3xl font-semibold">{formatNumber(lifetimeTotal)}</span>
            </div>
            <p className="mt-1 number-display text-sm text-muted-foreground">≈ {formatCompact(lifetimeTotal)} tokens</p>

            <div className="mt-4 flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className="size-1.5 rounded-full bg-chart-3" />
                <span className="text-xs text-muted-foreground/70">粗估累计</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="size-1.5 rounded-full bg-muted-foreground/30" />
                <span className="text-xs text-muted-foreground/70">仅本机</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
