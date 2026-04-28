import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import type {
  BibleCharacter,
  BibleGlossaryTerm,
  GlobalPromptTemplate,
  ReferenceExcerpt,
  Work,
  Chapter,
} from "../db/types";
import { approxRoughTokenCount } from "../ai/approx-tokens";
import { resetSessionApproxTokens } from "../ai/sidepanel-session-tokens";
import {
  buildWritingSidepanelInjectBlocks,
  buildWritingSidepanelMaterialsSummaryLines,
  buildWritingSidepanelMessages,
  type ChapterBibleFieldKey,
  validateDrawCardRequest,
  type WritingSidepanelAssembleInput,
  type WritingSkillMode,
  type WritingStyleSampleSlice,
  type WritingGlossaryTermSlice,
} from "../ai/assemble-context";
import { filterWorkBibleMarkdownBySections } from "../ai/work-bible-sections";
import { getProviderConfig, loadAiSettings, saveAiSettings } from "../ai/storage";
import type { AiChatMessage, AiProviderConfig, AiProviderId, AiSettings } from "../ai/types";
import { resolveInjectionConfirmPrompt } from "../util/ai-injection-confirm";
import { CostGateModal } from "./CostGateModal";
import { buildContextDegradeOverrides } from "../util/ai-degrade-retry";
import { normalizeWorkTagList, workTagsToProfileText } from "../util/work-tags";
import { useAiPanelToneDrift } from "./ai-panel/useAiPanelToneDrift";
import { useAiPanelStudySelection } from "./ai-panel/useAiPanelStudySelection";
import type { WritingRagSources } from "../util/work-rag-runtime";
import { AiDraftMergeDialog, type AiDraftMergePayload } from "./AiDraftMergeDialog";
import { AiInlineErrorNotice } from "./AiInlineErrorNotice";
import { AiPanelWritingPromptsRow } from "./ai-panel/AiPanelWritingPromptsRow";
import { renderPromptTemplate } from "../util/render-prompt-template";
import { loadChapterTargetWordCount, saveChapterTargetWordCount } from "../util/chapter-target-wordcount-storage";
import type { AiUsageEventRow } from "../storage/ai-usage-db";
import { isLocalAiProvider } from "../ai/local-provider";
import { AiPanelRagSection } from "./ai-panel/AiPanelRagSection";
import { AiPanelStudyChapterSection } from "./ai-panel/AiPanelStudyChapterSection";
import { useOutlineSource } from "./ai-panel/useOutlineSource";
import { useAiPanelDraftHistory } from "./ai-panel/useAiPanelDraftHistory";
import { useAiPanelRunState } from "./ai-panel/useAiPanelRunState";
import { useAiPanelStreamingRun } from "./ai-panel/useAiPanelStreamingRun";
import { useAiPanelOutlineBodyStreamRun } from "./ai-panel/useAiPanelOutlineBodyStreamRun";
import { estimateMaxOutputTokensForTargetChineseChars } from "../ai/writing-body-output-budget";
import { useAiPanelContextAssembly } from "./ai-panel/useAiPanelContextAssembly";
import { useAiPanelRagSession } from "./ai-panel/useAiPanelRagSession";
import { AiPanelModelPickerDialog } from "./ai-panel/AiPanelModelPickerDialog";
import { PROVIDER_UI, providerLogoImgSrc } from "./ai-panel/provider-ui";
import { OutlineGenerationDialog } from "./ai-panel/OutlineGenerationDialog";
import { AiPanelHistoryDialog } from "./ai-panel/AiPanelHistoryDialog";
import { LINKED_CHAPTERS_UPDATED_EVENT, loadLinkedChapters } from "../util/linked-chapters-storage";
import {
  CHAPTER_OUTLINE_PASTE_UPDATED_EVENT,
  loadChapterOutlinePaste,
  saveChapterOutlinePaste,
} from "../util/chapter-outline-paste-storage";
import type {
  AiPanelWorkRagInjectDefaults,
  AiPanelWorkRagInjectDefaultsPatch,
  AiPanelWorkWritingVars,
  AiPanelWorkWritingVarsPatch,
} from "./ai-panel/types";
import { Bot } from "lucide-react";

