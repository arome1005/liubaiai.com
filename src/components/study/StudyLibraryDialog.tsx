import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { approxRoughTokenCount } from "../../ai/approx-tokens";
import { generateWithProviderStream, isFirstAiGateCancelledError } from "../../ai/client";
import { isLocalAiProvider } from "../../ai/local-provider";
import { getProviderConfig, loadAiSettings } from "../../ai/storage";
import type { AiProviderId, AiSettings } from "../../ai/types";
import { aiModelIdToProvider, aiProviderToModelId } from "../../util/ai-ui-model-map";
import { AI_MODELS } from "../ai-model-selector";
import { UnifiedAIModelSelector as AIModelSelector } from "../ai-model-selector-unified";
import {
  buildExtractCharactersMessages,
  buildExtractTermsMessages,
  parseExtractedCharacters,
  parseExtractedTerms,
  type ExtractedCharacterDraft,
  type ExtractedTermDraft,
} from "../../util/ai-bulk-extract-prompt";
import { listBibleCharacters, listBibleGlossaryTerms, listChapters, listVolumes, listWorks } from "../../db/repo";
import type { BibleCharacter, BibleGlossaryTerm, Chapter, Volume, Work } from "../../db/types";
import { isAbortError } from "../../util/is-abort-error";
import { workPathSegment } from "../../util/work-url";
import { clampStreamMaxOutputTokens } from "../../ai/writing-body-output-budget";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { AiGenerateCharacterModal } from "./AiGenerateCharacterModal";
import { AiGenerateGlossaryTermModal } from "./AiGenerateGlossaryTermModal";
import { CharacterQuickUpdateDialog } from "./CharacterQuickUpdateDialog";
import { StudyImportChapterLinkDialog } from "./StudyImportChapterLinkDialog";

export type StudyLibraryTab = "characters" | "terms";
type CharacterGender = "male" | "female" | "unknown" | "none";

const CHARACTER_NAME_MAX = 15;
const CHARACTER_PERSONALITY_MAX = 300;
const CHARACTER_PROFILE_MAX = 1000;

/** 与本次流式请求的 `maxOutputTokens` 一致（经 clamp），进度 = 粗估已输出 token / 此上限（非定时器模拟） */
const EXTRACT_STREAM_MAX_OUTPUT_TOKENS = clampStreamMaxOutputTokens(16_384);

function extractStreamProgressPercentFromOutput(output: string): number {
  const t = approxRoughTokenCount(output);
  if (t <= 0) return 0;
  return Math.min(99, Math.floor((t / EXTRACT_STREAM_MAX_OUTPUT_TOKENS) * 100));
}

