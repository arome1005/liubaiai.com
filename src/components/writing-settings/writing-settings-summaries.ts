import type { AiPanelWorkRagInjectDefaults, AiPanelWorkStyle, AiPanelWorkWritingVars } from "../ai-panel/types";

/** 统计风格卡里已有内容的文本项数量（不含「高级指纹」里的枚举默认值推断）。 */
export function countWorkStyleFilledFields(ws: AiPanelWorkStyle): number {
  const texts = [
    ws.pov,
    ws.tone,
    ws.bannedPhrases,
    ws.styleAnchor,
    ws.extraRules,
    ws.sentenceRhythm,
    ws.punctuationStyle,
  ];
  return texts.filter((s) => (s ?? "").trim().length > 0).length;
}

export function summarizeWorkStyle(ws: AiPanelWorkStyle): string {
  const n = countWorkStyleFilledFields(ws);
  if (n === 0) return "未填写";
  return `已填 ${n} 项`;
}

export function summarizeWritingVars(wv: AiPanelWorkWritingVars): string {
  let n = [wv.storyBackground, wv.characters, wv.relations, wv.skillText].filter((s) => s.trim().length > 0).length;
  if (wv.skillPreset !== "none") n += 1;
  if (n === 0) return "未填写";
  return `已填 ${n} 项`;
}

export function summarizeRagDefaults(ri: AiPanelWorkRagInjectDefaults): string {
  return ri.ragEnabled ? `开 · top-${ri.ragK}` : "已关闭";
}

export function summarizeInjectDefaults(ri: AiPanelWorkRagInjectDefaults, includeBibleGlobal: boolean): string {
  const bits: string[] = [];
  bits.push(includeBibleGlobal ? "锦囊开" : "锦囊关");
  bits.push(ri.includeLinkedExcerpts ? "摘录开" : "摘录关");
  return bits.join(" · ");
}
