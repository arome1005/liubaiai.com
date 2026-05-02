import { Info } from "lucide-react";
import type { WritingContextMode } from "../../ai/assemble-context";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

const TOOLTIP =
  "控制侧栏生成时向模型发送的「当前章」材料：全文最费 token；有本章概要时可选概要大幅省 token；选区仅在编辑器有选中内容时有效；不注入则跳过本章正文/概要/选区（仍会发送 system、写作变量、邻章概要等你已在设定里打开的项）。";

export function AiPanelChapterContextSection(props: {
  mode: WritingContextMode;
  onModeChange: (m: WritingContextMode) => void;
  /** 抽卡模式固定走概要+前文尾，与本项无关 */
  disabled?: boolean;
}) {
  const dis = Boolean(props.disabled);
  return (
    <section className="ai-panel-section ai-panel-section--flat" aria-label="正文注入范围">
      <div className="ai-panel-row ai-panel-row--flush">
        <span className="small muted inline-flex items-center gap-0.5">
          <label htmlFor="ai-chapter-ctx-mode" className="inline">
            正文注入范围
          </label>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                aria-label="正文注入范围说明"
              >
                <Info className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[min(22rem,calc(100vw-2rem))] text-xs leading-snug">
              {TOOLTIP}
            </TooltipContent>
          </Tooltip>
        </span>
        <select
          id="ai-chapter-ctx-mode"
          name="aiChapterContextMode"
          value={props.mode}
          disabled={dis}
          title={dis ? "抽卡模式固定使用章节概要 + 前文末尾，不受此项影响" : undefined}
          onChange={(e) => props.onModeChange(e.target.value as WritingContextMode)}
        >
          <option value="full">全文</option>
          <option value="summary">本章概要</option>
          <option value="selection">选区</option>
          <option value="none">不注入</option>
        </select>
      </div>
    </section>
  );
}
