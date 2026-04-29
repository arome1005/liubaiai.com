import { useEffect } from "react";
import { toast } from "sonner";
import { clearShengHuiEditorHandoff, readShengHuiEditorHandoff } from "../util/sheng-hui-editor-handoff";
import type { ShengHuiGenerateMode } from "../ai/sheng-hui-generate";
import type { ShengHuiRightPanelTab } from "../components/sheng-hui/sheng-hui-right-panel-types";

type SetMode = (m: ShengHuiGenerateMode) => void;

/**
 * 页级 loading 结束且 work/chapter 已就绪时，消费 session 手传（写作台选区 / 藏经命中段等），写入主稿 + 模式（挂于快照/主稿草稿之后，最后生效）。
 */
export function useShengHuiEditorHandoffConsume(args: {
  loading: boolean;
  workId: string | null;
  chapterId: string | null;
  setOutput: (s: string) => void;
  setGenerateMode: SetMode;
  setRightPanelTab: (t: ShengHuiRightPanelTab) => void;
}) {
  const { loading, workId, chapterId, setOutput, setGenerateMode, setRightPanelTab } = args;

  useEffect(() => {
    if (loading || !workId || !chapterId) return;
    const p = readShengHuiEditorHandoff();
    if (!p) return;
    if (p.workId !== workId || p.chapterId !== chapterId) return;
    setOutput(p.outputSeed);
    setGenerateMode(p.generateMode);
    setRightPanelTab("compose");
    clearShengHuiEditorHandoff();
    toast.success(
      p.generateMode === "continue"
        ? "已载入主稿种子。续写模式可补「大纲与文策」后生成，或保持仅有草稿时直接续写。"
        : "已载入主稿内容，可在仿写区确认模式后生成。",
    );
  }, [loading, workId, chapterId, setOutput, setGenerateMode, setRightPanelTab]);
}
