import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { exportBibleMarkdown } from "../../db/repo";
import type {
  Chapter,
  ReferenceExcerpt,
  Work,
} from "../../db/types";
import {
  buildWritingSidepanelContextInputBuckets,
  buildWritingSidepanelMessages,
  type ChapterBibleFieldKey,
  type WritingGlossaryTermSlice,
  type WritingSidepanelAssembleInput,
  type WritingSkillMode,
  type WritingStudyCharacterCardSlice,
  type WritingStyleSampleSlice,
} from "../../ai/assemble-context";
import type { AiUsageEventRow } from "../../storage/ai-usage-db";
import { filterWorkBibleMarkdownBySections } from "../../ai/work-bible-sections";
import type { AiChatMessage, AiProviderConfig, AiProviderId, AiSettings } from "../../ai/types";
import type { AiRunContextOverrides } from "../../util/ai-degrade-retry";
import type { AiPanelWorkStyle } from "./types";

/** 单次 run 真正发请求所需的 messages + provider 三元组 */
export interface AiPanelAssembledRequest {
  provider: AiProviderId;
  providerCfg: AiProviderConfig;
  messages: AiChatMessage[];
  /** 与装配器同源；供 `usageLog.contextInputBuckets` 精确分桶 */
  contextInputBuckets?: AiUsageEventRow["contextInputBuckets"];
}

interface UseAiPanelContextAssemblyArgs {
  // —— props 来源 —— //
  workId: string;
  work: Work;
  chapter: Chapter | null;
  chapterBible: {
    goalText: string;
    forbidText: string;
    povText: string;
    sceneStance: string;
    characterStateText: string;
  };
  workStyle: AiPanelWorkStyle;
  linkedExcerptsForChapter: Array<ReferenceExcerpt & { refTitle: string; tagIds: string[] }>;
  styleSampleSlices: WritingStyleSampleSlice[];

  // —— settings / provider —— //
  settings: AiSettings;
  providerCfg: AiProviderConfig;
  isCloudProvider: boolean;

  // —— 注入默认（来自 workRagInjectDefaults） —— //
  includeLinkedExcerpts: boolean;
  chapterBibleInjectMask: Record<ChapterBibleFieldKey, boolean>;
  workBibleSectionMask: Record<string, boolean>;

  // —— bible 加载副作用 setters —— //
  setBibleLoading: Dispatch<SetStateAction<boolean>>;
  setBiblePreview: Dispatch<SetStateAction<{ text: string; chars: number } | null>>;

  // —— 已经在外部 useMemo 算好的派生文本 —— //
  /** 来自 `workTagsToProfileText`，签名是 `string | undefined` */
  tagProfileText: string | undefined;
  storyBackground: string;
  characters: string;
  relations: string;
  skillPresetText: string;

  // —— 章纲 / 书斋 —— //
  chapterOutlinePaste: string;
  /** 书斋中明确选取的人物卡切片（只有明确关联才进模型） */
  studyCharacterCardSlices: WritingStudyCharacterCardSlice[];
  /** 书斋中明确选取的词条切片（只有明确关联才进模型） */
  studyGlossarySlices: WritingGlossaryTermSlice[];
  studyCharacterSource: "cards" | "npc";
  studyNpcText: string;

  /** 知识库 · 关联章节（已由 AiPanel 按 `maxContextChars` 预切片） */
  linkedChaptersSummaryBlock: string;
  linkedChaptersFullBlock: string;

  // —— 其它 —— //
  selectedText: string;
  composedUserHint: string;

  // —— 降级重试一次性覆盖 —— //
  runContextOverridesRef: MutableRefObject<AiRunContextOverrides | null>;
}

export interface BuildAssembledRequestOpts {
  mode: WritingSkillMode;
  outlineOverride?: string;
}

/**
 * 把 `run()` 里「从 bible / 书斋 / 章纲等组装到 messages + usedProvider + usedProviderCfg」
 * 这一段整体抽出。主要副作用：
 *  - `exportBibleMarkdown(workId)`：仅当 `includeBible` 开启时拉全书 bible。
 *
 * 发送规则（极简可控）：
 *  - 正文区、章纲页 → 不进模型
 *  - 人物卡/词条卡 → 仅书斋中明确选取的
 *  - 全书锦囊/关联摘录 → 仅设定中明确开启的
 *  - 细纲/剧情（右栏粘贴框）→ 始终是主输入
 *  - 知识库 · 关联章节（概要/正文）→ 仅用户在该面板勾选后注入；正文关联中章序靠后者仅送末尾以衔接新章
 */
