import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import { getDB } from "../../../db/database";
import { 
  addReferenceExtract, 
  listReferenceExtracts, 
  addBibleCharacter,
  addBibleWorldEntry,
  addBibleGlossaryTerm,
  addBibleTimelineEvent,
  addWritingStyleSample,
  updateReferenceExtract,
  deleteReferenceExtract
} from "../../../db/repo";
import type { 
  ReferenceExtract, 
  ReferenceExtractType, 
  ReferenceLibraryEntry,
  ReferenceExcerpt
} from "../../../db/types";
import { extractReferenceContent, ReferenceExtractError } from "../../../ai/reference-extract";
import { type ReferenceKeyCard, formatKeyCardText } from "../../../util/reference-key-cards";

interface UseReferenceExtractProps {
  activeRefId: string | null;
  activeTitle: string;
  importWorkId: string;
  navigate: (path: string) => void;
  refWorkPathSeg: (id: string) => string;
  setImportBusy: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}

export function useReferenceExtract({
  activeRefId,
  activeTitle,
  importWorkId,
  navigate,
  refWorkPathSeg,
  setImportBusy,
}: UseReferenceExtractProps) {
  const [extractPanelOpen, setExtractPanelOpen] = useState(false);
  const [extractType, setExtractType] = useState<ReferenceExtractType>("characters");
  const [extractStreaming, setExtractStreaming] = useState("");
  const [extractLoading, setExtractLoading] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [savedExtracts, setSavedExtracts] = useState<ReferenceExtract[]>([]);
  const extractAbortRef = useRef<AbortController | null>(null);

  const [promptExtractDialogOpen, setPromptExtractDialogOpen] = useState(false);
  const [promptExtractSource, setPromptExtractSource] = useState<
    | { kind: "excerpt"; excerptText: string; excerptNote?: string; excerptId: string; bookTitle?: string }
    | { kind: "book"; chunkCount: number; bookTitle?: string }
    | null
  >(null);
  const promptExtractChunksRef = useRef<string[]>([]);

  const [aiChatDialogOpen, setAiChatDialogOpen] = useState(false);
  const [aiChatBookChunks, setAiChatBookChunks] = useState<string[]>([]);

  // 加载书籍已有的提炼记录
  useEffect(() => {
    setExtractStreaming("");
    setExtractError(null);
    setExtractLoading(false);
    if (!activeRefId) {
      setSavedExtracts([]);
      return;
    }
    void (async () => {
      setSavedExtracts(await listReferenceExtracts(activeRefId));
    })();
  }, [activeRefId]);

  const handleStartExtract = useCallback(async () => {
    if (!activeRefId || !activeTitle) return;
    setExtractError(null);
    setExtractStreaming("");
    setExtractLoading(true);
    const ctrl = new AbortController();
    extractAbortRef.current = ctrl;

    try {
      const db = getDB();
      const chunks = await db.referenceChunks
        .where("refWorkId")
        .equals(activeRefId)
        .sortBy("ordinal");
      const chunkTexts = chunks.map((c) => c.content);

      const fullResult = await extractReferenceContent({
        chunkTexts,
        type: extractType,
        bookTitle: activeTitle,
        signal: ctrl.signal,
        onDelta: (delta) => setExtractStreaming((prev) => prev + delta),
      });

      if (!ctrl.signal.aborted && fullResult.trim()) {
        const saved = await addReferenceExtract({
          refWorkId: activeRefId,
          type: extractType,
          body: fullResult,
        });
        setSavedExtracts((prev) => [saved, ...prev]);
        setExtractStreaming("");
      }
    } catch (err) {
      if (err instanceof ReferenceExtractError) {
        setExtractError(err.message);
      } else if (!ctrl.signal.aborted) {
        setExtractError(err instanceof Error ? err.message : "提炼失败");
      }
    } finally {
      setExtractLoading(false);
      extractAbortRef.current = null;
    }
  }, [activeRefId, activeTitle, extractType]);

  const handleImportExtract = useCallback(async (extract: ReferenceExtract) => {
    const wid = importWorkId;
    if (!wid) {
      toast.error("请先在上方选择要导入的作品。");
      return;
    }
    setImportBusy((prev) => ({ ...prev, [extract.id]: true }));
    try {
      let bibleId: string | undefined;
      const body = extract.body;
      const titlePrefix = `【藏经提炼·${activeTitle}】`;
      
      if (extract.type === "characters") {
        const entity = await addBibleCharacter(wid, {
          name: titlePrefix + "人物关系网络",
          motivation: body,
          relationships: "",
          voiceNotes: "",
          taboos: "",
        });
        bibleId = entity.id;
      } else if (extract.type === "worldbuilding") {
        const entity = await addBibleWorldEntry(wid, {
          entryKind: "世界观",
          title: titlePrefix + "核心设定",
          body,
        });
        bibleId = entity.id;
      } else if (extract.type === "plot_beats") {
        const entity = await addBibleTimelineEvent(wid, {
          label: titlePrefix + "情节节拍",
          note: body,
          chapterId: null,
        });
        bibleId = entity.id;
      } else if (extract.type === "craft") {
        const entity = await addWritingStyleSample(wid, {
          title: titlePrefix + "技法摘要",
          body,
        });
        bibleId = entity.id;
      } else if (extract.type === "key_cards") {
        toast.info("结构化要点卡片：请在下方卡片列表中逐张应用到作品模块。");
        return;
      }

      if (bibleId) {
        await updateReferenceExtract(extract.id, { importedBibleId: bibleId });
        setSavedExtracts((prev) =>
          prev.map((e) => (e.id === extract.id ? { ...e, importedBibleId: bibleId } : e)),
        );
      }

      toast.success("已成功导入至对应作品的锦囊库。");
      if (bibleId) {
        navigate(`/work/${refWorkPathSeg(wid)}?bibleId=${encodeURIComponent(bibleId)}`);
      }
    } catch (err) {
      toast.error("导入失败：" + (err instanceof Error ? err.message : String(err)));
    } finally {
      setImportBusy((prev) => {
        const next = { ...prev };
        delete next[extract.id];
        return next;
      });
    }
  }, [importWorkId, activeTitle, navigate, refWorkPathSeg, setImportBusy]);

  const applyKeyCardToWork = useCallback(
    async (card: ReferenceKeyCard) => {
      const wid = importWorkId;
      if (!wid) {
        toast.error("请先在上方选择要导入的作品。");
        return;
      }
      const titlePrefix = `【藏经卡片·${activeTitle}】`;
      const title = `${titlePrefix}${card.title}`.slice(0, 120);
      const body = [card.body, card.sourceHint ? `\n\n> 线索：${card.sourceHint}` : ""].join("").trim();

      if (card.kind === "character") {
        await addBibleCharacter(wid, {
          name: title,
          motivation: body,
          relationships: "",
          voiceNotes: "",
          taboos: "",
        });
      } else if (card.kind === "plot") {
        await addBibleTimelineEvent(wid, {
          label: title,
          note: body,
          chapterId: null,
        });
      } else if (card.kind === "craft" || card.kind === "quote") {
        await addWritingStyleSample(wid, { title, body });
      } else if (card.kind === "glossary") {
        await addBibleGlossaryTerm(wid, {
          term: card.title,
          note: body,
        });
      } else {
        await addBibleWorldEntry(wid, {
          entryKind: "藏经卡片",
          title,
          body,
        });
      }
      const tab = card.kind === "character" ? "characters"
        : card.kind === "plot" ? "timeline"
        : card.kind === "craft" || card.kind === "quote" ? "penfeel"
        : card.kind === "glossary" ? "glossary"
        : "world";
      toast.success("已应用到作品锦囊", {
        action: { label: "去查看", onClick: () => navigate(`/work/${refWorkPathSeg(wid)}/bible?tab=${tab}`) },
      });
    },
    [activeTitle, importWorkId, navigate, refWorkPathSeg],
  );



  const openPromptExtractFromExcerpt = useCallback((ex: ReferenceExcerpt) => {
    setPromptExtractSource({
      kind: "excerpt",
      excerptText: ex.text,
      excerptNote: ex.note ?? "",
      excerptId: ex.id,
    });
    setPromptExtractDialogOpen(true);
  }, []);

  const openPromptExtractFromBook = useCallback(async () => {
    if (!activeRefId) return;
    const db = getDB();
    const chunks = await db.referenceChunks
      .where("refWorkId")
      .equals(activeRefId)
      .sortBy("ordinal");
    promptExtractChunksRef.current = chunks.map((c) => c.content);
    setPromptExtractSource({ kind: "book", chunkCount: chunks.length });
    setPromptExtractDialogOpen(true);
  }, [activeRefId]);

  const openPromptExtractFromEntry = useCallback(async (entry: ReferenceLibraryEntry) => {
    const db = getDB();
    const chunks = await db.referenceChunks
      .where("refWorkId")
      .equals(entry.id)
      .sortBy("ordinal");
    promptExtractChunksRef.current = chunks.map((c) => c.content);
    setPromptExtractSource({ kind: "book", chunkCount: chunks.length, bookTitle: entry.title });
    setPromptExtractDialogOpen(true);
  }, []);

  const openAiChat = useCallback(async (refId: string, _title: string) => {
    if (refId) {
      const db = getDB();
      const chunks = await db.referenceChunks
        .where("refWorkId")
        .equals(refId)
        .sortBy("ordinal");
      // 若已打开书，预取前 4 段用于 system 注入
      setAiChatBookChunks(chunks.slice(0, 4).map((c) => c.content));
    } else {
      setAiChatBookChunks([]);
    }
    setAiChatDialogOpen(true);
  }, []);

  const deleteExtract = useCallback(async (id: string) => {
    await deleteReferenceExtract(id);
    setSavedExtracts((prev) => prev.filter((e) => e.id !== id));
  }, []);

  return {
    extractPanelOpen,
    setExtractPanelOpen,
    extractType,
    setExtractType,
    extractStreaming,
    extractLoading,
    extractError,
    savedExtracts,
    setSavedExtracts,
    extractAbortRef,
    promptExtractDialogOpen,
    setPromptExtractDialogOpen,
    promptExtractSource,
    setPromptExtractSource,
    promptExtractChunksRef,
    aiChatDialogOpen,
    setAiChatDialogOpen,
    aiChatBookChunks,
    handleStartExtract,
    handleImportExtract,
    applyKeyCardToWork,
    formatKeyCardText,
    openPromptExtractFromExcerpt,
    openPromptExtractFromBook,
    openPromptExtractFromEntry,
    openAiChat,
    deleteExtract,
  };
}