export const AiPanel = memo(function AiPanelBase(props: {
  onClose: () => void;
  /** 在右侧栏壳层内使用时隐藏标题行（避免重复两行标题） */
  hideHeader?: boolean;
  /**
   * 递增时触发一次：打开侧栏后由父组件递增；本面板切到「续写」并立即 `run`（结果仅进侧栏草稿，不写入正文）。
   * 总体规划 §11 步 17。
   */
  continueRunTick?: number;
  /** 父级已消费的 tick，避免 AiPanel 重挂载时对同一 tick 重复 run */
  lastContinueConsumedTick?: number;
  onContinueRunConsumed?: (tick: number) => void;
  /** §11 步 18：递增则切「抽卡」并自动 run（无额外提示词；概要+前文尾 → 草稿） */
  drawRunTick?: number;
  lastDrawConsumedTick?: number;
  onDrawRunConsumed?: (tick: number) => void;
  /** 锦囊「提示词」跳转：一次性覆盖侧栏「额外要求」 */
  prefillUserHint?: string | null;
  onPrefillUserHintConsumed?: () => void;
  workId: string;
  work: Work;
  chapter: Chapter | null;
  chapters: Chapter[];
  chapterContent: string;
  chapterBible: {
    goalText: string;
    forbidText: string;
    povText: string;
    sceneStance: string;
    characterStateText: string;
  };
  glossaryTerms: BibleGlossaryTerm[];
  /** 书斋：锦囊「人物卡」同源数据（整书） */
  bibleCharacters: BibleCharacter[];
  /** §11 步 43：锦囊「笔感」页维护的参考段落 */
  styleSampleSlices: WritingStyleSampleSlice[];
  workStyle: { pov: string; tone: string; bannedPhrases: string; styleAnchor: string; extraRules: string; sentenceRhythm?: string; punctuationStyle?: string; dialogueDensity?: "low" | "medium" | "high"; emotionStyle?: "cold" | "neutral" | "warm"; narrativeDistance?: "omniscient" | "limited" | "deep_pov" };
  onUpdateWorkStyle: (patch: Partial<{ pov: string; tone: string; bannedPhrases: string; styleAnchor: string; extraRules: string; sentenceRhythm?: string; punctuationStyle?: string; dialogueDensity?: "low" | "medium" | "high"; emotionStyle?: "cold" | "neutral" | "warm"; narrativeDistance?: "omniscient" | "limited" | "deep_pov" }>) => void;
  workWritingVars: AiPanelWorkWritingVars;
  onWorkWritingVarsChange: (patch: AiPanelWorkWritingVarsPatch) => void;
  workRagInjectDefaults: AiPanelWorkRagInjectDefaults;
  onWorkRagInjectDefaultsChange: (patch: AiPanelWorkRagInjectDefaultsPatch) => void;
  linkedExcerptsForChapter: Array<ReferenceExcerpt & { refTitle: string; tagIds: string[] }>;
  getSelectedText: () => string;
  insertAtCursor: (text: string) => void;
  appendToEnd: (text: string) => void;
  replaceSelection: (text: string) => void;
  /**
   * 在「插入正文 / 追加章尾 / 替换选区」之前调用：
   * 若左侧侧栏当前在「章纲」页签，则切到「章节正文」以确保中部正文区可见。
   */
  ensureChapterViewBeforeInsert?: () => void;
  /** 同步「本次生成 · 使用材料（简版）」行，供正文工具栏悬停简报 */
  onMaterialsSummaryLinesChange?: (lines: string[]) => void;
  /** 运行模式由侧栏「设定」托管，与 `EditorPage` 状态同步 */
  writingSkillMode: WritingSkillMode;
  onWritingSkillModeChange: (m: WritingSkillMode) => void;
  /**
   * 点击「从章纲拉取」时请求父组件打开选择弹窗（父组件拥有章纲树 + 弹窗）。
   * 确认拉取后父组件会调用 `saveChapterOutlinePaste` 并派发
   * `CHAPTER_OUTLINE_PASTE_UPDATED_EVENT`，本面板监听事件自动回填输入框。
   */
  onRequestPullOutline?: () => void;
  /** 章纲树是否为空：用于让「从章纲拉取」按钮禁用并给出提示。 */
  outlineEntriesCount?: number;
}) {
  const {
    storyBackground,
    characters,
    relations,
    skillPreset,
    skillText,
  } = props.workWritingVars;

  const ri = props.workRagInjectDefaults;
  const includeLinkedExcerpts = ri.includeLinkedExcerpts;
  const includeRecentSummaries = ri.includeRecentSummaries;
  const recentN = ri.recentN;
  const neighborSummaryIncludeById = ri.neighborSummaryIncludeById;
  const chapterBibleInjectMask = ri.chapterBibleInjectMask;
  const workBibleSectionMask = ri.workBibleSectionMask;
  const currentContextMode = ri.currentContextMode;
  const ragEnabled = ri.ragEnabled;
  const ragWorkSources = ri.ragWorkSources;
  const ragK = ri.ragK;

  const patchRagInject = props.onWorkRagInjectDefaultsChange;
  const setRagWorkSourcesUp = (up: SetStateAction<WritingRagSources>) => {
    patchRagInject({
      ragWorkSources: typeof up === "function" ? up(ragWorkSources) : up,
    });
  };
  const _setNeighborSummaryIncludeByIdUp = (up: SetStateAction<Record<string, boolean>>) => {
    patchRagInject({
      neighborSummaryIncludeById: typeof up === "function" ? up(neighborSummaryIncludeById) : up,
    });
  };
  void _setNeighborSummaryIncludeByIdUp;
  const _setChapterBibleInjectMaskUp = (up: SetStateAction<Record<ChapterBibleFieldKey, boolean>>) => {
    patchRagInject({
      chapterBibleInjectMask: typeof up === "function" ? up(chapterBibleInjectMask) : up,
    });
  };
  void _setChapterBibleInjectMaskUp;
  const _setWorkBibleSectionMaskUp = (up: SetStateAction<Record<string, boolean>>) => {
    patchRagInject({
      workBibleSectionMask: typeof up === "function" ? up(workBibleSectionMask) : up,
    });
  };
  void _setWorkBibleSectionMaskUp;

  const [settings, setSettings] = useState<AiSettings>(() => loadAiSettings());
  const [chapterOutlinePaste, setChapterOutlinePaste] = useState("");
  const {
    studyPickedCharacterIds,
    setStudyPickedCharacterIds,
    studyPickedGlossaryIds,
    setStudyPickedGlossaryIds,
    studyCharacterSource,
    setStudyCharacterSource,
    studyNpcText,
    setStudyNpcText,
    studyCharacterCardSlices,
    studyGlossarySlices,
    glossaryTermCountForSummary,
  } = useAiPanelStudySelection({
    workId: props.workId,
    chapterId: props.chapter?.id ?? null,
    bibleCharacters: props.bibleCharacters,
    glossaryTerms: props.glossaryTerms,
    chapterContent: props.chapterContent,
    chapterSummary: props.chapter?.summary,
    chapterBibleCharacterStateText: props.chapterBible.characterStateText,
  });
  /** 快捷窗选入的写作风格 / 要求（渲染后的正文），与下方「额外要求」文本框合并后参与组装 */
  const [writingStyleInject, setWritingStyleInject] = useState("");
  const [writingReqInject, setWritingReqInject] = useState("");
  const [selectedStyleTemplateId, setSelectedStyleTemplateId] = useState<string | null>(null);
  const [selectedReqTemplateId, setSelectedReqTemplateId] = useState<string | null>(null);
  const [styleTemplateTitle, setStyleTemplateTitle] = useState<string | null>(null);
  const [reqTemplateTitle, setReqTemplateTitle] = useState<string | null>(null);
  const [styleMode, setStyleMode] = useState<"quick" | "custom">("quick");
  const [reqMode, setReqMode] = useState<"quick" | "custom">("quick");
  const [styleCustomText, setStyleCustomText] = useState("");
  const [reqCustomText, setReqCustomText] = useState("");


  useEffect(() => {
    // 兼容旧入口：仍消费一次性 prefill，但不再显示「额外要求」输入框
    if (props.prefillUserHint == null) return;
    props.onPrefillUserHintConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onPrefillUserHintConsumed intentionally omitted
  }, [props.prefillUserHint]);

  const {
    genPhase, dispatchGenPhase, resetGenPhase,
    busy, setBusy,
    error, setError,
    showDegradeRetry, setShowDegradeRetry,
    mergePayload, setMergePayload,
    costGatePending, setCostGatePending,
    setSessionBudgetUiTick,
    setDailyUsageTick,
    sessionTokensUsed, todayTokensUsed,
    abortRef, lastReqRef, runContextOverridesRef, degradeAttemptedRef,
  } = useAiPanelRunState({ aiSessionApproxTokenBudget: settings.aiSessionApproxTokenBudget });
  /** 细纲来源（manual_paste / outline_pull / mixed / unknown），按章持久化 */
  const { source: outlineSource, markManual: markOutlineSourceManual, markPull: markOutlineSourcePull } =
    useOutlineSource(props.workId, props.chapter?.id ?? null);

  // per-chapter outline/plot paste (manual)
  useEffect(() => {
    if (!props.workId || !props.chapter) {
      setChapterOutlinePaste("");
      return;
    }
    setChapterOutlinePaste(loadChapterOutlinePaste(props.workId, props.chapter.id));
  }, [props.workId, props.chapter?.id]);

  useEffect(() => {
    const on = (e: Event) => {
      const ev = e as CustomEvent<{ workId?: string; chapterId?: string }>;
      if (!props.chapter) return;
      if (ev.detail?.workId === props.workId && ev.detail?.chapterId === props.chapter.id) {
        setChapterOutlinePaste(loadChapterOutlinePaste(props.workId, props.chapter.id));
        markOutlineSourcePull();
      }
    };
    window.addEventListener(CHAPTER_OUTLINE_PASTE_UPDATED_EVENT, on as EventListener);
    return () => window.removeEventListener(CHAPTER_OUTLINE_PASTE_UPDATED_EVENT, on as EventListener);
  }, [props.workId, props.chapter?.id, markOutlineSourcePull]);

  const [draft, setDraft] = useState("");
  const [draftDialogOpen, setDraftDialogOpen] = useState(false);
  /** 生成弹窗当前是否处于「细纲已带入、待点击生成正文」模式 */
  const [draftSeedMode, setDraftSeedMode] = useState(false);
  const {
    draftStorageKey,
    draftHistory,
    setDraftHistory,
    historyDialogOpen,
    setHistoryDialogOpen,
    pushGeneratedDraftHistory,
  } = useAiPanelDraftHistory({
    workId: props.workId,
    chapterId: props.chapter?.id ?? null,
  });

  const { executeStream } = useAiPanelStreamingRun({
    settings,
    workId: props.workId ?? null,
    setError,
    setShowDegradeRetry,
    setDraft,
    setCostGatePending,
    setSessionBudgetUiTick,
    setDailyUsageTick,
    dispatchGenPhase,
    pushGeneratedDraftHistory,
    degradeAttemptedRef,
  });
  const { runOutlineBodyWithContinuation } = useAiPanelOutlineBodyStreamRun(executeStream);
  /** 用户自定义的本章正文字数（0/空 → 不约束）。包含标点。 */
  const [targetWordCount, setTargetWordCount] = useState<number>(0);
  const [biblePreview, setBiblePreview] = useState<{ text: string; chars: number } | null>(null);
  const [bibleLoading, setBibleLoading] = useState(false);
  void bibleLoading;
  const [linkedChaptersTick, setLinkedChaptersTick] = useState(0);

  useEffect(() => {
    function onLinked() {
      setLinkedChaptersTick((x) => x + 1);
    }
    window.addEventListener(LINKED_CHAPTERS_UPDATED_EVENT, onLinked as EventListener);
    return () => window.removeEventListener(LINKED_CHAPTERS_UPDATED_EVENT, onLinked as EventListener);
  }, []);

  const {
    ragQuery,
    setRagQuery,
    ragHits,
    setRagHits,
    ragLoading,
    setRagLoading,
    ragExcluded,
    setRagExcluded,
    runRagPreview,
  } = useAiPanelRagSession({
    workId: props.workId,
    work: props.work,
    chapters: props.chapters,
    activeChapterId: props.chapter?.id ?? null,
    ragK,
    ragWorkSources,
    setError,
  });

  const skipDraftPersistRef = useRef(false);

  useLayoutEffect(() => {
    if (!draftStorageKey) {
      setDraft("");
      setDraftSeedMode(false);
      return;
    }
    skipDraftPersistRef.current = true;
    try {
      setDraft(sessionStorage.getItem(draftStorageKey) ?? "");
    } catch {
      setDraft("");
    }
    setDraftSeedMode(false);
    setTargetWordCount(
      props.workId && props.chapter ? loadChapterTargetWordCount(props.workId, props.chapter.id) : 0,
    );
  }, [draftStorageKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!props.workId || !props.chapter) return;
    saveChapterTargetWordCount(props.workId, props.chapter.id, targetWordCount);
  }, [targetWordCount, props.workId, props.chapter]);

  useEffect(() => {
    if (!draftStorageKey) return;
    if (skipDraftPersistRef.current) {
      skipDraftPersistRef.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      try {
        sessionStorage.setItem(draftStorageKey, draft);
      } catch {
        /* quota */
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [draft, draftStorageKey]);

  const providerCfg = useMemo(() => getProviderConfig(settings, settings.provider), [settings]);

  const isCloudProvider = !isLocalAiProvider(settings.provider);
  const cloudAllowed = !isCloudProvider
    ? true
    : settings.privacy.consentAccepted && settings.privacy.allowCloudProviders;
  const [providerPickerOpen, setProviderPickerOpen] = useState(false);

  const selectedText = useMemo(() => props.getSelectedText(), [props]);

  const promptRenderVars = useMemo(
    () => ({
      work_title: props.work.title ?? "",
      work_tags: (props.work.tags ?? []).join("，"),
      chapter_title: props.chapter?.title ?? "",
      chapter_summary: props.chapter?.summary ?? "",
      chapter_content: props.chapter?.content ?? "",
    }),
    [props.work.title, props.work.tags, props.chapter?.title, props.chapter?.summary, props.chapter?.content],
  );

  const composedUserHint = useMemo(() => {
    const parts: string[] = [];
    const styleText = styleMode === "custom" ? styleCustomText : writingStyleInject;
    const reqText = reqMode === "custom" ? reqCustomText : writingReqInject;
    if (styleText.trim()) parts.push(`【文风】\n${styleText.trim()}`);
    if (reqText.trim()) parts.push(`【要求】\n${reqText.trim()}`);
    if (targetWordCount > 0) {
      // 包含标点；给一个 ±10% 的容忍带，避免模型为了贴字数硬凑或截断
      const lo = Math.max(1, Math.floor(targetWordCount * 0.9));
      const hi = Math.ceil(targetWordCount * 1.1);
      parts.push(
        `【字数】\n请生成约 ${targetWordCount} 字（含中文标点；可在 ${lo}–${hi} 字区间内浮动）的本章正文，不要明显短于该区间。`,
      );
    }
    return parts.join("\n\n");
  }, [writingReqInject, writingStyleInject, styleMode, reqMode, styleCustomText, reqCustomText, targetWordCount]);

  const onStyleTemplatePick = useCallback(
    (t: GlobalPromptTemplate | null) => {
      setSelectedStyleTemplateId(t?.id ?? null);
      setStyleTemplateTitle(t?.title ?? null);
      if (!t) {
        setWritingStyleInject("");
        return;
      }
      setWritingStyleInject(
        renderPromptTemplate(t.body, {
          work_title: promptRenderVars.work_title,
          work_tags: promptRenderVars.work_tags,
          chapter_title: promptRenderVars.chapter_title,
          chapter_summary: promptRenderVars.chapter_summary,
          chapter_content: promptRenderVars.chapter_content,
        }),
      );
    },
    [promptRenderVars],
  );

  const onReqTemplatePick = useCallback(
    (t: GlobalPromptTemplate | null) => {
      setSelectedReqTemplateId(t?.id ?? null);
      setReqTemplateTitle(t?.title ?? null);
      if (!t) {
        setWritingReqInject("");
        return;
      }
      setWritingReqInject(
        renderPromptTemplate(t.body, {
          work_title: promptRenderVars.work_title,
          work_tags: promptRenderVars.work_tags,
          chapter_title: promptRenderVars.chapter_title,
          chapter_summary: promptRenderVars.chapter_summary,
          chapter_content: promptRenderVars.chapter_content,
        }),
      );
    },
    [promptRenderVars],
  );

  const { toneDriftHints, toneEmbedHint, toneEmbedBusy, toneEmbedErr } = useAiPanelToneDrift({
    toneDriftHintEnabled: settings.toneDriftHintEnabled,
    cloudAllowed,
    provider: settings.provider,
    providerCfg,
    bannedPhrases: props.workStyle.bannedPhrases,
    styleAnchor: props.workStyle.styleAnchor,
    draft,
  });

  const sessionBudget = settings.aiSessionApproxTokenBudget;

  const glossaryHitsInDraft = useMemo(() => {
    const text = draft;
    if (!text.trim() || props.glossaryTerms.length === 0) return [];
    const sorted = [...props.glossaryTerms].sort((a, b) => b.term.length - a.term.length);
    const seen = new Set<string>();
    const out: BibleGlossaryTerm[] = [];
    for (const t of sorted) {
      const term = (t.term ?? "").trim();
      if (!term) continue;
      if (text.includes(term) && !seen.has(t.id)) {
        seen.add(t.id);
        out.push(t);
      }
    }
    return out.slice(0, 24);
  }, [draft, props.glossaryTerms]);

  const neighborSummaryPoolChapters = useMemo(() => {
    if (!props.chapter) return [];
    const n = Math.max(0, Math.min(12, recentN));
    if (n <= 0) return [];
    const curOrder = props.chapter.order;
    return [...props.chapters]
      .filter((c) => c.order < curOrder)
      .sort((a, b) => b.order - a.order)
      .slice(0, n)
      .reverse()
      .filter((c) => (c.summary ?? "").trim());
  }, [props.chapter, props.chapters, recentN]);

  const neighborSummaryPoolCount = neighborSummaryPoolChapters.length;
  const neighborSummaryIncludedCount = useMemo(
    () => neighborSummaryPoolChapters.filter((c) => neighborSummaryIncludeById[c.id] !== false).length,
    [neighborSummaryPoolChapters, neighborSummaryIncludeById],
  );

  const recentSummaryText = useMemo(() => {
    if (!props.chapter) return "";
    if (!includeRecentSummaries) return "";
    if (neighborSummaryPoolChapters.length === 0) return "";
    const lines: string[] = [];
    for (const c of neighborSummaryPoolChapters) {
      if (neighborSummaryIncludeById[c.id] === false) continue;
      const s = (c.summary ?? "").trim();
      if (!s) continue;
      lines.push(`## ${c.title}`, s, "");
    }
    return lines.join("\n");
  }, [props.chapter, includeRecentSummaries, neighborSummaryPoolChapters, neighborSummaryIncludeById]);

  const linkedChapters = useMemo(() => {
    void linkedChaptersTick;
    if (!props.workId || !props.chapter) return null;
    return loadLinkedChapters(props.workId, props.chapter.id);
  }, [props.workId, props.chapter?.id, linkedChaptersTick]);

  const linkedChapterSummaryText = useMemo(() => {
    if (!props.chapter || !linkedChapters) return "";
    const ids = new Set(linkedChapters.summaryChapterIds);
    const curId = props.chapter.id;
    const picked = props.chapters
      .filter((c) => c.id !== curId && ids.has(c.id) && (c.summary ?? "").trim())
      .sort((a, b) => b.order - a.order);
    return picked.map((c) => `【#${c.order}｜${c.title}】\n${(c.summary ?? "").trim()}`).join("\n\n---\n\n");
  }, [props.chapter, props.chapters, linkedChapters]);

  const linkedChapterFullText = useMemo(() => {
    if (!props.chapter || !linkedChapters) return "";
    const ids = new Set(linkedChapters.fullChapterIds);
    const curId = props.chapter.id;
    const picked = props.chapters.filter((c) => c.id !== curId && ids.has(c.id) && (c.content ?? "").trim());
    picked.sort((a, b) => b.updatedAt - a.updatedAt);
    return picked
      .map((c) => `【#${c.order}｜${c.title}】\n${(c.content ?? "").trim()}`)
      .join("\n\n---\n\n");
  }, [props.chapter, props.chapters, linkedChapters]);

  const skillPresetText = useMemo(() => {
    if (skillPreset === "tight") return "写作技巧：更紧凑、减少解释性文字，多用具体动作与感官细节；避免空泛形容。";
    if (skillPreset === "dialogue") return "写作技巧：增加对话推动；对话要带信息差与情绪张力；避免无意义寒暄。";
    if (skillPreset === "describe") return "写作技巧：加强场景画面与氛围（光影/声音/气味/触感），并与人物动机联动。";
    if (skillPreset === "custom") return skillText.trim();
    return "";
  }, [skillPreset, skillText]);

  /** 与 `buildWritingSidepanelMessages` 同源字段；材料预览与真实请求一致（步 9 / 15） */
  const tagProfileText = useMemo(() => workTagsToProfileText(props.work.tags), [props.work.tags]);
  const tagCount = useMemo(() => normalizeWorkTagList(props.work.tags)?.length ?? 0, [props.work.tags]);

  const glossarySlices = useMemo((): WritingGlossaryTermSlice[] => {
    return props.glossaryTerms.map((g) => ({
      term: g.term,
      category: g.category,
      note: g.note ?? "",
    }));
  }, [props.glossaryTerms]);


  const styleSampleCountForSummary = useMemo(
    () => props.styleSampleSlices.filter((s) => (s.body ?? "").trim()).length,
    [props.styleSampleSlices],
  );

  const sidepanelAssembleInput = useMemo((): WritingSidepanelAssembleInput | null => {
    if (!props.chapter) return null;
    return {
      workStyle: props.workStyle,
      tagProfileText,
      workTitle: props.work.title,
      chapterTitle: props.chapter.title,
      storyBackground,
      characters,
      relations,
      chapterBible: props.chapterBible,
      skillPresetText,
      includeLinkedExcerpts,
      linkedExcerpts: props.linkedExcerptsForChapter.map((e) => ({ refTitle: e.refTitle, text: e.text })),
      maxContextChars: settings.maxContextChars,
      isCloudProvider,
      privacy: settings.privacy,
      includeBible: settings.includeBible,
      bibleMarkdown:
        settings.includeBible && biblePreview?.text
          ? filterWorkBibleMarkdownBySections(biblePreview.text, workBibleSectionMask)
          : "",
      chapterBibleInjectMask,
      workBibleSectionMask,
      neighborSummaryIncludedCount,
      recentSummaryText,
      includeRecentSummaries,
      linkedChapterSummaryText,
      linkedChapterFullText,
      linkedChapterSummaryCount: linkedChapters?.summaryChapterIds.length ?? 0,
      linkedChapterFullCount: linkedChapters?.fullChapterIds.length ?? 0,
      ragEnabled,
      ragQuery,
      ragK,
      ragHits: ragHits.filter((h) => !ragExcluded.has(h.chunkId)),
      ragSources: ragWorkSources,
      chapterContent: props.chapterContent,
      chapterSummary: props.chapter.summary,
      selectedText,
      currentContextMode,
      userHint: composedUserHint,
      mode: props.writingSkillMode,
      recentN,
      chapterOutlinePaste,
      styleSamples: props.styleSampleSlices,
      glossaryTerms: glossarySlices,
      chapterStudyCharacterCards: studyCharacterCardSlices,
      chapterStudyNpcNotes: studyCharacterSource === "npc" ? studyNpcText : "",
      studyGlossaryMode: "chapter_pick",
      chapterStudyGlossaryTerms: studyGlossarySlices,
    };
  }, [
    props.chapter,
    props.work.title,
    props.chapter?.title,
    props.bibleCharacters,
    props.glossaryTerms,
    props.workWritingVars,
    props.workRagInjectDefaults,
    props.chapterBible,
    skillPresetText,
    props.linkedExcerptsForChapter,
    settings.maxContextChars,
    settings.privacy,
    settings.includeBible,
    isCloudProvider,
    biblePreview?.text,
    neighborSummaryIncludedCount,
    recentSummaryText,
    linkedChapterSummaryText,
    linkedChapterFullText,
    linkedChapters?.summaryChapterIds.length,
    linkedChapters?.fullChapterIds.length,
    ragQuery,
    ragHits,
    ragExcluded,
    props.chapterContent,
    props.chapter?.summary,
    selectedText,
    composedUserHint,
    props.writingSkillMode,
    props.workStyle,
    tagProfileText,
    props.styleSampleSlices,
    glossarySlices,
    chapterOutlinePaste,
    studyCharacterCardSlices,
    studyCharacterSource,
    studyGlossarySlices,
    studyNpcText,
  ]);

  const injectBlocks = useMemo(() => {
    if (!sidepanelAssembleInput) return [];
    return buildWritingSidepanelInjectBlocks(sidepanelAssembleInput, {
      bibleRawLength: biblePreview?.text?.trim() ? biblePreview.chars : undefined,
    });
  }, [sidepanelAssembleInput, biblePreview?.text, biblePreview?.chars]);

  const approxInjectChars = useMemo(() => injectBlocks.reduce((s, b) => s + (b.chars ?? 0), 0), [injectBlocks]);

  /**
   * 注入量预览（点击「本章细纲」标签旁的 tokens 标签时展示）。
   * 不会阻断生成；只是把原阻断式弹窗改成按需查看。
   * 注意：这里用与真实请求相同的装配函数，但 bibleMarkdown 仅在用户已加载时才有；
   * 在用户尚未点过生成时，bible 部分体积可能略偏小，仅作为粗估即可。
   */
  const previewMessagesForInjection = useMemo(() => {
    if (!sidepanelAssembleInput) return null;
    try {
      return buildWritingSidepanelMessages(sidepanelAssembleInput);
    } catch {
      return null;
    }
  }, [sidepanelAssembleInput]);

  const previewInjectionPrompt = useMemo(() => {
    if (!previewMessagesForInjection) return null;
    const willSendBibleToCloud =
      settings.includeBible &&
      isCloudProvider &&
      settings.privacy.allowBible &&
      !!biblePreview?.text?.trim();
    return resolveInjectionConfirmPrompt({
      messages: previewMessagesForInjection,
      settings,
      willSendBibleToCloud,
    });
  }, [previewMessagesForInjection, settings, isCloudProvider, biblePreview?.text]);

  const [tokenInfoOpen, setTokenInfoOpen] = useState(false);

  const approxInjectTokens = useMemo(() => {
    // Bible size is unknown until fetched; we keep it as a small constant signal.
    const s = settings.includeBible ? `${approxInjectChars}\n[BIBLE]` : String(approxInjectChars);
    return approxRoughTokenCount(s);
  }, [approxInjectChars, settings.includeBible]);

  /** 可解释性简版（步 15）：与装配器字段对齐，见 `buildWritingSidepanelMaterialsSummaryLines` */
  const materialsSummaryLines = useMemo(() => {
    if (!props.chapter) return ["未选择章节时不会组装请求。"];
    return buildWritingSidepanelMaterialsSummaryLines({
      workTitle: props.work.title,
      chapterTitle: props.chapter.title,
      providerLabel: PROVIDER_UI[settings.provider]?.label ?? settings.provider,
      modelId: providerCfg.model ?? "",
      workStyle: props.workStyle,
      chapterBible: props.chapterBible,
      includeBible: settings.includeBible,
      isCloudProvider,
      privacy: settings.privacy,
      includeLinkedExcerpts,
      linkedExcerptCount: props.linkedExcerptsForChapter.length,
      includeRecentSummaries,
      recentN,
      currentContextMode,
      skillMode: props.writingSkillMode,
      ragEnabled,
      ragQuery,
      ragK,
      ragSources: ragWorkSources,
      tagProfileText,
      tagCount,
      styleSampleCount: styleSampleCountForSummary,
      glossaryTermCount: glossaryTermCountForSummary,
      studyCharacterCardCount: studyCharacterCardSlices.length,
      studyCharacterSource,
      studyNpcNoteChars: studyNpcText.trim().length,
      studyGlossaryMode: "chapter_pick",
      studyGlossaryPickCount: studyGlossarySlices.filter((g) => (g.term ?? "").trim()).length,
      neighborSummaryPoolCount,
      neighborSummaryIncludedCount,
      chapterBibleInjectMask,
      workBibleSectionMask,
      approxInjectChars,
      approxInjectTokens,
    });
  }, [
    props.chapter,
    props.work.title,
    props.chapter?.title,
    props.chapterBible,
    props.workStyle,
    settings.provider,
    settings.includeBible,
    settings.privacy,
    providerCfg.model,
    includeLinkedExcerpts,
    props.linkedExcerptsForChapter.length,
    includeRecentSummaries,
    recentN,
    currentContextMode,
    props.writingSkillMode,
    ragEnabled,
    ragQuery,
    ragK,
    ragWorkSources,
    isCloudProvider,
    approxInjectChars,
    approxInjectTokens,
    tagProfileText,
    tagCount,
    styleSampleCountForSummary,
    glossaryTermCountForSummary,
    studyCharacterCardSlices.length,
    studyCharacterSource,
    studyGlossarySlices,
    studyNpcText,
    neighborSummaryPoolCount,
    neighborSummaryIncludedCount,
    chapterBibleInjectMask,
    workBibleSectionMask,
  ]);

  useEffect(() => {
    props.onMaterialsSummaryLinesChange?.(materialsSummaryLines);
  }, [materialsSummaryLines, props.onMaterialsSummaryLinesChange]);

  function updateSettings(patch: Partial<AiSettings>) {
    const next: AiSettings = { ...settings, ...patch };
    setSettings(next);
    saveAiSettings(next);
  }

  function updateProvider(p: AiProviderId) {
    updateSettings({ provider: p });
  }

  const { buildAssembledRequest } = useAiPanelContextAssembly({
    workId: props.workId,
    work: props.work,
    chapter: props.chapter,
    chapters: props.chapters,
    chapterContent: props.chapterContent,
    chapterBible: props.chapterBible,
    workStyle: props.workStyle,
    linkedExcerptsForChapter: props.linkedExcerptsForChapter,
    styleSampleSlices: props.styleSampleSlices,
    settings,
    providerCfg,
    isCloudProvider,
    currentContextMode,
    includeRecentSummaries,
    includeLinkedExcerpts,
    recentN,
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
    recentSummaryText,
    linkedChapterSummaryText,
    linkedChapterFullText,
    linkedChapters,
    neighborSummaryIncludedCount,
    chapterOutlinePaste,
    glossarySlices,
    studyCharacterCardSlices,
    studyGlossarySlices,
    studyCharacterSource,
    studyNpcText,
    selectedText,
    composedUserHint,
    runContextOverridesRef,
  });

  async function run(
    input?: { provider: AiProviderId; providerCfg: AiProviderConfig; messages: AiChatMessage[] },
    opts?: { mode?: WritingSkillMode; fromDegrade?: boolean; outlineOverride?: string },
  ) {
    if (!props.chapter) {
      setError("请先选择章节。");
      return;
    }
    if (!input && isCloudProvider && !cloudAllowed) {
      setError(null);
      setProviderPickerOpen(true);
      return;
    }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    setError(null);
    setDraftSeedMode(false);
    setDraft("");
    setShowDegradeRetry(false);
    if (!opts?.fromDegrade) degradeAttemptedRef.current = false;
    // 打开「本章正文生成」弹窗，进入可见状态机
    dispatchGenPhase({ type: "start" });
    setDraftDialogOpen(true);
    const modeForAssemble: WritingSkillMode = opts?.mode ?? props.writingSkillMode;
    try {
      if (!input && modeForAssemble === "draw") {
        const v = validateDrawCardRequest({
          chapterContent: props.chapterContent ?? "",
          chapterSummary: props.chapter?.summary,
          isCloudProvider,
          privacy: settings.privacy,
        });
        if (!v.ok) {
          setError(v.message);
          return;
        }
      }
      let messages: AiChatMessage[];
      let usedProvider: AiProviderId;
      let usedProviderCfg: AiProviderConfig;
      let assembledContextBuckets: AiUsageEventRow["contextInputBuckets"];
      if (input) {
        messages = input.messages;
        usedProvider = input.provider;
        usedProviderCfg = input.providerCfg;
        assembledContextBuckets = undefined;
      } else {
        // 注入量确认改为「细纲标签旁内联展示 + 点击查看详情」，不再阻断生成流程。
        // 仍保留下方的「单次调用预警」与「日预算预警」作为硬护栏。
        // 历史路径：见 design/editor-outline-generate-dialog-implementation-plan-2026-04-26.md。
        const built = await buildAssembledRequest({
          mode: modeForAssemble,
          outlineOverride: opts?.outlineOverride,
        });
        messages = built.messages;
        usedProvider = built.provider;
        usedProviderCfg = built.providerCfg;
        assembledContextBuckets = built.contextInputBuckets;
      }

      lastReqRef.current = { provider: usedProvider, providerCfg: usedProviderCfg, messages };
      if (input) {
        await executeStream({
          provider: usedProvider,
          providerCfg: usedProviderCfg,
          messages,
          signal: ac.signal,
          maxOutputTokens:
            targetWordCount > 0
              ? estimateMaxOutputTokensForTargetChineseChars(targetWordCount)
              : undefined,
        });
      } else {
        const outlineTextForCont = (opts?.outlineOverride ?? chapterOutlinePaste).trim();
        await runOutlineBodyWithContinuation({
          provider: usedProvider,
          providerCfg: usedProviderCfg,
          firstMessages: messages,
          mode: modeForAssemble,
          targetWordCount,
          outlineText: outlineTextForCont,
          signal: ac.signal,
          contextInputBuckets: assembledContextBuckets,
          onPostAllRounds: (full) => {
            pushGeneratedDraftHistory(full);
            dispatchGenPhase({ type: "done" });
          },
        });
      }
    } catch (e) {
      // 仅捕获上下文组装阶段（bible 导出、RAG 检索等）抛出的异常
      const aborted = e instanceof Error && (e.name === "AbortError" || /abort/i.test(e.message));
      if (aborted) {
        dispatchGenPhase({ type: "abort" });
      } else {
        setError(e instanceof Error ? e.message : "AI 调用失败");
        dispatchGenPhase({ type: "error" });
      }
    } finally {
      setBusy(false);
    }
  }

  function runWithDegrade() {
    degradeAttemptedRef.current = true;
    runContextOverridesRef.current = buildContextDegradeOverrides({
      maxContextChars: settings.maxContextChars,
      currentContextMode,
      hasChapterSummary: !!(props.chapter?.summary ?? "").trim(),
    });
    void run(undefined, { fromDegrade: true });
  }

  function confirmDraftMerge(p: AiDraftMergePayload) {
    if (p.kind === "insert") props.insertAtCursor(p.payload);
    else if (p.kind === "append") props.appendToEnd(p.payload);
    else props.replaceSelection(p.after);
    setMergePayload(null);
  }

  const runRef = useRef(run);
  runRef.current = run;

  function openDraftDialogWithOutlineSeed() {
    const seed = chapterOutlinePaste.trim();
    setDraft(seed);
    setDraftSeedMode(true);
    resetGenPhase();
    setDraftDialogOpen(true);
  }
  /** 防 StrictMode / 重挂载对同一 tick 重复 run；与父级 `lastContinueConsumedTick` 配合 */
  const continueLocalStartedRef = useRef(0);
  useEffect(() => {
    const t = props.continueRunTick ?? 0;
    const consumed = props.lastContinueConsumedTick ?? 0;
    if (t === 0 || t === consumed || t === continueLocalStartedRef.current) return;
    continueLocalStartedRef.current = t;
    props.onContinueRunConsumed?.(t);
    props.onWritingSkillModeChange("continue");
    void runRef.current(undefined, { mode: "continue" });
  }, [props.continueRunTick, props.lastContinueConsumedTick, props.onContinueRunConsumed]);

  const drawLocalStartedRef = useRef(0);
  useEffect(() => {
    const t = props.drawRunTick ?? 0;
    const consumed = props.lastDrawConsumedTick ?? 0;
    if (t === 0 || t === consumed || t === drawLocalStartedRef.current) return;
    drawLocalStartedRef.current = t;
    props.onDrawRunConsumed?.(t);
    props.onWritingSkillModeChange("draw");
    void runRef.current(undefined, { mode: "draw" });
  }, [props.drawRunTick, props.lastDrawConsumedTick, props.onDrawRunConsumed]);

  return (
    <aside className="ai-panel" aria-label="AI 面板">
      {props.hideHeader ? null : (
        <div className="ai-panel-head">
          <strong>AI</strong>
          <button type="button" className="icon-btn" title="关闭" onClick={props.onClose}>
            ×
          </button>
        </div>
      )}

      <div className="ai-panel-body-stack">
        <section className="ai-panel-section ai-panel-section--flat" aria-label="AI 模型选择">
          <div className="flex items-center justify-between gap-2 px-0.5 py-1">
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground/70 tracking-wider">
              <Bot className="h-3 w-3" />
              AI模型
            </span>
            <button
              type="button"
              onClick={() => setProviderPickerOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-primary active:scale-[0.98]"
            >
              {(() => {
                const logoSrc = providerLogoImgSrc(settings.provider);
                return (
                  <span className="flex items-center gap-1.5">
                    {logoSrc ? (
                      <img src={logoSrc} alt="" className="h-3.5 w-3.5 rounded-sm object-contain" />
                    ) : null}
                    <span className="font-semibold text-foreground">
                      {PROVIDER_UI[settings.provider]?.label ?? settings.provider}
                    </span>
                  </span>
                );
              })()}
            </button>
          </div>
        </section>

        {props.chapter ? (
          <AiPanelStudyChapterSection
            characters={props.bibleCharacters}
            glossaryTerms={props.glossaryTerms}
            characterSource={studyCharacterSource}
            onCharacterSourceChange={setStudyCharacterSource}
            npcText={studyNpcText}
            onNpcTextChange={setStudyNpcText}
            pickedCharacterIds={studyPickedCharacterIds}
            onPickedCharacterIdsChange={setStudyPickedCharacterIds}
            pickedGlossaryIds={studyPickedGlossaryIds}
            onPickedGlossaryIdsChange={setStudyPickedGlossaryIds}
          />
        ) : null}

      <AiPanelModelPickerDialog
        open={providerPickerOpen}
        onOpenChange={setProviderPickerOpen}
        settings={settings}
        updateSettings={updateSettings}
        updateProvider={updateProvider}
      />
      </div>

      <AiPanelWritingPromptsRow
        selectedStyleTemplateId={selectedStyleTemplateId}
        selectedReqTemplateId={selectedReqTemplateId}
        styleTemplateTitle={styleTemplateTitle}
        reqTemplateTitle={reqTemplateTitle}
        onStyleTemplatePick={onStyleTemplatePick}
        onReqTemplatePick={onReqTemplatePick}
        styleMode={styleMode}
        onStyleModeChange={setStyleMode}
        styleCustomText={styleCustomText}
        onStyleCustomTextChange={setStyleCustomText}
        reqMode={reqMode}
        onReqModeChange={setReqMode}
        reqCustomText={reqCustomText}
        onReqCustomTextChange={setReqCustomText}
      />

      <label className="ai-panel-field">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
            <span className="small muted">剧情/细纲/tokens：</span>
            {previewInjectionPrompt ? (
              <button
                type="button"
                onClick={() => setTokenInfoOpen(true)}
                title={
                  previewInjectionPrompt.shouldPrompt
                    ? "本次注入量已触发提示，点击查看详情"
                    : "本次注入量预估，点击查看详情"
                }
                className="small"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: 0,
                  border: "none",
                  borderRadius: 0,
                  background: "transparent",
                  color: previewInjectionPrompt.shouldPrompt
                    ? "var(--destructive)"
                    : "var(--muted-foreground)",
                  cursor: "pointer",
                  lineHeight: 1.2,
                }}
              >
                <strong>{previewInjectionPrompt.tokensApprox.toLocaleString()}</strong>
                <span aria-hidden style={{ opacity: 0.7 }}>/次</span>
                {previewInjectionPrompt.shouldPrompt ? (
                  <span aria-hidden style={{ marginLeft: 2 }}>⚠</span>
                ) : null}
              </button>
            ) : null}
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <button
              type="button"
              className="small"
              disabled={draftHistory.length === 0}
              title={
                draftHistory.length === 0
                  ? "暂无生成历史（生成完成后会自动留存最近 5 条）"
                  : `查看本章最近 ${draftHistory.length} 条生成历史`
              }
              onClick={() => {
                if (draftHistory.length === 0) return;
                setHistoryDialogOpen(true);
              }}
              style={{
                padding: 0,
                border: "none",
                borderRadius: 0,
                background: "transparent",
                color: draftHistory.length === 0 ? "var(--muted-foreground)" : "var(--foreground)",
                cursor: draftHistory.length === 0 ? "not-allowed" : "pointer",
                opacity: draftHistory.length === 0 ? 0.6 : 1,
              }}
            >
              历史{draftHistory.length > 0 ? `（${draftHistory.length}）` : ""}
            </button>
            {props.onRequestPullOutline ? (
              <button
                type="button"
                className="wprow-tab wprow-tab--active"
                disabled={(props.outlineEntriesCount ?? 0) === 0}
                title={
                  (props.outlineEntriesCount ?? 0) === 0
                    ? "章纲树为空。请先到「推演」页生成并推送到写作章纲。"
                    : "从章纲树选一个节点的内容灌到本框（推荐「详细细纲」，约 500–1200 字）"
                }
                onClick={() => props.onRequestPullOutline?.()}
              >
                从章纲拉取
              </button>
            ) : null}
          </div>
        </div>
        <textarea
          name="chapterOutlinePaste"
          value={chapterOutlinePaste}
          onChange={(e) => {
            const v = e.target.value;
            setChapterOutlinePaste(v);
            markOutlineSourceManual();
            if (!props.chapter) return;
            saveChapterOutlinePaste(props.workId, props.chapter.id, v);
          }}
          rows={6}
          placeholder="粘贴细纲/剧情节拍（用于生成正文的主依据）。例如：\n- 场景目标：...\n- 节拍：A→B→转折→钩子\n- 必出现信息：...\n"
        />
      </label>

      <div className="ai-panel-actions" style={{ justifyContent: "flex-start" }}>
        <button
          type="button"
          className="btn primary"
          disabled={busy}
          title={
            props.writingSkillMode === "outline" && !chapterOutlinePaste.trim()
              ? "细纲为空 · 建议先「从章纲拉取」或粘贴细纲再生成"
              : undefined
          }
          onClick={() => openDraftDialogWithOutlineSeed()}
        >
          {busy ? "去生成正文中…" : "去生成正文"}
        </button>
        <button
          type="button"
          className="btn"
          title="打开「本章正文生成」弹窗（查看上一次生成结果或历史草稿）"
          onClick={() => {
            setDraftSeedMode(false);
            setDraftDialogOpen(true);
          }}
        >
          生成结果
        </button>
      </div>
      {props.writingSkillMode === "outline" && !chapterOutlinePaste.trim() ? (
        <div className="muted small" style={{ marginTop: 6, color: "var(--warning, #b48510)" }}>
          扩写模式下细纲为空 · 建议先「从章纲拉取」或粘贴细纲，否则生成会缺少剧情依据
        </div>
      ) : null}
      {error ? <AiInlineErrorNotice message={error} /> : null}
      {showDegradeRetry ? (
        <div className="rr-block" style={{ marginTop: 8 }}>
          <button type="button" className="btn" disabled={busy} onClick={() => runWithDegrade()}>
            精简并重试
          </button>
          <span className="muted small" style={{ marginLeft: 8 }}>
            减半字数上限，并暂时关闭全书锦囊、RAG、邻章概要、关联摘录；全文且本章有概要时改为概要模式。
          </span>
        </div>
      ) : null}

      <OutlineGenerationDialog
        open={draftDialogOpen}
        onOpenChange={setDraftDialogOpen}
        busy={busy}
        phase={genPhase}
        outlineSource={outlineSource}
        providerLabel={PROVIDER_UI[settings.provider]?.label ?? settings.provider}
        draft={draft}
        onDraftChange={(next) => {
          setDraft(next);
          if (draftSeedMode) {
            setChapterOutlinePaste(next);
            if (props.chapter) {
              saveChapterOutlinePaste(props.workId, props.chapter.id, next);
            }
          }
        }}
        seedMode={draftSeedMode}
        onStartGenerate={() => {
          const outlineForRun = draft.trim();
          setChapterOutlinePaste(outlineForRun);
          if (props.chapter) {
            saveChapterOutlinePaste(props.workId, props.chapter.id, outlineForRun);
          }
          void run(undefined, { outlineOverride: outlineForRun });
        }}
        targetWordCount={targetWordCount}
        onTargetWordCountChange={setTargetWordCount}
        error={error}
        selectedText={selectedText}
        canRetry={!!lastReqRef.current}
        onAbort={() => abortRef.current?.abort()}
        onRetry={() => {
          const last = lastReqRef.current;
          if (!last) return;
          void run({ provider: last.provider, providerCfg: last.providerCfg, messages: last.messages });
        }}
        onInsertToCursor={props.insertAtCursor}
        onAppendToEnd={props.appendToEnd}
        onReplaceSelection={(text) => {
          const before = props.getSelectedText().trim();
          if (!before) return;
          setMergePayload({ kind: "replace", before, after: text });
        }}
        ensureChapterViewBeforeInsert={props.ensureChapterViewBeforeInsert}
        extraSlot={
          <>
            {/* P1-04：今日已用 token 始终显示 */}
            <p className="muted small ai-panel-session-budget" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
              <span>
                今日已用（粗估）
                <strong style={{ marginLeft: 4 }}>{todayTokensUsed.toLocaleString()}</strong>
                {settings.dailyTokenBudget > 0 && (
                  <span
                    style={{
                      color: todayTokensUsed >= settings.dailyTokenBudget ? "var(--destructive)" : "inherit",
                    }}
                  >
                    {" "}/ {settings.dailyTokenBudget.toLocaleString()}
                  </span>
                )}
                {" "}tokens
              </span>
              {settings.dailyTokenBudget > 0 && (
                <span
                  style={{
                    display: "inline-block",
                    width: 64,
                    height: 4,
                    borderRadius: 2,
                    background: "var(--border)",
                    overflow: "hidden",
                    verticalAlign: "middle",
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      height: "100%",
                      width: `${Math.min(100, Math.round((todayTokensUsed / settings.dailyTokenBudget) * 100))}%`,
                      background: todayTokensUsed >= settings.dailyTokenBudget ? "var(--destructive)" : "var(--primary)",
                      borderRadius: 2,
                    }}
                  />
                </span>
              )}
            </p>
            {sessionBudget > 0 ? (
              <p className="muted small ai-panel-session-budget">
                本会话侧栏累计（粗估）{sessionTokensUsed.toLocaleString()} / {sessionBudget.toLocaleString()} tokens ·{" "}
                <button
                  type="button"
                  className="btn small secondary"
                  disabled={busy}
                  onClick={() => {
                    resetSessionApproxTokens();
                    setSessionBudgetUiTick((x) => x + 1);
                  }}
                >
                  清零本会话累计
                </button>
              </p>
            ) : null}

            {toneDriftHints.length > 0 || toneEmbedHint || toneEmbedErr || toneEmbedBusy ? (
              <div className="rr-block ai-tone-drift-hint" role="status" style={{ marginTop: 12 }}>
                <div className="rr-block-title">调性提示（轻量规则 · 仅参考）</div>
                <ul className="rr-list">
                  {toneDriftHints.map((h, i) => (
                    <li key={i} className="rr-list-item muted small">
                      {h}
                    </li>
                  ))}
                  {toneEmbedBusy ? <li className="rr-list-item muted small">标杆段距离计算中…</li> : null}
                  {toneEmbedHint ? <li className="rr-list-item muted small">{toneEmbedHint}</li> : null}
                  {toneEmbedErr ? <li className="rr-list-item muted small">标杆段距离不可用：{toneEmbedErr}</li> : null}
                </ul>
              </div>
            ) : null}

            {glossaryHitsInDraft.length > 0 ? (
              <div className="rr-block" style={{ marginTop: 12 }}>
                <div className="rr-block-title">一致性提示（来自术语/人名表）</div>
                <ul className="rr-list">
                  {glossaryHitsInDraft.map((t) => (
                    <li key={t.id} className="rr-list-item">
                      <span style={{ fontWeight: 700 }}>{t.term}</span>
                      <span className="muted small">
                        {t.category === "dead"
                          ? " · 已死（请确认没有复活/误用）"
                          : t.category === "name"
                            ? " · 人名"
                            : " · 术语"}
                        {t.note.trim() ? ` · ${t.note}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        }
      />

      <AiPanelRagSection
        variant="sessionOnly"
        workId={props.workId}
        work={props.work}
        chapters={props.chapters}
        activeChapterId={props.chapter?.id ?? null}
        ragEnabled={ragEnabled}
        onRagEnabledChange={(v) => patchRagInject({ ragEnabled: v })}
        ragWorkSources={ragWorkSources}
        setRagWorkSources={setRagWorkSourcesUp}
        ragQuery={ragQuery}
        onRagQueryChange={setRagQuery}
        ragK={ragK}
        onRagKChange={(n) => patchRagInject({ ragK: n })}
        ragHits={ragHits}
        ragLoading={ragLoading}
        ragExcluded={ragExcluded}
        setRagExcluded={setRagExcluded}
        busy={busy}
        onRunPreview={runRagPreview}
      />

      <AiPanelHistoryDialog
        open={historyDialogOpen}
        onOpenChange={setHistoryDialogOpen}
        entries={draftHistory}
        workId={props.workId}
        chapterId={props.chapter?.id ?? null}
        onRestore={(content) => {
          setDraft(content);
          setDraftSeedMode(false);
          setDraftDialogOpen(true);
        }}
        onEntriesChanged={setDraftHistory}
      />

      <AiDraftMergeDialog
        open={mergePayload !== null}
        payload={mergePayload}
        getSelectedText={props.getSelectedText}
        onCancel={() => setMergePayload(null)}
        onConfirm={confirmDraftMerge}
      />

      {/* P1-04：成本门控弹窗。用 createPortal 渲染到 body 顶层，避免被 Radix Dialog 的
           pointer-events 拦截层或 <aside> 的 stacking context 盖住无法点击。 */}
      {costGatePending && createPortal(
        <CostGateModal
          reasons={costGatePending.reasons}
          tokensApprox={costGatePending.tokensApprox}
          dailyUsed={costGatePending.dailyUsed}
          dailyBudget={costGatePending.dailyBudget}
          triggerLabel={costGatePending.triggerLabel}
          onConfirm={() => { costGatePending.resolve(true); setCostGatePending(null); }}
          onCancel={() => { costGatePending.resolve(false); setCostGatePending(null); }}
        />,
        document.body,
      )}

      {/* 「本章细纲」标签旁的 tokens 标签点击后展示的注入量详情（info 模式，仅展示） */}
      {tokenInfoOpen && previewInjectionPrompt && createPortal(
        <CostGateModal
          mode="info"
          reasons={previewInjectionPrompt.reasons}
          tokensApprox={previewInjectionPrompt.tokensApprox}
          dailyUsed={todayTokensUsed}
          dailyBudget={settings.dailyTokenBudget}
          triggerLabel="本次注入量预估"
          onConfirm={() => setTokenInfoOpen(false)}
          onCancel={() => setTokenInfoOpen(false)}
        />,
        document.body,
      )}
    </aside>
  );
});

