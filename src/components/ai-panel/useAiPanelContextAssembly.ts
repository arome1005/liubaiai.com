import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { exportBibleMarkdown } from "../../db/repo";
import type {
  Chapter,
  ReferenceExcerpt,
  ReferenceSearchHit,
  Work,
} from "../../db/types";
import {
  buildWritingSidepanelContextInputBuckets,
  buildWritingSidepanelMessages,
  type ChapterBibleFieldKey,
  type WritingContextMode,
  type WritingGlossaryTermSlice,
  type WritingSidepanelAssembleInput,
  type WritingSkillMode,
  type WritingStudyCharacterCardSlice,
  type WritingStyleSampleSlice,
} from "../../ai/assemble-context";
import type { AiUsageEventRow } from "../../storage/ai-usage-db";
import { filterWorkBibleMarkdownBySections } from "../../ai/work-bible-sections";
import type { AiChatMessage, AiProviderConfig, AiProviderId, AiSettings } from "../../ai/types";
import { searchWritingRagMerged, type WritingRagSources } from "../../util/work-rag-runtime";
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
  chapters: Chapter[];
  chapterContent: string;
  /**
   * 若父级对正文做了防抖后再传入 `chapterContent`，此处应在发请求前调用以拿到编辑器最新正文
   * （避免用户删改后立即续写仍装配旧段）。
   */
  resolveChapterContentForAi?: () => string;
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
  currentContextMode: WritingContextMode;
  includeLinkedExcerpts: boolean;
  chapterBibleInjectMask: Record<ChapterBibleFieldKey, boolean>;
  workBibleSectionMask: Record<string, boolean>;
  ragEnabled: boolean;
  ragWorkSources: WritingRagSources;
  ragK: number;

  // —— RAG 当前状态 + setters —— //
  ragQuery: string;
  ragHits: ReferenceSearchHit[];
  ragExcluded: ReadonlySet<string>;
  setRagHits: Dispatch<SetStateAction<ReferenceSearchHit[]>>;
  setRagLoading: Dispatch<SetStateAction<boolean>>;

  // —— bible 加载副作用 setters —— //
  setBibleLoading: Dispatch<SetStateAction<boolean>>;
  setBiblePreview: Dispatch<SetStateAction<{ text: string; chars: number } | null>>;

  // —— 已经在外部 useMemo 算好的派生文本 —— //
  /** 来自 `workTagsToProfileText`，签名是 `string | undefined`；下游 `WritingSidepanelAssembleInput.tagProfileText` 也是可选 */
  tagProfileText: string | undefined;
  storyBackground: string;
  characters: string;
  relations: string;
  skillPresetText: string;
  linkedChapterSummaryText: string;
  linkedChapterFullText: string;
  linkedChapters: { summaryChapterIds: string[]; fullChapterIds: string[] } | null;

  // —— 章纲 / 书斋 —— //
  chapterOutlinePaste: string;
  glossarySlices: WritingGlossaryTermSlice[];
  studyCharacterCardSlices: WritingStudyCharacterCardSlice[];
  studyGlossarySlices: WritingGlossaryTermSlice[];
  studyCharacterSource: "cards" | "npc";
  studyNpcText: string;

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
 * 把 `run()` 里「从 bible / RAG / linked / 章纲等组装到 messages + usedProvider + usedProviderCfg」
 * 这一段（约 120 行）整体抽出。包含两个真正的副作用：
 *  - `exportBibleMarkdown(workId)`：拉全书 bible，期间 setBibleLoading/setBiblePreview。
 *  - `searchWritingRagMerged(...)`：实时检索 RAG 命中，期间 setRagLoading/setRagHits。
 *
 * 调用方 `run()` 之后只剩：校验、Abort、`lastReqRef`、`executeStream(...)`。
 */
