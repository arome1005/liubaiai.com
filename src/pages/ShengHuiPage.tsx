import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import type { WritingWorkStyleSlice } from "../ai/assemble-context";
import { clampContextText } from "../ai/assemble-context";
import { isLocalAiProvider } from "../ai/local-provider";
import { getProviderConfig, getProviderTemperature, loadAiSettings } from "../ai/storage";
import { isFirstAiGateCancelledError } from "../ai/client";
import {
  assertShengHuiPrivacy,
  buildShengHuiChatMessages,
  detectCharactersInOutline,
  estimateShengHuiRoughTokens,
  formatSceneStateForPrompt,
  generateShengHuiProseStream,
  isSceneStateCardEmpty,
  MODE_DESCS,
  takeTailByParagraphs,
  type BodyTailParagraphCount,
  type CharacterVoiceLock,
  type SceneStateCard,
  type ShengHuiGenerateMode,
} from "../ai/sheng-hui-generate";
import { addTodayApproxTokens } from "../ai/daily-approx-tokens";
import { confirmInjectionPrompt, resolveInjectionConfirmPrompt } from "../util/ai-injection-confirm";
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
import {
  appendShengHuiSnapshot,
  deleteShengHuiSnapshot,
  loadShengHuiSnapshotBucket,
  setShengHuiAdoptedSnapshot,
  type ShengHuiSnapshotBucket,
} from "../util/sheng-hui-snapshots";
import { workTagsToProfileText } from "../util/work-tags";
import { searchWritingRagMerged } from "../util/work-rag-runtime";
import { writeAiPanelDraft } from "../util/ai-panel-draft";
import { HubAiSettingsHint } from "../components/HubAiSettingsHint";
import { Button } from "../components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { PenLine, Undo2 } from "lucide-react";
import { ShengHuiAmbientBg } from "../components/sheng-hui/ShengHuiAmbientBg";
import { ShengHuiCenterManuscriptColumn } from "../components/sheng-hui/ShengHuiCenterManuscriptColumn";
import { ShengHuiLeftChapterRail } from "../components/sheng-hui/ShengHuiLeftChapterRail";
import { ShengHuiModelTrigger } from "../components/sheng-hui/ShengHuiModelTrigger";
import { ShengHuiRightColumnSyncHint } from "../components/sheng-hui/ShengHuiRightColumnSyncHint";
import { ShengHuiRightComposeBlock } from "../components/sheng-hui/ShengHuiRightComposeBlock";
import { ShengHuiRightMaterialsBlock } from "../components/sheng-hui/ShengHuiRightMaterialsBlock";
import { ShengHuiRightPanel } from "../components/sheng-hui/ShengHuiRightPanel";
import { ShengHuiRightVersionsBlock } from "../components/sheng-hui/ShengHuiRightVersionsBlock";
import type { ShengHuiRightPanelTab } from "../components/sheng-hui/sheng-hui-right-panel-types";
import { AiPanelModelPickerDialog } from "../components/ai-panel/AiPanelModelPickerDialog";
import { useShengHuiModelPickerBridge } from "../hooks/useShengHuiModelPickerBridge";
import { useShengHuiWorkspacePrefs } from "../hooks/useShengHuiWorkspacePrefs";
import { summarizeShengHuiContextInject, summarizeShengHuiRagSelection } from "../util/sheng-hui-context-inject-summary";
import { buildWorkEditorUrl } from "../util/sheng-hui-deeplink";
import { cn } from "../lib/utils";
import { useShengHuiDeepLink } from "../hooks/useShengHuiDeepLink";

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

