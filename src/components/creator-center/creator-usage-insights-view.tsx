"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity } from "lucide-react";
import type { AiProviderId, PerspectiveMode, TimeRange } from "../../util/usage-types";
import { useAiUsageInsights } from "../../hooks/useAiUsageInsights";
import { useAuthUserState } from "../../hooks/useAuthUserState";
import { UsageTopBar } from "./usage/usage-top-bar";
import { UsageHeroCards } from "./usage/usage-hero-cards";
import { UsageSankeyChart } from "./usage/usage-sankey-chart";
import { UsageRatioChart } from "./usage/usage-ratio-chart";
import { UsageTimelineChart } from "./usage/usage-timeline-chart";
import { UsageTableCard } from "./usage/usage-table-card";
import { UsageCaliberAccordion } from "./usage/usage-caliber-accordion";
import { UsageCostBudgetCard } from "./usage/usage-cost-budget-card";

/** AI 用量洞察：事件来自 IndexedDB；登录用户与云端双向同步（见 `ai-usage-cloud`） */
export function CreatorUsageInsightsView() {
  const { authUser } = useAuthUserState();
  const [work, setWork] = useState("all");
  const [timeRange, setTimeRange] = useState<TimeRange>("today");
  const [provider, setProvider] = useState<AiProviderId>("all");
  const [perspective, setPerspective] = useState<PerspectiveMode>("mixed");

  const { records, taskBreakdown, contextBreakdown, stats, timelineData, workOptions, isOwnerMode, isEmpty } =
    useAiUsageInsights({ work, timeRange, provider, perspective });

  useEffect(() => {
    if (work === "all") return;
    const ok = workOptions.some((o) => o.value === work);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- keep selected work valid when history shrinks after filter change
    if (!ok) setWork("all");
  }, [work, workOptions]);

  const onExportCsv = useCallback(() => {
    if (records.length === 0) return;
    const esc = (v: string | number | null | undefined) => {
      const s = v == null ? "" : String(v);
      if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
        return `"${s.replace(/"/g, "\"\"")}"`;
      }
      return s;
    };
    const header = [
      "timestamp",
      "task",
      "workId",
      "model",
      "provider",
      "source",
      "status",
      "inputTokens",
      "outputTokens",
      "reasoningTokens",
      "totalTokens",
    ];
    const rows = records.map((r) => [
      r.timestamp.toISOString(),
      r.task,
      r.workId ?? "",
      r.model,
      r.provider,
      r.source,
      r.status,
      r.inputTokens,
      r.outputTokens,
      r.reasoningTokens ?? "",
      r.totalTokens,
    ]);
    const csv = [header, ...rows].map((line) => line.map((v) => esc(v)).join(",")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    a.download = `ai-usage-${y}${m}${dd}-${hh}${mm}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(href);
  }, [records]);

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-[280px] -top-[200px] size-[520px] rounded-full bg-chart-1/25 blur-[100px]" />
        <div className="absolute -right-[200px] top-[120px] size-[420px] rounded-full bg-chart-3/25 blur-[90px]" />
        <div className="absolute -bottom-[120px] left-[25%] size-[360px] rounded-full bg-chart-2/15 blur-[80px]" />
      </div>

      <UsageTopBar
        work={work}
        onWorkChange={setWork}
        workOptions={workOptions}
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
        provider={provider}
        onProviderChange={setProvider}
        perspective={perspective}
        onPerspectiveChange={setPerspective}
        onExportCsv={onExportCsv}
        exportDisabled={records.length === 0}
      />

      <main className="relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4 sm:py-4">
        <div className="mx-auto w-full max-w-full space-y-4">
          <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight sm:text-xl">
                <Activity className="size-[1.125rem] shrink-0 text-primary sm:size-5" />
                AI 用量洞察
              </h1>
              <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
                了解上下文消耗、任务分布与预算状态{isEmpty ? "（尚未产生本机记录，侧栏等 AI 调用成功后会自动累积）" : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 self-start rounded-full border border-border/50 bg-card/50 px-2.5 py-1.5 backdrop-blur-sm sm:self-auto">
              <div className="relative">
                <div className="size-2 rounded-full bg-chart-2" />
                <div className="absolute inset-0 animate-ping rounded-full bg-chart-2 opacity-75" />
              </div>
              <span className="text-xs text-muted-foreground">实时</span>
            </div>
          </header>

          <UsageHeroCards stats={stats} isOwnerMode={isOwnerMode} usageAccountLoggedIn={Boolean(authUser?.id)} />

          <UsageCostBudgetCard />

          {/* 弹窗内宽约 72rem：两栏与视口断点易错位，此处固定单列更易读 */}
          <div className="grid grid-cols-1 gap-4">
            <div className="min-w-0">
              <UsageSankeyChart contextData={contextBreakdown} taskData={taskBreakdown} />
            </div>
            <div className="min-w-0">
              <UsageRatioChart stats={stats} />
            </div>
          </div>

          <UsageTimelineChart data={timelineData} timeRange={timeRange} />

          <UsageTableCard records={records} />

          <UsageCaliberAccordion usageAccountLoggedIn={Boolean(authUser?.id)} />

          <footer className="border-t border-border/30 pt-4 sm:pt-5">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground/70">
                {authUser?.id ? (
                  <>
                    <span>登录后用量记录与账号同步</span>
                    <span className="size-1 rounded-full bg-muted-foreground/30" />
                    <span>换设备登录同一邮箱可见</span>
                  </>
                ) : (
                  <>
                    <span>未登录时数据仅在本机</span>
                    <span className="size-1 rounded-full bg-muted-foreground/30" />
                    <span>登录后可跨设备同步</span>
                  </>
                )}
                <span className="size-1 rounded-full bg-muted-foreground/30" />
                <span>以厂商账单为准</span>
              </div>
              <p className="text-[10px] text-muted-foreground/50">AI 用量洞察 v1.0 · 写作工作台</p>
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}
