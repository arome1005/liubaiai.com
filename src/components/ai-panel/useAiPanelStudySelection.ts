import { useEffect, useMemo, useRef, useState } from "react";
import type { BibleCharacter, BibleGlossaryTerm } from "../../db/types";
import {
  readStudyChapterSelection,
  writeStudyChapterSelection,
} from "../../util/study-chapter-selection-storage";
import {
  buildStudyNeedleText,
  pickSuggestedCharacterIds,
  pickSuggestedGlossaryIds,
} from "../../util/study-suggestions";
import type { WritingGlossaryTermSlice, WritingStudyCharacterCardSlice } from "../../ai/assemble-context";

interface UseAiPanelStudySelectionArgs {
  workId: string;
  chapterId: string | null;
  bibleCharacters: BibleCharacter[];
  glossaryTerms: BibleGlossaryTerm[];
  /** 用于推荐默认勾选（章节正文 + 概要 + 人物状态文本） */
  chapterContent: string;
  chapterSummary: string | undefined;
  chapterBibleCharacterStateText: string;
}

/**
 * 书斋「本章勾选」：人物/词条卡的本章勾选状态，随章节切换自动读取/推荐默认值，
 * 并在勾选变化时写回 localStorage。
 * 同时派生出组装请求所需的 slice 列表，以避免在 AiPanel 中重复计算。
 */
export function useAiPanelStudySelection(args: UseAiPanelStudySelectionArgs) {
  const {
    workId,
    chapterId,
    bibleCharacters,
    glossaryTerms,
    chapterContent,
    chapterSummary,
    chapterBibleCharacterStateText,
  } = args;

  const [studyPickedCharacterIds, setStudyPickedCharacterIds] = useState<string[]>([]);
  const [studyPickedGlossaryIds, setStudyPickedGlossaryIds] = useState<string[]>([]);
  const [studyCharacterSource, setStudyCharacterSource] = useState<"cards" | "npc">("cards");
  const [studyNpcText, setStudyNpcText] = useState("");

  /** 防章节切换瞬间把 localStorage 默认值写覆盖到上一章 */
  const studySelectionHydratedForChapterRef = useRef<string | null>(null);

  // ── 读取 / 推荐默认值（章节切换时） ────────────────────────────────────────
  useEffect(() => {
    // queueMicrotask 避免在 effect body 内同步 setState（set-state-in-effect 规则）
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;

      if (!workId || !chapterId) {
        setStudyPickedCharacterIds([]);
        setStudyPickedGlossaryIds([]);
        setStudyCharacterSource("cards");
        setStudyNpcText("");
        studySelectionHydratedForChapterRef.current = null;
        return;
      }

      studySelectionHydratedForChapterRef.current = null;

      const saved = readStudyChapterSelection(workId, chapterId);
      const charSet = new Set(bibleCharacters.map((c) => c.id));
      const glossSet = new Set(glossaryTerms.map((g) => g.id));

      if (saved) {
        const charIds = saved.characterIds.filter((id) => charSet.has(id));
        let glossIds = saved.glossaryIds.filter((id) => glossSet.has(id));
        if (saved.glossaryMode === "full_book") {
          glossIds = glossaryTerms.map((g) => g.id).filter((id) => glossSet.has(id));
        }
        setStudyPickedCharacterIds(charIds);
        setStudyPickedGlossaryIds(glossIds);
        setStudyCharacterSource(saved.characterSource === "npc" ? "npc" : "cards");
        setStudyNpcText(saved.npcText ?? "");
        studySelectionHydratedForChapterRef.current = chapterId;
        return;
      }

      const needleEarly = buildStudyNeedleText([chapterContent, chapterSummary, chapterBibleCharacterStateText]);
      const sugChar = pickSuggestedCharacterIds(bibleCharacters, needleEarly);
      const sugGloss = pickSuggestedGlossaryIds(glossaryTerms, needleEarly);
      setStudyPickedCharacterIds(sugChar);
      setStudyPickedGlossaryIds(sugGloss);
      setStudyCharacterSource("cards");
      setStudyNpcText("");
      studySelectionHydratedForChapterRef.current = chapterId;
    });
    return () => { cancelled = true; };
  }, [
    workId,
    chapterId,
    bibleCharacters,
    glossaryTerms,
    chapterContent,
    chapterSummary,
    chapterBibleCharacterStateText,
  ]);

  // ── 写回 localStorage（勾选变化时） ────────────────────────────────────────
  useEffect(() => {
    if (!workId || !chapterId) return;
    if (studySelectionHydratedForChapterRef.current !== chapterId) return;
    writeStudyChapterSelection(workId, chapterId, {
      v: 2,
      characterIds: studyPickedCharacterIds,
      glossaryIds: studyPickedGlossaryIds,
      glossaryMode: "chapter_pick",
      characterSource: studyCharacterSource,
      npcText: studyNpcText,
    });
  }, [workId, chapterId, studyCharacterSource, studyNpcText, studyPickedCharacterIds, studyPickedGlossaryIds]);

  // ── 派生：组装请求所需的 slice 列表 ──────────────────────────────────────────
  const studyCharacterCardSlices = useMemo((): WritingStudyCharacterCardSlice[] => {
    if (studyCharacterSource !== "cards") return [];
    const byId = new Map(bibleCharacters.map((c) => [c.id, c]));
    const out: WritingStudyCharacterCardSlice[] = [];
    for (const id of studyPickedCharacterIds) {
      const c = byId.get(id);
      if (!c || !(c.name ?? "").trim()) continue;
      out.push({
        name: c.name,
        motivation: c.motivation ?? "",
        relationships: c.relationships ?? "",
        voiceNotes: c.voiceNotes ?? "",
        taboos: c.taboos ?? "",
      });
    }
    return out;
  }, [bibleCharacters, studyCharacterSource, studyPickedCharacterIds]);

  const studyGlossarySlices = useMemo((): WritingGlossaryTermSlice[] => {
    const byId = new Map(glossaryTerms.map((g) => [g.id, g]));
    const out: WritingGlossaryTermSlice[] = [];
    for (const id of studyPickedGlossaryIds) {
      const g = byId.get(id);
      if (!g || !(g.term ?? "").trim()) continue;
      out.push({ term: g.term, note: g.note ?? "" })
    }
    return out;
  }, [glossaryTerms, studyPickedGlossaryIds]);

  const glossaryTermCountForSummary = useMemo(
    () => studyGlossarySlices.filter((g) => (g.term ?? "").trim()).length,
    [studyGlossarySlices],
  );

  return {
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
  };
}
