import type { ChapterBibleFieldKey } from "../../ai/assemble-context";
import type { WritingRagSources } from "../../util/work-rag-runtime";

/** 与 `AiPanel` props.workStyle / onUpdateWorkStyle 对齐，供拆分的子组件复用 */
export type AiPanelWorkStyle = {
  pov: string;
  tone: string;
  bannedPhrases: string;
  styleAnchor: string;
  extraRules: string;
  sentenceRhythm?: string;
  punctuationStyle?: string;
  dialogueDensity?: "low" | "medium" | "high";
  emotionStyle?: "cold" | "neutral" | "warm";
  narrativeDistance?: "omniscient" | "limited" | "deep_pov";
};

export type AiPanelWorkStylePatch = Partial<AiPanelWorkStyle>;

/** 本书级写作变量（与 `AiPanel` / 设定 Tab 共享） */
export type AiPanelWorkWritingVars = {
  storyBackground: string;
  characters: string;
  relations: string;
  skillPreset: "none" | "tight" | "dialogue" | "describe" | "custom";
  skillText: string;
};

export type AiPanelWorkWritingVarsPatch = Partial<AiPanelWorkWritingVars>;

/** 本书 RAG + 上下文注入默认（不含全局 `includeBible`，该项仍在 `AiSettings`） */
export type AiPanelWorkRagInjectDefaults = {
  ragEnabled: boolean;
  ragWorkSources: WritingRagSources;
  ragK: number;
  includeLinkedExcerpts: boolean;
  includeRecentSummaries: boolean;
  recentN: number;
  neighborSummaryIncludeById: Record<string, boolean>;
  chapterBibleInjectMask: Record<ChapterBibleFieldKey, boolean>;
  workBibleSectionMask: Record<string, boolean>;
  currentContextMode: "full" | "summary" | "selection" | "none";
};

export type AiPanelWorkRagInjectDefaultsPatch = Partial<AiPanelWorkRagInjectDefaults>;