export function useAiPanelContextAssembly(args: UseAiPanelContextAssemblyArgs) {
  const {
    workId,
    work,
    chapter,
    chapterBible,
    workStyle,
    linkedExcerptsForChapter,
    styleSampleSlices,
    settings,
    providerCfg,
    isCloudProvider,
    includeLinkedExcerpts,
    chapterBibleInjectMask,
    workBibleSectionMask,
    setBibleLoading,
    setBiblePreview,
    tagProfileText,
    storyBackground,
    characters,
    relations,
    skillPresetText,
    chapterOutlinePaste,
    studyCharacterCardSlices,
    studyGlossarySlices,
    studyCharacterSource,
    studyNpcText,
    linkedChaptersSummaryBlock,
    linkedChaptersFullBlock,
    selectedText,
    composedUserHint,
    runContextOverridesRef,
  } = args;

  const buildAssembledRequest = useCallback(
    async (opts: BuildAssembledRequestOpts): Promise<AiPanelAssembledRequest> => {
      if (!chapter) {
        throw new Error("请先选择章节。");
      }

      const ov = runContextOverridesRef.current;
      runContextOverridesRef.current = null;

      const effMax = ov?.maxContextChars ?? settings.maxContextChars;
      const effIncludeBible =
        ov?.includeBible !== undefined ? ov.includeBible : settings.includeBible;
      const effLinked =
        ov?.includeLinkedExcerpts !== undefined
          ? ov.includeLinkedExcerpts
          : includeLinkedExcerpts;

      let bibleRaw = "";
      const needBibleFull = effIncludeBible && (!isCloudProvider || settings.privacy.allowBible);
      if (needBibleFull) {
        try {
          setBibleLoading(true);
          bibleRaw = await exportBibleMarkdown(workId);
          setBiblePreview({ text: bibleRaw, chars: bibleRaw.length });
        } finally {
          setBibleLoading(false);
        }
      }
      const bibleForPrompt =
        effIncludeBible && bibleRaw.trim()
          ? filterWorkBibleMarkdownBySections(bibleRaw, workBibleSectionMask)
          : "";

      const linkedForAssemble = effLinked
        ? linkedExcerptsForChapter.map((e) => ({ refTitle: e.refTitle, text: e.text }))
        : [];

      const chapterOutlineForAssemble = opts.outlineOverride ?? chapterOutlinePaste;
      const assembleInput: WritingSidepanelAssembleInput = {
        workStyle,
        tagProfileText,
        workTitle: work.title,
        chapterTitle: chapter.title,
        storyBackground,
        characters,
        relations,
        chapterBible,
        chapterBibleInjectMask,
        workBibleSectionMask,
        skillPresetText,
        includeLinkedExcerpts: effLinked,
        linkedExcerpts: linkedForAssemble,
        maxContextChars: effMax,
        isCloudProvider,
        privacy: settings.privacy,
        includeBible: effIncludeBible,
        bibleMarkdown: bibleForPrompt,
        selectedText,
        userHint: composedUserHint,
        mode: opts.mode,
        chapterOutlinePaste: chapterOutlineForAssemble,
        linkedChaptersSummaryBlock,
        linkedChaptersFullBlock,
        styleSamples: styleSampleSlices,
        chapterStudyCharacterCards: studyCharacterCardSlices,
        chapterStudyNpcNotes: studyCharacterSource === "npc" ? studyNpcText : "",
        chapterStudyGlossaryTerms: studyGlossarySlices,
      };

      const messages = buildWritingSidepanelMessages(assembleInput);
      return {
        provider: settings.provider,
        providerCfg,
        messages,
        contextInputBuckets: buildWritingSidepanelContextInputBuckets(assembleInput),
      };
    },
    [
      workId,
      work,
      chapter,
      chapterBible,
      workStyle,
      linkedExcerptsForChapter,
      styleSampleSlices,
      settings,
      providerCfg,
      isCloudProvider,
      includeLinkedExcerpts,
      chapterBibleInjectMask,
      workBibleSectionMask,
      setBibleLoading,
      setBiblePreview,
      tagProfileText,
      storyBackground,
      characters,
      relations,
      skillPresetText,
      chapterOutlinePaste,
      studyCharacterCardSlices,
      studyGlossarySlices,
      studyCharacterSource,
      studyNpcText,
      linkedChaptersSummaryBlock,
      linkedChaptersFullBlock,
      selectedText,
      composedUserHint,
      runContextOverridesRef,
    ],
  );

  return { buildAssembledRequest };
}
