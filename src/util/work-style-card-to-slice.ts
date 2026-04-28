import type { WritingWorkStyleSlice } from "../ai/assemble-context";
import type { WorkStyleCard } from "../db/types";

const EMPTY_BASE: WritingWorkStyleSlice = {
  pov: "",
  tone: "",
  bannedPhrases: "",
  styleAnchor: "",
  extraRules: "",
};

/**
 * 将储存在库中的 `WorkStyleCard` 转为装配器用的 `WritingWorkStyleSlice`（含风格指纹五维）。
 * 全书笔感卡、生辉、问策等应共用此函数，避免漏字段造成「写作页填了、其他模块没注入」。
 */
export function workStyleCardToWritingSlice(card: WorkStyleCard | undefined): WritingWorkStyleSlice {
  if (!card) return { ...EMPTY_BASE };
  return {
    pov: card.pov ?? "",
    tone: card.tone ?? "",
    bannedPhrases: card.bannedPhrases ?? "",
    styleAnchor: card.styleAnchor ?? "",
    extraRules: card.extraRules ?? "",
    sentenceRhythm: card.sentenceRhythm,
    punctuationStyle: card.punctuationStyle,
    dialogueDensity: card.dialogueDensity,
    emotionStyle: card.emotionStyle,
    narrativeDistance: card.narrativeDistance,
  };
}
