import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { clampContextText } from "../ai/assemble-context";
import { isLocalAiProvider } from "../ai/local-provider";
import { getProviderTemperature, loadAiSettings } from "../ai/storage";
import {
  assertShengHuiPrivacy,
  formatSceneStateForPrompt,
  isSceneStateCardEmpty,
  MODE_DESCS,
  shengHuiEmotionTemperaturePromptLine,
  shengHuiIsTwoStepGenerateMode,
  shengHuiTwoStepPhaseFromIntermediate,
  type SceneStateCard,
} from "../ai/sheng-hui-generate";
import type { AiSettings } from "../ai/types";
import {
  getChapterBible,
  getTuiyanState,
  getWork,
  getWorkStyleCard,
  listBibleCharacters,
  listBibleGlossaryTerms,
  listBibleWorldEntries,
  listChapters,
  listWorks,
} from "../db/repo";
import type { Chapter, ChapterBible, ReferenceSearchHit, Work, WorkStyleCard } from "../db/types";
import { resolveDefaultChapterId } from "../util/resolve-default-chapter";
import { formatRelativeUpdateMs } from "../util/relativeTime";
import { loadShengHuiSnapshotBucket, setShengHuiAdoptedSnapshot, type ShengHuiSnapshotBucket } from "../util/sheng-hui-snapshots";
import { workTagsToProfileText } from "../util/work-tags";
import { searchWritingRagMerged } from "../util/work-rag-runtime";
import { writeAiPanelDraftWithHistory } from "../util/ai-panel-draft";
import { HubAiSettingsHint } from "../components/HubAiSettingsHint";
import { Button } from "../components/ui/button";
import { BookOpen, PanelLeft, PenLine } from "lucide-react";
import { readTodayApproxTokens } from "../ai/daily-approx-tokens";
import { ShengHuiAmbientBg } from "../components/sheng-hui/ShengHuiAmbientBg";
import { ShengHuiCenterManuscriptColumn } from "../components/sheng-hui/ShengHuiCenterManuscriptColumn";
import { ShengHuiLeftChapterRail } from "../components/sheng-hui/ShengHuiLeftChapterRail";
import { ShengHuiRightColumnSyncHint } from "../components/sheng-hui/ShengHuiRightColumnSyncHint";
import { ShengHuiRightComposeBlock } from "../components/sheng-hui/ShengHuiRightComposeBlock";
import { ShengHuiRightMaterialsBlock } from "../components/sheng-hui/ShengHuiRightMaterialsBlock";
import { ShengHuiRightPanel } from "../components/sheng-hui/ShengHuiRightPanel";
import { ShengHuiDeleteSnapshotDialog } from "../components/sheng-hui/ShengHuiDeleteSnapshotDialog";
import { ShengHuiRightVersionsBlock } from "../components/sheng-hui/ShengHuiRightVersionsBlock";
import { ShengHuiWorkspaceTopBar } from "../components/sheng-hui/ShengHuiWorkspaceTopBar";
import type { ShengHuiRightPanelTab } from "../components/sheng-hui/sheng-hui-right-panel-types";
import { Sheet, SheetContent } from "../components/ui/sheet";
import { AiPanelModelPickerDialog } from "../components/ai-panel/AiPanelModelPickerDialog";
import { useShengHuiModelPickerBridge } from "../hooks/useShengHuiModelPickerBridge";
import { useShengHuiWorkspacePrefs } from "../hooks/useShengHuiWorkspacePrefs";
import {
  useShengHuiGenerationLifecycle,
  type ShengHuiBuildResult,
} from "../hooks/useShengHuiGenerationLifecycle";
import { summarizeShengHuiContextInject, summarizeShengHuiRagSelection } from "../util/sheng-hui-context-inject-summary";
import { cn } from "../lib/utils";
import { useShengHuiDeepLink } from "../hooks/useShengHuiDeepLink";
import { useShengHuiBodyTailPreference } from "../hooks/useShengHuiBodyTailPreference";
import { useShengHuiRagStyleFeatures } from "../hooks/useShengHuiRagStyleFeatures";
import { useShengHuiEmotionTemperature } from "../hooks/useShengHuiEmotionTemperature";
import { useShengHuiGenerateMode } from "../hooks/useShengHuiGenerateMode";
import { useShengHuiSnapshotDelete } from "../hooks/useShengHuiSnapshotDelete";
import { useShengHuiVoiceLock } from "../hooks/useShengHuiVoiceLock";
import { computeShengHuiChapterBodyTail } from "../util/sheng-hui-body-tail";
import { buildCharacterVoiceLocksForShengHui } from "../util/sheng-hui-voice-lock";
import { workStyleCardToWritingSlice } from "../util/work-style-card-to-slice";

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const LS_LAST_WORK = "liubai:lastWorkId";
const LS_OUTLINE_PREFIX = "liubai:shengHuiOutline:v1:";
const LS_RIGHT_PANEL_TAB = "liubai:shengHuiRightPanelTab:v1";
const LS_RIGHT_TAB_LEGACY = "liubai:shengHuiRightTab:v1";
const LS_RIGHT_COLLAPSED = "liubai:shengHuiRightCollapsed:v1";
const RAG_LIMIT = 8;

