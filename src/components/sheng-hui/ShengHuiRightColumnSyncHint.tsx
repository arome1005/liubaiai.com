import { Link } from "react-router-dom";
import { PanelLeftOpen } from "lucide-react";
import { Button } from "../ui/button";

export interface ShengHuiRightColumnSyncHintProps {
  /** 宽屏且左侧已收起时，提供展开入口 */
  isLg: boolean;
  leftExpanded: boolean;
  onExpandLeft: () => void;
  contextSummary: string;
  ragSummary: string;
  targetWords: number;
  emotionTemperature: number;
  modelTemperatureLabel: string;
}

/**
 * 与右侧「仿写/素材」只读同步摘要；实际编辑在对应 Tab，本面板作概览与快捷展开章节目录。
 */
export function ShengHuiRightColumnSyncHint({
  isLg,
  leftExpanded,
  onExpandLeft,
  contextSummary,
  ragSummary,
  targetWords,
  emotionTemperature,
  modelTemperatureLabel,
}: ShengHuiRightColumnSyncHintProps) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">说明</p>
      <p className="text-[11px] leading-relaxed text-muted-foreground/90">
        <strong className="font-medium text-foreground/80">上下文注入、藏经风格参考、场景与人物</strong>{" "}
        请在右侧「素材」中调整；模式、大纲与生成在「仿写」。
      </p>

      {isLg && !leftExpanded ? (
        <Button type="button" variant="secondary" size="sm" className="w-full text-xs" onClick={onExpandLeft}>
          <PanelLeftOpen className="mr-1.5 size-3.5" />
          展开章节目录
        </Button>
      ) : null}

      <div className="rounded-xl border border-border/50 bg-background/50 p-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">仿写·参数（只读摘要）</p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-foreground/85">
          目标 {targetWords > 0 ? `约 ${targetWords.toLocaleString()} 字` : "不限字数"} · 情绪档 {emotionTemperature}
          /5 · 模型温度 {modelTemperatureLabel}
        </p>
        <p className="mt-1 text-[10px] text-muted-foreground/80">改目标字数、情绪与温度请用右侧「仿写」与设置链接。</p>
      </div>

      <div className="rounded-xl border border-border/50 bg-background/50 p-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">当前·上下文（只读）</p>
        <p className="mt-1.5 break-words text-[11px] leading-relaxed text-foreground/85">{contextSummary}</p>
      </div>

      <div className="rounded-xl border border-border/50 bg-background/50 p-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">藏经·风格参考</p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-foreground/85">{ragSummary}</p>
      </div>

      <p className="text-[10px] leading-relaxed text-muted-foreground/75">
        全局模型与 API：{" "}
        <Link to="/settings" className="text-primary underline">
          设置
        </Link>
      </p>
    </div>
  );
}
