import type {
  BibleCharacter,
  BibleChapterTemplate,
  BibleForeshadow,
  BibleGlossaryTerm,
  BibleTimelineEvent,
  BibleWorldEntry,
  Chapter,
  ChapterBible,
  ChapterSnapshot,
  InspirationFragment,
  ReferenceChapterHead,
  ReferenceExcerpt,
  ReferenceExcerptTag,
  ReferenceLibraryEntry,
  ReferenceTag,
  Volume,
  Work,
  WorkStyleCard,
  WritingPromptTemplate,
  WritingStyleSample,
} from "../db/types";
import { normalizeWorkTagList } from "../util/work-tags";
import { normalizeImportRows } from "./import-normalize";

export type MergeRemapResult = {
  newWorks: Work[];
  newVolumes: Volume[];
  newChapters: Chapter[];
  newSnaps: ChapterSnapshot[];
  newRefLib: ReferenceLibraryEntry[];
  newRefChunks: import("../db/types").ReferenceChunk[];
  newRefChapterHeads: ReferenceChapterHead[];
  newExcerpts: ReferenceExcerpt[];
  newTags: ReferenceTag[];
  newExcerptTags: ReferenceExcerptTag[];
  newBibleChars: BibleCharacter[];
  newBibleWorld: BibleWorldEntry[];
  newBibleFore: BibleForeshadow[];
  newBibleTime: BibleTimelineEvent[];
  newBibleTpl: BibleChapterTemplate[];
  newChapterBible: ChapterBible[];
  newBibleGloss: BibleGlossaryTerm[];
  newStyleCards: WorkStyleCard[];
  newInspirationFragments: InspirationFragment[];
  newWritingPromptTemplates: WritingPromptTemplate[];
  newWritingStyleSamples: WritingStyleSample[];
};

/**
 * 合并导入：为 zip 内数据生成新 id，与现有库并存。
 * 供 IndexedDB 全量写入、Supabase 仅写作侧写入、Hybrid 拆分时共用。
 */