function styleCardToSlice(card: WorkStyleCard | undefined): WritingWorkStyleSlice {
  if (!card) return { pov: "", tone: "", bannedPhrases: "", styleAnchor: "", extraRules: "" };
  return {
    pov: card.pov ?? "",
    tone: card.tone ?? "",
    bannedPhrases: card.bannedPhrases ?? "",
    styleAnchor: card.styleAnchor ?? "",
    extraRules: card.extraRules ?? "",
  };
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
  const [bodyTailCount, setBodyTailCount] = useState<BodyTailParagraphCount | false>(false);
  const [includeSettingIndex, setIncludeSettingIndex] = useState(false);
  const [settingIndexText, setSettingIndexText] = useState("");
  const [settingIndexLoading, setSettingIndexLoading] = useState(false);

  // RAG — 藏经风格参考
  const [ragQuery, setRagQuery] = useState("");
  const [ragResults, setRagResults] = useState<ReferenceSearchHit[]>([]);
  const [ragSearching, setRagSearching] = useState(false);
  const [selectedExcerptIds, setSelectedExcerptIds] = useState<Set<string>>(new Set());
  // 风格解构器：chunkId → 提炼出的笔法描述（替代原文注入）
  const [styleFeatures, setStyleFeatures] = useState<Map<string, string>>(new Map());
  const [extractingFeatureIds, setExtractingFeatureIds] = useState<Set<string>>(new Set());

  // 人物声音锁
  const [bibleCharacters, setBibleCharacters] = useState<{ name: string; voiceNotes: string; taboos: string }[]>([]);
  const [lockedCharNames, setLockedCharNames] = useState<Set<string>>(new Set());

  // Writing
  const [generateMode, setGenerateMode] = useState<ShengHuiGenerateMode>("write");
  /** 两步模式（skeleton / dialogue_first）的中间结果：第一步骨架输出 */
  const [twoStepIntermediate, setTwoStepIntermediate] = useState<string | null>(null);
  /** 快照删除确认 Dialog */
  const [deleteSnapshotDialogOpen, setDeleteSnapshotDialogOpen] = useState(false);
  /** 情绪温度：1=克制 … 5=热烈 */
  const [emotionTemperature, setEmotionTemperature] = useState(3);
  const [outline, setOutline] = useState("");
  const [outlineHydrated, setOutlineHydrated] = useState(false);
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const accRef = useRef("");
  const [lastRoughEstimate, setLastRoughEstimate] = useState<{
    inputApprox: number;
    outputEstimateApprox: number;
    totalApprox: number;
  } | null>(null);

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

  const { isLg, setLeftOpen, leftExpanded, stepHintDismissed, dismissStepHint, prefsHydrated } =
    useShengHuiWorkspacePrefs();

  useShengHuiDeepLink(loading, works, chapters, workId, chapterId, setWorkId, setChapterId);

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

  // 人物声音锁 — 随 workId 加载锦囊人物卡
  useEffect(() => {
    if (!workId) { setBibleCharacters([]); return; }
    void listBibleCharacters(workId).then((list) =>
      setBibleCharacters(list.map((c) => ({ name: c.name, voiceNotes: c.voiceNotes, taboos: c.taboos })))
    );
  }, [workId]);

  // 人物声音锁 — 大纲变化时自动检测匹配人物，自动勾选有 voiceNotes/taboos 的
  const detectedCharNames = useMemo(
    () => detectCharactersInOutline(outline, bibleCharacters),
    [outline, bibleCharacters],
  );
  useEffect(() => {
    setLockedCharNames((prev) => {
      const next = new Set<string>();
      for (const name of detectedCharNames) {
        // 自动勾选有 voiceNotes 或 taboos 的；保留用户手动勾选的
        const char = bibleCharacters.find((c) => c.name === name);
        if (char && (char.voiceNotes.trim() || char.taboos.trim())) next.add(name);
        else if (prev.has(name)) next.add(name); // 保留用户手动勾选
      }
      return next;
    });
  }, [detectedCharNames, bibleCharacters]);

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
    setStyleFeatures(new Map());   // 新搜索 → 旧提炼失效
    setExtractingFeatureIds(new Set());
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

  async function extractStyleFeature(chunkId: string, text: string) {
    if (!text.trim() || extractingFeatureIds.has(chunkId)) return;
    setExtractingFeatureIds((prev) => new Set(prev).add(chunkId));
    try {
      const { generateWithProviderStream } = await import("../ai/client");
      const { getProviderConfig } = await import("../ai/storage");
      const cfg = getProviderConfig(settings, settings.provider);
      const prompt = `请从以下中文小说段落中，提炼其笔法特征。
要求：输出 3-4 句简洁的风格描述，涵盖：句子节奏（长短句分布）、遣词风格（古典/白话/现代）、感官偏好（视/听/触/心理）、情绪处理方式（外化动作还是内化心理）。
不要引用原文句子，不要解释，直接给出描述。

【段落】
${text.slice(0, 1500)}`;
      let result = "";
      await generateWithProviderStream({
        provider: settings.provider,
        config: cfg,
        messages: [{ role: "user", content: prompt }],
        onDelta: (d) => { result += d; },
        signal: undefined,
        usageLog: { task: "生辉·笔法提炼", workId },
      });
      const feature = result.trim();
      if (feature) {
        setStyleFeatures((prev) => new Map(prev).set(chunkId, feature));
        // 自动勾选已提炼条目
        setSelectedExcerptIds((prev) => new Set(prev).add(chunkId));
      }
    } catch {
      toast.error("笔法提炼失败，请重试。");
    } finally {
      setExtractingFeatureIds((prev) => {
        const next = new Set(prev);
        next.delete(chunkId);
        return next;
      });
    }
  }

  async function runGenerate() {
    if (!workId || !work || busy) return;
    if (isCloudProvider && !cloudAllowed) {
      setError("请先在设置中同意云端 AI 并允许调用。");
      return;
    }
    if (generateMode === "write" && !outline.trim()) {
      setError("按纲仿写模式：请先填写「大纲与文策」。");
      return;
    }
    if ((generateMode === "rewrite" || generateMode === "polish") && !output.trim()) {
      setError(`${generateMode === "rewrite" ? "重写" : "精炼"}模式需先有草稿内容。`);
      return;
    }
    if ((generateMode === "skeleton" || generateMode === "dialogue_first") && !outline.trim()) {
      setError("请先填写「大纲与文策」。");
      return;
    }

    // 两步模式：判断当前处于第几步
    const isTwoStep = generateMode === "skeleton" || generateMode === "dialogue_first";
    const twoStepPhase: 1 | 2 = isTwoStep && twoStepIntermediate ? 2 : 1;
    // 分段接龙：使用上一段末尾作为 bodyTail
    const isSegment = generateMode === "segment";

    let skipSnapshotAppend = false;
    setError(null);
    setOutput("");
    accRef.current = "";
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);

    try {
      let bibleFormatted = "";
      if (chapterId && includeBible) {
        const row = await getChapterBible(chapterId);
        bibleFormatted = formatChapterBibleForPrompt(row);
      }
      const summary = chapterId && includeSummary ? (selectedChapter?.summary ?? "").trim() : "";
      const bodyTailRaw = chapterId && bodyTailCount !== false ? (selectedChapter?.content ?? "").trim() : "";
      const bodyTail = bodyTailRaw ? takeTailByParagraphs(bodyTailRaw, bodyTailCount as BodyTailParagraphCount) : "";

      assertShengHuiPrivacy(settings, { includeChapterSummary: Boolean(summary) });

      const cfg = getProviderConfig(settings, settings.provider);
      if (!isLocalAiProvider(settings.provider) && !cfg.apiKey?.trim()) {
        setError("请先在设置中填写当前模型的 API Key。");
        return;
      }

      // 有提炼结果的用笔法描述，没有的用原文 preview
      const referenceStyleExcerpts = ragResults
        .filter((h) => selectedExcerptIds.has(h.chunkId))
        .map((h) => {
          const feature = styleFeatures.get(h.chunkId);
          return feature ? `[笔法特征] ${feature}` : (h.preview ?? "").trim();
        })
        .filter(Boolean);

      const needsDraft = generateMode === "continue" || generateMode === "rewrite" || generateMode === "polish";
      // 分段接龙：强制带上末尾 1 段（若未开启续接则自动补）
      const effectiveBodyTail = isSegment && !bodyTail
        ? takeTailByParagraphs((selectedChapter?.content ?? "").trim(), 1)
        : bodyTail;

      // 情绪温度 → 注入 extraRules 尾部
      const emotionTempHint =
        emotionTemperature <= 2
          ? "叙述克制，情绪内化，少用形容词，多用行为描写表达情感。"
          : emotionTemperature >= 4
            ? "情绪饱满，意象丰富，可适当抒情，感官描写密集。"
            : "";
      const baseStyle = styleCardToSlice(styleCard);
      const effectiveWorkStyle: typeof baseStyle = emotionTempHint
        ? { ...baseStyle, extraRules: [baseStyle.extraRules, emotionTempHint].filter(Boolean).join("\n") }
        : baseStyle;

      const generateArgs = {
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
        characterVoiceLocks: (() => {
          const locks: CharacterVoiceLock[] = [];
          for (const name of lockedCharNames) {
            const c = bibleCharacters.find((ch) => ch.name === name);
            if (c && (c.voiceNotes.trim() || c.taboos.trim())) {
              locks.push({ name: c.name, voiceNotes: c.voiceNotes, taboos: c.taboos });
            }
          }
          return locks.length > 0 ? locks : undefined;
        })(),
        twoStepPhase: isTwoStep ? twoStepPhase : undefined,
        intermediateResult: isTwoStep && twoStepPhase === 2 ? (twoStepIntermediate ?? undefined) : undefined,
      };

      const messages = buildShengHuiChatMessages(generateArgs);
      const rough = estimateShengHuiRoughTokens(messages);
      setLastRoughEstimate(rough);

      const confirmPrompt = resolveInjectionConfirmPrompt({
        messages,
        settings,
        willSendBibleToCloud: isCloudProvider && Boolean(bibleFormatted.trim()),
      });
      const roughPlain = `生辉粗估：输入约 ${rough.inputApprox.toLocaleString()} tokens，输出预留约 ${rough.outputEstimateApprox.toLocaleString()} tokens，合计约 ${rough.totalApprox.toLocaleString()}。`;
      if (confirmPrompt.shouldPrompt) {
        if (
          !confirmInjectionPrompt({
            shouldPrompt: true,
            reasons: confirmPrompt.reasons,
            interaction: confirmPrompt.interaction,
            extraLines: [roughPlain],
          })
        ) {
          return;
        }
      }

      const r = await generateShengHuiProseStream({
        ...generateArgs,
        settings,
        signal: ac.signal,
        workId,
        onDelta: (d) => {
          accRef.current += d;
          setOutput((prev) => prev + d);
        },
      });
      const tail = (r.text ?? "").trim();
      if (rough.totalApprox > 0) addTodayApproxTokens(rough.totalApprox);
      if (tail && !accRef.current.trim()) accRef.current = tail;
      setOutput((prev) => (prev.trim() ? prev : tail));
      // 两步模式：第一步完成后保存中间结果，第二步完成后清除
      if (isTwoStep) {
        if (twoStepPhase === 1) {
          setTwoStepIntermediate(accRef.current.trim() || tail);
          skipSnapshotAppend = true; // 第一步骨架不存快照
        } else {
          setTwoStepIntermediate(null);
        }
      }
    } catch (e) {
      if (isFirstAiGateCancelledError(e)) {
        skipSnapshotAppend = true;
        return;
      }
      const aborted = e instanceof Error && (e.name === "AbortError" || /abort/i.test(e.message));
      if (!aborted) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!skipSnapshotAppend && workId) {
        const t = accRef.current.trim();
        if (t) {
          const snap = appendShengHuiSnapshot(workId, chapterId, outline, t);
          setSnapshotBucket(loadShengHuiSnapshotBucket(workId, chapterId));
          setSelectedSnapshotId(snap.id);
          setOutput(t);
        }
      }
      accRef.current = "";
      setBusy(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
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
    const result = writeAiPanelDraft(workId, chapterId, output.trim());
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

  function removeSelectedSnapshot() {
    if (!workId || !selectedSnapshotId) return;
    setDeleteSnapshotDialogOpen(true);
  }

  function confirmDeleteSnapshot() {
    if (!workId || !selectedSnapshotId) return;
    const b = deleteShengHuiSnapshot(workId, chapterId, selectedSnapshotId);
    setSnapshotBucket(b);
    if (b.snapshots.length === 0) {
      setOutput("");
      setSelectedSnapshotId(null);
      return;
    }
    if (b.adoptedId) {
      const ad = b.snapshots.find((s) => s.id === b.adoptedId);
      if (ad) {
        setOutput(ad.prose);
        setSelectedSnapshotId(ad.id);
        return;
      }
    }
    const latest = [...b.snapshots].sort((a, b) => b.createdAt - a.createdAt)[0]!;
    setOutput(latest.prose);
    setSelectedSnapshotId(latest.id);
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

  // ─── Main render ───────────────────────────

  return (
    <div
      className={`relative flex h-dvh min-h-0 w-full flex-col overflow-hidden ${SHENG_HUI_WORKSPACE_BG}`}
    >
      <ShengHuiAmbientBg />
      {/* 顶栏：与推演页同高、独立全屏无 AppShell */}
      <header className="relative z-10 flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border/40 bg-card/45 px-3 backdrop-blur sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" asChild title="返回作品库" aria-label="返回作品库">
            <Link to="/library">
              <Undo2 className="h-4 w-4" />
            </Link>
          </Button>
        </div>
        <div className="flex min-w-0 shrink-0 items-center gap-1 sm:gap-2">
          <ShengHuiModelTrigger
            settings={settings}
            onOpen={() => setModelPickerOpen(true)}
            disabled={loading}
          />
          {workId ? (
            <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" asChild>
              <Link to={work ? buildWorkEditorUrl(work, chapterId, true) : `/work/${workId}`}>写作</Link>
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" asChild>
            <Link to="/logic">推演</Link>
          </Button>
          <Button variant="ghost" size="sm" className="hidden h-8 px-2 text-xs sm:inline-flex" asChild>
            <Link to="/reference">藏经</Link>
          </Button>
        </div>
      </header>

      {/* 左章节目录 / 中主稿 / 右工具+版本+说明（对齐写作编辑页三栏动线） */}
      <div
        className={cn(
          "relative z-10 grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-hidden p-2",
          isLg && !leftExpanded
            ? "lg:grid-cols-[2.75rem_1fr_minmax(20rem,24rem)]"
            : "lg:grid-cols-[14rem_1fr_minmax(20rem,24rem)]",
        )}
      >
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
        />

        <ShengHuiRightPanel
          activeTab={rightPanelTab}
          onTabChange={setRightPanelTab}
          collapsed={rightCollapsed}
          onCollapsedChange={setRightCollapsed}
          compose={
            <ShengHuiRightComposeBlock
              generateMode={generateMode}
              onGenerateModeChange={setGenerateMode}
              onResetTwoStep={() => setTwoStepIntermediate(null)}
              twoStepIntermediate={twoStepIntermediate}
              onResetTwoStepIntermediate={() => setTwoStepIntermediate(null)}
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
              onToggleLockedCharName={(name, hasData) => {
                if (!hasData) return;
                setLockedCharNames((prev) => {
                  const next = new Set(prev);
                  if (next.has(name)) next.delete(name);
                  else next.add(name);
                  return next;
                });
              }}
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
              onRemoveSelected={removeSelectedSnapshot}
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
      </div>

      <AiPanelModelPickerDialog
        open={modelPickerOpen}
        onOpenChange={setModelPickerOpen}
        settings={settings}
        updateSettings={updateSettings}
        updateProvider={updateProvider}
      />

      {/* 快照删除确认 Dialog */}
      <AlertDialog open={deleteSnapshotDialogOpen} onOpenChange={setDeleteSnapshotDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除生成快照</AlertDialogTitle>
            <AlertDialogDescription>确定删除该条生成快照？此操作不可恢复。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { confirmDeleteSnapshot(); setDeleteSnapshotDialogOpen(false); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}