export function StudyLibraryDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workId: string;
  /** 用于站内链接优先书号；不传则路径段为 workId（UUID） */
  linkWork?: Pick<Work, "id" | "bookNo"> | null;
  workTitle: string;
  tab: StudyLibraryTab;
  onTabChange: (tab: StudyLibraryTab) => void;
  chapters: Chapter[];
  activeChapterId: string | null;
  onNavigateToMention: (chapterId: string, query: string) => void | Promise<void>;
  characters: BibleCharacter[];
  glossaryTerms: BibleGlossaryTerm[];
  onRefresh: () => void | Promise<void>;
  addCharacter: (workId: string, input: Partial<Omit<BibleCharacter, "id" | "workId" | "createdAt" | "updatedAt">>) => Promise<BibleCharacter>;
  updateCharacter: (id: string, patch: Partial<Omit<BibleCharacter, "id" | "workId">>) => Promise<void>;
  deleteCharacter: (id: string) => Promise<void>;
  reorderCharacters: (workId: string, orderedIds: string[]) => Promise<void>;
  addGlossaryTerm: (
    workId: string,
    input: Partial<Omit<BibleGlossaryTerm, "id" | "workId" | "createdAt" | "updatedAt">>,
  ) => Promise<BibleGlossaryTerm>;
  updateGlossaryTerm: (id: string, patch: Partial<Omit<BibleGlossaryTerm, "id" | "workId">>) => Promise<void>;
  deleteGlossaryTerm: (id: string) => Promise<void>;
}) {
  const [filterQuery, setFilterQuery] = useState("");
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [selectedTermId, setSelectedTermId] = useState<string | null>(null);
  const [characterDraft, setCharacterDraft] = useState({
    name: "",
    motivation: "",
    relationships: "",
    voiceNotes: "",
    taboos: "",
  });
  const [termDraft, setTermDraft] = useState<{
    term: string
    note: string
  }>({
    term: "",
    note: "",
  })
  const [saving, setSaving] = useState(false);
  const [aiGenModalOpen, setAiGenModalOpen] = useState(false);
  const [aiGlossaryGenModalOpen, setAiGlossaryGenModalOpen] = useState(false);
  const [characterQuickUpdating, setCharacterQuickUpdating] = useState(false);
  const [characterQuickUpdateOpen, setCharacterQuickUpdateOpen] = useState(false);
  const [quickUpdateProgress, setQuickUpdateProgress] = useState<{ current: number; total: number; name?: string } | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importMode, setImportMode] = useState<StudyLibraryTab>("characters");
  const [importWorks, setImportWorks] = useState<Work[]>([]);
  const [importSourceWorkId, setImportSourceWorkId] = useState<string>("");
  const [importLoadingWorks, setImportLoadingWorks] = useState(false);
  const [importLoadingRows, setImportLoadingRows] = useState(false);
  const [importRowsCharacters, setImportRowsCharacters] = useState<BibleCharacter[]>([]);
  const [importRowsTerms, setImportRowsTerms] = useState<BibleGlossaryTerm[]>([]);
  const [importSelectedIds, setImportSelectedIds] = useState<Set<string>>(() => new Set());
  const [importQuery, setImportQuery] = useState("");
  const [importing, setImporting] = useState(false);
  /** "bible"=复制对方书斋已有；"ai-extract"=AI 扫源作品正文 */
  const [importSource, setImportSource] = useState<"bible" | "ai-extract">("bible");
  /** AI 扫描送入模型的章节 id（order 由 util 排序）；切换来源作品时在 effect 中重置 */
  const [extractLinkedChapterIds, setExtractLinkedChapterIds] = useState<string[]>([]);
  const [extractSourceChapters, setExtractSourceChapters] = useState<Chapter[]>([]);
  const [extractSourceVolumes, setExtractSourceVolumes] = useState<Volume[]>([]);
  const [extractChapterLinkOpen, setExtractChapterLinkOpen] = useState(false);
  const extractImportWorkKeyRef = useRef<string>("");
  const [extractRunning, setExtractRunning] = useState(false);
  const [extractStreamPercent, setExtractStreamPercent] = useState(0);
  const extractAbortRef = useRef<AbortController | null>(null);
  const [extractProgress, setExtractProgress] = useState<string>("");
  const [extractCharacters, setExtractCharacters] = useState<ExtractedCharacterDraft[]>([]);
  const [extractTerms, setExtractTerms] = useState<ExtractedTermDraft[]>([]);
  const [extractLastError, setExtractLastError] = useState<string>("");
  /** 扫描专用模型，独立于「设置 → AI」全局选择，避免来回切换 */
  const [extractModelId, setExtractModelId] = useState<string>(() => aiProviderToModelId(loadAiSettings().provider));
  const [extractModelPickerOpen, setExtractModelPickerOpen] = useState(false);
  const extractCurrentModel = useMemo(
    () => AI_MODELS.find((m) => m.id === extractModelId) ?? AI_MODELS[0]!,
    [extractModelId],
  );
  const importSourceWorkTitle = useMemo(() => {
    const w = importWorks.find((x) => x.id === importSourceWorkId);
    return (w?.title ?? "").trim() || "未命名作品";
  }, [importWorks, importSourceWorkId]);

  const extractLinkButtonLabel = useMemo(() => {
    if (!importSourceWorkId) return "请选择来源作品";
    if (extractSourceChapters.length === 0) return "正在加载章节…";
    if (extractLinkedChapterIds.length === 0) return "点击配置关联章节";
    return `已选 ${extractLinkedChapterIds.length} 章`;
  }, [importSourceWorkId, extractSourceChapters.length, extractLinkedChapterIds.length]);

  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [batchSelectedIds, setBatchSelectedIds] = useState<Set<string>>(() => new Set());
  const [batchQuery, setBatchQuery] = useState("");
  const [batchRunning, setBatchRunning] = useState(false);
  const [showCharacterMentions, setShowCharacterMentions] = useState(false);
  const [showTermMentions, setShowTermMentions] = useState(false);
  const [characterGenderById, setCharacterGenderById] = useState<Record<string, CharacterGender>>({});
  const [characterFolderById, setCharacterFolderById] = useState<Record<string, "all">>({});

  const filteredCharacters = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return props.characters;
    return props.characters.filter((c) => {
      const blob = `${c.name}\n${c.motivation}\n${c.relationships}\n${c.voiceNotes}\n${c.taboos}`.toLowerCase();
      return blob.includes(q);
    });
  }, [filterQuery, props.characters]);

  const filteredGlossary = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return props.glossaryTerms;
    return props.glossaryTerms.filter((g) => `${g.term}\n${g.note}`.toLowerCase().includes(q));
  }, [filterQuery, props.glossaryTerms]);

  const selectedCharacter = useMemo(
    () => props.characters.find((c) => c.id === selectedCharacterId) ?? null,
    [props.characters, selectedCharacterId],
  );

  const selectedTerm = useMemo(
    () => props.glossaryTerms.find((g) => g.id === selectedTermId) ?? null,
    [props.glossaryTerms, selectedTermId],
  );

  const importRowsDisplayed = useMemo(() => {
    const q = importQuery.trim().toLowerCase();
    const rows: Array<BibleCharacter | BibleGlossaryTerm | ExtractedCharacterDraft | ExtractedTermDraft> =
      importMode === "characters"
        ? importSource === "ai-extract"
          ? extractCharacters
          : importRowsCharacters
        : importSource === "ai-extract"
          ? extractTerms
          : importRowsTerms;
    if (!q) return rows;
    if (importMode === "characters") {
      return (rows as Array<BibleCharacter | ExtractedCharacterDraft>).filter((c) =>
        `${c.name}\n${c.motivation}\n${c.voiceNotes}\n${c.relationships}`.toLowerCase().includes(q),
      );
    }
    return (rows as Array<BibleGlossaryTerm | ExtractedTermDraft>).filter((t) =>
      `${t.term}\n${t.note}`.toLowerCase().includes(q),
    );
  }, [importMode, importQuery, importSource, importRowsCharacters, importRowsTerms, extractCharacters, extractTerms]);

  /** 未应用筛选词的数据条数（用于决定是否在列表顶栏显示筛选框） */
  const importRowsUnfiltered = useMemo(() => {
    return importMode === "characters"
      ? importSource === "ai-extract"
        ? extractCharacters
        : importRowsCharacters
      : importSource === "ai-extract"
        ? extractTerms
        : importRowsTerms;
  }, [importMode, importSource, importRowsCharacters, importRowsTerms, extractCharacters, extractTerms]);

  const showImportSearchBar = importRowsUnfiltered.length > 0;

  const batchRowsDisplayed = useMemo(() => {
    const q = batchQuery.trim().toLowerCase();
    const rows = props.tab === "characters" ? props.characters : props.glossaryTerms;
    if (!q) return rows;
    if (props.tab === "characters") {
      return props.characters.filter((c) =>
        `${c.name}\n${c.motivation}\n${c.voiceNotes}\n${c.relationships}\n${c.taboos}`.toLowerCase().includes(q),
      );
    }
    return props.glossaryTerms.filter((t) => `${t.term}\n${t.note}`.toLowerCase().includes(q));
  }, [batchQuery, props.characters, props.glossaryTerms, props.tab]);

  useEffect(() => {
    if (!importDialogOpen) return;
    setImportMode(props.tab);
    setImportQuery("");
    setImportSelectedIds(new Set());
    setExtractModelId((prev) => prev || aiProviderToModelId(loadAiSettings().provider));
    let cancelled = false;
    void (async () => {
      setImportLoadingWorks(true);
      try {
        const works = await listWorks();
        if (cancelled) return;
        const candidates = works.filter((w) => w.id !== props.workId);
        setImportWorks(candidates);
        setImportSourceWorkId((prev) => (prev && candidates.some((w) => w.id === prev) ? prev : candidates[0]?.id ?? ""));
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "加载作品列表失败");
      } finally {
        if (!cancelled) setImportLoadingWorks(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [importDialogOpen, props.tab, props.workId]);

  useEffect(() => {
    if (!importDialogOpen) return;
    if (importRowsUnfiltered.length === 0) setImportQuery("");
  }, [importDialogOpen, importRowsUnfiltered.length]);

  /** AI 扫描：加载来源作品的章节 / 卷，并在切换来源作品时默认勾选前 50 章 */
  useEffect(() => {
    if (!importDialogOpen || importSource !== "ai-extract" || !importSourceWorkId) return;
    let cancelled = false;
    void (async () => {
      try {
        const [ch, vol] = await Promise.all([listChapters(importSourceWorkId), listVolumes(importSourceWorkId)]);
        if (cancelled) return;
        setExtractSourceChapters(ch);
        setExtractSourceVolumes(vol);
        const valid = ch.filter((c) => (c.content ?? "").trim()).sort((a, b) => a.order - b.order);
        if (extractImportWorkKeyRef.current !== importSourceWorkId) {
          extractImportWorkKeyRef.current = importSourceWorkId;
          setExtractLinkedChapterIds(valid.slice(0, 50).map((c) => c.id));
        }
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "加载来源章节失败");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [importDialogOpen, importSource, importSourceWorkId]);

  useEffect(() => {
    if (!importDialogOpen || !importSourceWorkId) return;
    if (importSource !== "bible") return; // AI 提取由「开始扫描」按钮触发
    setImportSelectedIds(new Set());
    let cancelled = false;
    void (async () => {
      setImportLoadingRows(true);
      try {
        if (importMode === "characters") {
          const rows = await listBibleCharacters(importSourceWorkId);
          if (!cancelled) setImportRowsCharacters(rows);
        } else {
          const rows = await listBibleGlossaryTerms(importSourceWorkId);
          if (!cancelled) setImportRowsTerms(rows);
        }
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "加载可导入数据失败");
      } finally {
        if (!cancelled) setImportLoadingRows(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [importDialogOpen, importSourceWorkId, importMode, importSource]);

  /** Tab 切换 / 类型 / 源作品变化时清掉勾选与历史结果，避免串号 */
  useEffect(() => {
    setImportSelectedIds(new Set());
    setExtractLastError("");
    if (importSource === "bible") {
      // 切回"复制已有"时清掉上次扫描的草稿，避免误导
      setExtractCharacters([]);
      setExtractTerms([]);
      setExtractProgress("");
    }
  }, [importSource, importMode, importSourceWorkId]);

  function swapOrderIds(list: BibleCharacter[], id: string, dir: -1 | 1): string[] | null {
    const idx = list.findIndex((x) => x.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= list.length) return null;
    const next = list.map((x) => x.id);
    const t = next[idx]!;
    next[idx] = next[j]!;
    next[j] = t;
    return next;
  }

  function countLiteral(haystack: string, needle: string): number {
    if (!needle) return 0;
    let count = 0;
    let from = 0;
    while (true) {
      const idx = haystack.indexOf(needle, from);
      if (idx < 0) break;
      count += 1;
      from = idx + Math.max(1, needle.length);
    }
    return count;
  }

  function buildMentionSnippet(content: string, offset: number, size = 24): string {
    const start = Math.max(0, offset - size);
    const end = Math.min(content.length, offset + size);
    return content.slice(start, end).replace(/\s+/g, " ").trim();
  }

  const chapterOrderMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const ch of props.chapters) m.set(ch.id, ch.order);
    return m;
  }, [props.chapters]);

  const activeOrder = useMemo(
    () => (props.activeChapterId ? chapterOrderMap.get(props.activeChapterId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER),
    [props.activeChapterId, chapterOrderMap],
  );

  const characterMentionKeyword = (selectedCharacter?.name ?? characterDraft.name).trim();
  const termMentionKeyword = (selectedTerm?.term ?? termDraft.term).trim();
  const selectedCharacterGender: CharacterGender = selectedCharacter
    ? characterGenderById[selectedCharacter.id] ?? "unknown"
    : "unknown";
  const selectedCharacterFolder = selectedCharacter ? characterFolderById[selectedCharacter.id] ?? "all" : "all";

  const characterMentionHits = useMemo(() => {
    const kw = characterMentionKeyword;
    if (!kw) return [];
    return props.chapters
      .map((ch) => {
        const body = ch.content ?? "";
        const firstOffset = body.indexOf(kw);
        if (firstOffset < 0) return null;
        return {
          chapterId: ch.id,
          chapterTitle: ch.title,
          chapterOrder: ch.order,
          count: countLiteral(body, kw),
          firstOffset,
          snippet: buildMentionSnippet(body, firstOffset),
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x))
      .sort((a, b) => {
        const da = Math.abs(a.chapterOrder - activeOrder);
        const db = Math.abs(b.chapterOrder - activeOrder);
        if (da !== db) return da - db;
        return a.chapterOrder - b.chapterOrder;
      });
  }, [props.chapters, characterMentionKeyword, activeOrder]);

  const termMentionHits = useMemo(() => {
    const kw = termMentionKeyword;
    if (!kw) return [];
    return props.chapters
      .map((ch) => {
        const body = ch.content ?? "";
        const firstOffset = body.indexOf(kw);
        if (firstOffset < 0) return null;
        return {
          chapterId: ch.id,
          chapterTitle: ch.title,
          chapterOrder: ch.order,
          count: countLiteral(body, kw),
          firstOffset,
          snippet: buildMentionSnippet(body, firstOffset),
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x))
      .sort((a, b) => {
        const da = Math.abs(a.chapterOrder - activeOrder);
        const db = Math.abs(b.chapterOrder - activeOrder);
        if (da !== db) return da - db;
        return a.chapterOrder - b.chapterOrder;
      });
  }, [props.chapters, termMentionKeyword, activeOrder]);

  useEffect(() => {
    if (props.characters.length === 0) {
      setSelectedCharacterId(null);
      return;
    }
    if (!selectedCharacterId || !props.characters.some((c) => c.id === selectedCharacterId)) {
      const firstVisible = filteredCharacters[0]?.id ?? props.characters[0]?.id ?? null;
      setSelectedCharacterId(firstVisible);
    }
  }, [props.characters, filteredCharacters, selectedCharacterId]);

  useEffect(() => {
    if (!selectedCharacter) {
      setCharacterDraft({
        name: "",
        motivation: "",
        relationships: "",
        voiceNotes: "",
        taboos: "",
      });
      return;
    }
    setCharacterDraft({
      name: selectedCharacter.name ?? "",
      motivation: selectedCharacter.motivation ?? "",
      relationships: selectedCharacter.relationships ?? "",
      voiceNotes: selectedCharacter.voiceNotes ?? "",
      taboos: selectedCharacter.taboos ?? "",
    });
    // 从持久化字段同步性别（回落到 "unknown"）
    setCharacterGenderById((prev) => ({
      ...prev,
      [selectedCharacter.id]: (selectedCharacter.gender ?? "unknown") as CharacterGender,
    }));
  }, [selectedCharacter]);

  useEffect(() => {
    setShowCharacterMentions(false);
  }, [selectedCharacterId, characterDraft.name]);

  useEffect(() => {
    if (props.glossaryTerms.length === 0) {
      setSelectedTermId(null);
      return;
    }
    if (!selectedTermId || !props.glossaryTerms.some((g) => g.id === selectedTermId)) {
      const firstVisible = filteredGlossary[0]?.id ?? props.glossaryTerms[0]?.id ?? null;
      setSelectedTermId(firstVisible);
    }
  }, [props.glossaryTerms, filteredGlossary, selectedTermId]);

  useEffect(() => {
    if (!selectedTerm) {
      setTermDraft({
        term: "",
        note: "",
      })
      return
    }
    setTermDraft({
      term: selectedTerm.term ?? "",
      note: selectedTerm.note ?? "",
    })
  }, [selectedTerm]);

  useEffect(() => {
    setShowTermMentions(false);
  }, [selectedTermId, termDraft.term]);

  const characterDirty = useMemo(() => {
    if (!selectedCharacter) return false;
    return (
      characterDraft.name !== selectedCharacter.name ||
      characterDraft.motivation !== selectedCharacter.motivation ||
      characterDraft.relationships !== selectedCharacter.relationships ||
      characterDraft.voiceNotes !== selectedCharacter.voiceNotes ||
      characterDraft.taboos !== selectedCharacter.taboos ||
      selectedCharacterGender !== (selectedCharacter.gender ?? "unknown")
    );
  }, [characterDraft, selectedCharacter, selectedCharacterGender]);

  const termDirty = useMemo(() => {
    if (!selectedTerm) return false
    return termDraft.term !== selectedTerm.term || termDraft.note !== selectedTerm.note
  }, [termDraft, selectedTerm])

  async function saveCharacter() {
    if (!selectedCharacter) return;
    if (!characterDraft.name.trim()) {
      toast.error("人物名不能为空");
      return;
    }
    setSaving(true);
    try {
      await props.updateCharacter(selectedCharacter.id, {
        name: characterDraft.name.trim(),
        motivation: characterDraft.motivation,
        relationships: characterDraft.relationships,
        voiceNotes: characterDraft.voiceNotes,
        taboos: characterDraft.taboos,
        gender: selectedCharacterGender as BibleCharacter["gender"],
      });
      await props.onRefresh();
      toast.success("人物已保存");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function saveTerm() {
    if (!selectedTerm) return;
    if (!termDraft.term.trim()) {
      toast.error("词条名不能为空");
      return;
    }
    setSaving(true);
    try {
      await props.updateGlossaryTerm(selectedTerm.id, {
        term: termDraft.term.trim(),
        note: termDraft.note,
      })
      await props.onRefresh();
      toast.success("词条已保存");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function copyText(text: string, okMessage: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(okMessage);
    } catch {
      toast.error("复制失败，请检查浏览器剪贴板权限");
    }
  }

  function unwrapJsonBlock(raw: string): string {
    const s = raw.trim();
    const fenced = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return fenced ? fenced[1]!.trim() : s;
  }

  /** 当前人物在书斋中编辑的表单与列表中的记录合并成一张「要送给 AI 的卡」；其他人用已保存数据 */
  function resolveCardForQuickUpdate(id: string): BibleCharacter {
    const base = props.characters.find((c) => c.id === id);
    if (!base) throw new Error("人物不存在");
    if (id === selectedCharacterId) {
      return {
        ...base,
        name: characterDraft.name,
        motivation: characterDraft.motivation,
        relationships: characterDraft.relationships,
        voiceNotes: characterDraft.voiceNotes,
        taboos: characterDraft.taboos,
      };
    }
    return base;
  }

  function buildCharacterChapterContext(card: BibleCharacter): string {
    const sourceChapters = props.chapters.filter((c) => (c.content ?? "").trim());
    const activeOrderForPick = activeOrder === Number.MAX_SAFE_INTEGER ? 0 : activeOrder;
    const kw = (card.name ?? "").trim();

    // 轻量检索：优先抓人物名命中片段（相当于不引入向量库的简化 RAG）
    const mentionBlocks = kw
      ? sourceChapters
          .map((ch) => {
            const body = ch.content ?? "";
            if (!body) return null;
            const offsets: number[] = [];
            let from = 0;
            while (offsets.length < 2) {
              const idx = body.indexOf(kw, from);
              if (idx < 0) break;
              offsets.push(idx);
              from = idx + Math.max(1, kw.length);
            }
            if (offsets.length === 0) return null;
            const snippets = offsets
              .map((off) => buildMentionSnippet(body, off, 180))
              .filter(Boolean)
              .map((s, i) => `(${i + 1}) ${s}`);
            return {
              score: countLiteral(body, kw),
              order: ch.order,
              block: `【命中·第${ch.order}章 ${ch.title}】\n${snippets.join("\n")}`,
            };
          })
          .filter((x): x is NonNullable<typeof x> => Boolean(x))
          .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return Math.abs(a.order - activeOrderForPick) - Math.abs(b.order - activeOrderForPick);
          })
          .slice(0, 6)
          .map((x) => x.block)
      : [];

    const nearbyBlocks = [...sourceChapters]
      .sort((a, b) => Math.abs(a.order - activeOrderForPick) - Math.abs(b.order - activeOrderForPick))
      .slice(0, mentionBlocks.length > 0 ? 2 : 4)
      .map((ch) => `【邻近·第${ch.order}章 ${ch.title}】\n${(ch.content ?? "").slice(0, 700)}`);

    const blocks = mentionBlocks.length > 0 ? [...mentionBlocks, ...nearbyBlocks] : nearbyBlocks;
    const out: string[] = [];
    let budget = 0;
    for (const b of blocks) {
      // 软预算，避免批量更新时 token 激增
      if (budget + b.length > 4200) break;
      out.push(b);
      budget += b.length;
    }
    return out.join("\n\n---\n\n");
  }

  async function runOneCharacterQuickUpdate(
    card: BibleCharacter,
    chapterContext: string,
    settings: ReturnType<typeof loadAiSettings>,
  ): Promise<void> {
    const config = getProviderConfig(settings, settings.provider);
    const current = `当前人物卡：\n- 名称：${card.name || "未命名"}\n- 角色信息：${card.motivation || "暂无"}\n- 角色性格：${card.voiceNotes || "暂无"}\n- 关系：${card.relationships || "暂无"}\n- 禁忌：${card.taboos || "暂无"}`;

    const systemPrompt = `你是长篇小说角色卡维护员。请根据用户提供的「当前人物卡」与「本书正文节选」，把各字段改写成与剧情当前进展一致、便于在写作中检索与对照的短摘要。
若某维度在正文中着墨很少，可保留原卡要点或作轻微收束，不要编造与节选明显矛盾的情节。
请严格只输出一个 JSON 对象，不要输出 markdown，不要其他说明文字。
JSON 字段：name, motivation, relationships, voiceNotes, taboos，均为字符串。name 不超过 15 字。`;

    const otherNames = props.characters
      .filter((c) => c.id !== card.id)
      .map((c) => c.name)
      .filter(Boolean);
    const userPrompt = `${current}

同书其他人物名称（改名时请避免与下列重复）：${otherNames.length ? otherNames.join("、") : "无"}

【本书正文节选】
${chapterContext}`;

    let output = "";
    await generateWithProviderStream({
      provider: settings.provider,
      config,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      onDelta: (d) => {
        output += d;
      },
    });
    const parsed = JSON.parse(unwrapJsonBlock(output)) as Partial<{
      name: string;
      motivation: string;
      relationships: string;
      voiceNotes: string;
      taboos: string;
    }>;
    if (!(parsed.name ?? "").trim()) {
      throw new Error("AI 未返回有效角色名");
    }
    await props.updateCharacter(card.id, {
      name: (parsed.name ?? "").trim() || card.name || "未命名",
      motivation: (parsed.motivation ?? "").trim(),
      relationships: (parsed.relationships ?? "").trim(),
      voiceNotes: (parsed.voiceNotes ?? "").trim(),
      taboos: (parsed.taboos ?? "").trim(),
    });
  }

  function runCharacterQuickUpdateBatch(selectedIds: string[]) {
    void (async () => {
      if (selectedIds.length === 0) return;
      const ids = selectedIds.filter((id) => props.characters.some((c) => c.id === id));
      if (ids.length === 0) {
        toast.error("未找到可更新的人物，请重新选择。");
        return;
      }
      const sourceChapters = props.chapters.filter((c) => (c.content ?? "").trim());
      if (sourceChapters.length === 0) {
        toast.error("当前还没有可用正文，无法根据剧情更新。");
        return;
      }
      setCharacterQuickUpdating(true);
      setQuickUpdateProgress({ current: 0, total: ids.length });
      try {
        const settings = loadAiSettings();
        if (!isLocalAiProvider(settings.provider)) {
          if (!settings.privacy.consentAccepted || !settings.privacy.allowCloudProviders) {
            toast.error("请先在设置中开启云端模型。");
            return;
          }
          if (!settings.privacy.allowChapterContent) {
            toast.error("请先在隐私设置中开启「允许正文上云」，才能一键更新。");
            return;
          }
        }
        for (let i = 0; i < ids.length; i++) {
          const id = ids[i]!;
          const card = resolveCardForQuickUpdate(id);
          const chapterContext = buildCharacterChapterContext(card);
          setQuickUpdateProgress({
            current: i + 1,
            total: ids.length,
            name: card.name || "未命名",
          });
          await runOneCharacterQuickUpdate(card, chapterContext, settings);
        }
        await props.onRefresh();
        toast.success(`已根据正文更新 ${ids.length} 个人物卡。`);
        setCharacterQuickUpdateOpen(false);
      } catch (err) {
        if (isFirstAiGateCancelledError(err)) return;
        toast.error(err instanceof Error ? err.message : "一键更新失败");
      } finally {
        setCharacterQuickUpdating(false);
        setQuickUpdateProgress(null);
      }
    })();
  }

  const quickCreateCharacter = async () => {
    try {
      const created = await props.addCharacter(props.workId, { name: "新人物" });
      await props.onRefresh();
      setSelectedCharacterId(created.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "添加失败");
    }
  };

  function toggleImportRow(id: string) {
    setImportSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runImportSelected() {
    if (!importSourceWorkId) {
      toast.error("请先选择来源作品。");
      return;
    }
    const ids = [...importSelectedIds];
    if (ids.length === 0) {
      toast.error("请先勾选要导入的条目。");
      return;
    }
    setImporting(true);
    try {
      if (importMode === "characters") {
        const sourceRows: Array<BibleCharacter | ExtractedCharacterDraft> =
          importSource === "ai-extract" ? extractCharacters : importRowsCharacters;
        const selected = sourceRows.filter((r) => ids.includes(r.id));
        const existed = new Set(props.characters.map((c) => (c.name ?? "").trim().toLowerCase()).filter(Boolean));
        let ok = 0;
        let skipped = 0;
        let firstCreatedId: string | null = null;
        for (const row of selected) {
          const key = (row.name ?? "").trim().toLowerCase();
          if (key && existed.has(key)) {
            skipped += 1;
            continue;
          }
          const created = await props.addCharacter(props.workId, {
            name: row.name || "未命名角色",
            motivation: row.motivation ?? "",
            relationships: row.relationships ?? "",
            voiceNotes: row.voiceNotes ?? "",
            taboos: row.taboos ?? "",
          });
          if (!firstCreatedId) firstCreatedId = created.id;
          if (key) existed.add(key);
          ok += 1;
        }
        await props.onRefresh();
        if (firstCreatedId) setSelectedCharacterId(firstCreatedId);
        toast.success(`导入人物 ${ok} 条${skipped ? `，跳过重名 ${skipped} 条` : ""}。`);
      } else {
        const sourceRows: Array<BibleGlossaryTerm | ExtractedTermDraft> =
          importSource === "ai-extract" ? extractTerms : importRowsTerms;
        const selected = sourceRows.filter((r) => ids.includes(r.id));
        const existed = new Set(props.glossaryTerms.map((t) => (t.term ?? "").trim().toLowerCase()).filter(Boolean));
        let ok = 0;
        let skipped = 0;
        let firstCreatedId: string | null = null;
        for (const row of selected) {
          const key = (row.term ?? "").trim().toLowerCase();
          if (key && existed.has(key)) {
            skipped += 1;
            continue;
          }
          const created = await props.addGlossaryTerm(props.workId, {
            term: row.term || "未命名词条",
            note: row.note ?? "",
          })
          if (!firstCreatedId) firstCreatedId = created.id;
          if (key) existed.add(key);
          ok += 1;
        }
        await props.onRefresh();
        if (firstCreatedId) setSelectedTermId(firstCreatedId);
        toast.success(`导入词条 ${ok} 条${skipped ? `，跳过同名 ${skipped} 条` : ""}。`);
      }
      setImportDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "导入失败");
    } finally {
      setImporting(false);
    }
  }

  async function runAiExtract() {
    if (!importSourceWorkId) {
      toast.error("请先选择来源作品。");
      return;
    }
    const sourceWork = importWorks.find((w) => w.id === importSourceWorkId);
    setExtractLastError("");
    setImportSelectedIds(new Set());
    setExtractStreamPercent(0);
    setExtractRunning(true);
    setExtractProgress("正在加载来源作品的章节…");
    try {
      const chapters = await listChapters(importSourceWorkId);
      const validChapters = chapters.filter((c) => (c.content ?? "").trim());
      if (validChapters.length === 0) {
        setExtractLastError("来源作品没有可用正文，先把章节写入后再扫描。");
        setExtractProgress("");
        return;
      }

      // 隐私门：调云端模型必须开启「允许正文上云」
      const sBase: AiSettings = loadAiSettings();
      const overrideProvider: AiProviderId = aiModelIdToProvider(extractModelId);
      const merged: AiSettings = { ...sBase, provider: overrideProvider };
      if (!isLocalAiProvider(merged.provider)) {
        if (!merged.privacy?.consentAccepted || !merged.privacy?.allowCloudProviders) {
          setExtractLastError("请先在设置中开启云端模型。");
          return;
        }
        if (!merged.privacy?.allowChapterContent) {
          setExtractLastError("请先在隐私设置中开启「允许正文上云」。");
          return;
        }
      }
      const config = getProviderConfig(merged, merged.provider);

      const builder = importMode === "characters" ? buildExtractCharactersMessages : buildExtractTermsMessages;
      const sortedValid = [...validChapters].sort((a, b) => a.order - b.order);
      const fallbackIds = sortedValid.slice(0, 50).map((c) => c.id);
      const chapterIds = extractLinkedChapterIds.length > 0 ? extractLinkedChapterIds : fallbackIds;
      const built = builder({
        chapters: validChapters,
        workTitle: sourceWork?.title ?? "",
        chapterIds,
      });

      setExtractProgress(
        `已发起扫描：取前 ${built.scannedChapters} 章 / 共 ${validChapters.length} 章，约 ${built.totalChars.toLocaleString()} 字${built.truncated ? "（部分内容已截断）" : ""}…`,
      );

      const ac = new AbortController();
      extractAbortRef.current = ac;

      let output = "";
      let lastTickAt = 0;
      await generateWithProviderStream({
        provider: merged.provider,
        config,
        messages: built.messages,
        signal: ac.signal,
        maxOutputTokens: EXTRACT_STREAM_MAX_OUTPUT_TOKENS,
        onDelta: (delta) => {
          output += delta;
          const now = Date.now();
          if (now - lastTickAt > 250) {
            lastTickAt = now;
            setExtractStreamPercent(extractStreamProgressPercentFromOutput(output));
            setExtractProgress(`扫描中…已收到 ${output.length.toLocaleString()} 字符`);
          }
        },
      });

      setExtractStreamPercent(100);

      if (importMode === "characters") {
        const drafts = parseExtractedCharacters(output);
        setExtractCharacters(drafts);
        setExtractProgress(`扫描完成：识别 ${drafts.length} 个角色（请勾选要导入的项）`);
        if (drafts.length === 0) {
          setExtractLastError("AI 未返回有效角色 JSON。可换 2.5 Pro 重试，或减少扫描章节数。");
        }
      } else {
        const drafts = parseExtractedTerms(output);
        setExtractTerms(drafts);
        setExtractProgress(`扫描完成：识别 ${drafts.length} 个词条（请勾选要导入的项）`);
        if (drafts.length === 0) {
          setExtractLastError("AI 未返回有效词条 JSON。可换 2.5 Pro 重试，或减少扫描章节数。");
        }
      }
    } catch (err) {
      if (isFirstAiGateCancelledError(err)) {
        setExtractProgress("");
        return;
      }
      if (isAbortError(err)) {
        setExtractLastError("");
        setExtractProgress("已终止扫描。");
        return;
      }
      const msg = err instanceof Error ? err.message : "AI 扫描失败";
      setExtractLastError(msg);
      setExtractProgress("");
    } finally {
      extractAbortRef.current = null;
      setExtractStreamPercent(0);
      setExtractRunning(false);
    }
  }

  function stopAiExtract() {
    extractAbortRef.current?.abort();
  }

  function openBatchDialog() {
    setBatchQuery("");
    const preset =
      props.tab === "characters"
        ? selectedCharacterId
          ? [selectedCharacterId]
          : []
        : selectedTermId
          ? [selectedTermId]
          : [];
    setBatchSelectedIds(new Set(preset));
    setBatchDialogOpen(true);
  }

  function toggleBatchRow(id: string) {
    setBatchSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runBatchDelete() {
    const ids = [...batchSelectedIds];
    if (ids.length === 0) {
      toast.error("请至少勾选一项。");
      return;
    }
    const label = props.tab === "characters" ? "人物卡" : "词条";
    if (!window.confirm(`确定删除选中的 ${ids.length} 条${label}吗？此操作不可撤销。`)) return;
    setBatchRunning(true);
    try {
      if (props.tab === "characters") {
        for (const id of ids) await props.deleteCharacter(id);
        if (selectedCharacterId && ids.includes(selectedCharacterId)) setSelectedCharacterId(null);
      } else {
        for (const id of ids) await props.deleteGlossaryTerm(id);
        if (selectedTermId && ids.includes(selectedTermId)) setSelectedTermId(null);
      }
      await props.onRefresh();
      setBatchDialogOpen(false);
      toast.success(`已删除 ${ids.length} 条${label}。`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "批量删除失败");
    } finally {
      setBatchRunning(false);
    }
  }

  return (
    <>
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        overlayClassName="work-form-modal-overlay"
        showCloseButton={false}
        aria-describedby={undefined}
        className={cn(
          "study-library-dialog z-[var(--z-modal-app-content)] max-h-[min(85vh,800px)] w-full max-w-[min(1200px,calc(100vw-3rem))] sm:max-w-[min(1200px,calc(100vw-3rem))] gap-0 overflow-hidden border-border bg-[var(--surface)] p-0 shadow-lg",
        )}
      >
        <DialogHeader className="study-library-header flex shrink-0 flex-row items-start justify-between gap-3 border-b border-border/40 px-5 py-3.5 sm:px-6">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span className="study-library-header-accent" aria-hidden />
            <div className="min-w-0">
              <DialogTitle className="text-left text-lg font-semibold tracking-tight">书斋</DialogTitle>
              <p className="study-library-tagline">随写随记，与本书正文同步沉淀</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 pt-0.5">
            <Button asChild type="button" variant="outline" size="sm" className="h-8">
              <Link
                to={`/work/${props.linkWork ? workPathSegment(props.linkWork) : props.workId}/bible`}
                onClick={() => props.onOpenChange(false)}
              >
                打开锦囊页
              </Link>
            </Button>
            <button type="button" className="icon-btn" title="关闭" onClick={() => props.onOpenChange(false)}>
              ×
            </button>
          </div>
        </DialogHeader>

        <div className="study-library-body flex min-h-0 flex-1 flex-col px-5 pb-4 pt-3 sm:px-6 sm:pt-3.5">
          <div className="study-library-toolbar">
            <Button type="button" size="sm" className="study-library-btn-accent" onClick={() => void quickCreateCharacter()}>
              新建角色
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setImportMode(props.tab);
                setImportDialogOpen(true);
              }}
            >
              他书导入
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={openBatchDialog}>
              批量操作
            </Button>
          </div>
          <Tabs
            value={props.tab}
            onValueChange={(v) => props.onTabChange(v as StudyLibraryTab)}
            className="min-h-0 flex-1 gap-0"
          >
            <TabsList className="study-library-subtabs w-full shrink-0 justify-start">
              <TabsTrigger value="characters" className="px-3">
                人物
              </TabsTrigger>
              <TabsTrigger value="terms" className="px-3">
                词条
              </TabsTrigger>
            </TabsList>

            <div className="mt-3.5 shrink-0">
              <input
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder={
                  props.tab === "characters" ? "搜索：姓名、性格、角色信息里的字句…" : "搜索：词条、备注中的关键词…"
                }
                className="study-library-search h-10 w-full rounded-lg border border-border/80 bg-background/80 px-3.5 text-sm shadow-sm"
              />
            </div>

            <TabsContent
              value="characters"
              className="mt-3 flex min-h-0 min-w-0 flex-1 flex-col data-[state=inactive]:hidden"
            >
              <div className="study-library-layout">
                <aside className="study-library-left">
                  <ul className="study-library-list">
                    {filteredCharacters.length === 0 ? (
                      <li className="study-library-empty">暂无匹配人物</li>
                    ) : (
                      filteredCharacters.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            className={cn(
                              "study-library-list-item",
                              selectedCharacterId === c.id && "study-library-list-item--active",
                            )}
                            onClick={() => setSelectedCharacterId(c.id)}
                            title={c.name}
                          >
                            <span className="study-library-list-item-title">{c.name || "（未命名）"}</span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                  <div className="study-library-left-footer">
                    <div className="study-library-left-btns">
                      <Button
                        type="button"
                        className="study-library-btn-accent"
                        size="sm"
                        onClick={() => void quickCreateCharacter()}
                      >
                        + 添加人物
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="study-library-btn-ghost-ai"
                        onClick={() => setAiGenModalOpen(true)}
                      >
                        AI 生成人物
                      </Button>
                    </div>
                  </div>
                </aside>

                <section className="study-library-right">
                  {!selectedCharacter ? (
                      <div className="study-library-right-scroll">
                      <div className="study-library-empty-panel">还没有人物。左下角可添加，或与正文一起用 AI 生成一张起点人物卡。</div>
                    </div>
                  ) : (
                    <>
                      <div className="study-library-right-scroll">
                        <label className="study-library-field study-library-field--compact">
                          <span>所属文件夹</span>
                          <select
                            className="study-library-input"
                            value={selectedCharacterFolder}
                            onChange={(e) => {
                              const v = (e.target.value as "all") ?? "all";
                              setCharacterFolderById((prev) => ({ ...prev, [selectedCharacter.id]: v }));
                            }}
                          >
                            <option value="all">全部</option>
                          </select>
                        </label>
                        <div className="study-library-field">
                          <div className="study-library-field-label-row">
                            <span>角色名称</span>
                            <span className="study-library-field-counter" aria-live="polite">
                              {characterDraft.name.length}/{CHARACTER_NAME_MAX}
                            </span>
                          </div>
                          <input
                            className="study-library-input"
                            value={characterDraft.name}
                            maxLength={CHARACTER_NAME_MAX}
                            onChange={(e) =>
                              setCharacterDraft((p) => ({ ...p, name: e.target.value.slice(0, CHARACTER_NAME_MAX) }))
                            }
                            placeholder="输入角色名"
                          />
                        </div>
                        <div className="study-library-field">
                          <span>性别</span>
                          <div className="study-library-segment">
                            {([
                              ["male", "男"],
                              ["female", "女"],
                              ["unknown", "未知"],
                              ["none", "无"],
                            ] as const).map(([id, label]) => (
                              <button
                                key={id}
                                type="button"
                                className={cn(
                                  "study-library-segment-item",
                                  selectedCharacterGender === id && "study-library-segment-item--active",
                                )}
                                onClick={() => {
                                  if (!selectedCharacter) return;
                                  setCharacterGenderById((prev) => ({ ...prev, [selectedCharacter.id]: id }));
                                }}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <label className="study-library-field">
                          <div className="study-library-field-label-row">
                            <span>角色性格</span>
                            <span className="study-library-field-counter">
                              {characterDraft.voiceNotes.length} / {CHARACTER_PERSONALITY_MAX}
                            </span>
                          </div>
                          <textarea
                            className="study-library-textarea study-library-textarea--personality"
                            maxLength={CHARACTER_PERSONALITY_MAX}
                            value={characterDraft.voiceNotes}
                            onChange={(e) =>
                              setCharacterDraft((p) => ({
                                ...p,
                                voiceNotes: e.target.value.slice(0, CHARACTER_PERSONALITY_MAX),
                              }))
                            }
                            placeholder="请输入角色性格"
                          />
                        </label>
                        <label className="study-library-field">
                          <div className="study-library-field-label-row">
                            <span>角色信息（请根据剧情同步更新，仅填写剧情用得到的信息）</span>
                            <span className="study-library-field-counter">
                              {characterDraft.motivation.length} / {CHARACTER_PROFILE_MAX}
                            </span>
                          </div>
                          <textarea
                            className="study-library-textarea study-library-textarea--profile"
                            maxLength={CHARACTER_PROFILE_MAX}
                            value={characterDraft.motivation}
                            onChange={(e) =>
                              setCharacterDraft((p) => ({
                                ...p,
                                motivation: e.target.value.slice(0, CHARACTER_PROFILE_MAX),
                              }))
                            }
                            placeholder="请输入角色信息"
                          />
                        </label>
                        {showCharacterMentions && characterMentionHits.length > 0 ? (
                          <div className="study-library-mentions">
                            <div className="study-library-mentions-title">本书正文中的出现</div>
                            <ul className="study-library-mention-list">
                              {characterMentionHits.map((hit) => (
                                <li key={hit.chapterId}>
                                  <button
                                    type="button"
                                    className="study-library-mention-item"
                                    onClick={() =>
                                      void (async () => {
                                        await props.onNavigateToMention(hit.chapterId, characterMentionKeyword);
                                        props.onOpenChange(false);
                                      })()
                                    }
                                  >
                                    <span className="study-library-mention-title">
                                      第{hit.chapterOrder}章 · {hit.chapterTitle}（{hit.count}处）
                                    </span>
                                    <span className="study-library-mention-snippet">{hit.snippet}</span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                      <div className="study-library-right-footer">
                        <div className="study-library-primary-actions">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 text-muted-foreground"
                            onClick={() =>
                              void (async () => {
                                try {
                                  const ids = swapOrderIds(props.characters, selectedCharacter.id, -1);
                                  if (!ids) return;
                                  await props.reorderCharacters(props.workId, ids);
                                  await props.onRefresh();
                                } catch (err) {
                                  toast.error(err instanceof Error ? err.message : "排序失败");
                                }
                              })()
                            }
                          >
                            ↑
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 text-muted-foreground"
                            onClick={() =>
                              void (async () => {
                                try {
                                  const ids = swapOrderIds(props.characters, selectedCharacter.id, 1);
                                  if (!ids) return;
                                  await props.reorderCharacters(props.workId, ids);
                                  await props.onRefresh();
                                } catch (err) {
                                  toast.error(err instanceof Error ? err.message : "排序失败");
                                }
                              })()
                            }
                          >
                            ↓
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={characterMentionHits.length === 0}
                            onClick={() => setShowCharacterMentions((v) => !v)}
                          >
                            提及章节（{characterMentionHits.length}）
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            title="在弹窗中勾选要按本书正文重填的人物"
                            disabled={saving || characterQuickUpdating}
                            onClick={() => setCharacterQuickUpdateOpen(true)}
                          >
                            {characterQuickUpdating ? "更新中…" : "一键更新"}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              void copyText(
                                `# ${characterDraft.name || "未命名角色"}\n\n## 角色性格\n${characterDraft.voiceNotes || "暂无"}\n\n## 角色信息\n${characterDraft.motivation || "暂无"}\n\n## 关系（备）\n${characterDraft.relationships || "暂无"}\n\n## 禁忌（备）\n${characterDraft.taboos || "暂无"}`,
                                "已导出人物内容到剪贴板",
                              )
                            }
                          >
                            导出
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                              if (!window.confirm("删除该人物卡？")) return;
                              void (async () => {
                                try {
                                  await props.deleteCharacter(selectedCharacter.id);
                                  await props.onRefresh();
                                  setSelectedCharacterId(null);
                                } catch (err) {
                                  toast.error(err instanceof Error ? err.message : "删除失败");
                                }
                              })();
                            }}
                          >
                            删除
                          </Button>
                          <Button
                            type="button"
                            className="study-library-save"
                            size="sm"
                            disabled={!characterDirty || saving}
                            onClick={() => void saveCharacter()}
                          >
                            {saving ? "保存中…" : "保存"}
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </section>
              </div>
            </TabsContent>

            <TabsContent value="terms" className="mt-3 flex min-h-0 min-w-0 flex-1 flex-col data-[state=inactive]:hidden">
              <div className="study-library-layout">
                <aside className="study-library-left">
                  <ul className="study-library-list">
                    {filteredGlossary.length === 0 ? (
                      <li className="study-library-empty">暂无匹配词条</li>
                    ) : (
                      filteredGlossary.map((g) => (
                        <li key={g.id}>
                          <button
                            type="button"
                            className={cn(
                              "study-library-list-item",
                              selectedTermId === g.id && "study-library-list-item--active",
                            )}
                            onClick={() => setSelectedTermId(g.id)}
                            title={g.term}
                          >
                            <span className="study-library-list-item-title">{g.term || "（未命名）"}</span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                  <div className="study-library-left-footer">
                    <div className="study-library-left-btns">
                      <Button
                        type="button"
                        size="sm"
                        className="study-library-btn-accent"
                        onClick={() =>
                          void (async () => {
                            try {
                              const created = await props.addGlossaryTerm(props.workId, {
                                term: "新术语",
                                note: "",
                              });
                              await props.onRefresh();
                              setSelectedTermId(created.id);
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "添加失败");
                            }
                          })()
                        }
                      >
                        + 添加词条
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="study-library-btn-ghost-ai"
                        onClick={() => setAiGlossaryGenModalOpen(true)}
                      >
                        AI 生成词条
                      </Button>
                    </div>
                  </div>
                </aside>

                <section className="study-library-right">
                  {!selectedTerm ? (
                      <div className="study-library-right-scroll">
                      <div className="study-library-empty-panel">
                        还没有词条。人名、设定用语可收在这里，写正文时随时对照；左下角可添加，或用「AI 生成词条」从正文与「万能词条」提示词生成。
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="study-library-right-scroll">
                        <div className="study-library-term-top study-library-term-top--single">
                          <label className="study-library-field study-library-field--compact">
                            <span>词条名称</span>
                            <input
                              className="study-library-input"
                              value={termDraft.term}
                              onChange={(e) => setTermDraft((p) => ({ ...p, term: e.target.value }))}
                              placeholder="输入词条名"
                            />
                          </label>
                        </div>
                        <label className="study-library-field">
                          <div className="study-library-field-label-row">
                            <span>备注</span>
                            <span className="study-library-field-counter">{termDraft.note.length} 字</span>
                          </div>
                          <textarea
                            className="study-library-textarea study-library-textarea--note"
                            value={termDraft.note}
                            onChange={(e) => setTermDraft((p) => ({ ...p, note: e.target.value }))}
                            placeholder="释义、设定约束、与剧情相关的注意事项"
                          />
                        </label>
                        {showTermMentions && termMentionHits.length > 0 ? (
                          <div className="study-library-mentions">
                            <div className="study-library-mentions-title">本书正文中的出现</div>
                            <ul className="study-library-mention-list">
                              {termMentionHits.map((hit) => (
                                <li key={hit.chapterId}>
                                  <button
                                    type="button"
                                    className="study-library-mention-item"
                                    onClick={() =>
                                      void (async () => {
                                        await props.onNavigateToMention(hit.chapterId, termMentionKeyword);
                                        props.onOpenChange(false);
                                      })()
                                    }
                                  >
                                    <span className="study-library-mention-title">
                                      第{hit.chapterOrder}章 · {hit.chapterTitle}（{hit.count}处）
                                    </span>
                                    <span className="study-library-mention-snippet">{hit.snippet}</span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                      <div className="study-library-right-footer">
                        <div className="study-library-primary-actions study-library-primary-actions--terms">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={termMentionHits.length === 0}
                            onClick={() => setShowTermMentions((v) => !v)}
                          >
                            提及章节（{termMentionHits.length}）
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              void copyText(
                                `# ${termDraft.term || "未命名词条"}\n\n${termDraft.note || "暂无备注"}`,
                                "已导出词条内容到剪贴板",
                              )
                            }
                          >
                            导出
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                              if (!window.confirm("删除该词条？")) return;
                              void (async () => {
                                try {
                                  await props.deleteGlossaryTerm(selectedTerm.id);
                                  await props.onRefresh();
                                  setSelectedTermId(null);
                                } catch (err) {
                                  toast.error(err instanceof Error ? err.message : "删除失败");
                                }
                              })();
                            }}
                          >
                            删除
                          </Button>
                          <Button
                            type="button"
                            className="study-library-save"
                            size="sm"
                            disabled={!termDirty || saving}
                            onClick={() => void saveTerm()}
                          >
                            {saving ? "保存中…" : "保存"}
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </section>
              </div>
            </TabsContent>
          </Tabs>
          <p className="study-library-footnote" role="note">
            留白写作 · 书斋：设定随作品保存，不与其他书混用。
          </p>
        </div>
      </DialogContent>
    </Dialog>
    <Dialog
      open={importDialogOpen}
      onOpenChange={(v) => {
        if (!v && importing) return;
        setImportDialogOpen(v);
      }}
    >
      <DialogContent
        overlayClassName="nested-app-dialog-overlay"
        className={cn(
          "z-[var(--z-modal-nested-content)] flex max-h-[min(85vh,800px)] w-full flex-col gap-0 overflow-hidden border-border bg-[var(--surface)] p-0 shadow-lg",
          "max-w-[min(1200px,calc(100vw-3rem))] sm:max-w-[min(1200px,calc(100vw-3rem))]",
        )}
      >
        <DialogHeader className="relative border-b border-border/50 px-5 py-3 pr-24">
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
              <DialogTitle className="shrink-0 text-base leading-none">他书导入</DialogTitle>
              <div className="inline-flex h-8 shrink-0 gap-0.5 rounded-lg border border-border/40 bg-background/70 p-0.5 shadow-sm">
                <Button
                  type="button"
                  size="sm"
                  variant={importSource === "bible" ? "default" : "ghost"}
                  className="h-7 rounded-md px-2.5 text-xs sm:h-8 sm:px-3 sm:text-sm"
                  disabled={importing || extractRunning}
                  onClick={() => setImportSource("bible")}
                >
                  复制已有
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={importSource === "ai-extract" ? "default" : "ghost"}
                  className="h-7 rounded-md px-2.5 text-xs sm:h-8 sm:px-3 sm:text-sm"
                  disabled={importing || extractRunning}
                  onClick={() => setImportSource("ai-extract")}
                >
                  AI 扫描提取
                </Button>
              </div>
            </div>
            <div className="flex min-h-9 min-w-0 flex-1 items-center gap-1 lg:justify-center lg:px-2">
              <span className="shrink-0 text-xs text-muted-foreground sm:text-sm">作品来源：</span>
              {importLoadingWorks ? (
                <span className="min-w-0 truncate text-sm text-muted-foreground">加载中…</span>
              ) : importWorks.length === 0 ? (
                <span className="min-w-0 truncate text-sm text-destructive">暂无可导入作品</span>
              ) : importWorks.length === 1 ? (
                <span
                  className="min-w-0 truncate text-sm font-medium text-foreground"
                  title={importSourceWorkTitle}
                >
                  {importSourceWorkTitle}
                </span>
              ) : (
                <select
                  aria-label="选择来源作品"
                  className={cn(
                    "box-border min-h-9 min-w-0 max-w-full flex-1 rounded-md border border-border/50 bg-muted/15 px-2.5 py-1.5 text-sm font-medium leading-normal text-foreground",
                    "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
                    "sm:max-w-[min(100%,36rem)]",
                  )}
                  value={importSourceWorkId}
                  disabled={importing || importLoadingWorks}
                  onChange={(e) => setImportSourceWorkId(e.target.value)}
                >
                  {importWorks.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.title || "未命名作品"}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="说明"
                className="absolute right-12 top-3.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <HelpCircle className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end" className="max-w-xs text-xs leading-relaxed">
              {importSource === "bible"
                ? "从其他作品已建立的人物 / 词条复制到当前书斋；同名项自动跳过。"
                : "AI 扫描其他作品的章节正文，自动识别人物或词条；勾选后写入当前书斋（同名跳过）。"}
            </TooltipContent>
          </Tooltip>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-5">
          <div className="rounded-xl border border-border/50 bg-muted/10 p-4 shadow-sm">
            <div className="flex flex-col gap-3">
              {importSource === "ai-extract" ? (
                <div className="flex flex-wrap items-end gap-x-2 gap-y-2 sm:gap-x-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-xs font-medium leading-none text-muted-foreground">导入类型</span>
                    <div className="flex gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant={importMode === "characters" ? "default" : "outline"}
                        className="h-9 px-4"
                        disabled={importing}
                        onClick={() => setImportMode("characters")}
                      >
                        人物
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={importMode === "terms" ? "default" : "outline"}
                        className="h-9 px-4"
                        disabled={importing}
                        onClick={() => setImportMode("terms")}
                      >
                        词条
                      </Button>
                    </div>
                  </div>
                  <div className="flex min-w-0 max-w-[min(100%,22rem)] flex-col gap-1">
                    <span className="text-xs font-medium leading-none text-muted-foreground">关联章节</span>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-auto min-h-9 w-full justify-start whitespace-normal px-3 py-2 text-left text-sm font-normal leading-snug"
                      disabled={extractRunning || importing || !importSourceWorkId}
                      onClick={() => setExtractChapterLinkOpen(true)}
                    >
                      {extractLinkButtonLabel}
                    </Button>
                  </div>
                  <div className="min-w-0 flex-1 basis-[min(100%,18rem)] sm:min-w-[12rem] sm:basis-auto">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium leading-none text-muted-foreground">AI 模型</span>
                      <button
                        type="button"
                        disabled={extractRunning || importing}
                        onClick={() => setExtractModelPickerOpen(true)}
                        className={cn(
                          "flex h-9 w-full min-w-0 items-center gap-2 rounded-md border border-border/60 bg-background px-3 text-left text-sm transition-colors",
                          "hover:border-primary/50 hover:bg-accent/30",
                          (extractRunning || importing) && "cursor-not-allowed opacity-60",
                        )}
                      >
                        <span className="shrink-0 scale-90">{extractCurrentModel.icon}</span>
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-medium text-foreground">{extractCurrentModel.name}</span>
                          <span className="ml-1.5 text-xs text-muted-foreground">{extractCurrentModel.subtitle}</span>
                        </span>
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="invisible select-none text-xs font-medium leading-none" aria-hidden>
                      导入类型
                    </span>
                    <Button
                      type="button"
                      variant={extractRunning ? "outline" : "default"}
                      className="h-9 shrink-0 px-4 sm:px-5"
                      disabled={
                        importing || (!extractRunning && (!importSourceWorkId || extractLinkedChapterIds.length === 0))
                      }
                      onClick={() => {
                        if (extractRunning) stopAiExtract();
                        else void runAiExtract();
                      }}
                    >
                      {extractRunning ? "终止扫描" : "开始扫描"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <span className="block text-xs font-medium text-muted-foreground">导入类型</span>
                  <div className="flex gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant={importMode === "characters" ? "default" : "outline"}
                      className="h-9 px-4"
                      disabled={importing}
                      onClick={() => setImportMode("characters")}
                    >
                      人物
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={importMode === "terms" ? "default" : "outline"}
                      className="h-9 px-4"
                      disabled={importing}
                      onClick={() => setImportMode("terms")}
                    >
                      词条
                    </Button>
                  </div>
                </div>
              )}
              {importSource === "ai-extract" && (extractProgress || extractLastError) ? (
                <div className="space-y-1">
                  {extractProgress ? <p className="text-xs text-muted-foreground">{extractProgress}</p> : null}
                  {extractLastError ? <p className="text-xs text-destructive">{extractLastError}</p> : null}
                </div>
              ) : null}
            </div>
          </div>
          <div className="relative flex min-h-[14rem] flex-1 flex-col overflow-hidden rounded-lg border border-border/60 bg-background/40">
            {showImportSearchBar ? (
              <div className="shrink-0 border-b border-border/50 bg-muted/15 px-3 py-2">
                <input
                  value={importQuery}
                  onChange={(e) => setImportQuery(e.target.value)}
                  disabled={importing}
                  className="study-library-search h-8 w-full rounded-md border border-border/70 bg-background/90 px-3 text-sm shadow-sm"
                  placeholder={importMode === "characters" ? "筛选人物…" : "筛选词条…"}
                />
              </div>
            ) : null}
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {importLoadingRows || extractRunning ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                {extractRunning ? (
                  <span className="font-medium text-foreground">提取进度 {extractStreamPercent}%</span>
                ) : (
                  "加载中…"
                )}
              </p>
            ) : importRowsDisplayed.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                {importSource === "ai-extract"
                  ? "点击上方「开始扫描」让 AI 识别人物或词条"
                  : "暂无可导入数据（来源作品的书斋为空）"}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {importRowsDisplayed.map((row) => {
                  const id = row.id;
                  const checked = importSelectedIds.has(id);
                  return (
                    <li key={id}>
                      <label
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 transition-colors",
                          checked
                            ? "border-primary/60 bg-primary/5"
                            : "border-border/50 hover:border-border hover:bg-accent/20",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={checked}
                          disabled={importing}
                          onChange={() => toggleImportRow(id)}
                        />
                        <span className="min-w-0 flex-1 space-y-0.5 text-sm">
                          {importMode === "characters" ? (
                            <>
                              <span className="block font-medium">{(row as BibleCharacter).name || "（未命名）"}</span>
                              <span className="block text-xs text-muted-foreground line-clamp-2">
                                {(row as BibleCharacter).motivation ||
                                  (row as BibleCharacter).voiceNotes ||
                                  (row as BibleCharacter).relationships ||
                                  "—"}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="block font-medium">{(row as BibleGlossaryTerm).term || "（未命名）"}</span>
                              <span className="block text-xs text-muted-foreground line-clamp-2">
                                {(row as BibleGlossaryTerm).note || "—"}
                              </span>
                            </>
                          )}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-border/40 pt-3">
            <div className="text-xs text-muted-foreground">
              已选 <span className="font-medium text-foreground">{importSelectedIds.size}</span> / 共 {importRowsDisplayed.length} 条
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={importing || importRowsDisplayed.length === 0}
                onClick={() => setImportSelectedIds(new Set(importRowsDisplayed.map((r) => r.id)))}
              >
                全选可见
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={importing || importSelectedIds.size === 0} onClick={() => setImportSelectedIds(new Set())}>
                清空
              </Button>
              <Button type="button" size="sm" disabled={importing || importSelectedIds.size === 0} onClick={() => void runImportSelected()}>
                {importing ? "导入中…" : "开始导入"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    <StudyImportChapterLinkDialog
      open={extractChapterLinkOpen && importDialogOpen}
      onOpenChange={setExtractChapterLinkOpen}
      chapters={extractSourceChapters}
      volumes={extractSourceVolumes}
      selectedIds={extractLinkedChapterIds}
      onConfirm={setExtractLinkedChapterIds}
      disabled={extractRunning || importing}
    />
    <AIModelSelector
      open={extractModelPickerOpen && importDialogOpen}
      onOpenChange={setExtractModelPickerOpen}
      selectedModelId={extractModelId}
      onSelectModel={(id) => {
        setExtractModelId(id);
        setExtractModelPickerOpen(false);
      }}
      title="选择扫描模型"
      overlayClassName="z-[222]"
      contentClassName="z-[223]"
    />
    <Dialog
      open={batchDialogOpen}
      onOpenChange={(v) => {
        if (!v && batchRunning) return;
        setBatchDialogOpen(v);
      }}
    >
      <DialogContent
        overlayClassName="nested-app-dialog-overlay"
        className="z-[var(--z-modal-nested-content)] max-h-[min(84dvh,680px)] max-w-lg overflow-hidden p-0"
      >
        <DialogHeader className="border-b border-border/50 px-4 py-3">
          <DialogTitle>批量操作</DialogTitle>
          <p className="text-xs text-muted-foreground">当前作用于「{props.tab === "characters" ? "人物" : "词条"}」：支持多选删除。</p>
        </DialogHeader>
        <div className="flex min-h-0 flex-col gap-3 p-4">
          <input
            value={batchQuery}
            onChange={(e) => setBatchQuery(e.target.value)}
            disabled={batchRunning}
            className="study-library-search h-9 w-full rounded-md border border-border/80 bg-background/80 px-3 text-sm"
            placeholder={props.tab === "characters" ? "筛选人物…" : "筛选词条…"}
          />
          <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border/60 p-2">
            {batchRowsDisplayed.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">暂无可操作项</p>
            ) : (
              <ul className="space-y-1">
                {batchRowsDisplayed.map((row) => {
                  const id = row.id;
                  const checked = batchSelectedIds.has(id);
                  return (
                    <li key={id}>
                      <label className={cn("flex cursor-pointer items-start gap-2 rounded-md border px-2 py-1.5", checked ? "border-primary/60 bg-primary/5" : "border-border/50")}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={batchRunning}
                          onChange={() => toggleBatchRow(id)}
                        />
                        <span className="min-w-0 flex-1 text-sm">
                          {props.tab === "characters" ? (row as BibleCharacter).name || "（未命名）" : (row as BibleGlossaryTerm).term || "（未命名）"}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-border/40 pt-2">
            <div className="text-xs text-muted-foreground">已选 {batchSelectedIds.size} 条</div>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={batchRunning}
                onClick={() => setBatchSelectedIds(new Set(batchRowsDisplayed.map((r) => r.id)))}
              >
                全选可见
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={batchRunning} onClick={() => setBatchSelectedIds(new Set())}>
                清空
              </Button>
              <Button type="button" size="sm" variant="destructive" disabled={batchRunning || batchSelectedIds.size === 0} onClick={() => void runBatchDelete()}>
                {batchRunning ? "删除中…" : "删除选中"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    <AiGenerateCharacterModal
      open={aiGenModalOpen}
      onOpenChange={setAiGenModalOpen}
      workTitle={props.workTitle}
      workId={props.workId}
      chapters={props.chapters}
      characters={props.characters}
      activeChapterId={props.activeChapterId}
      selectedCharacter={selectedCharacter}
      characterFormDirty={characterDirty}
      onRefresh={props.onRefresh}
      onCharacterGenerated={setSelectedCharacterId}
      addCharacter={props.addCharacter}
      updateCharacter={props.updateCharacter}
    />
    <AiGenerateGlossaryTermModal
      open={aiGlossaryGenModalOpen}
      onOpenChange={setAiGlossaryGenModalOpen}
      workTitle={props.workTitle}
      workId={props.workId}
      chapters={props.chapters}
      glossaryTerms={props.glossaryTerms}
      activeChapterId={props.activeChapterId}
      selectedTerm={selectedTerm}
      termFormDirty={termDirty}
      onRefresh={props.onRefresh}
      onTermGenerated={setSelectedTermId}
      addGlossaryTerm={props.addGlossaryTerm}
      updateGlossaryTerm={props.updateGlossaryTerm}
    />
    <CharacterQuickUpdateDialog
      open={characterQuickUpdateOpen}
      onOpenChange={setCharacterQuickUpdateOpen}
      characters={props.characters}
      anchorCharacterId={selectedCharacterId}
      isRunning={characterQuickUpdating}
      progress={quickUpdateProgress}
      onStart={runCharacterQuickUpdateBatch}
    />
  </>
  );
}