/** 与推演页 `/logic` 根容器一致：独立全屏工作台底色（可与 `ShengHuiAmbientBg` 叠加）。 */
const SHENG_HUI_WORKSPACE_BG =
  "bg-[radial-gradient(1200px_520px_at_10%_-20%,rgba(99,102,241,0.12),transparent),radial-gradient(900px_420px_at_95%_0%,rgba(16,185,129,0.08),transparent)] bg-background";

function readInitialRightPanelTab(): ShengHuiRightPanelTab {
  try {
    const v = localStorage.getItem(LS_RIGHT_PANEL_TAB);
    if (v === "compose" || v === "materials" || v === "versions" || v === "help") return v;
  } catch {
    /* ignore */
  }
  try {
    const leg = localStorage.getItem(LS_RIGHT_TAB_LEGACY);
    if (leg === "settings") return "help";
    if (leg === "versions") return "versions";
  } catch {
    /* ignore */
  }
  return "compose";
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function outlineStorageKey(workId: string | null): string {
  return LS_OUTLINE_PREFIX + (workId ?? "none");
}

async function buildSettingIndexText(workId: string, maxChars: number): Promise<string> {
  const [chars, worlds, gloss] = await Promise.all([
    listBibleCharacters(workId),
    listBibleWorldEntries(workId),
    listBibleGlossaryTerms(workId),
  ]);
  const parts: string[] = [];
  if (chars.length) {
    const line = chars
      .map((c) => {
        const tab = (c.taboos ?? "").trim();
        return tab ? `${c.name}（禁忌：${tab.slice(0, 60)}${tab.length > 60 ? "…" : ""}）` : c.name;
      })
      .join("、");
    parts.push(`【人物】${line}`);
  }
  if (worlds.length) {
    const lines = worlds.map((w) => {
      const b = (w.body ?? "").trim();
      const snippet = b ? `：${b.slice(0, 100)}${b.length > 100 ? "…" : ""}` : "";
      const kind = (w.entryKind ?? "").trim();
      return kind ? `「${w.title}」(${kind})${snippet}` : `「${w.title}」${snippet}`;
    });
    parts.push(`【世界观】\n${lines.join("\n")}`);
  }
  if (gloss.length) {
    parts.push(`【术语】${gloss.map((g) => g.term).join("、")}`);
  }
  return clampContextText(parts.join("\n\n"), maxChars);
}

function formatChapterBibleForPrompt(b: ChapterBible | undefined): string {
  if (!b) return "";
  const parts: string[] = [];
  if (b.goalText.trim()) parts.push(`本章目标：\n${b.goalText.trim()}`);
  if (b.forbidText.trim()) parts.push(`禁止：\n${b.forbidText.trim()}`);
  if (b.povText.trim()) parts.push(`视角/口吻：\n${b.povText.trim()}`);
  if (b.sceneStance.trim()) parts.push(`场景状态：\n${b.sceneStance.trim()}`);
  if (b.characterStateText.trim()) parts.push(`本章人物状态：\n${b.characterStateText.trim()}`);
  return parts.join("\n\n");
}

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

  // RAG — 藏经风格参考
  const [ragQuery, setRagQuery] = useState("");
  const [ragResults, setRagResults] = useState<ReferenceSearchHit[]>([]);
  const [ragSearching, setRagSearching] = useState(false);
  const [selectedExcerptIds, setSelectedExcerptIds] = useState<Set<string>>(new Set());
  const [outline, setOutline] = useState("");
  const [outlineHydrated, setOutlineHydrated] = useState(false);
  const { styleFeatures, extractingFeatureIds, runExtract, clearForNewRagSearch } = useShengHuiRagStyleFeatures(workId);
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

  // Parameters panel
  const [targetWords, setTargetWords] = useState(2000);

  // Tuiyan import
  const [tuiyanImporting, setTuiyanImporting] = useState(false);

  // Version comparison
  const [compareSnapshotId, setCompareSnapshotId] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(false);

  const [rightPanelTab, setRightPanelTab] = useState<ShengHuiRightPanelTab>(readInitialRightPanelTab);
  const [rightCollapsed, setRightCollapsed] = useState(() => {
    try {
      return localStorage.getItem(LS_RIGHT_COLLAPSED) === "1";
    } catch {
      return false;
    }
  });

  // Scene state card
  const SCENE_STATE_KEY = useMemo(
    () => `liubai:shengHuiSceneState:v1:${workId ?? "none"}:${chapterId ?? "none"}`,
    [workId, chapterId],
  );
  const [sceneState, setSceneState] = useState<SceneStateCard>({
    location: "",
    timeOfDay: "",
    charState: "",
    tension: "",
  });
  const [sceneStateOpen, setSceneStateOpen] = useState(false);
  const [sceneStateExtracting, setSceneStateExtracting] = useState(false);

  // Write-back status
  const [writeBackStatus, setWriteBackStatus] = useState<null | "ok" | "error">(null);
  const [writeBackError, setWriteBackError] = useState("");

  // Snapshots
  const [snapshotBucket, setSnapshotBucket] = useState<ShengHuiSnapshotBucket>({
    snapshots: [],
    adoptedId: null,
  });
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);

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
    // 用稳定包装函数代理到 ref，避免循环依赖（builder 内需要读 hook 返回的 output）。
    buildGenerateArgs: useCallback(() => buildGenerateArgsRef.current(), []),
    onTwoStepIntermediateChange: setTwoStepIntermediate,
    onSnapshotPersisted: ({ snap, runWorkId, runChapterId, isCurrentTarget }) => {
      if (isCurrentTarget) {
        setSnapshotBucket(loadShengHuiSnapshotBucket(runWorkId, runChapterId));
        setSelectedSnapshotId(snap.id);
      }
    },
  });
  const { output, setOutput, busy, error, setError, lastRoughEstimate, runGenerate, stop } = lifecycle;

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

  useEffect(() => {
    setTodayTokensSnapshot(readTodayApproxTokens());
  }, [busy]);
  useEffect(() => {
    const sync = () => setTodayTokensSnapshot(readTodayApproxTokens());
    window.addEventListener("focus", sync);
    return () => window.removeEventListener("focus", sync);
  }, []);

  useEffect(() => {
    if (!busy) {
      setGenElapsedSec(0);
      return;
    }
    const t0 = Date.now();
    setGenElapsedSec(0);
    const id = window.setInterval(() => setGenElapsedSec(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [busy]);

  // Derived
  const isCloudProvider = !isLocalAiProvider(settings.provider);
  const cloudAllowed =
    !isCloudProvider || (settings.privacy.consentAccepted && settings.privacy.allowCloudProviders);
  const canInjectWorkMeta = !isCloudProvider || settings.privacy.allowMetadata;
  const tagProfileText = useMemo(() => (work ? workTagsToProfileText(work.tags) : ""), [work]);
  const selectedChapter = useMemo(
    () => (chapterId ? chapters.find((c) => c.id === chapterId) : undefined),
    [chapters, chapterId],
  );
  const snapshotsNewestFirst = useMemo(
    () => [...snapshotBucket.snapshots].sort((a, b) => b.createdAt - a.createdAt),
    [snapshotBucket.snapshots],
  );
  const outlineKey = useMemo(() => outlineStorageKey(workId), [workId]);

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

  const buildShengHuiPageGenerateArgs = useCallback(async (): Promise<ShengHuiBuildResult> => {
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
      bibleFormatted = formatChapterBibleForPrompt(row);
    }
    const summary = chapterId && includeSummary ? (selectedChapter?.summary ?? "").trim() : "";
    const chapterContent = (selectedChapter?.content ?? "").trim();
    const effectiveBodyTail = computeShengHuiChapterBodyTail({
      fullChapterText: chapterId ? chapterContent : "",
      bodyTailCount,
      generateMode,
    });

    assertShengHuiPrivacy(settings, { includeChapterSummary: Boolean(summary) });

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

  useEffect(() => {
    buildGenerateArgsRef.current = buildShengHuiPageGenerateArgs;
  }, [buildShengHuiPageGenerateArgs]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_RIGHT_PANEL_TAB, rightPanelTab);
    } catch {
      /* ignore */
    }
  }, [rightPanelTab]);
  useEffect(() => {
    try {
      localStorage.setItem(LS_RIGHT_COLLAPSED, rightCollapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [rightCollapsed]);

  // ─── Effects ───────────────────────────────

  const refreshWorks = useCallback(async () => {
    const list = await listWorks();
    setWorks(list);
    return list;
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const list = await refreshWorks();
        let wid: string | null = null;
        try {
          wid = localStorage.getItem(LS_LAST_WORK);
        } catch {
          wid = null;
        }
        if (wid && !list.some((w) => w.id === wid)) wid = null;
        if (!wid) wid = list[0]?.id ?? null;
        setWorkId(wid);
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshWorks]);

  useEffect(() => {
    if (!workId) {
      setWork(null);
      setStyleCard(undefined);
      return;
    }
    void (async () => {
      const [w, sc] = await Promise.all([getWork(workId), getWorkStyleCard(workId)]);
      setWork(w ?? null);
      setStyleCard(sc);
    })();
  }, [workId]);

  useEffect(() => {
    if (!workId) {
      setChapters([]);
      setChapterId(null);
      return;
    }
    void (async () => {
      const [list, w] = await Promise.all([listChapters(workId), getWork(workId)]);
      setChapters(list);
      setChapterId((prev) => {
        if (prev && list.some((c) => c.id === prev)) return prev;
        return resolveDefaultChapterId(workId, list, w ?? undefined);
      });
    })();
  }, [workId]);

  // Outline hydration from sessionStorage
  useEffect(() => {
    if (loading) {
      setOutlineHydrated(false);
      return;
    }
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(outlineKey);
    } catch {
      raw = null;
    }
    setOutline(raw ?? "");
    setOutlineHydrated(true);
  }, [loading, outlineKey]);

  useEffect(() => {
    if (!outlineHydrated || loading) return;
    try {
      sessionStorage.setItem(outlineKey, outline);
    } catch {
      /* quota */
    }
  }, [outline, outlineKey, outlineHydrated, loading]);

  // Setting index
  useEffect(() => {
    if (!canInjectWorkMeta && includeSettingIndex) setIncludeSettingIndex(false);
  }, [canInjectWorkMeta, includeSettingIndex]);

  useEffect(() => {
    if (!workId || !includeSettingIndex) {
      setSettingIndexText("");
      setSettingIndexLoading(false);
      return;
    }
    setSettingIndexLoading(true);
    void (async () => {
      try {
        const t = await buildSettingIndexText(workId, 6000);
        setSettingIndexText(t);
      } finally {
        setSettingIndexLoading(false);
      }
    })();
  }, [workId, includeSettingIndex]);

  // Scene state card — load from sessionStorage when chapter changes
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SCENE_STATE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SceneStateCard>;
        setSceneState({
          location: parsed.location ?? "",
          timeOfDay: parsed.timeOfDay ?? "",
          charState: parsed.charState ?? "",
          tension: parsed.tension ?? "",
        });
      } else {
        setSceneState({ location: "", timeOfDay: "", charState: "", tension: "" });
      }
    } catch {
      setSceneState({ location: "", timeOfDay: "", charState: "", tension: "" });
    }
  }, [SCENE_STATE_KEY]);

  // Scene state card — persist on change
  useEffect(() => {
    try {
      sessionStorage.setItem(SCENE_STATE_KEY, JSON.stringify(sceneState));
    } catch { /* quota */ }
  }, [SCENE_STATE_KEY, sceneState]);

  // Snapshots
  useEffect(() => {
    if (!workId) return;
    const b = loadShengHuiSnapshotBucket(workId, chapterId);
    setSnapshotBucket(b);
    if (b.adoptedId) {
      const adopted = b.snapshots.find((s) => s.id === b.adoptedId);
      if (adopted) {
        setOutput(adopted.prose);
        setSelectedSnapshotId(adopted.id);
        return;
      }
    }
    if (b.snapshots.length) {
      const latest = [...b.snapshots].sort((a, b) => b.createdAt - a.createdAt)[0]!;
      setOutput(latest.prose);
      setSelectedSnapshotId(latest.id);
    } else {
      setOutput("");
      setSelectedSnapshotId(null);
    }
  }, [workId, chapterId]);

  // ─── Handlers ──────────────────────────────

  async function searchRag() {
    if (!ragQuery.trim() || ragSearching) return;
    setRagSearching(true);
    setRagResults([]);
    setSelectedExcerptIds(new Set());
    clearForNewRagSearch();
    try {
      const hits = await searchWritingRagMerged({
        workId: workId ?? "",
        query: ragQuery.trim(),
        limit: RAG_LIMIT,
        sources: { referenceLibrary: true, workBibleExport: false, workManuscript: false },
        chapters,
      });
      setRagResults(hits);
      // Auto-select all results
      setSelectedExcerptIds(new Set(hits.map((h) => h.chunkId)));
    } finally {
      setRagSearching(false);
    }
  }

  async function extractSceneStateFromLatestSnapshot() {
    const latestSnap = snapshotsNewestFirst[0];
    const prose = latestSnap?.prose ?? selectedChapter?.content ?? "";
    if (!prose.trim() || sceneStateExtracting) return;
    setSceneStateExtracting(true);
    try {
      const { generateWithProviderStream } = await import("../ai/client");
      const { getProviderConfig } = await import("../ai/storage");
      const cfg = getProviderConfig(settings, settings.provider);
      const prompt = `请从以下中文小说段落的**末尾部分**，提取四项场景状态信息，用于下一段续写时的衔接。
每项用一句话，不超过30字。若信息不明确则留空。
格式（严格按此，不要加其他内容）：
场所：xxx
时间：xxx
人物状态：xxx
悬念/张力：xxx

【段落】
${prose.slice(-2000)}`;
      let result = "";
      await generateWithProviderStream({
        provider: settings.provider,
        config: cfg,
        messages: [{ role: "user", content: prompt }],
        onDelta: (d) => { result += d; },
        signal: undefined,
        usageLog: { task: "生辉·场景状态", workId },
      });
      // Parse result
      const lines = result.split("\n").map((l) => l.trim()).filter(Boolean);
      const get = (prefix: string) => {
        const line = lines.find((l) => l.startsWith(prefix));
        return line ? line.slice(prefix.length).trim() : "";
      };
      setSceneState({
        location: get("场所："),
        timeOfDay: get("时间："),
        charState: get("人物状态："),
        tension: get("悬念/张力："),
      });
      setSceneStateOpen(true);
    } catch {
      toast.error("AI 提取场景状态失败，请手动填写。");
    } finally {
      setSceneStateExtracting(false);
    }
  }

  function toggleExcerpt(chunkId: string) {
    setSelectedExcerptIds((prev) => {
      const next = new Set(prev);
      if (next.has(chunkId)) next.delete(chunkId);
      else next.add(chunkId);
      return next;
    });
  }

  function extractStyleFeature(chunkId: string, text: string) {
    void runExtract(settings, chunkId, text, () => {
      setSelectedExcerptIds((prev) => new Set(prev).add(chunkId));
    });
  }

  async function importFromTuiyan() {
    if (!workId || tuiyanImporting) return;
    setTuiyanImporting(true);
    try {
      const state = await getTuiyanState(workId);
      if (!state) { toast.info("该作品尚无推演记录。"); return; }
      const entries = state.wenCe.filter((w) => {
        if (!chapterId) return true;
        return !w.relatedOutlineId || w.relatedOutlineId === chapterId;
      });
      if (!entries.length) { toast.info("推演中暂无文策条目。"); return; }
      const lines = entries.map((w) => {
        const prefix = w.type === "decision" ? "【决策】" : w.type === "revision" ? "【修订】" :
          w.type === "milestone" ? "【里程碑】" : w.type === "ai_suggestion" ? "【AI建议】" : "【备注】";
        return `${prefix} ${w.title}\n${w.content.trim()}`;
      });
      const imported = lines.join("\n\n");
      setOutline((prev) => prev.trim() ? `${prev.trim()}\n\n──────\n${imported}` : imported);
    } finally {
      setTuiyanImporting(false);
    }
  }

  function handleWriteBack() {
    if (!workId || !chapterId || !output.trim()) return;
    const result = writeAiPanelDraftWithHistory(workId, chapterId, output.trim());
    if (result.ok) {
      setWriteBackStatus("ok");
      setWriteBackError("");
      setTimeout(() => setWriteBackStatus(null), 4000);
    } else {
      setWriteBackStatus("error");
      setWriteBackError(result.error);
    }
  }

  function markSnapshotAdopted() {
    if (!workId || !selectedSnapshotId) return;
    const b = setShengHuiAdoptedSnapshot(workId, chapterId, selectedSnapshotId);
    setSnapshotBucket(b);
  }

  // ─── Render guards ──────────────────────────

  if (loading) {
    return (
      <div
        className={`relative flex h-dvh min-h-0 w-full flex-col items-center justify-center overflow-hidden ${SHENG_HUI_WORKSPACE_BG}`}
      >
        <ShengHuiAmbientBg />
        <p className="relative z-10 muted">加载中…</p>
      </div>
    );
  }

  if (works.length === 0) {
    return (
      <div
        className={`relative flex h-dvh min-h-0 w-full flex-col items-center justify-center gap-4 overflow-hidden text-center ${SHENG_HUI_WORKSPACE_BG}`}
      >
        <ShengHuiAmbientBg />
        <div className="relative z-10 flex max-w-sm flex-col items-center gap-4">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm">
            <PenLine className="size-6" aria-hidden />
          </div>
          <p className="text-xl font-semibold">生辉 · 仿写工作台</p>
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
      lastWorkStorageKey={LS_LAST_WORK}
      chapters={chapters}
      chapterId={chapterId}
      onChapterIdChange={setChapterId}
      isLg={isLg}
      leftExpanded={leftExpanded}
      onSetLeftOpen={setLeftOpen}
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
          onStop={stop}
          lastRoughEstimate={lastRoughEstimate}
          selectedExcerptCount={selectedExcerptIds.size}
          error={error}
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
          onToggleExcerpt={toggleExcerpt}
          styleFeatures={styleFeatures}
          extractingFeatureIds={extractingFeatureIds}
          onExtractStyleFeature={extractStyleFeature}
          sceneState={sceneState}
          onSceneStateChange={setSceneState}
          sceneStateOpen={sceneStateOpen}
          onSceneStateOpenChange={setSceneStateOpen}
          sceneStateExtracting={sceneStateExtracting}
          onExtractSceneStateFromSnapshot={extractSceneStateFromLatestSnapshot}
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
      className={`relative flex h-dvh min-h-0 w-full flex-col overflow-hidden ${SHENG_HUI_WORKSPACE_BG}`}
    >
      <ShengHuiAmbientBg />
      <ShengHuiWorkspaceTopBar
        works={works}
        workId={workId}
        onWorkIdChange={(v) => {
          setWorkId(v);
          setError(null);
        }}
        lastWorkStorageKey={LS_LAST_WORK}
        chapters={chapters}
        chapterId={chapterId}
        onChapterIdChange={setChapterId}
        work={work}
        selectedChapter={selectedChapter}
        settings={settings}
        onOpenModelPicker={() => setModelPickerOpen(true)}
        loading={loading}
        busy={busy}
        genElapsedSec={genElapsedSec}
        lastTotalApprox={lastRoughEstimate?.totalApprox ?? null}
        todayTokensSnapshot={todayTokensSnapshot}
        focusMode={focusMode}
        onToggleFocus={toggleFocusMode}
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
    </div>
  );
}