export function remapImportMergePayload(
  data: {
    works: Work[];
    chapters: Chapter[];
    volumes?: Volume[];
    chapterSnapshots?: ChapterSnapshot[];
    referenceLibrary?: ReferenceLibraryEntry[];
    referenceChunks?: import("../db/types").ReferenceChunk[];
    referenceExcerpts?: ReferenceExcerpt[];
    referenceTags?: ReferenceTag[];
    referenceExcerptTags?: ReferenceExcerptTag[];
    referenceChapterHeads?: ReferenceChapterHead[];
    bibleCharacters?: BibleCharacter[];
    bibleWorldEntries?: BibleWorldEntry[];
    bibleForeshadowing?: BibleForeshadow[];
    bibleTimelineEvents?: BibleTimelineEvent[];
    bibleChapterTemplates?: BibleChapterTemplate[];
    chapterBible?: ChapterBible[];
    bibleGlossaryTerms?: BibleGlossaryTerm[];
    workStyleCards?: WorkStyleCard[];
    inspirationFragments?: InspirationFragment[];
    writingPromptTemplates?: WritingPromptTemplate[];
    writingStyleSamples?: WritingStyleSample[];
  },
  now: () => number,
): MergeRemapResult {
  const normalized = normalizeImportRows(data);
  const refLibIn = data.referenceLibrary ?? [];
  const refChunksIn = data.referenceChunks ?? [];
  const refChapterHeadsIn = data.referenceChapterHeads ?? [];
  const excerptsIn = data.referenceExcerpts ?? [];
  const tagsIn = data.referenceTags ?? [];
  const excerptTagsIn = data.referenceExcerptTags ?? [];
  const bibleCharsIn = data.bibleCharacters ?? [];
  const bibleWorldIn = data.bibleWorldEntries ?? [];
  const bibleForeIn = data.bibleForeshadowing ?? [];
  const bibleTimeIn = data.bibleTimelineEvents ?? [];
  const bibleTplIn = data.bibleChapterTemplates ?? [];
  const chapterBibleIn = data.chapterBible ?? [];
  const bibleGlossIn = data.bibleGlossaryTerms ?? [];
  const styleIn = data.workStyleCards ?? [];
  const inspirationIn = data.inspirationFragments ?? [];
  const writingPromptTplIn = data.writingPromptTemplates ?? [];
  const writingStyleSamplesIn = data.writingStyleSamples ?? [];

  const workMap = new Map<string, string>();
  const volumeMap = new Map<string, string>();
  const chapterMap = new Map<string, string>();
  const refWorkMap = new Map<string, string>();
  const chunkIdMap = new Map<string, string>();
  const tagMap = new Map<string, string>();
  const excerptOldToNew = new Map<string, string>();

  for (const w of normalized.works) {
    workMap.set(w.id, crypto.randomUUID());
  }
  for (const v of normalized.volumes) {
    volumeMap.set(v.id, crypto.randomUUID());
  }
  for (const c of normalized.chapters) {
    chapterMap.set(c.id, crypto.randomUUID());
  }
  for (const r of refLibIn) {
    refWorkMap.set(r.id, crypto.randomUUID());
  }
  for (const t of tagsIn) {
    tagMap.set(t.id, crypto.randomUUID());
  }

  const newWorks = normalized.works.map((w) => ({
    ...w,
    id: workMap.get(w.id)!,
    progressCursor: w.progressCursor ? (chapterMap.get(w.progressCursor) ?? null) : null,
  }));

  const newVolumes = normalized.volumes.map((v) => ({
    ...v,
    id: volumeMap.get(v.id)!,
    workId: workMap.get(v.workId)!,
  }));

  const newChapters = normalized.chapters.map((c) => ({
    ...c,
    id: chapterMap.get(c.id)!,
    workId: workMap.get(c.workId)!,
    volumeId: volumeMap.get(c.volumeId)!,
  }));

  const newSnaps = normalized.chapterSnapshots
    .filter((s) => chapterMap.has(s.chapterId))
    .map((s) => ({
      ...s,
      id: crypto.randomUUID(),
      chapterId: chapterMap.get(s.chapterId)!,
    }));

  const newRefLib = refLibIn.map((r) => ({
    ...r,
    id: refWorkMap.get(r.id)!,
    category: r.category ?? "",
    chapterHeadCount: r.chapterHeadCount ?? 0,
  }));

  const newRefChunks = refChunksIn.map((c) => {
    const nid = crypto.randomUUID();
    chunkIdMap.set(c.id, nid);
    return {
      ...c,
      id: nid,
      refWorkId: refWorkMap.get(c.refWorkId)!,
      isChapterHead: c.isChapterHead ?? false,
      embeddings: c.embeddings ?? null,
    };
  });

  const newRefChapterHeads: ReferenceChapterHead[] = [];
  for (const h of refChapterHeadsIn) {
    const nw = refWorkMap.get(h.refWorkId);
    const nc = chunkIdMap.get(h.chunkId);
    if (!nw || !nc) continue;
    newRefChapterHeads.push({
      ...h,
      id: crypto.randomUUID(),
      refWorkId: nw,
      chunkId: nc,
    });
  }

  const newExcerpts: ReferenceExcerpt[] = [];
  for (const ex of excerptsIn) {
    const nw = refWorkMap.get(ex.refWorkId);
    const nc = chunkIdMap.get(ex.chunkId);
    if (!nw || !nc) continue;
    const newId = crypto.randomUUID();
    excerptOldToNew.set(ex.id, newId);
    const lw = ex.linkedWorkId ? (workMap.get(ex.linkedWorkId) ?? null) : null;
    const lc = ex.linkedChapterId ? (chapterMap.get(ex.linkedChapterId) ?? null) : null;
    newExcerpts.push({
      ...ex,
      id: newId,
      refWorkId: nw,
      chunkId: nc,
      linkedWorkId: lw,
      linkedChapterId: lc,
    });
  }

  const newTags: ReferenceTag[] = tagsIn.map((t) => ({
    ...t,
    id: tagMap.get(t.id)!,
  }));

  const newExcerptTags: ReferenceExcerptTag[] = [];
  for (const j of excerptTagsIn) {
    const nid = excerptOldToNew.get(j.excerptId);
    const tid = tagMap.get(j.tagId);
    if (!nid || !tid) continue;
    newExcerptTags.push({
      id: crypto.randomUUID(),
      excerptId: nid,
      tagId: tid,
    });
  }

  const newBibleChars: BibleCharacter[] = [];
  for (const c of bibleCharsIn) {
    const nw = workMap.get(c.workId);
    if (!nw) continue;
    newBibleChars.push({ ...c, id: crypto.randomUUID(), workId: nw });
  }
  const newBibleWorld: BibleWorldEntry[] = [];
  for (const c of bibleWorldIn) {
    const nw = workMap.get(c.workId);
    if (!nw) continue;
    newBibleWorld.push({ ...c, id: crypto.randomUUID(), workId: nw });
  }
  const newBibleFore: BibleForeshadow[] = [];
  for (const c of bibleForeIn) {
    const nw = workMap.get(c.workId);
    if (!nw) continue;
    const nc = c.chapterId ? (chapterMap.get(c.chapterId) ?? null) : null;
    newBibleFore.push({
      ...c,
      id: crypto.randomUUID(),
      workId: nw,
      chapterId: nc,
    });
  }
  const newBibleTime: BibleTimelineEvent[] = [];
  for (const c of bibleTimeIn) {
    const nw = workMap.get(c.workId);
    if (!nw) continue;
    const nc = c.chapterId ? (chapterMap.get(c.chapterId) ?? null) : null;
    newBibleTime.push({
      ...c,
      id: crypto.randomUUID(),
      workId: nw,
      chapterId: nc,
    });
  }
  const newBibleTpl: BibleChapterTemplate[] = [];
  for (const c of bibleTplIn) {
    const nw = workMap.get(c.workId);
    if (!nw) continue;
    newBibleTpl.push({ ...c, id: crypto.randomUUID(), workId: nw });
  }
  const newChapterBible: ChapterBible[] = [];
  for (const c of chapterBibleIn) {
    const nw = workMap.get(c.workId);
    const nc = chapterMap.get(c.chapterId);
    if (!nw || !nc) continue;
    newChapterBible.push({
      ...c,
      id: crypto.randomUUID(),
      workId: nw,
      chapterId: nc,
      characterStateText: c.characterStateText ?? "",
    });
  }
  const newBibleGloss: BibleGlossaryTerm[] = [];
  for (const c of bibleGlossIn) {
    const nw = workMap.get(c.workId);
    if (!nw) continue;
    newBibleGloss.push({ ...c, id: crypto.randomUUID(), workId: nw });
  }

  const newStyleCards: WorkStyleCard[] = [];
  for (const s of styleIn) {
    const wid = s.workId || s.id;
    const nw = workMap.get(wid);
    if (!nw) continue;
    newStyleCards.push({
      ...s,
      id: nw,
      workId: nw,
      updatedAt: s.updatedAt ?? now(),
      pov: s.pov ?? "",
      tone: s.tone ?? "",
      bannedPhrases: s.bannedPhrases ?? "",
      styleAnchor: s.styleAnchor ?? "",
      extraRules: s.extraRules ?? "",
    });
  }

  const newWritingPromptTemplates: WritingPromptTemplate[] = [];
  for (const p of writingPromptTplIn) {
    const nw = workMap.get(p.workId);
    if (!nw) continue;
    newWritingPromptTemplates.push({
      ...p,
      id: crypto.randomUUID(),
      workId: nw,
      category: (p.category ?? "").trim(),
      title: (p.title ?? "").trim() || "未命名模板",
      body: p.body ?? "",
      sortOrder: p.sortOrder ?? 0,
      createdAt: p.createdAt ?? now(),
      updatedAt: p.updatedAt ?? now(),
    });
  }

  const newWritingStyleSamples: WritingStyleSample[] = [];
  for (const s of writingStyleSamplesIn) {
    const nw = workMap.get(s.workId);
    if (!nw) continue;
    newWritingStyleSamples.push({
      ...s,
      id: crypto.randomUUID(),
      workId: nw,
      title: (s.title ?? "").trim() || "未命名样本",
      body: s.body ?? "",
      sortOrder: s.sortOrder ?? 0,
      createdAt: s.createdAt ?? now(),
      updatedAt: s.updatedAt ?? now(),
    });
  }

  const newInspirationFragments: InspirationFragment[] = [];
  for (const f of inspirationIn) {
    const tags = normalizeWorkTagList(f.tags) ?? [];
    if (f.workId) {
      const nw = workMap.get(f.workId);
      if (!nw) continue;
      newInspirationFragments.push({
        ...f,
        id: crypto.randomUUID(),
        workId: nw,
        tags,
        body: f.body ?? "",
        createdAt: f.createdAt ?? now(),
        updatedAt: f.updatedAt ?? now(),
      });
    } else {
      newInspirationFragments.push({
        ...f,
        id: crypto.randomUUID(),
        workId: null,
        tags,
        body: f.body ?? "",
        createdAt: f.createdAt ?? now(),
        updatedAt: f.updatedAt ?? now(),
      });
    }
  }

  return {
    newWorks,
    newVolumes,
    newChapters,
    newSnaps,
    newRefLib,
    newRefChunks,
    newRefChapterHeads,
    newExcerpts,
    newTags,
    newExcerptTags,
    newBibleChars,
    newBibleWorld,
    newBibleFore,
    newBibleTime,
    newBibleTpl,
    newChapterBible,
    newBibleGloss,
    newStyleCards,
    newInspirationFragments,
    newWritingPromptTemplates,
    newWritingStyleSamples,
  };
}
