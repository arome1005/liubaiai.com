import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { WritingWorkStyleSlice } from "../ai/assemble-context";
import { clampContextText } from "../ai/assemble-context";
import { lineDiffRows } from "../util/text-line-diff";
import { isLocalAiProvider } from "../ai/local-provider";
import { getProviderConfig, loadAiSettings } from "../ai/storage";
import { isFirstAiGateCancelledError } from "../ai/client";
import {
  assertShengHuiPrivacy,
  buildShengHuiChatMessages,
  estimateShengHuiRoughTokens,
  generateShengHuiProseStream,
  MODE_DESCS,
  MODE_LABELS,
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
import { AiInlineErrorNotice } from "../components/AiInlineErrorNotice";
import { HubAiSettingsHint } from "../components/HubAiSettingsHint";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { cn } from "../lib/utils";

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const LS_LAST_WORK = "liubai:lastWorkId";
const LS_OUTLINE_PREFIX = "liubai:shengHuiOutline:v1:";
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
  const [includeBodyTail, setIncludeBodyTail] = useState(false);
  const [includeSettingIndex, setIncludeSettingIndex] = useState(false);
  const [settingIndexText, setSettingIndexText] = useState("");
  const [settingIndexLoading, setSettingIndexLoading] = useState(false);

  // RAG — 藏经风格参考
  const [ragQuery, setRagQuery] = useState("");
  const [ragResults, setRagResults] = useState<ReferenceSearchHit[]>([]);
  const [ragSearching, setRagSearching] = useState(false);
  const [selectedExcerptIds, setSelectedExcerptIds] = useState<Set<string>>(new Set());

  // Writing
  const [generateMode, setGenerateMode] = useState<ShengHuiGenerateMode>("write");
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

  function toggleExcerpt(chunkId: string) {
    setSelectedExcerptIds((prev) => {
      const next = new Set(prev);
      if (next.has(chunkId)) next.delete(chunkId);
      else next.add(chunkId);
      return next;
    });
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
      const bodyTail = chapterId && includeBodyTail ? (selectedChapter?.content ?? "").trim() : "";

      assertShengHuiPrivacy(settings, { includeChapterSummary: Boolean(summary) });

      const cfg = getProviderConfig(settings, settings.provider);
      if (!isLocalAiProvider(settings.provider) && !cfg.apiKey?.trim()) {
        setError("请先在设置中填写当前模型的 API Key。");
        return;
      }

      const referenceStyleExcerpts = ragResults
        .filter((h) => selectedExcerptIds.has(h.chunkId))
        .map((h) => (h.preview ?? "").trim())
        .filter(Boolean);

      const needsDraft = generateMode === "continue" || generateMode === "rewrite" || generateMode === "polish";
      const generateArgs = {
        workTitle: work.title.trim() || "未命名",
        chapterTitle: selectedChapter?.title?.trim() || undefined,
        outlineAndStrategy: outline,
        chapterSummary: summary || undefined,
        chapterBodyTail: bodyTail || undefined,
        chapterBibleFormatted: bibleFormatted || undefined,
        settingIndexText: includeSettingIndex && settingIndexText.trim() ? settingIndexText : undefined,
        workStyle: styleCardToSlice(styleCard),
        tagProfileText: tagProfileText || undefined,
        referenceStyleExcerpts: referenceStyleExcerpts.length > 0 ? referenceStyleExcerpts : undefined,
        generateMode,
        draftToProcess: needsDraft ? (output.trim() || undefined) : undefined,
        targetWordCount: targetWords > 0 ? targetWords : undefined,
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
      if (!state) { alert("该作品尚无推演记录。"); return; }
      const entries = state.wenCe.filter((w) => {
        if (!chapterId) return true;
        return !w.relatedOutlineId || w.relatedOutlineId === chapterId;
      });
      if (!entries.length) { alert("推演中暂无文策条目。"); return; }
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
    if (!window.confirm("确定删除该条生成快照？不可恢复。")) return;
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
              <Link to={`/work/${workId}`}>写作页</Link>
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
                {ragResults.map((hit) => (
                  <label
                    key={hit.chunkId}
                    className={cn(
                      "flex cursor-pointer gap-2 rounded-lg border px-2 py-1.5 text-[11px] transition-colors",
                      selectedExcerptIds.has(hit.chunkId)
                        ? "border-primary/40 bg-primary/5"
                        : "border-border/40 bg-card/20 opacity-55 hover:opacity-80",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 shrink-0"
                      checked={selectedExcerptIds.has(hit.chunkId)}
                      onChange={() => toggleExcerpt(hit.chunkId)}
                    />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground/80">
                        {hit.refTitle || "参考书库"}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-muted-foreground">
                        {hit.snippetMatch || hit.preview}
                      </p>
                    </div>
                  </label>
                ))}
                <p className="text-[10px] text-muted-foreground/60">
                  已选 {selectedExcerptIds.size}/{ragResults.length} 条 · 勾选段落将作为风格参考注入
                </p>
              </div>
            )}
          </section>

          {/* Context toggles */}
          <section className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              上下文注入
            </p>
            <div className="flex flex-col gap-1.5">
              {(
                [
                  {
                    key: "summary",
                    label: "本章概要",
                    checked: includeSummary,
                    set: setIncludeSummary,
                    disabled: !chapterId,
                  },
                  {
                    key: "bible",
                    label: "本章锦囊要点",
                    checked: includeBible,
                    set: setIncludeBible,
                    disabled: !chapterId,
                  },
                  {
                    key: "tail",
                    label: "正文末尾（续接）",
                    checked: includeBodyTail,
                    set: setIncludeBodyTail,
                    disabled: !chapterId,
                  },
                  {
                    key: "settingIndex",
                    label: "设定索引（人物/世界观/术语）",
                    checked: includeSettingIndex,
                    set: setIncludeSettingIndex,
                    disabled: !workId || settingIndexLoading || !canInjectWorkMeta,
                  },
                ] as const
              ).map(({ key, label, checked, set, disabled }) => (
                <label
                  key={key}
                  className={cn(
                    "flex cursor-pointer items-start gap-1.5 text-[12px]",
                    disabled && "cursor-not-allowed opacity-45",
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 shrink-0"
                    checked={checked}
                    disabled={disabled}
                    onChange={(e) => set(e.target.checked)}
                  />
                  <span>{label}</span>
                </label>
              ))}
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
          <div className="flex gap-1 rounded-xl border border-border/40 bg-card/40 p-1.5">
            {(["write", "continue", "rewrite", "polish"] as const).map((m) => (
              <button
                key={m}
                type="button"
                title={MODE_DESCS[m]}
                onClick={() => setGenerateMode(m)}
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
            <span className="ml-auto text-[11px] text-muted-foreground/50">
              温度：{settings.geminiTemperature}
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
                {MODE_LABELS[generateMode]}
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
          {snapshotsNewestFirst.length >= 2 && (
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
                <option value="">选择对比版本…</option>
                {snapshotsNewestFirst
                  .filter((s) => s.id !== selectedSnapshotId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {formatRelativeUpdateMs(s.createdAt)} · {s.prose.replace(/\s/g, "").length}字
                    </option>
                  ))}
              </select>
              {showDiff && compareSnapshotId && selectedSnapshotId && (() => {
                const a = snapshotBucket.snapshots.find((s) => s.id === compareSnapshotId);
                const b = snapshotBucket.snapshots.find((s) => s.id === selectedSnapshotId);
                if (!a || !b) return null;
                const rows = lineDiffRows(a.prose, b.prose);
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
        </aside>
      </div>
    </div>
  );
}