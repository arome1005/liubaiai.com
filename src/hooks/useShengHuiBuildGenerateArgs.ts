import { useCallback } from "react";
import { getChapterBible } from "../db/repo";
import type { Chapter, ReferenceSearchHit, Work, WorkStyleCard } from "../db/types";
import type { AiSettings } from "../ai/types";
import {
  assertShengHuiPrivacy,
  formatSceneStateForPrompt,
  isSceneStateCardEmpty,
  shengHuiEmotionTemperaturePromptLine,
  shengHuiIsTwoStepGenerateMode,
  shengHuiTwoStepPhaseFromIntermediate,
  type BodyTailParagraphCount,
  type SceneStateCard,
  type ShengHuiEmotionTemperature,
  type ShengHuiGenerateMode,
} from "../ai/sheng-hui-generate";
import { formatShengHuiChapterBibleForPrompt } from "../util/sheng-hui-bible-prompt";
import { computeShengHuiChapterBodyTail } from "../util/sheng-hui-body-tail";
import { workStyleCardToWritingSlice } from "../util/work-style-card-to-slice";
import { buildCharacterVoiceLocksForShengHui, type ShengHuiBibleCharRow } from "../util/sheng-hui-voice-lock";
import type { ShengHuiBuildResult } from "./useShengHuiGenerationLifecycle";

/**
 * 传给 `useShengHuiBuildGenerateArgs` 的装配入参；字段与 ShengHui 页内表单/派生一一对应。
 */
export type ShengHuiBuildGenerateParams = {
  workId: string | null;
  work: Work | null;
  isCloudProvider: boolean;
  cloudAllowed: boolean;
  generateMode: ShengHuiGenerateMode;
  outline: string;
  output: string;
  twoStepIntermediate: string | null;
  chapterId: string | null;
  includeBible: boolean;
  includeSummary: boolean;
  // 与 useShengHuiBodyTailPreference 的状态域对齐：`false` 表示「不续接末尾」。
  // computeShengHuiChapterBodyTail 已可直接消费 `false`，不需要在 page 端归一化。
  bodyTailCount: BodyTailParagraphCount | false;
  selectedChapter: Chapter | undefined;
  includeSettingIndex: boolean;
  settingIndexText: string;
  styleCard: WorkStyleCard | undefined;
  // 与 workTagsToProfileText 的返回类型对齐：无 tags 时返回 undefined；
  // 内部 `tagProfileText || undefined` 已兜底，无需在 page 端 `?? ""`。
  tagProfileText: string | undefined;
  ragResults: ReferenceSearchHit[];
  selectedExcerptIds: Set<string>;
  styleFeatures: Map<string, string>;
  sceneState: SceneStateCard;
  lockedCharNames: Set<string>;
  bibleCharacters: ShengHuiBibleCharRow[];
  emotionTemperature: ShengHuiEmotionTemperature;
  targetWords: number;
  settings: AiSettings;
};

/**
 * 装配 `runGenerate` 所需上下文；为 async 以容纳 getChapterBible。
 * 与 `useShengHuiGenerationLifecycle` 通过 **稳定** `buildGenerateArgsStable`（见 `useShengHuiBuildGenerateArgsStable`）桥接，避免子 hook 的依赖链随每次装配而抖动。
 */
