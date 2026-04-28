"use client";

import { BookOpen, ChevronDown, Download, Settings } from "lucide-react";
import { Button } from "../../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Tabs, TabsList, TabsTrigger } from "../../ui/tabs";
import type { AiProviderId, PerspectiveMode, TimeRange } from "../../../util/usage-types";
import { providerLabels } from "../../../util/usage-mock-data";

interface UsageTopBarProps {
  work: string;
  onWorkChange: (value: string) => void;
  /** 来自本机用量事件的 workId；空则仅显示「全部作品」 */
  workOptions?: { value: string; label: string }[];
  timeRange: TimeRange;
  onTimeRangeChange: (value: TimeRange) => void;
  provider: AiProviderId;
  onProviderChange: (value: AiProviderId) => void;
  perspective: PerspectiveMode;
  onPerspectiveChange: (value: PerspectiveMode) => void;
  onExportCsv?: () => void;
  exportDisabled?: boolean;
}

const timeRangeLabels: Record<TimeRange, string> = {
  today: "今日",
  "7d": "近 7 天",
  "30d": "近 30 天",
  session: "本会话",
  custom: "自定义",
};

export function UsageTopBar({
  work,
  onWorkChange,
  workOptions = [],
  timeRange,
  onTimeRangeChange,
  provider,
  onProviderChange,
  perspective,
  onPerspectiveChange,
  onExportCsv,
  exportDisabled = false,
}: UsageTopBarProps) {
  return (
    <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 sm:gap-2 sm:px-4">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary/10">
            <BookOpen className="size-3.5 text-primary" />
          </div>
          <Select value={work} onValueChange={onWorkChange}>
            <SelectTrigger className="h-8 w-[130px] border-0 bg-transparent px-2 text-sm font-medium hover:bg-accent">
              <SelectValue />
              <ChevronDown className="ml-1 size-3 opacity-50" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部作品</SelectItem>
              {workOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="hidden h-4 w-px bg-border/50 sm:block" />

        <Select value={timeRange} onValueChange={(v) => onTimeRangeChange(v as TimeRange)}>
          <SelectTrigger className="h-8 w-[90px] border-border/50 bg-transparent text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(timeRangeLabels).map(([key, label]) => (
              <SelectItem key={key} value={key} disabled={key === "custom"}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={provider} onValueChange={(v) => onProviderChange(v as AiProviderId)}>
          <SelectTrigger className="h-8 w-[120px] border-border/50 bg-transparent text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(providerLabels).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="hidden h-4 w-px bg-border/50 md:block" />

        <Tabs value={perspective} onValueChange={(v) => onPerspectiveChange(v as PerspectiveMode)} className="hidden md:block">
          <TabsList className="h-8 gap-0.5 bg-muted/50 p-0.5">
            <TabsTrigger
              value="mixed"
              className="h-7 rounded-[5px] px-3 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              混合
            </TabsTrigger>
            <TabsTrigger
              value="api"
              className="h-7 rounded-[5px] px-3 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              计费
            </TabsTrigger>
            <TabsTrigger
              value="approx"
              className="h-7 rounded-[5px] px-3 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              粗估
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="ml-auto flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            disabled={!onExportCsv || exportDisabled}
            onClick={onExportCsv}
          >
            <Download className="size-3.5" />
            <span className="hidden sm:inline">导出</span>
          </Button>
          <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground">
            <Settings className="size-4" />
            <span className="sr-only">AI 隐私与预算设置</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
