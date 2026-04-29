import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { isLocalAiProvider } from "../ai/local-provider";
import { getProviderTemperature, loadAiSettings } from "../ai/storage";
import { MODE_DESCS, type SceneStateCard } from "../ai/sheng-hui-generate";
import type { AiSettings } from "../ai/types";
import { listWorks, updateChapter } from "../db/repo";
import type { Chapter, Work, WorkStyleCard } from "../db/types";
import { formatRelativeUpdateMs } from "../util/relativeTime";
import {
  appendShengHuiSnapshot,
  loadShengHuiSnapshotBucket,
  sortShengHuiSnapshotsForList,
  type ShengHuiSnapshotBucket,
} from "../util/sheng-hui-snapshots";
import { workTagsToProfileText } from "../util/work-tags";
import { HubAiSettingsHint } from "../components/HubAiSettingsHint";
import { Button } from "../components/ui/button";
import { BookOpen, PanelLeft, PenLine } from "lucide-react";
import { ShengHuiAmbientBg } from "../components/sheng-hui/ShengHuiAmbientBg";
import { ShengHuiCenterManuscriptColumn } from "../components/sheng-hui/ShengHuiCenterManuscriptColumn";
import { ShengHuiLeftChapterRail } from "../components/sheng-hui/ShengHuiLeftChapterRail";
import { ShengHuiRightColumnSyncHint } from "../components/sheng-hui/ShengHuiRightColumnSyncHint";
import { ShengHuiRightComposeBlock } from "../components/sheng-hui/ShengHuiRightComposeBlock";
import { ShengHuiRightMaterialsBlock } from "../components/sheng-hui/ShengHuiRightMaterialsBlock";
import { ShengHuiRightPanel } from "../components/sheng-hui/ShengHuiRightPanel";
import { ShengHuiAbCompareDialog } from "../components/sheng-hui/ShengHuiAbCompareDialog";
import { ShengHuiDeleteSnapshotDialog } from "../components/sheng-hui/ShengHuiDeleteSnapshotDialog";
import { ShengHuiRightVersionsBlock } from "../components/sheng-hui/ShengHuiRightVersionsBlock";
import { ShengHuiWorkspaceTopBar } from "../components/sheng-hui/ShengHuiWorkspaceTopBar";
import type { ShengHuiRightPanelTab } from "../components/sheng-hui/sheng-hui-right-panel-types";
import { Sheet, SheetContent } from "../components/ui/sheet";
import { AiPanelModelPickerDialog } from "../components/ai-panel/AiPanelModelPickerDialog";
import { useShengHuiModelPickerBridge } from "../hooks/useShengHuiModelPickerBridge";
import { useShengHuiWorkspacePrefs } from "../hooks/useShengHuiWorkspacePrefs";
import {
  useShengHuiAbCompareStream,
  type ShengHuiAbAdoptPayload,
} from "../hooks/useShengHuiAbCompareStream";
import {
  useShengHuiGenerationLifecycle,
  type ShengHuiBuildResult,
} from "../hooks/useShengHuiGenerationLifecycle";
import { summarizeShengHuiContextInject, summarizeShengHuiRagSelection } from "../util/sheng-hui-context-inject-summary";
import { cn } from "../lib/utils";
import { useShengHuiDeepLink } from "../hooks/useShengHuiDeepLink";
import { useShengHuiBodyTailPreference } from "../hooks/useShengHuiBodyTailPreference";
import { useShengHuiCangjingRag } from "../hooks/useShengHuiCangjingRag";
import { useShengHuiTuiyanOutlineImport } from "../hooks/useShengHuiTuiyanOutlineImport";
import { useShengHuiWriteBackToAiPanel } from "../hooks/useShengHuiWriteBackToAiPanel";
import { useShengHuiMarkAdoptedSnapshot } from "../hooks/useShengHuiMarkAdoptedSnapshot";
import { useShengHuiEmotionTemperature } from "../hooks/useShengHuiEmotionTemperature";
import { useShengHuiGenerateMode } from "../hooks/useShengHuiGenerateMode";
import { useShengHuiSnapshotDelete } from "../hooks/useShengHuiSnapshotDelete";
import { useShengHuiSceneStateExtract } from "../hooks/useShengHuiSceneStateExtract";
import { useShengHuiParagraphToolbarStream } from "../hooks/useShengHuiParagraphToolbarStream";
import { useShengHuiSkeletonBeatRegen } from "../hooks/useShengHuiSkeletonBeatRegen";
import { useShengHuiVoiceLock } from "../hooks/useShengHuiVoiceLock";
import { useShengHuiMainDraftPersistence } from "../hooks/useShengHuiMainDraftPersistence";
import { useShengHuiEditorHandoffConsume } from "../hooks/useShengHuiEditorHandoffConsume";
import { useShengHuiSnapshotMeta } from "../hooks/useShengHuiSnapshotMeta";
import { useShengHuiContextTokenTree } from "../hooks/useShengHuiContextTokenTree";
import { useShengHuiBuildGenerateArgs } from "../hooks/useShengHuiBuildGenerateArgs";
import { useShengHuiGenTimerAndTodayTokens } from "../hooks/useShengHuiGenTimerAndTodayTokens";
import { useShengHuiGenerationCompleteCard } from "../hooks/useShengHuiGenerationCompleteCard";
import { useShengHuiPageDataEffects } from "../hooks/useShengHuiPageDataEffects";
import { useShengHuiSeedOutputFromChapterWhenNoSnapshot } from "../hooks/useShengHuiSeedOutputFromChapterWhenNoSnapshot";
import { useShengHuiSelfReview } from "../hooks/useShengHuiSelfReview";
import {
  LS_SHENG_HUI_LAST_WORK,
  readInitialShengHuiRightPanelTab,
  readShengHuiRightPanelCollapsedFromStorage,
  SHENG_HUI_PAGE_WORKSPACE_BG,
} from "../util/sheng-hui-workspace-constants";
import { SHENG_HUI_WORKSPACE_ROOT_CLASS } from "../util/sheng-hui-typography";
import { applyShengHuiHunks, type ShengHuiTextHunk } from "../util/sheng-hui-token-diff";
import { workStyleCardToWritingSlice } from "../util/work-style-card-to-slice";
import { toast } from "sonner";

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function ShengHuiPage() {
  // Settings
  const [settings, setSettings] = useState<AiSettings>(() => loadAiSettings());
  useEffect(() => {
    const sync = () => setSettings(loadAiSettings());
    window.addEventListener("focus", sync);
    return () => window.removeEventListener("focus", sync);
  }, []);

  const { modelPickerOpen, setModelPickerOpen, updateSettings, updateProvider } = useShengHuiModelPickerBridge(setSettings);

  // Works & chapters
  const [works, setWorks] = useState<Work[]>([]);
  const [workId, setWorkId] = useState<string | null>(null);
  const [work, setWork] = useState<Work | null>(null);
  const [styleCard, setStyleCard] = useState<WorkStyleCard | undefined>(undefined);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Context toggles
  const [includeSummary, setIncludeSummary] = useState(true);
  const [includeBible, setIncludeBible] = useState(true);
  const { bodyTailCount, setBodyTailCount } = useShengHuiBodyTailPreference();
  const [includeSettingIndex, setIncludeSettingIndex] = useState(false);
  const [settingIndexText, setSettingIndexText] = useState("");
  const [settingIndexLoading, setSettingIndexLoading] = useState(false);

  const [outline, setOutline] = useState("");
  const [outlineHydrated, setOutlineHydrated] = useState(false);
  const {
    ragQuery,
    setRagQuery,
    ragResults,
    ragSearching,
    searchRag,
    selectedExcerptIds,
    styleFeatures,
    extractingFeatureIds,
    onExtractStyleFeature,
    onStopExtractStyleFeature,
    onToggleExcerpt,
  } = useShengHuiCangjingRag(workId, chapters, settings);
  const { tuiyanImporting, importFromTuiyan } = useShengHuiTuiyanOutlineImport(workId, chapterId, setOutline);
  const { bibleCharacters, detectedCharNames, lockedCharNames, toggleLockedCharName } = useShengHuiVoiceLock(
    workId,
    outline,
  );
  /**
   * `runGenerate` 等流式生命周期已下沉到 `useShengHuiGenerationLifecycle`：
   * 它持有 output/busy/error/lastRoughEstimate 与 abort/acc/latestTarget refs，
   * 并在 workId/chapterId 切换时自动 abort in-flight 流。本页通过下面的
   * `buildGenerateArgs` 把所有装配上下文（outline、generateMode、各注入开关、RAG、
   * 场景卡、人物声音锁、风格卡、目标字数、情绪温度等）以一次 async 调用喂给 hook；
   * 通过 `onTwoStepIntermediateChange` / `onSnapshotPersisted` 让 hook 写回页内状态。
   */
  const buildGenerateArgsRef = useRef<() => Promise<ShengHuiBuildResult>>(() =>
    Promise.resolve({ ok: false, error: "未初始化" }),
  );
  const buildGenerateArgsStable = useCallback(() => buildGenerateArgsRef.current(), []);

  // Parameters panel
  const [targetWords, setTargetWords] = useState(2000);

  // Version comparison
  const [compareSnapshotId, setCompareSnapshotId] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(false);

  const [rightPanelTab, setRightPanelTab] = useState<ShengHuiRightPanelTab>(readInitialShengHuiRightPanelTab);
  const [rightCollapsed, setRightCollapsed] = useState(readShengHuiRightPanelCollapsedFromStorage);

  // Scene state card
  const [sceneState, setSceneState] = useState<SceneStateCard>({
    location: "",
    timeOfDay: "",
    charState: "",
    tension: "",
  });
  const [sceneStateOpen, setSceneStateOpen] = useState(false);

  // Snapshots
  const [snapshotBucket, setSnapshotBucket] = useState<ShengHuiSnapshotBucket>({
    snapshots: [],
    adoptedId: null,
  });
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  /** 快照按章 setOutput 后自增，供主稿 localStorage 对齐（两章正文相同、React 跳过重渲染时仍刷新 debounce）。 */
  const [shengHuiMainContentEpoch, setShengHuiMainContentEpoch] = useState(0);

  const {
    isLg,
    setLeftOpen,
    leftExpanded,
    stepHintDismissed,
    dismissStepHint,
    prefsHydrated,
    focusMode,
    toggleFocusMode,
  } = useShengHuiWorkspacePrefs();

  const [genElapsedSec, setGenElapsedSec] = useState(0);
  const [todayTokensSnapshot, setTodayTokensSnapshot] = useState(0);
  const peakGenElapsedRef = useRef(0);
  const [mobileSheet, setMobileSheet] = useState<null | "left" | "right">(null);

  useShengHuiDeepLink(loading, works, chapters, workId, chapterId, setWorkId, setChapterId);

  const {
    generateMode,
    setGenerateMode,
    twoStepIntermediate,
    setTwoStepIntermediate,
    resetTwoStep,
  } = useShengHuiGenerateMode();

  const { emotionTemperature, setEmotionTemperature } = useShengHuiEmotionTemperature();

  /** 生辉「按纲仿写」流式生命周期（state/abort/快照写回均在 hook 内）。 */
  const lifecycle = useShengHuiGenerationLifecycle({
    workId,
    chapterId,
    settings,
    buildGenerateArgs: buildGenerateArgsStable,
    onTwoStepIntermediateChange: setTwoStepIntermediate,
    onSnapshotPersisted: ({ snap, runWorkId, runChapterId, isCurrentTarget }) => {
      if (isCurrentTarget) {
        setSnapshotBucket(loadShengHuiSnapshotBucket(runWorkId, runChapterId));
        setSelectedSnapshotId(snap.id);
      }
    },
  });
  const { output, setOutput, busy, error, setError, lastRoughEstimate, runGenerate, stop } = lifecycle;

  const { writeBackStatus, writeBackError, handleWriteBack } = useShengHuiWriteBackToAiPanel(
    workId,
    chapterId,
    output,
  );
  const { markSnapshotAdopted } = useShengHuiMarkAdoptedSnapshot(
    workId,
    chapterId,
    selectedSnapshotId,
    setSnapshotBucket,
    output,
    outline,
  );

  const { regenBeatIndex, regenerateBeat, stopSkeletonBeatRegen } = useShengHuiSkeletonBeatRegen({
    workId,
    chapterId,
    settings,
    busy,
    generateMode,
    twoStepIntermediate,
    setTwoStepIntermediate,
    output,
    setOutput,
    setError,
    buildGenerateArgs: buildGenerateArgsStable,
  });

  const { paragraphToolbarIndex, runParagraphAction, stopParagraphToolbarStream } = useShengHuiParagraphToolbarStream({
    workId,
    chapterId,
    settings,
    mainBusy: busy,
    output,
    onOutputChange: setOutput,
    setError,
    buildGenerateArgs: buildGenerateArgsStable,
  });

  const stopAllShengHuiStreams = useCallback(() => {
    stop();
    stopParagraphToolbarStream();
    stopSkeletonBeatRegen();
  }, [stop, stopParagraphToolbarStream, stopSkeletonBeatRegen]);

  const {
    deleteSnapshotDialogOpen,
    onDeleteSnapshotDialogOpenChange,
    requestDeleteSelectedSnapshot,
    confirmDeleteSelectedSnapshot,
  } = useShengHuiSnapshotDelete(
    workId,
    chapterId,
    selectedSnapshotId,
    setOutput,
    setSelectedSnapshotId,
    setSnapshotBucket,
  );

  const onAbAdopted = useCallback(
    (p: ShengHuiAbAdoptPayload) => {
      setOutput(p.text);
      const snap = appendShengHuiSnapshot(p.workId, p.chapterId, p.outlineForSnapshotPreview, p.text);
      setSnapshotBucket(loadShengHuiSnapshotBucket(p.workId, p.chapterId));
      setSelectedSnapshotId(snap.id);
    },
    [setOutput, setSelectedSnapshotId, setSnapshotBucket],
  );

  const {
    abDialogOpen,
    onAbDialogOpenChange,
    abRunning,
    abTextA,
    abTextB,
    abSublabelA,
    abSublabelB,
    abError,
    runAbCompare,
    stopAbCompare,
    adoptAb,
  } = useShengHuiAbCompareStream({
    workId,
    chapterId,
    settings,
    mainBusy: busy,
    setError,
    buildGenerateArgs: buildGenerateArgsStable,
    onAdopted: onAbAdopted,
  });

  const updateSnapshotMeta = useShengHuiSnapshotMeta(workId, chapterId, setSnapshotBucket);

  const refreshWorks = useCallback(async () => {
    const list = await listWorks();
    setWorks(list);
    return list;
  }, []);

  useShengHuiGenTimerAndTodayTokens(busy, setGenElapsedSec, setTodayTokensSnapshot, peakGenElapsedRef);

  const { completePayload, dismissCompleteCard } = useShengHuiGenerationCompleteCard({
    busy,
    error,
    output,
    peakGenElapsedRef,
    lastRoughEstimate,
  });

  // Derived
  const isCloudProvider = !isLocalAiProvider(settings.provider);
  const cloudAllowed =
    !isCloudProvider || (settings.privacy.consentAccepted && settings.privacy.allowCloudProviders);
  const canInjectWorkMeta = !isCloudProvider || settings.privacy.allowMetadata;

  const abCompareDisabled = useMemo(
    () =>
      busy ||
      regenBeatIndex != null ||
      !workId ||
      (generateMode === "write" && !outline.trim()) ||
      (generateMode === "continue" && !outline.trim() && !output.trim()) ||
      generateMode === "skeleton" ||
      generateMode === "dialogue_first",
    [busy, regenBeatIndex, workId, generateMode, outline, output],
  );
  const abCompareButtonTitle = useMemo(() => {
    if (generateMode === "skeleton" || generateMode === "dialogue_first") {
      return "两步模式请用主栏「生成」分步完成";
    }
    return undefined;
  }, [generateMode]);
  const tagProfileText = useMemo(() => (work ? workTagsToProfileText(work.tags) : ""), [work]);
  const selectedChapter = useMemo(
    () => (chapterId ? chapters.find((c) => c.id === chapterId) : undefined),
    [chapters, chapterId],
  );

  const selfReviewStyleBlock = useMemo(() => {
    const w = workStyleCardToWritingSlice(styleCard);
    return [w.tone && `语气：${w.tone}`, w.bannedPhrases && `禁忌：${w.bannedPhrases}`, w.styleAnchor && `笔感锚点：${w.styleAnchor}`, w.pov && `视角：${w.pov}`]
      .filter(Boolean)
      .join("\n");
  }, [styleCard]);

  const {
    selfReviewText,
    selfReviewBusy,
    selfReviewError,
    setSelfReviewError,
    runSelfReview,
    stopSelfReview,
  } = useShengHuiSelfReview({
    settings,
    workId,
    workTitle: (work?.title ?? "").trim() || "未命名",
    chapterTitle: (selectedChapter?.title ?? "").trim() || "未选章节",
    styleBlock: selfReviewStyleBlock,
    bibleHint: "",
    body: output,
    canRun: !busy && output.trim().length >= 20,
  });

  const onApplySnapshotHunkToChapter = useCallback(
    async (h: ShengHuiTextHunk) => {
      if (!chapterId || !selectedChapter) return;
      if (compareSnapshotId !== "__chapter__") return;
      const base = selectedChapter.content ?? "";
      const next = applyShengHuiHunks(base, [h]);
      if (next === base) {
        toast.info("无文字变化可写回。");
        return;
      }
      try {
        await updateChapter(chapterId, { content: next });
        setChapters((prev) => prev.map((c) => (c.id === chapterId ? { ...c, content: next } : c)));
        toast.success("已将该块写入章节正文。");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "写回失败");
      }
    },
    [chapterId, selectedChapter, compareSnapshotId, setChapters],
  );

  const snapshotsNewestFirst = useMemo(
    () => sortShengHuiSnapshotsForList(snapshotBucket.snapshots),
    [snapshotBucket.snapshots],
  );
  const latestSnapshotByTime = useMemo(() => {
    if (snapshotBucket.snapshots.length === 0) return null;
    return [...snapshotBucket.snapshots].sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
  }, [snapshotBucket.snapshots]);

  const {
    sceneStateExtracting,
    extractSceneStateFromLatestSnapshot,
    stopSceneStateExtract,
  } = useShengHuiSceneStateExtract({
    settings,
    workId,
    latestSnapshot: latestSnapshotByTime,
    selectedChapter,
    setSceneState,
    setSceneStateOpen,
  });

  const contextInjectSummary = useMemo(
    () =>
      summarizeShengHuiContextInject({
        includeSummary,
        includeBible,
        bodyTailCount,
        includeSettingIndex,
        settingIndexLoading,
      }),
    [includeSummary, includeBible, bodyTailCount, includeSettingIndex, settingIndexLoading],
  );

  const ragSelectionSummary = useMemo(
    () => summarizeShengHuiRagSelection(selectedExcerptIds.size, ragResults.length),
    [selectedExcerptIds, ragResults.length],
  );

  const modelTemperatureLabel = useMemo(
    () => String(getProviderTemperature(settings, settings.provider)),
    [settings],
  );

  const buildShengHuiPageGenerateArgs = useShengHuiBuildGenerateArgs({
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
  });

  useEffect(() => {
    buildGenerateArgsRef.current = buildShengHuiPageGenerateArgs;
  }, [buildShengHuiPageGenerateArgs]);

  const shengHuiContextTreeSnapshot = useMemo(
    () => ({}),
    [
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
    ],
  );
  const contextTokenTreeState = useShengHuiContextTokenTree(buildGenerateArgsStable, shengHuiContextTreeSnapshot);

  useShengHuiPageDataEffects({
    refreshWorks,
    workId,
    chapterId,
    setWork,
    setStyleCard,
    setChapters,
    setChapterId,
    setWorkId,
    setLoading,
    loading,
    outline,
    outlineHydrated,
    setOutline,
    setOutlineHydrated,
    canInjectWorkMeta,
    includeSettingIndex,
    setIncludeSettingIndex,
    setSettingIndexText,
    setSettingIndexLoading,
    sceneState,
    setSceneState,
    setSnapshotBucket,
    setOutput,
    setSelectedSnapshotId,
    setShengHuiMainContentEpoch,
    rightPanelTab,
    rightCollapsed,
  });

  // 主稿手改按章持久化：承接上方快照，再读 localStorage 草稿（有则覆盖为上次手改）
  useShengHuiMainDraftPersistence({
    workId,
    chapterId,
    output,
    setOutput,
    loading,
    snapshotContentEpoch: shengHuiMainContentEpoch,
  });

  useShengHuiSeedOutputFromChapterWhenNoSnapshot({
    loading,
    workId,
    chapterId,
    chapterContent: selectedChapter?.content,
    output,
    setOutput,
    setShengHuiMainContentEpoch,
  });

  // 写作台选区 → 生辉主稿/模式（session，最后覆盖快照与本地主稿草稿）
  useShengHuiEditorHandoffConsume({
    loading,
    workId,
    chapterId,
    setOutput,
    setGenerateMode,
    setRightPanelTab,
  });

  // ─── Render guards ──────────────────────────

  if (loading) {
    return (
      <div
        className={cn(
          "relative flex h-dvh min-h-0 w-full flex-col items-center justify-center overflow-hidden",
          SHENG_HUI_PAGE_WORKSPACE_BG,
          SHENG_HUI_WORKSPACE_ROOT_CLASS,
        )}
      >
        <ShengHuiAmbientBg />
        <p className="relative z-10 muted">加载中…</p>
      </div>
    );
  }

  if (works.length === 0) {
    return (
      <div
        className={cn(
          "relative flex h-dvh min-h-0 w-full flex-col items-center justify-center gap-4 overflow-hidden text-center",
          SHENG_HUI_PAGE_WORKSPACE_BG,
          SHENG_HUI_WORKSPACE_ROOT_CLASS,
        )}
      >
        <ShengHuiAmbientBg />
        <div className="relative z-10 flex max-w-sm flex-col items-center gap-4">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm">
            <PenLine className="size-6" aria-hidden />
          </div>
        <p className="sheng-hui-t1">生辉 · 仿写工作台</p>
        <p className="muted max-w-xs">暂无作品。请先在「留白」创建作品后再使用生辉。</p>
        <Button asChild>
          <Link to="/library">去作品库</Link>
        </Button>
        <HubAiSettingsHint />
        </div>
      </div>
    );
  }

  // 共享子树：大屏栅格 + 小屏 Sheet 只择一挂载，避免双份受控树。
  const leftChapterRail = (
    <ShengHuiLeftChapterRail
      works={works}
      workId={workId}
      onWorkIdChange={(v) => {
                setWorkId(v);
                setError(null);
      }}
      lastWorkStorageKey={LS_SHENG_HUI_LAST_WORK}
      chapters={chapters}
      chapterId={chapterId}
      onChapterIdChange={setChapterId}
      isLg={isLg}
      leftExpanded={leftExpanded}
      onSetLeftOpen={setLeftOpen}
      targetWords={targetWords}
    />
  );

  const rightWorkspacePanel = (
    <ShengHuiRightPanel
      inputApprox={lastRoughEstimate?.inputApprox ?? null}
      outputEstimateApprox={lastRoughEstimate?.outputEstimateApprox ?? null}
      activeTab={rightPanelTab}
      onTabChange={setRightPanelTab}
      collapsed={rightCollapsed}
      onCollapsedChange={setRightCollapsed}
      compose={
        <ShengHuiRightComposeBlock
          generateMode={generateMode}
          onGenerateModeChange={setGenerateMode}
          onResetTwoStep={resetTwoStep}
          twoStepIntermediate={twoStepIntermediate}
          onResetTwoStepIntermediate={resetTwoStep}
          targetWords={targetWords}
          onTargetWordsChange={setTargetWords}
          emotionTemperature={emotionTemperature}
          onEmotionTemperatureChange={setEmotionTemperature}
          settings={settings}
          outline={outline}
          onOutlineChange={setOutline}
          busy={busy}
          tuiyanImporting={tuiyanImporting}
          workId={workId}
          onImportFromTuiyan={importFromTuiyan}
          onRunGenerate={runGenerate}
          onStop={stopAllShengHuiStreams}
          onRunAbCompare={runAbCompare}
          abCompareDisabled={abCompareDisabled}
          abCompareButtonTitle={abCompareButtonTitle}
          lastRoughEstimate={lastRoughEstimate}
          selectedExcerptCount={selectedExcerptIds.size}
          manuscriptOutput={output}
          skeletonRegenBeatIndex={regenBeatIndex}
          onRegenerateSkeletonBeat={regenerateBeat}
        />
      }
      materials={
        <ShengHuiRightMaterialsBlock
          workId={workId}
          work={work}
          settings={settings}
          canInjectWorkMeta={canInjectWorkMeta}
          snapshotsNewestFirst={snapshotsNewestFirst}
          selectedChapter={selectedChapter}
          ragQuery={ragQuery}
          onRagQueryChange={setRagQuery}
          ragResults={ragResults}
          ragSearching={ragSearching}
          onSearchRag={searchRag}
          selectedExcerptIds={selectedExcerptIds}
          onToggleExcerpt={onToggleExcerpt}
          styleFeatures={styleFeatures}
          extractingFeatureIds={extractingFeatureIds}
          onExtractStyleFeature={onExtractStyleFeature}
          onStopExtractStyleFeature={onStopExtractStyleFeature}
          sceneState={sceneState}
          onSceneStateChange={setSceneState}
          sceneStateOpen={sceneStateOpen}
          onSceneStateOpenChange={setSceneStateOpen}
          sceneStateExtracting={sceneStateExtracting}
          onExtractSceneStateFromSnapshot={extractSceneStateFromLatestSnapshot}
          onStopSceneStateExtract={stopSceneStateExtract}
          bibleCharacters={bibleCharacters}
          detectedCharNames={detectedCharNames}
          lockedCharNames={lockedCharNames}
          onToggleLockedCharName={toggleLockedCharName}
          includeSummary={includeSummary}
          onIncludeSummaryChange={setIncludeSummary}
          includeBible={includeBible}
          onIncludeBibleChange={setIncludeBible}
          bodyTailCount={bodyTailCount}
          onBodyTailCountChange={setBodyTailCount}
          includeSettingIndex={includeSettingIndex}
          onIncludeSettingIndexChange={setIncludeSettingIndex}
          settingIndexLoading={settingIndexLoading}
          chapterId={chapterId}
          contextTokenTreeState={contextTokenTreeState}
        />
      }
      versions={
        <ShengHuiRightVersionsBlock
          snapshotsNewestFirst={snapshotsNewestFirst}
          snapshotBucket={snapshotBucket}
          selectedSnapshotId={selectedSnapshotId}
          onSelectSnapshot={(s) => {
            setSelectedSnapshotId(s.id);
            setOutput(s.prose);
          }}
          selectedChapter={selectedChapter}
          compareSnapshotId={compareSnapshotId}
          onCompareSnapshotIdChange={setCompareSnapshotId}
          showDiff={showDiff}
          onShowDiffChange={setShowDiff}
          formatRelativeUpdateMs={formatRelativeUpdateMs}
          busy={busy}
          onMarkAdopted={markSnapshotAdopted}
          onRemoveSelected={requestDeleteSelectedSnapshot}
          onUpdateSnapshotMeta={updateSnapshotMeta}
          compareIsChapterVsSelected={compareSnapshotId === "__chapter__" && Boolean(selectedSnapshotId)}
          onApplySnapshotHunkToChapter={onApplySnapshotHunkToChapter}
          selfReviewBusy={selfReviewBusy}
          selfReviewCanRun={!busy && output.trim().length >= 20}
          onSelfReviewRun={runSelfReview}
          onSelfReviewStop={stopSelfReview}
          selfReviewText={selfReviewText}
          selfReviewError={selfReviewError}
          onSelfReviewDismissError={() => setSelfReviewError(null)}
        />
      }
      help={
        <ShengHuiRightColumnSyncHint
          isLg={isLg}
          leftExpanded={leftExpanded}
          onExpandLeft={() => setLeftOpen(true)}
          contextSummary={contextInjectSummary}
          ragSummary={ragSelectionSummary}
          targetWords={targetWords}
          emotionTemperature={emotionTemperature}
          modelTemperatureLabel={modelTemperatureLabel}
        />
      }
    />
  );

  // ─── Main render ───────────────────────────

  return (
    <div
      className={cn(
        "relative flex h-dvh min-h-0 w-full flex-col overflow-hidden",
        SHENG_HUI_PAGE_WORKSPACE_BG,
        SHENG_HUI_WORKSPACE_ROOT_CLASS,
      )}
    >
      <ShengHuiAmbientBg />
      <ShengHuiWorkspaceTopBar
        workId={workId}
        chapterId={chapterId}
        work={work}
        settings={settings}
        onOpenModelPicker={() => setModelPickerOpen(true)}
        loading={loading}
        focusMode={focusMode}
        onToggleFocus={toggleFocusMode}
        busy={busy}
        genElapsedSec={genElapsedSec}
        lastRoughEstimate={lastRoughEstimate}
        todayTokensSnapshot={todayTokensSnapshot}
        dailyTokenBudget={settings.dailyTokenBudget}
      />

      {/* 三栏：小屏只显示主稿，目录/右栏经底部按钮进 Sheet；大屏专注模式仅主稿。 */}
      <div
              className={cn(
          "relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden p-2 lg:grid lg:min-h-0",
          isLg && !focusMode && !leftExpanded && "lg:grid-cols-[2.75rem_1fr_minmax(20rem,24rem)]",
          isLg && !focusMode && leftExpanded && "lg:grid-cols-[14rem_1fr_minmax(20rem,24rem)]",
          isLg && focusMode && "lg:grid-cols-1",
          !isLg && "grid-cols-1",
        )}
      >
        {isLg && !focusMode ? leftChapterRail : null}

        <ShengHuiCenterManuscriptColumn
          showStepHint={Boolean(prefsHydrated && !stepHintDismissed)}
          onDismissStepHint={dismissStepHint}
          output={output}
          onOutputChange={setOutput}
          busy={busy}
          modeDesc={MODE_DESCS[generateMode]}
          wordCount={output.replace(/\s/g, "").length}
          onCopy={() => {
            const t = output.trim();
            if (t) void navigator.clipboard.writeText(t);
          }}
          onWriteBack={handleWriteBack}
          writeBackStatus={writeBackStatus}
          writeBackError={writeBackError}
          canWriteBack={Boolean(output.trim() && chapterId && !busy)}
          work={work}
          workId={workId}
          chapterId={chapterId}
          emotionTemperature={emotionTemperature}
          focusMode={focusMode}
          targetWords={targetWords}
          generateError={error}
          onDismissGenerateError={() => setError(null)}
          genElapsedSec={genElapsedSec}
          lastRoughEstimate={lastRoughEstimate}
          todayTokensSnapshot={todayTokensSnapshot}
          settings={settings}
          setError={setError}
          buildGenerateArgs={buildGenerateArgsStable}
          styleCard={styleCard}
          cloudAllowed={cloudAllowed}
          generationComplete={completePayload}
          onDismissGenerationComplete={dismissCompleteCard}
          onRerunGeneration={runGenerate}
          paragraphToolbar={
            output.trim()
              ? {
                  onAction: runParagraphAction,
                  disabled: busy,
                  busyIndex: paragraphToolbarIndex,
                }
              : undefined
          }
        />

        {isLg && !focusMode ? rightWorkspacePanel : null}
                      </div>

      {!isLg && !focusMode ? (
        <div
          className="pointer-events-none fixed bottom-3 left-1/2 z-20 flex -translate-x-1/2 gap-2 lg:hidden"
          role="navigation"
          aria-label="小屏章节目录与侧栏"
        >
                  <Button
                    type="button"
            variant="secondary"
            className="pointer-events-auto h-10 rounded-full shadow-md"
            onClick={() => setMobileSheet("left")}
          >
            <PanelLeft className="size-4" />
            目录
                  </Button>
                  <Button
                    type="button"
            variant="secondary"
            className="pointer-events-auto h-10 rounded-full shadow-md"
            onClick={() => setMobileSheet("right")}
          >
            <BookOpen className="size-4" />
            侧栏
                  </Button>
                </div>
              ) : null}

      <Sheet
        open={!isLg && mobileSheet === "left"}
        onOpenChange={(open) => {
          if (!open) setMobileSheet((s) => (s === "left" ? null : s));
        }}
      >
        <SheetContent side="left" className="w-[min(20rem,92vw)] p-0">
          {leftChapterRail}
        </SheetContent>
      </Sheet>

      <Sheet
        open={!isLg && mobileSheet === "right"}
        onOpenChange={(open) => {
          if (!open) setMobileSheet((s) => (s === "right" ? null : s));
        }}
      >
        <SheetContent side="right" className="flex h-[100dvh] w-[min(24rem,96vw)] max-w-[100vw] flex-col p-0 sm:max-w-md">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-1">{rightWorkspacePanel}</div>
        </SheetContent>
      </Sheet>

      <AiPanelModelPickerDialog
        open={modelPickerOpen}
        onOpenChange={setModelPickerOpen}
        settings={settings}
        updateSettings={updateSettings}
        updateProvider={updateProvider}
      />

      <ShengHuiDeleteSnapshotDialog
        open={deleteSnapshotDialogOpen}
        onOpenChange={onDeleteSnapshotDialogOpenChange}
        onConfirm={confirmDeleteSelectedSnapshot}
      />

      <ShengHuiAbCompareDialog
        open={abDialogOpen}
        onOpenChange={onAbDialogOpenChange}
        running={abRunning}
        textA={abTextA}
        textB={abTextB}
        sublabelA={abSublabelA}
        sublabelB={abSublabelB}
        error={abError}
        onStop={stopAbCompare}
        onAdoptA={() => adoptAb("a")}
        onAdoptB={() => adoptAb("b")}
      />
    </div>
  );
}