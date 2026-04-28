import { Link } from "react-router-dom";
import { AiInlineErrorNotice } from "../AiInlineErrorNotice";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { getProviderTemperature } from "../../ai/storage";
import type { AiSettings } from "../../ai/types";
import { cn } from "../../lib/utils";
import {
  MODE_DESCS,
  MODE_LABELS,
  type ShengHuiGenerateMode,
} from "../../ai/sheng-hui-generate";

export function ShengHuiRightComposeBlock(props: {
  generateMode: ShengHuiGenerateMode;
  onGenerateModeChange: (m: ShengHuiGenerateMode) => void;
  onResetTwoStep: () => void;
  twoStepIntermediate: string | null;
  onResetTwoStepIntermediate: () => void;
  targetWords: number;
  onTargetWordsChange: (n: number) => void;
  emotionTemperature: number;
  onEmotionTemperatureChange: (n: number) => void;
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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1 rounded-2xl border border-border/50 bg-card/50 p-1.5 shadow-sm">
        <div className="flex gap-1">
          {(["write", "continue", "rewrite", "polish"] as const).map((m) => (
            <button
              key={m}
              type="button"
              title={MODE_DESCS[m]}
              onClick={() => {
                onGenerateModeChange(m);
                onResetTwoStep();
              }}
              className={cn(
                "flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors",
                generateMode === m
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {(["skeleton", "dialogue_first", "segment"] as const).map((m) => (
            <button
              key={m}
              type="button"
              title={MODE_DESCS[m]}
              onClick={() => {
                onGenerateModeChange(m);
                onResetTwoStep();
              }}
              className={cn(
                "flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors",
                generateMode === m
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/50 bg-card/50 px-3 py-2 shadow-sm">
        <span className="text-[11px] font-semibold text-muted-foreground">参数</span>
        <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          目标字数
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
          <span className="text-[11px] text-muted-foreground/60">字（0=不限）</span>
        </label>
        <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          情绪温度
          <span className="text-[11px] text-muted-foreground/60">克制</span>
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={emotionTemperature}
            disabled={busy}
            onChange={(e) => onEmotionTemperatureChange(Number(e.target.value))}
            className="w-20 accent-primary"
          />
          <span className="text-[11px] text-muted-foreground/60">热烈</span>
          <span className="ml-1 w-4 text-center text-[11px] font-medium text-foreground">{emotionTemperature}</span>
        </label>
        <span className="ml-auto text-[11px] text-muted-foreground/50">
          温度：{getProviderTemperature(settings, settings.provider)}
          {" · "}
          <Link to="/settings" className="underline">
            设置
          </Link>
        </span>
      </div>

      <div className="rounded-2xl border border-border/50 bg-card/50 p-3 shadow-sm">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
            大纲与文策
            {generateMode === "write" ? (
              <span className="text-destructive">*</span>
            ) : (
              <span className="text-muted-foreground/60">（选填）</span>
            )}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-5 px-1.5 text-[11px]"
            disabled={busy || tuiyanImporting || !workId}
            onClick={() => void onImportFromTuiyan()}
            title="从该作品的推演文策条目导入"
          >
            {tuiyanImporting ? "导入中…" : "从推演导入"}
          </Button>
        </div>
        <textarea
          className="input wence-input w-full min-h-[5rem] text-sm"
          rows={generateMode === "write" ? 7 : 4}
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

      {(generateMode === "skeleton" || generateMode === "dialogue_first") && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/50 bg-card/50 px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
          <span
            className={cn(
              "rounded px-1.5 py-0.5 font-medium",
              !twoStepIntermediate ? "bg-primary text-primary-foreground" : "bg-muted",
            )}
          >
            第一步：生成{generateMode === "skeleton" ? "情节节拍" : "对话骨架"}
          </span>
          <span className="text-muted-foreground/40">→</span>
          <span
            className={cn(
              "rounded px-1.5 py-0.5 font-medium",
              twoStepIntermediate ? "bg-primary text-primary-foreground" : "bg-muted",
            )}
          >
            第二步：展开正文
          </span>
          {twoStepIntermediate ? (
            <button
              type="button"
              className="ml-2 text-[11px] text-muted-foreground/60 hover:text-foreground"
              onClick={() => onResetTwoStepIntermediate()}
            >
              重置步骤
            </button>
          ) : null}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/50 bg-card/50 px-3 py-2 shadow-sm">
        {busy ? (
          <Button type="button" variant="secondary" size="sm" onClick={onStop}>
            停止
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={() => void onRunGenerate()}
            disabled={busy || !workId || (generateMode === "write" && !outline.trim())}
          >
            {generateMode === "skeleton" || generateMode === "dialogue_first"
              ? twoStepIntermediate
                ? "第二步：展开正文"
                : `第一步：生成${generateMode === "skeleton" ? "节拍" : "对话骨架"}`
              : MODE_LABELS[generateMode]}
          </Button>
        )}
        {lastRoughEstimate ? (
          <span className="text-[11px] text-muted-foreground">
            粗估：~{lastRoughEstimate.inputApprox.toLocaleString()} + ~{lastRoughEstimate.outputEstimateApprox.toLocaleString()}{" "}
            tokens
          </span>
        ) : null}
        {selectedExcerptCount > 0 ? (
          <Badge variant="outline" className="text-[10px]">
            注入 {selectedExcerptCount} 条风格参考
          </Badge>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-2xl border border-border/50 bg-card/50 px-3 py-2 shadow-sm">
          <AiInlineErrorNotice message={error} />
        </div>
      ) : null}
    </div>
  );
}
