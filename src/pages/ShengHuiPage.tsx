import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import type { WritingWorkStyleSlice } from "../ai/assemble-context";
import { clampContextText } from "../ai/assemble-context";
import { lineDiffRows } from "../util/text-line-diff";
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
  MODE_LABELS,
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
import { workPathSegment } from "../util/work-url";
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
import { AiInlineErrorNotice } from "../components/AiInlineErrorNotice";
import { HubAiSettingsHint } from "../components/HubAiSettingsHint";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
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
import { cn } from "../lib/utils";

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const LS_LAST_WORK = "liubai:lastWorkId";
const LS_OUTLINE_PREFIX = "liubai:shengHuiOutline:v1:";
const LS_RIGHT_TAB = "liubai:shengHuiRightTab:v1";
const LS_RIGHT_COLLAPSED = "liubai:shengHuiRightCollapsed:v1";
const RAG_LIMIT = 8;

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

  // Right panel (v0 IA)
  const [rightTab, setRightTab] = useState<"versions" | "settings">(() => {
    try {
      return localStorage.getItem(LS_RIGHT_TAB) === "settings" ? "settings" : "versions";
    } catch {
      return "versions";
    }
  });
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

  useEffect(() => {
    try {
      localStorage.setItem(LS_RIGHT_TAB, rightTab);
    } catch {
      /* ignore */
    }
  }, [rightTab]);
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
      <div className="page flex items-center justify-center">
        <p className="muted">加载中…</p>
      </div>
    );
  }

  if (works.length === 0) {
    return (
      <div className="page flex flex-col items-center justify-center gap-4 text-center">
        <p className="text-xl font-semibold">生辉 · 仿写工作台</p>
        <p className="muted max-w-xs">暂无作品。请先在「留白」创建作品后再使用生辉。</p>
        <Button asChild>
          <Link to="/library">去作品库</Link>
        </Button>
        <HubAiSettingsHint />
      </div>
    );
  }

  // ─── Main render ───────────────────────────

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Top bar ── */}
      <header className="flex shrink-0 items-center gap-3 border-b border-border/40 bg-card/30 px-4 py-2">
        <div className="flex items-baseline gap-2">
          <span className="text-base font-semibold tracking-tight text-foreground">生辉</span>
          <span className="text-xs text-muted-foreground">仿写工作台</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {workId ? (
            <Button variant="ghost" size="sm" asChild>
              <Link to={workId ? `/work/${work ? workPathSegment(work) : workId}` : "/library"}>写作页</Link>
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" asChild>
            <Link to="/library">作品库</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/reference">藏经</Link>
          </Button>
        </div>
      </header>

      {/* ── Three-column body ── */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-hidden p-2 lg:grid-cols-[15rem_1fr_14rem]">

        {/* ══════════════════════════════════════
            LEFT  ·  素材装配
        ══════════════════════════════════════ */}
        <aside className="flex flex-col gap-4 overflow-y-auto rounded-xl border border-border/40 bg-card/40 p-3">

          {/* Work / Chapter selectors */}
          <section className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">目标章节</p>
            <select
              className="input wence-select text-sm"
              value={workId ?? ""}
              onChange={(e) => {
                const v = e.target.value || null;
                setWorkId(v);
                setError(null);
                try {
                  if (v) localStorage.setItem(LS_LAST_WORK, v);
                } catch {
                  /* ignore */
                }
              }}
            >
              {works.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.title.trim() || "未命名"}
                </option>
              ))}
            </select>
            <select
              className="input wence-select text-sm"
              value={chapterId ?? ""}
              onChange={(e) => setChapterId(e.target.value || null)}
              disabled={!chapters.length}
            >
              {!chapters.length ? <option value="">暂无章节</option> : null}
              {chapters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title || "未命名章节"}
                </option>
              ))}
            </select>
          </section>

          {/* RAG — 藏经风格参考 */}
          <section className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              藏经风格参考
            </p>
            <p className="text-[11px] leading-relaxed text-muted-foreground/80">
              从参考书库检索段落，学习其笔法融入创作——仅吸收风格，不引用原文，不洗稿。
            </p>
            <div className="flex gap-1.5">
              <input
                type="text"
                className="input min-w-0 flex-1 text-sm"
                placeholder="搜索场景关键词…"
                value={ragQuery}
                onChange={(e) => setRagQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void searchRag();
                  }
                }}
                disabled={ragSearching}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => void searchRag()}
                disabled={ragSearching || !ragQuery.trim()}
                className="shrink-0 px-2.5"
              >
                {ragSearching ? "…" : "搜索"}
              </Button>
            </div>

            {ragResults.length === 0 && !ragSearching ? (
              <p className="text-[11px] text-muted-foreground/60">
                无结果。请先在「藏经」导入参考书，再搜索关键词。
              </p>
            ) : null}

            {ragResults.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {ragResults.map((hit) => {
                  const feature = styleFeatures.get(hit.chunkId);
                  const isExtracting = extractingFeatureIds.has(hit.chunkId);
                  const isSelected = selectedExcerptIds.has(hit.chunkId);
                  return (
                    <div
                      key={hit.chunkId}
                      className={cn(
                        "flex flex-col gap-1 rounded-lg border px-2 py-1.5 text-[11px] transition-colors",
                        isSelected
                          ? "border-primary/40 bg-primary/5"
                          : "border-border/40 bg-card/20 opacity-55 hover:opacity-80",
                      )}
                    >
                      {/* 顶行：勾选框 + 书名 + 提炼按钮 */}
                      <div className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          className="shrink-0"
                          checked={isSelected}
                          onChange={() => toggleExcerpt(hit.chunkId)}
                        />
                        <p className="min-w-0 flex-1 truncate font-medium text-foreground/80">
                          {hit.refTitle || "参考书库"}
                        </p>
                        <button
                          type="button"
                          className={cn(
                            "shrink-0 rounded px-1.5 py-0.5 text-[10px] transition-colors",
                            feature
                              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                              : "bg-border/30 text-muted-foreground hover:bg-primary/10 hover:text-primary",
                          )}
                          disabled={isExtracting}
                          onClick={() => void extractStyleFeature(hit.chunkId, hit.preview ?? "")}
                          title={feature ? "重新提炼笔法" : "AI 提炼此段的笔法特征，代替原文注入（更安全、更精准）"}
                        >
                          {isExtracting ? "提炼中…" : feature ? "已提炼 ↺" : "提炼笔法"}
                        </button>
                      </div>
                      {/* 内容区：已提炼显示特征，否则显示原文预览 */}
                      {feature ? (
                        <p className="rounded bg-emerald-500/8 px-1.5 py-1 text-[10px] leading-relaxed text-emerald-800 dark:text-emerald-300">
                          {feature}
                        </p>
                      ) : (
                        <p className="line-clamp-2 text-muted-foreground">
                          {hit.snippetMatch || hit.preview}
                        </p>
                      )}
                    </div>
                  );
                })}
                <p className="text-[10px] text-muted-foreground/60">
                  已选 {selectedExcerptIds.size}/{ragResults.length} 条 ·{" "}
                  {styleFeatures.size > 0
                    ? `${styleFeatures.size} 条已提炼笔法（不含原文）`
                    : "勾选后可点「提炼笔法」替代原文注入"}
                </p>
              </div>
            )}
          </section>

          {/* Scene state card */}
          <section className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                场景状态卡
              </p>
              <button
                type="button"
                className="ml-auto text-[10px] text-muted-foreground/70 hover:text-foreground"
                onClick={() => setSceneStateOpen((v) => !v)}
              >
                {sceneStateOpen ? "收起" : (isSceneStateCardEmpty(sceneState) ? "展开填写" : "已填 ✓")}
              </button>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground/70">
              记录上一段落的场所/时间/人物状态/悬念，让 AI 精准续接，比贴末尾正文更省 token。
            </p>
            {!sceneStateOpen && !isSceneStateCardEmpty(sceneState) && (
              <p className="truncate rounded bg-primary/5 px-2 py-1 text-[11px] text-primary/80">
                {formatSceneStateForPrompt(sceneState).replace(/\n/g, " · ")}
              </p>
            )}
            {sceneStateOpen && (
              <div className="flex flex-col gap-1.5 rounded-lg border border-border/40 bg-background/40 p-2">
                {(
                  [
                    { key: "location" as const, label: "场所", placeholder: "如：苏州城外废庙" },
                    { key: "timeOfDay" as const, label: "时间", placeholder: "如：傍晚、三更" },
                    { key: "charState" as const, label: "人物状态", placeholder: "如：顾长安受伤，苏九月守旁" },
                    { key: "tension" as const, label: "悬念/张力", placeholder: "如：追兵未退，信物下落不明" },
                  ] as const
                ).map(({ key, label, placeholder }) => (
                  <label key={key} className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-muted-foreground">{label}</span>
                    <input
                      type="text"
                      className="input text-xs"
                      placeholder={placeholder}
                      value={sceneState[key]}
                      onChange={(e) => setSceneState((prev) => ({ ...prev, [key]: e.target.value }))}
                    />
                  </label>
                ))}
                <div className="flex items-center gap-1.5 pt-0.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    disabled={sceneStateExtracting || !snapshotsNewestFirst.length && !selectedChapter?.content}
                    onClick={() => void extractSceneStateFromLatestSnapshot()}
                    title="从最新快照或当前正文末尾 AI 提取场景状态"
                  >
                    {sceneStateExtracting ? "提取中…" : "AI 提取"}
                  </Button>
                  {!isSceneStateCardEmpty(sceneState) && (
                    <button
                      type="button"
                      className="text-[10px] text-muted-foreground/60 hover:text-destructive"
                      onClick={() => setSceneState({ location: "", timeOfDay: "", charState: "", tension: "" })}
                    >
                      清空
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Character voice locks */}
          {detectedCharNames.size > 0 && (
            <section className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  人物声音锁
                </p>
                <span className="ml-auto text-[10px] text-muted-foreground/60">
                  大纲中检测到
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground/70">
                勾选的人物口吻与禁忌将注入提示词，让对话更有辨识度。
              </p>
              <div className="flex flex-wrap gap-1.5">
                {Array.from(detectedCharNames).map((name) => {
                  const char = bibleCharacters.find((c) => c.name === name);
                  const hasData = char && (char.voiceNotes.trim() || char.taboos.trim());
                  const locked = lockedCharNames.has(name);
                  return (
                    <button
                      key={name}
                      type="button"
                      title={
                        hasData
                          ? `口吻：${char.voiceNotes || "—"}  禁忌：${char.taboos || "—"}`
                          : "该人物暂无口吻/禁忌设定，可在锦囊中补充"
                      }
                      onClick={() => {
                        if (!hasData) return;
                        setLockedCharNames((prev) => {
                          const next = new Set(prev);
                          if (next.has(name)) next.delete(name);
                          else next.add(name);
                          return next;
                        });
                      }}
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                        locked
                          ? "border-primary/50 bg-primary/10 text-primary"
                          : hasData
                            ? "border-border/50 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                            : "cursor-default border-border/30 text-muted-foreground/40",
                      )}
                    >
                      {locked ? "🔒 " : ""}{name}
                      {!hasData && <span className="ml-0.5 text-[9px]">无设定</span>}
                    </button>
                  );
                })}
              </div>
              {lockedCharNames.size > 0 && (
                <p className="text-[10px] text-primary/70">
                  {lockedCharNames.size} 个人物口吻已锁定注入
                </p>
              )}
            </section>
          )}

          {/* Context toggles */}
          <section className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              上下文注入
            </p>
            <div className="flex flex-col gap-1.5">
              {/* 本章概要 */}
              <label className={cn("flex cursor-pointer items-start gap-1.5 text-[12px]", !chapterId && "cursor-not-allowed opacity-45")}>
                <input type="checkbox" className="mt-0.5 shrink-0" checked={includeSummary} disabled={!chapterId} onChange={(e) => setIncludeSummary(e.target.checked)} />
                <span>本章概要</span>
              </label>
              {/* 本章锦囊要点 */}
              <label className={cn("flex cursor-pointer items-start gap-1.5 text-[12px]", !chapterId && "cursor-not-allowed opacity-45")}>
                <input type="checkbox" className="mt-0.5 shrink-0" checked={includeBible} disabled={!chapterId} onChange={(e) => setIncludeBible(e.target.checked)} />
                <span>本章锦囊要点</span>
              </label>
              {/* 正文末尾续接 — N 段选择器 */}
              <div className={cn("flex items-center gap-1.5 text-[12px]", !chapterId && "cursor-not-allowed opacity-45")}>
                <input
                  type="checkbox"
                  className="mt-0.5 shrink-0"
                  checked={bodyTailCount !== false}
                  disabled={!chapterId}
                  onChange={(e) => setBodyTailCount(e.target.checked ? 3 : false)}
                />
                <span className="shrink-0">续接末尾</span>
                {bodyTailCount !== false && (
                  <select
                    className="ml-auto rounded border border-border/40 bg-background/60 px-1 py-0 text-[11px] text-foreground focus:outline-none"
                    value={String(bodyTailCount)}
                    disabled={!chapterId}
                    onChange={(e) => {
                      const v = e.target.value;
                      setBodyTailCount(v === "all" ? "all" : (Number(v) as 1 | 3 | 5));
                    }}
                  >
                    <option value="1">最近 1 段</option>
                    <option value="3">最近 3 段</option>
                    <option value="5">最近 5 段</option>
                    <option value="all">全部末尾</option>
                  </select>
                )}
              </div>
              {/* 设定索引 */}
              <label className={cn("flex cursor-pointer items-start gap-1.5 text-[12px]", (!workId || settingIndexLoading || !canInjectWorkMeta) && "cursor-not-allowed opacity-45")}>
                <input type="checkbox" className="mt-0.5 shrink-0" checked={includeSettingIndex} disabled={!workId || settingIndexLoading || !canInjectWorkMeta} onChange={(e) => setIncludeSettingIndex(e.target.checked)} />
                <span>设定索引（人物/世界观/术语）</span>
              </label>
              {settingIndexLoading ? (
                <p className="text-[11px] text-muted-foreground">索引加载中…</p>
              ) : null}
            </div>
          </section>

          {/* Privacy warning */}
          {workId && work && !canInjectWorkMeta && isCloudProvider ? (
            <p className="text-[11px] leading-relaxed text-muted-foreground/80">
              云端模型·未允许元数据：风格卡与书名无法注入。{" "}
              <Link to="/settings#ai-privacy" className="underline">
                设置 → 隐私
              </Link>
            </p>
          ) : null}

          <HubAiSettingsHint />
        </aside>

        {/* ══════════════════════════════════════
            CENTER  ·  写作台
        ══════════════════════════════════════ */}
        <section className="flex min-w-0 flex-col gap-2 overflow-y-auto">

          {/* Mode tabs */}
          <div className="flex flex-col gap-1 rounded-xl border border-border/40 bg-card/40 p-1.5">
            <div className="flex gap-1">
              {(["write", "continue", "rewrite", "polish"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  title={MODE_DESCS[m]}
                  onClick={() => { setGenerateMode(m); setTwoStepIntermediate(null); }}
                  className={cn(
                    "flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors",
                    generateMode === m
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {MODE_LABELS[m]}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {(["skeleton", "dialogue_first", "segment"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  title={MODE_DESCS[m]}
                  onClick={() => { setGenerateMode(m); setTwoStepIntermediate(null); }}
                  className={cn(
                    "flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors",
                    generateMode === m
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {MODE_LABELS[m]}
                </button>
              ))}
            </div>
          </div>

          {/* Params bar */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/40 bg-card/40 px-3 py-2">
            <span className="text-[11px] font-semibold text-muted-foreground">参数</span>
            <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              目标字数
              <input
                type="number"
                min={0}
                max={20000}
                step={500}
                value={targetWords}
                disabled={busy}
                onChange={(e) => setTargetWords(Math.max(0, Math.min(20000, Number(e.target.value) || 0)))}
                className="w-20 rounded border border-border/40 bg-background/60 px-1.5 py-0.5 text-center text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
              <span className="text-[11px] text-muted-foreground/60">字（0=不限）</span>
            </label>
            <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              情绪温度
              <span className="text-[11px] text-muted-foreground/60">克制</span>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={emotionTemperature}
                disabled={busy}
                onChange={(e) => setEmotionTemperature(Number(e.target.value))}
                className="w-20 accent-primary"
              />
              <span className="text-[11px] text-muted-foreground/60">热烈</span>
              <span className="ml-1 w-4 text-center text-[11px] font-medium text-foreground">{emotionTemperature}</span>
            </label>
            <span className="ml-auto text-[11px] text-muted-foreground/50">
              温度：{getProviderTemperature(settings, settings.provider)}
              {" · "}
              <Link to="/settings" className="underline">设置</Link>
            </span>
          </div>

          {/* Outline textarea */}
          <div className="rounded-xl border border-border/40 bg-card/40 p-3">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                大纲与文策
                {generateMode === "write" ? (
                  <span className="text-destructive">*</span>
                ) : (
                  <span className="text-muted-foreground/60">（选填）</span>
                )}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto h-5 px-1.5 text-[11px]"
                disabled={busy || tuiyanImporting || !workId}
                onClick={() => void importFromTuiyan()}
                title="从该作品的推演文策条目导入"
              >
                {tuiyanImporting ? "导入中…" : "从推演导入"}
              </Button>
            </div>
            <textarea
              className="input wence-input text-sm"
              rows={generateMode === "write" ? 7 : 4}
              placeholder={
                generateMode === "write"
                  ? "从「推演」定稿后粘贴卷纲、细纲与文策要点（必填），或点击「从推演导入」"
                  : "填写以引导方向；重写/精炼时可留空"
              }
              value={outline}
              disabled={busy}
              onChange={(e) => setOutline(e.target.value)}
            />
          </div>

          {/* Two-step progress indicator */}
          {(generateMode === "skeleton" || generateMode === "dialogue_first") && (
            <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-card/60 px-3 py-1.5 text-xs text-muted-foreground">
              <span className={cn("rounded px-1.5 py-0.5 font-medium", !twoStepIntermediate ? "bg-primary text-primary-foreground" : "bg-muted")}>
                第一步：生成{generateMode === "skeleton" ? "情节节拍" : "对话骨架"}
              </span>
              <span className="text-muted-foreground/40">→</span>
              <span className={cn("rounded px-1.5 py-0.5 font-medium", twoStepIntermediate ? "bg-primary text-primary-foreground" : "bg-muted")}>
                第二步：展开正文
              </span>
              {twoStepIntermediate && (
                <button
                  type="button"
                  className="ml-2 text-[11px] text-muted-foreground/60 hover:text-foreground"
                  onClick={() => setTwoStepIntermediate(null)}
                >
                  重置步骤
                </button>
              )}
            </div>
          )}

          {/* Actions bar */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/40 bg-card/40 px-3 py-2">
            {busy ? (
              <Button type="button" variant="secondary" size="sm" onClick={stop}>
                停止
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={() => void runGenerate()}
                disabled={busy || !workId || (generateMode === "write" && !outline.trim())}
              >
                {(generateMode === "skeleton" || generateMode === "dialogue_first")
                  ? twoStepIntermediate ? "第二步：展开正文" : `第一步：生成${generateMode === "skeleton" ? "节拍" : "对话骨架"}`
                  : MODE_LABELS[generateMode]}
              </Button>
            )}
            {lastRoughEstimate ? (
              <span className="text-[11px] text-muted-foreground">
                粗估：~{lastRoughEstimate.inputApprox.toLocaleString()} + ~
                {lastRoughEstimate.outputEstimateApprox.toLocaleString()} tokens
              </span>
            ) : null}
            {selectedExcerptIds.size > 0 ? (
              <Badge variant="outline" className="text-[10px]">
                注入 {selectedExcerptIds.size} 条风格参考
              </Badge>
            ) : null}
          </div>

          {/* Error */}
          {error ? (
            <div className="rounded-xl border border-border/40 bg-card/40 px-3 py-2">
              <AiInlineErrorNotice message={error} />
            </div>
          ) : null}

          {/* Output area (editable) */}
          <div className="flex min-h-0 flex-1 flex-col gap-1.5 rounded-xl border border-border/40 bg-card/40 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">写作台</span>
              {busy ? (
                <span className="animate-pulse text-[11px] text-primary">生成中…</span>
              ) : null}
              {output.trim() && !busy ? (
                <span className="text-[11px] text-muted-foreground/60">
                  {output.replace(/\s/g, "").length} 字
                </span>
              ) : null}
              <div className="ml-auto flex gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => {
                    const t = output.trim();
                    if (t) void navigator.clipboard.writeText(t);
                  }}
                  disabled={!output.trim() || busy}
                >
                  复制
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={handleWriteBack}
                  disabled={!output.trim() || !chapterId || busy}
                  title={!chapterId ? "需选择章节才能写回侧栏" : "写入写作侧栏草稿，在写作页合并到正文"}
                >
                  写回侧栏草稿
                </Button>
              </div>
            </div>

            {writeBackStatus === "ok" ? (
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                ✓ 已写入侧栏草稿。前往写作页 → AI 侧栏 → 草稿区查看与合并。
              </p>
            ) : null}
            {writeBackStatus === "error" ? (
              <p className="text-[11px] text-destructive">{writeBackError}</p>
            ) : null}

            <textarea
              className="min-h-64 flex-1 resize-none rounded-lg border border-border/30 bg-background/60 p-3 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/40 focus:border-primary/40 focus:outline-none focus:ring-0"
              placeholder={
                busy ? "生成中…" : `在此输入或编辑正文…\n（${MODE_DESCS[generateMode]}）`
              }
              value={output}
              onChange={(e) => setOutput(e.target.value)}
              aria-label="生辉写作台"
              disabled={busy}
            />
          </div>
        </section>

        {/* ══════════════════════════════════════
            RIGHT  ·  版本历史
        ══════════════════════════════════════ */}
        <aside className="hidden flex-col gap-3 overflow-y-auto rounded-xl border border-border/40 bg-card/40 p-3 lg:flex">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className={cn(
                "rounded-md px-2 py-1 text-[11px] font-medium",
                rightTab === "versions" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
              )}
              onClick={() => setRightTab("versions")}
            >
              版本
            </button>
            <button
              type="button"
              className={cn(
                "rounded-md px-2 py-1 text-[11px] font-medium",
                rightTab === "settings" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
              )}
              onClick={() => setRightTab("settings")}
            >
              设置
            </button>

            <button
              type="button"
              className="ml-auto rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent"
              onClick={() => setRightCollapsed((v) => !v)}
              title={rightCollapsed ? "展开右侧面板" : "收起右侧面板"}
            >
              {rightCollapsed ? "展开" : "收起"}
            </button>
          </div>

          {rightCollapsed ? (
            <p className="text-[11px] text-muted-foreground/60">右侧面板已收起</p>
          ) : rightTab === "versions" ? (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                版本历史
              </p>
              <p className="text-[11px] leading-relaxed text-muted-foreground/70">
                每次生成自动保存快照（本机·按章节）
              </p>

              {snapshotsNewestFirst.length === 0 ? (
                <p className="text-[12px] text-muted-foreground/60">尚无快照</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {snapshotsNewestFirst.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setSelectedSnapshotId(s.id);
                        setOutput(s.prose);
                      }}
                      className={cn(
                        "rounded-lg border px-2.5 py-2 text-left text-[11px] transition-colors",
                        selectedSnapshotId === s.id
                          ? "border-primary/40 bg-primary/5"
                          : "border-border/40 hover:bg-accent",
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-muted-foreground">
                          {formatRelativeUpdateMs(s.createdAt)}
                        </span>
                        {snapshotBucket.adoptedId === s.id ? (
                          <Badge variant="outline" className="h-4 px-1 text-[9px]">
                            采纳
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-foreground/70">{s.outlinePreview}</p>
                      <p className="mt-0.5 text-muted-foreground/55">
                        {s.prose.replace(/\s/g, "").length} 字
                      </p>
                    </button>
                  ))}
                </div>
              )}

              {/* Version compare toggle */}
              {(snapshotsNewestFirst.length >= 2 || (snapshotsNewestFirst.length >= 1 && selectedChapter?.content)) && (
                <div className="border-t border-border/40 pt-2">
                  <p className="mb-1 text-[10px] text-muted-foreground">版本对比</p>
                  <select
                    className="input wence-select w-full text-xs"
                    value={compareSnapshotId ?? ""}
                    onChange={(e) => {
                      setCompareSnapshotId(e.target.value || null);
                      setShowDiff(!!e.target.value);
                    }}
                  >
                    <option value="">选择对比对象…</option>
                    {selectedChapter?.content ? <option value="__chapter__">当前正文（章节内容）</option> : null}
                    {snapshotsNewestFirst
                      .filter((s) => s.id !== selectedSnapshotId)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {formatRelativeUpdateMs(s.createdAt)} · {s.prose.replace(/\s/g, "").length}字
                        </option>
                      ))}
                  </select>
                  {showDiff && compareSnapshotId && selectedSnapshotId && (() => {
                    const b = snapshotBucket.snapshots.find((s) => s.id === selectedSnapshotId);
                    if (!b) return null;
                    const aText =
                      compareSnapshotId === "__chapter__"
                        ? (selectedChapter?.content ?? "")
                        : (snapshotBucket.snapshots.find((s) => s.id === compareSnapshotId)?.prose ?? "");
                    const bText = b.prose;
                    if (!aText || !bText) return null;
                    const rows = lineDiffRows(aText, bText);
                    if (!rows) return (
                      <p className="mt-1 text-[10px] text-muted-foreground/60">内容过长，无法对比。</p>
                    );
                    return (
                      <div className="mt-1.5 max-h-64 overflow-y-auto rounded border border-border/40 bg-background/60 p-1.5 text-[10px] leading-relaxed">
                        {rows.map((r, i) => (
                          <div
                            key={i}
                            className={cn(
                              "whitespace-pre-wrap break-words",
                              r.kind === "del" && "bg-red-500/10 text-red-600 dark:text-red-400",
                              r.kind === "ins" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                              r.kind === "same" && "text-muted-foreground/60",
                            )}
                          >
                            {r.kind === "del" ? "− " : r.kind === "ins" ? "+ " : "  "}{r.line || "\u00a0"}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}

              {selectedSnapshotId ? (
                <div className="mt-auto flex flex-col gap-1.5 border-t border-border/40 pt-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={markSnapshotAdopted}
                    disabled={busy}
                  >
                    标为当前采纳
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs text-destructive hover:text-destructive"
                    onClick={removeSelectedSnapshot}
                    disabled={busy}
                  >
                    删除此快照
                  </Button>
                  <p className="text-[10px] leading-relaxed text-muted-foreground/60">
                    「写回侧栏草稿」后前往写作页合并，采纳标记仅本页辨认用。
                  </p>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                设置（右侧对齐）
              </p>
              <div className="flex flex-col gap-2">
                <label className="flex items-center justify-between text-[12px] text-muted-foreground">
                  目标字数
                  <input
                    type="number"
                    min={0}
                    max={20000}
                    step={500}
                    value={targetWords}
                    disabled={busy}
                    onChange={(e) => setTargetWords(Math.max(0, Math.min(20000, Number(e.target.value) || 0)))}
                    className="w-20 rounded border border-border/40 bg-background/60 px-1.5 py-0.5 text-center text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                  />
                </label>

                <div className="rounded-lg border border-border/40 bg-background/40 p-2">
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    上下文注入
                  </div>
                  <div className="mt-2 flex flex-col gap-1.5">
                    <label className={cn("flex items-start gap-1.5 text-[12px]", !chapterId && "opacity-45")}>
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={includeSummary}
                        disabled={!chapterId}
                        onChange={(e) => setIncludeSummary(e.target.checked)}
                      />
                      本章概要
                    </label>
                    <label className={cn("flex items-start gap-1.5 text-[12px]", !chapterId && "opacity-45")}>
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={includeBible}
                        disabled={!chapterId}
                        onChange={(e) => setIncludeBible(e.target.checked)}
                      />
                      本章锦囊要点
                    </label>
                    <div className={cn("flex items-center gap-1.5 text-[12px]", !chapterId && "opacity-45")}>
                      <input
                        type="checkbox"
                        className="mt-0.5 shrink-0"
                        checked={bodyTailCount !== false}
                        disabled={!chapterId}
                        onChange={(e) => setBodyTailCount(e.target.checked ? 3 : false)}
                      />
                      <span className="shrink-0">续接末尾</span>
                      {bodyTailCount !== false && (
                        <select
                          className="ml-auto rounded border border-border/40 bg-background/60 px-1 py-0 text-[11px] text-foreground focus:outline-none"
                          value={String(bodyTailCount)}
                          disabled={!chapterId}
                          onChange={(e) => {
                            const v = e.target.value;
                            setBodyTailCount(v === "all" ? "all" : (Number(v) as 1 | 3 | 5));
                          }}
                        >
                          <option value="1">最近 1 段</option>
                          <option value="3">最近 3 段</option>
                          <option value="5">最近 5 段</option>
                          <option value="all">全部末尾</option>
                        </select>
                      )}
                    </div>
                    <label
                      className={cn(
                        "flex items-start gap-1.5 text-[12px]",
                        (!workId || settingIndexLoading || !canInjectWorkMeta) && "opacity-45",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={includeSettingIndex}
                        disabled={!workId || settingIndexLoading || !canInjectWorkMeta}
                        onChange={(e) => setIncludeSettingIndex(e.target.checked)}
                      />
                      设定索引
                    </label>
                  </div>
                </div>

                <div className="rounded-lg border border-border/40 bg-background/40 p-2">
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    藏经风格参考
                  </div>
                  <div className="mt-2 flex gap-1.5">
                    <input
                      type="text"
                      className="input min-w-0 flex-1 text-xs"
                      placeholder="搜索关键词…"
                      value={ragQuery}
                      onChange={(e) => setRagQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void searchRag();
                        }
                      }}
                      disabled={ragSearching}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void searchRag()}
                      disabled={ragSearching || !ragQuery.trim()}
                      className="shrink-0 px-2.5 text-xs"
                    >
                      {ragSearching ? "…" : "搜"}
                    </Button>
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground/60">
                    勾选段落会作为风格参考注入（仅吸收风格，不引用原文）。
                  </p>
                </div>
              </div>
            </>
          )}
        </aside>
      </div>

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