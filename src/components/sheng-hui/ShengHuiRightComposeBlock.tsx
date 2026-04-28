import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { AiInlineErrorNotice } from "../AiInlineErrorNotice";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { getProviderTemperature } from "../../ai/storage";
import type { AiSettings } from "../../ai/types";
import { cn } from "../../lib/utils";
import {
  MODE_DESCS,
  MODE_LABELS,
  SHENG_HUI_ADVANCED_MODE_SHORT_LABEL,
  SHENG_HUI_ADVANCED_MODES,
  SHENG_HUI_MAIN_MODES,
  shengHuiComposePrimaryButtonLabel,
  shengHuiIsAdvancedGenerateMode,
  shengHuiIsTwoStepGenerateMode,
  type ShengHuiEmotionTemperature,
  type ShengHuiGenerateMode,
} from "../../ai/sheng-hui-generate";
import { ShengHuiEmotionTemperatureRow } from "./ShengHuiEmotionTemperatureRow";

const PRESET_WORDS = [500, 1500, 3000, 5000] as const;

export function ShengHuiRightComposeBlock(props: {
  generateMode: ShengHuiGenerateMode;
  onGenerateModeChange: (m: ShengHuiGenerateMode) => void;
  onResetTwoStep: () => void;
  twoStepIntermediate: string | null;
  onResetTwoStepIntermediate: () => void;
  targetWords: number;
  onTargetWordsChange: (n: number) => void;
  emotionTemperature: ShengHuiEmotionTemperature;
  onEmotionTemperatureChange: (n: ShengHuiEmotionTemperature) => void;
  settings: AiSettings;
  outline: string;
  onOutlineChange: (v: string) => void;
  busy: boolean;
  tuiyanImporting: boolean;
  workId: string | null;
  onImportFromTuiyan: () => void;
  onRunGenerate: () => void;
  onStop: () => void;
  lastRoughEstimate: { inputApprox: number; outputEstimateApprox: number; totalApprox: number } | null;
  selectedExcerptCount: number;
  error: string | null;
}) {
  const {
    generateMode,
    onGenerateModeChange,
    onResetTwoStep,
    twoStepIntermediate,
    onResetTwoStepIntermediate,
    targetWords,
    onTargetWordsChange,
    emotionTemperature,
    onEmotionTemperatureChange,
    settings,
    outline,
    onOutlineChange,
    busy,
    tuiyanImporting,
    workId,
    onImportFromTuiyan,
    onRunGenerate,
    onStop,
    lastRoughEstimate,
    selectedExcerptCount,
    error,
  } = props;

  const isAdvanced = shengHuiIsAdvancedGenerateMode(generateMode);
  const highCost = (lastRoughEstimate?.totalApprox ?? 0) > 8_000;

  return (
    <div className="flex flex-col gap-3">
      <div
        className={cn(
          "sheng-hui-glass-section flex flex-col gap-2 rounded-2xl border border-white/[0.05] bg-card/50 p-2",
          "shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset]",
        )}
      >
        <div className="h-0.5 rounded-full bg-gradient-to-r from-primary/50 to-transparent" aria-hidden />
        <p className="px-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">模式</p>
        <div
          className="inline-flex w-full gap-0.5 rounded-lg border border-border/30 bg-muted/50 p-0.5"
          role="tablist"
          aria-label="主模式"
        >
          {SHENG_HUI_MAIN_MODES.map((m) => (
            <Tooltip key={m}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  role="tab"
                  aria-selected={!isAdvanced && generateMode === m}
                  onClick={() => {
                    onGenerateModeChange(m);
                    onResetTwoStep();
                  }}
                  className={cn(
                    "min-w-0 flex-1 rounded-md px-1.5 py-1.5 text-[10px] font-medium transition-colors sm:text-[11px]",
                    !isAdvanced && generateMode === m
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
                  )}
                >
                  {MODE_LABELS[m]}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[16rem] text-xs">
                {MODE_DESCS[m]}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-full justify-between text-[11px] font-normal"
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
      </div>

      <div className="sheng-hui-glass-section space-y-2 rounded-2xl border border-white/[0.05] bg-card/50 p-2.5 shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset]">
        <div className="h-0.5 rounded-full bg-gradient-to-r from-chart-2/50 to-transparent" aria-hidden />
        <div className="text-[11px] font-semibold text-muted-foreground">参数</div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-muted-foreground">目标字数</span>
          <div className="flex flex-wrap gap-1">
            {PRESET_WORDS.map((n) => (
              <button
                key={n}
                type="button"
                disabled={busy}
                onClick={() => onTargetWordsChange(n)}
                className={cn(
                  "rounded-md border px-1.5 py-0.5 text-[10px] tabular-nums transition-colors",
                  targetWords === n
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border/50 text-muted-foreground hover:bg-accent/60",
                )}
              >
                {n}
              </button>
            ))}
          </div>
          <input
            type="number"
            min={0}
            max={20000}
            step={500}
            value={targetWords}
            disabled={busy}
            onChange={(e) => onTargetWordsChange(Math.max(0, Math.min(20000, Number(e.target.value) || 0)))}
            className="w-20 rounded border border-border/40 bg-background/60 px-1.5 py-0.5 text-center text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
        </div>
        <ShengHuiEmotionTemperatureRow
          value={emotionTemperature}
          onChange={onEmotionTemperatureChange}
          busy={busy}
        />
        <p className="text-[10px] text-muted-foreground/50">
          温度：{getProviderTemperature(settings, settings.provider)} ·{" "}
          <Link to="/settings" className="underline">
            设置
          </Link>
        </p>
      </div>

      <div className="sheng-hui-glass-section rounded-2xl border border-white/[0.05] bg-card/50 p-2.5 shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset]">
        <div className="h-0.5 rounded-full bg-gradient-to-r from-primary/30 to-chart-1/30" aria-hidden />
        <div className="mb-1.5 flex items-center gap-2">
          <span className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
            大纲与文策
            {generateMode === "write" ? (
              <span className="text-destructive">*</span>
            ) : (
              <span className="text-xs font-normal text-muted-foreground/60">（选填）</span>
            )}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-7 text-[11px]"
            disabled={busy || tuiyanImporting || !workId}
            onClick={() => void onImportFromTuiyan()}
          >
            {tuiyanImporting ? "导入中…" : "从推演导入"}
          </Button>
        </div>
        <textarea
          className="input wence-input w-full min-h-[5rem] text-sm"
          rows={generateMode === "write" ? 6 : 4}
          placeholder={
            generateMode === "write"
              ? "从「推演」定稿后粘贴卷纲、细纲与文策要点（必填），或点击「从推演导入」"
              : "填写以引导方向；重写/精炼时可留空"
          }
          value={outline}
          disabled={busy}
          onChange={(e) => onOutlineChange(e.target.value)}
        />
      </div>

      {shengHuiIsTwoStepGenerateMode(generateMode) && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/40 bg-card/40 px-2.5 py-1.5 text-xs text-muted-foreground">
          <span
            className={cn(
              "rounded px-1.5 py-0.5 font-medium",
              !twoStepIntermediate ? "bg-primary text-primary-foreground" : "bg-muted",
            )}
          >
            {generateMode === "skeleton" ? "① 骨架" : "① 对话"}
          </span>
          <span className="text-muted-foreground/40">→</span>
          <span
            className={cn(
              "rounded px-1.5 py-0.5 font-medium",
              twoStepIntermediate ? "bg-primary text-primary-foreground" : "bg-muted",
            )}
          >
            ② 正文
          </span>
          {twoStepIntermediate ? (
            <button
              type="button"
              className="ml-1 text-[11px] text-muted-foreground/60 hover:text-foreground"
              onClick={() => onResetTwoStepIntermediate()}
            >
              重置
            </button>
          ) : null}
        </div>
      )}

      <div
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-2xl border p-2.5",
          highCost ? "border-amber-500/35 bg-amber-500/5" : "border-border/50 bg-card/50",
        )}
      >
        {busy ? (
          <Button type="button" variant="secondary" size="sm" onClick={onStop}>
            停止
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            className={cn(highCost && "ring-1 ring-amber-500/50")}
            onClick={() => void onRunGenerate()}
            disabled={busy || !workId || (generateMode === "write" && !outline.trim())}
            title={highCost ? "粗估用量较高，请注意成本" : undefined}
          >
            {shengHuiComposePrimaryButtonLabel(generateMode, twoStepIntermediate)}
            {highCost ? " ⚠" : ""}
          </Button>
        )}
        {lastRoughEstimate ? (
          <span className="text-[11px] text-muted-foreground">
            粗估：~{lastRoughEstimate.inputApprox.toLocaleString()} + ~{lastRoughEstimate.outputEstimateApprox.toLocaleString()}{" "}
            tok
            {lastRoughEstimate.totalApprox > 8_000 ? (
              <span className="ml-1 text-amber-600 dark:text-amber-400">（高）</span>
            ) : null}
          </span>
        ) : null}
        {selectedExcerptCount > 0 ? (
          <Badge variant="outline" className="text-[10px]">
            风格 {selectedExcerptCount} 条
          </Badge>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-3 py-2">
          <AiInlineErrorNotice message={error} />
        </div>
      ) : null}
    </div>
  );
}