export function useAiPanelContextAssembly(args: UseAiPanelContextAssemblyArgs) {
  const {
    workId,
    work,
    chapter,
    chapters,
    chapterContent,
    resolveChapterContentForAi,
    chapterBible,
    workStyle,
    linkedExcerptsForChapter,
    styleSampleSlices,
    settings,
    providerCfg,
    isCloudProvider,
    currentContextMode,
    includeLinkedExcerpts,
    chapterBibleInjectMask,
    workBibleSectionMask,
    ragEnabled,
    ragWorkSources,
    ragK,
    ragQuery,
    ragHits,
    ragExcluded,
    setRagHits,
    setRagLoading,
    setBibleLoading,
    setBiblePreview,
    tagProfileText,
    storyBackground,
    characters,
    relations,
    skillPresetText,
    linkedChapterSummaryText,
    linkedChapterFullText,
    linkedChapters,
    chapterOutlinePaste,
    glossarySlices,
    studyCharacterCardSlices,
    studyGlossarySlices,
    studyCharacterSource,
    studyNpcText,
    selectedText,
    composedUserHint,
    runContextOverridesRef,
  } = args;

  const buildAssembledRequest = useCallback(
    async (opts: BuildAssembledRequestOpts): Promise<AiPanelAssembledRequest> => {
      if (!chapter) {
        // 调用方应在外层校验过；防御性兜底
        throw new Error("请先选择章节。");
      }

      const ov = runContextOverridesRef.current;
      runContextOverridesRef.current = null;

      const effMax = ov?.maxContextChars ?? settings.maxContextChars;
      const effIncludeBible =
        ov?.includeBible !== undefined ? ov.includeBible : settings.includeBible;
      const effRag = ov?.ragEnabled !== undefined ? ov.ragEnabled : ragEnabled;
      const effLinked =
        ov?.includeLinkedExcerpts !== undefined
          ? ov.includeLinkedExcerpts
          : includeLinkedExcerpts;
      const effCtxMode = ov?.currentContextMode ?? currentContextMode;

      const qRag = ragQuery.trim();
      const needBibleForRagChunks =
        effRag &&
        !!qRag &&
        ragWorkSources.workBibleExport &&
        (!isCloudProvider || settings.privacy.allowRagSnippets);

      let bibleRaw = "";
      const needBibleFull = effIncludeBible && (!isCloudProvider || settings.privacy.allowBible);
      if (needBibleFull || needBibleForRagChunks) {
        if (needBibleFull) {
          try {
            setBibleLoading(true);
            bibleRaw = await exportBibleMarkdown(workId);
            setBiblePreview({ text: bibleRaw, chars: bibleRaw.length });
          } finally {
            setBibleLoading(false);
          }
        } else {
          bibleRaw = await exportBibleMarkdown(workId);
        }
      }
      const bibleForPrompt =
        effIncludeBible && bibleRaw.trim()
          ? filterWorkBibleMarkdownBySections(bibleRaw, workBibleSectionMask)
          : "";

      let ragHitsForRequest: ReferenceSearchHit[] = effRag
        ? ragHits.filter((h) => !ragExcluded.has(h.chunkId))
        : [];
      if (effRag && (!isCloudProvider || settings.privacy.allowRagSnippets) && qRag) {
        try {
          setRagLoading(true);
          const hits = await searchWritingRagMerged({
            workId,
            query: qRag,
            limit: Math.max(1, Math.min(20, ragK)),
            sources: ragWorkSources,
            chapters,
            progressCursorChapterId: work.progressCursor,
            excludeManuscriptChapterId: chapter.id ?? null,
            bibleMarkdownOverride: bibleRaw.trim() ? bibleRaw : undefined,
          });
          setRagHits(hits);
          ragHitsForRequest = hits.filter((h) => !ragExcluded.has(h.chunkId));
        } finally {
          setRagLoading(false);
        }
      }

      const linkedForAssemble = effLinked
        ? linkedExcerptsForChapter.map((e) => ({ refTitle: e.refTitle, text: e.text }))
        : [];
      const linkedChapterSummariesForAssemble = linkedChapterSummaryText;
      const linkedChapterFullForAssemble = linkedChapterFullText;

      const chapterOutlineForAssemble = opts.outlineOverride ?? chapterOutlinePaste;
      const effectiveChapterContent = resolveChapterContentForAi?.() ?? chapterContent;
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
        linkedChapterSummaryText: linkedChapterSummariesForAssemble,
        linkedChapterFullText: linkedChapterFullForAssemble,
        linkedChapterSummaryCount: linkedChapters?.summaryChapterIds.length ?? 0,
        linkedChapterFullCount: linkedChapters?.fullChapterIds.length ?? 0,
        ragEnabled: effRag,
        ragQuery,
        ragK,
        ragHits: ragHitsForRequest,
        ragSources: ragWorkSources,
        chapterContent: effectiveChapterContent,
        chapterSummary: chapter.summary,
        selectedText,
        currentContextMode: effCtxMode,
        userHint: composedUserHint,
        mode: opts.mode,
        chapterOutlinePaste: chapterOutlineForAssemble,
        styleSamples: styleSampleSlices,
        glossaryTerms: glossarySlices,
        chapterStudyCharacterCards: studyCharacterCardSlices,
        chapterStudyNpcNotes: studyCharacterSource === "npc" ? studyNpcText : "",
        studyGlossaryMode: "chapter_pick",
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
      chapters,
      chapterContent,
      resolveChapterContentForAi,
      chapterBible,
      workStyle,
      linkedExcerptsForChapter,
      styleSampleSlices,
      settings,
      providerCfg,
      isCloudProvider,
      currentContextMode,
      includeLinkedExcerpts,
      chapterBibleInjectMask,
      workBibleSectionMask,
      ragEnabled,
      ragWorkSources,
      ragK,
      ragQuery,
      ragHits,
      ragExcluded,
      setRagHits,
      setRagLoading,
      setBibleLoading,
      setBiblePreview,
      tagProfileText,
      storyBackground,
      characters,
      relations,
      skillPresetText,
      linkedChapterSummaryText,
      linkedChapterFullText,
      linkedChapters,
      chapterOutlinePaste,
      glossarySlices,
      studyCharacterCardSlices,
      studyGlossarySlices,
      studyCharacterSource,
      studyNpcText,
      selectedText,
      composedUserHint,
      runContextOverridesRef,
    ],
  );

  return { buildAssembledRequest };
}