export function useShengHuiBuildGenerateArgs(p: ShengHuiBuildGenerateParams) {
  const {
    workId,
    work,
    isCloudProvider,
    cloudAllowed,
    generateMode,
    outline,
    output,
    twoStepIntermediate,
    chapterId,
    includeBible,
    includeSummary,
    bodyTailCount,
    selectedChapter,
    includeSettingIndex,
    settingIndexText,
    styleCard,
    tagProfileText,
    ragResults,
    selectedExcerptIds,
    styleFeatures,
    sceneState,
    lockedCharNames,
    bibleCharacters,
    emotionTemperature,
    targetWords,
    settings,
  } = p;

  return useCallback(async (): Promise<ShengHuiBuildResult> => {
    if (!workId || !work) {
      return { ok: false, error: "请先选择作品。" };
    }
    if (isCloudProvider && !cloudAllowed) {
      return { ok: false, error: "请先在设置中同意云端 AI 并允许调用。" };
    }
    if (generateMode === "write" && !outline.trim()) {
      return { ok: false, error: "按纲仿写模式：请先填写「大纲与文策」。" };
    }
    if ((generateMode === "rewrite" || generateMode === "polish") && !output.trim()) {
      return {
        ok: false,
        error: `${generateMode === "rewrite" ? "重写" : "精炼"}模式需先有草稿内容。`,
      };
    }
    if (shengHuiIsTwoStepGenerateMode(generateMode) && !outline.trim()) {
      return { ok: false, error: "请先填写「大纲与文策」。" };
    }

    const isTwoStep = shengHuiIsTwoStepGenerateMode(generateMode);
    const twoStepPhase = shengHuiTwoStepPhaseFromIntermediate(twoStepIntermediate);

    let bibleFormatted = "";
    if (chapterId && includeBible) {
      const row = await getChapterBible(chapterId);
      bibleFormatted = formatShengHuiChapterBibleForPrompt(row);
    }
    const summary = chapterId && includeSummary ? (selectedChapter?.summary ?? "").trim() : "";
    const chapterContent = (selectedChapter?.content ?? "").trim();
    const effectiveBodyTail = computeShengHuiChapterBodyTail({
      fullChapterText: chapterId ? chapterContent : "",
      bodyTailCount,
      generateMode,
    });

    assertShengHuiPrivacy(settings, {
      includeChapterSummary: Boolean(summary),
      includeBodyContent: Boolean(effectiveBodyTail),
    });

    const referenceStyleExcerpts = ragResults
      .filter((h) => selectedExcerptIds.has(h.chunkId))
      .map((h) => {
        const feature = styleFeatures.get(h.chunkId);
        return feature ? `[笔法特征] ${feature}` : (h.preview ?? "").trim();
      })
      .filter(Boolean);

    const needsDraft = generateMode === "continue" || generateMode === "rewrite" || generateMode === "polish";

    const baseStyle = workStyleCardToWritingSlice(styleCard);
    const emotionLine = shengHuiEmotionTemperaturePromptLine(emotionTemperature);
    const effectiveWorkStyle = {
      ...baseStyle,
      extraRules: [baseStyle.extraRules, emotionLine].filter(Boolean).join("\n"),
    };

    const args = {
      workTitle: work.title.trim() || "未命名",
      chapterTitle: selectedChapter?.title?.trim() || undefined,
      outlineAndStrategy: outline,
      chapterSummary: summary || undefined,
      chapterBodyTail: effectiveBodyTail || undefined,
      chapterBibleFormatted: bibleFormatted || undefined,
      settingIndexText: includeSettingIndex && settingIndexText.trim() ? settingIndexText : undefined,
      workStyle: effectiveWorkStyle,
      tagProfileText: tagProfileText || undefined,
      referenceStyleExcerpts: referenceStyleExcerpts.length > 0 ? referenceStyleExcerpts : undefined,
      generateMode,
      draftToProcess: needsDraft ? (output.trim() || undefined) : undefined,
      targetWordCount: targetWords > 0 ? targetWords : undefined,
      sceneStateText: !isSceneStateCardEmpty(sceneState) ? formatSceneStateForPrompt(sceneState) : undefined,
      characterVoiceLocks: buildCharacterVoiceLocksForShengHui(lockedCharNames, bibleCharacters),
      twoStepPhase: isTwoStep ? twoStepPhase : undefined,
      intermediateResult: isTwoStep && twoStepPhase === 2 ? (twoStepIntermediate ?? undefined) : undefined,
    };

    return {
      ok: true,
      args,
      willSendBibleToCloud: isCloudProvider && Boolean(bibleFormatted.trim()),
      outlineForSnapshotPreview: outline,
    };
  }, [
    workId,
    work,
    isCloudProvider,
    cloudAllowed,
    generateMode,
    outline,
    output,
    twoStepIntermediate,
    chapterId,
    includeBible,
    includeSummary,
    bodyTailCount,
    selectedChapter,
    includeSettingIndex,
    settingIndexText,
    styleCard,
    tagProfileText,
    ragResults,
    selectedExcerptIds,
    styleFeatures,
    sceneState,
    lockedCharNames,
    bibleCharacters,
    emotionTemperature,
    targetWords,
    settings,
  ]);
}
