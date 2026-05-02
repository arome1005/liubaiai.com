"use client";

import { useCallback, useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import { toast } from "sonner";
import { AI_SETTINGS_UPDATED_EVENT, loadAiSettings, saveAiSettings } from "../../../ai/storage";
import type { AiSettings } from "../../../ai/types";
import { cn } from "../../../lib/utils";

/** 与设置页同源：日预算与单次调用预警，写入 `saveAiSettings`。 */
export function UsageCostBudgetCard() {
  const [aiSettings, setAiSettings] = useState<AiSettings>(() => loadAiSettings());

  useEffect(() => {
    const handler = () => setAiSettings(loadAiSettings());
    window.addEventListener(AI_SETTINGS_UPDATED_EVENT, handler);
    return () => window.removeEventListener(AI_SETTINGS_UPDATED_EVENT, handler);
  }, []);

  const persist = useCallback((next: AiSettings) => {
    setAiSettings(next);
    try {
      saveAiSettings(next);
    } catch {
      toast.error("保存失败。");
    }
  }, []);

  return (
    <div className="rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm">
      <div className="border-b border-border/30 px-4 py-3 sm:px-5 sm:py-4">
        <div className="flex items-center gap-2">
          <div className="rounded-md bg-chart-2/10 p-1.5">
            <Wallet className="size-3.5 text-chart-2" />
          </div>
          <h3 className="text-sm font-medium tracking-tight">成本预算 · 门控阈值</h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground/80">
          超出后在写作侧栏弹出确认弹窗（可继续，非硬性拦截），数值仅本机记录。
        </p>
      </div>

      <div className="space-y-5 px-4 py-4 sm:px-5 sm:py-5">
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              日预算 <span className="opacity-60">（0 = 不限制）</span>
            </span>
            <span className="shrink-0 text-xs font-medium">
              {aiSettings.dailyTokenBudget === 0
                ? "不限制"
                : `${(aiSettings.dailyTokenBudget / 10_000).toFixed(1)}万 tokens`}
            </span>
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              className="input flex-1 text-sm"
              min={0}
              max={10_000_000}
              step={10_000}
              value={aiSettings.dailyTokenBudget}
              onChange={(e) => {
                const v = Math.max(0, Math.min(10_000_000, Math.floor(Number(e.target.value) || 0)));
                persist({ ...aiSettings, dailyTokenBudget: v });
              }}
            />
            <span className="flex items-center text-xs text-muted-foreground">tokens</span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {([0, 50_000, 100_000, 500_000] as const).map((v) => (
              <button
                key={v}
                type="button"
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                  aiSettings.dailyTokenBudget === v
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/30 text-muted-foreground hover:border-border/60",
                )}
                onClick={() => persist({ ...aiSettings, dailyTokenBudget: v })}
              >
                {v === 0 ? "不限制" : v >= 10_000 ? `${v / 10_000}万` : String(v)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              单次调用预警 <span className="opacity-60">（0 = 不预警）</span>
            </span>
            <span className="shrink-0 text-xs font-medium">
              {aiSettings.singleCallWarnTokens === 0
                ? "不预警"
                : `${(aiSettings.singleCallWarnTokens / 1_000).toFixed(0)}k tokens`}
            </span>
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              className="input flex-1 text-sm"
              min={0}
              max={500_000}
              step={1_000}
              value={aiSettings.singleCallWarnTokens}
              onChange={(e) => {
                const v = Math.max(0, Math.min(500_000, Math.floor(Number(e.target.value) || 0)));
                persist({ ...aiSettings, singleCallWarnTokens: v });
              }}
            />
            <span className="flex items-center text-xs text-muted-foreground">tokens</span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {([0, 5_000, 20_000, 100_000] as const).map((v) => (
              <button
                key={v}
                type="button"
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                  aiSettings.singleCallWarnTokens === v
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/30 text-muted-foreground hover:border-border/60",
                )}
                onClick={() => persist({ ...aiSettings, singleCallWarnTokens: v })}
              >
                {v === 0 ? "不预警" : v >= 10_000 ? `${v / 10_000}万` : `${v / 1_000}k`}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
