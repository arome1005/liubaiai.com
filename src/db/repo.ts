/**
 * 对外 API：全部委托给存储抽象层 {@link getWritingStore}，
 * 便于 Web IndexedDB / 桌面 SQLite 切换时无需改页面逻辑。
 */
import { getWritingStore } from "../storage/instance";
import { getDB } from "./database";
import type { UpdateChapterOptions } from "../storage/writing-store";
import type {
  BibleCharacter,
  BibleChapterTemplate,
  BibleForeshadow,
  GlobalPromptTemplate,
  ReferenceExtract,
  ReferenceExtractType,
  BibleGlossaryTerm,
  BibleTimelineEvent,
  BibleWorldEntry,
  BookSearchHit,
  BookSearchScope,
  Chapter,
  ChapterBible,
  ChapterSnapshot,
  InspirationCollection,
  InspirationFragment,
  ReferenceChapterHead,
  ReferenceChunk,
  ReferenceExcerpt,
  ReferenceExcerptTag,
  ReferenceLibraryEntry,
  ReferenceSearchHit,
  ReferenceTag,
  ReferenceTokenPosting,
  Volume,
  Work,
  WorkStyleCard,
  WritingPromptTemplate,
  WritingStyleSample,
  LogicPlaceEvent,
  LogicPlaceNode,
  TuiyanState,
} from "./types";
import { buildBibleMarkdownExport } from "../storage/bible-markdown";

export async function listWorks(): Promise<Work[]> {
  return getWritingStore().listWorks();
}

export async function getWork(id: string): Promise<Work | undefined> {
  return getWritingStore().getWork(id);
}

export async function createWork(
  title: string,
  opts?: { tags?: string[]; description?: string; status?: Work["status"] },
): Promise<Work> {
  return getWritingStore().createWork(title, opts);
}

export async function updateWork(
  id: string,
  patch: Partial<Pick<Work, "title" | "progressCursor" | "coverImage" | "tags" | "description" | "status">>,
): Promise<void> {
  return getWritingStore().updateWork(id, patch);
}

export async function deleteWork(id: string): Promise<void> {
  return getWritingStore().deleteWork(id);
}

export async function listVolumes(workId: string): Promise<Volume[]> {
  return getWritingStore().listVolumes(workId);
}

export async function createVolume(workId: string, title?: string): Promise<Volume> {
  return getWritingStore().createVolume(workId, title);
}

export async function updateVolume(
  id: string,
  patch: Partial<Pick<Volume, "title" | "order" | "summary">>,
): Promise<void> {
  return getWritingStore().updateVolume(id, patch);
}

export async function deleteVolume(volumeId: string): Promise<void> {
  return getWritingStore().deleteVolume(volumeId);
}

export async function listChapters(workId: string): Promise<Chapter[]> {
  return getWritingStore().listChapters(workId);
}

export async function createChapter(workId: string, title?: string, volumeId?: string): Promise<Chapter> {
  return getWritingStore().createChapter(workId, title, volumeId);
}

export async function updateChapter(
  id: string,
  patch: Partial<
    Pick<
      Chapter,
      "title" | "content" | "volumeId" | "summary" | "summaryUpdatedAt" | "summaryScopeFromOrder" | "summaryScopeToOrder"
    >
  >,
  options?: UpdateChapterOptions,
): Promise<void> {
  return getWritingStore().updateChapter(id, patch, options);
}

export async function deleteChapter(id: string): Promise<void> {
  return getWritingStore().deleteChapter(id);
}

export async function reorderChapters(workId: string, orderedIds: string[]): Promise<void> {
  return getWritingStore().reorderChapters(workId, orderedIds);
}

export async function searchWork(
  workId: string,
  query: string,
  scope?: BookSearchScope,
  isRegex?: boolean,
): Promise<BookSearchHit[]> {
  return getWritingStore().searchWork(workId, query, scope, isRegex);
}

export async function listChapterSnapshots(chapterId: string): Promise<ChapterSnapshot[]> {
  return getWritingStore().listChapterSnapshots(chapterId);
}

export async function addChapterSnapshot(chapterId: string, content: string): Promise<void> {
  return getWritingStore().addChapterSnapshot(chapterId, content);
}

/** 为库内全部章节各写入一条快照（与当前正文相同则跳过）。用于整库备份导出前。 */
export async function snapshotAllChaptersInLibrary(): Promise<void> {
  const store = getWritingStore();
  const works = await store.listWorks();
  for (const w of works) {
    const chapters = await store.listChapters(w.id);
    for (const c of chapters) {
      await store.addChapterSnapshot(c.id, c.content);
    }
  }
}

export async function deleteChapterSnapshot(snapshotId: string): Promise<void> {
  return getWritingStore().deleteChapterSnapshot(snapshotId);
}

export async function listReferenceLibrary(): Promise<ReferenceLibraryEntry[]> {
  return getWritingStore().listReferenceLibrary();
}

export async function getReferenceLibraryEntry(id: string): Promise<ReferenceLibraryEntry | undefined> {
  return getWritingStore().getReferenceLibraryEntry(id);
}

export async function createReferenceFromPlainText(
  input: {
    title: string;
    sourceName?: string;
    fullText: string;
    category?: string;
  },
  options?: {
    onProgress?: (p: { phase: "chunks" | "index"; percent: number; label?: string }) => void;
  },
): Promise<ReferenceLibraryEntry> {
  return getWritingStore().createReferenceFromPlainText(input, options);
}

export async function updateReferenceLibraryEntry(
  id: string,
  patch: Partial<Pick<ReferenceLibraryEntry, "title" | "category">>,
): Promise<void> {
  return getWritingStore().updateReferenceLibraryEntry(id, patch);
}

export async function deleteReferenceLibraryEntry(id: string): Promise<void> {
  return getWritingStore().deleteReferenceLibraryEntry(id);
}

export async function listReferenceChunks(refWorkId: string): Promise<ReferenceChunk[]> {
  return getWritingStore().listReferenceChunks(refWorkId);
}

export async function listReferenceChapterHeads(refWorkId: string): Promise<ReferenceChapterHead[]> {
  return getWritingStore().listReferenceChapterHeads(refWorkId);
}

export async function syncChapterMetadataForRefWork(refWorkId: string): Promise<void> {
  return getWritingStore().syncChapterMetadataForRefWork(refWorkId);
}

export async function getReferenceChunkAt(
  refWorkId: string,
  ordinal: number,
): Promise<ReferenceChunk | undefined> {
  return getWritingStore().getReferenceChunkAt(refWorkId, ordinal);
}

export async function getReferenceChunk(chunkId: string): Promise<ReferenceChunk | undefined> {
  return getWritingStore().getReferenceChunk(chunkId);
}

export async function listReferenceTags(): Promise<ReferenceTag[]> {
  return getWritingStore().listReferenceTags();
}

export async function createReferenceTag(name: string): Promise<ReferenceTag> {
  return getWritingStore().createReferenceTag(name);
}

export async function deleteReferenceTag(id: string): Promise<void> {
  return getWritingStore().deleteReferenceTag(id);
}

export async function searchReferenceLibrary(
  query: string,
  opts?: { refWorkId?: string; limit?: number; mode?: "strict" | "hybrid" },
): Promise<ReferenceSearchHit[]> {
  return getWritingStore().searchReferenceLibrary(query, opts);
}

export async function listReferenceExcerpts(refWorkId: string): Promise<ReferenceExcerpt[]> {
  return getWritingStore().listReferenceExcerpts(refWorkId);
}

export async function listReferenceExcerptsWithTagIds(
  refWorkId: string,
): Promise<Array<ReferenceExcerpt & { tagIds: string[] }>> {
  return getWritingStore().listReferenceExcerptsWithTagIds(refWorkId);
}

export async function addReferenceExcerpt(
  input: Omit<ReferenceExcerpt, "id" | "createdAt">,
): Promise<ReferenceExcerpt> {
  return getWritingStore().addReferenceExcerpt(input);
}

export async function updateReferenceExcerpt(
  id: string,
  patch: Partial<Pick<ReferenceExcerpt, "note" | "linkedWorkId" | "linkedChapterId">> & {
    tagIds?: string[];
  },
): Promise<void> {
  return getWritingStore().updateReferenceExcerpt(id, patch);
}

export async function setExcerptTags(excerptId: string, tagIds: string[]): Promise<void> {
  return getWritingStore().setExcerptTags(excerptId, tagIds);
}

export async function deleteReferenceExcerpt(id: string): Promise<void> {
  return getWritingStore().deleteReferenceExcerpt(id);
}

export async function listAllReferenceExcerpts(): Promise<
  Array<ReferenceExcerpt & { refTitle: string; tagIds: string[] }>
> {
  return getWritingStore().listAllReferenceExcerpts();
}

export async function rebuildAllReferenceSearchIndex(
  onProgress?: (p: { phase: string; percent: number; label?: string }) => void,
): Promise<void> {
  return getWritingStore().rebuildAllReferenceSearchIndex(onProgress);
}

export async function clearAllReferenceLibraryData(): Promise<void> {
  return getWritingStore().clearAllReferenceLibraryData();
}

export async function listBibleCharacters(workId: string) {
  return getWritingStore().listBibleCharacters(workId);
}
export async function addBibleCharacter(
  workId: string,
  input: Parameters<ReturnType<typeof getWritingStore>["addBibleCharacter"]>[1],
) {
  return getWritingStore().addBibleCharacter(workId, input);
}
export async function updateBibleCharacter(
  id: string,
  patch: Partial<Omit<BibleCharacter, "id" | "workId">>,
) {
  return getWritingStore().updateBibleCharacter(id, patch);
}
export async function deleteBibleCharacter(id: string) {
  return getWritingStore().deleteBibleCharacter(id);
}
export async function reorderBibleCharacters(workId: string, orderedIds: string[]) {
  return getWritingStore().reorderBibleCharacters(workId, orderedIds);
}

export async function listBibleWorldEntries(workId: string) {
  return getWritingStore().listBibleWorldEntries(workId);
}
export async function addBibleWorldEntry(
  workId: string,
  input: Parameters<ReturnType<typeof getWritingStore>["addBibleWorldEntry"]>[1],
) {
  return getWritingStore().addBibleWorldEntry(workId, input);
}
export async function updateBibleWorldEntry(
  id: string,
  patch: Partial<Omit<BibleWorldEntry, "id" | "workId">>,
) {
  return getWritingStore().updateBibleWorldEntry(id, patch);
}
export async function deleteBibleWorldEntry(id: string) {
  return getWritingStore().deleteBibleWorldEntry(id);
}
export async function reorderBibleWorldEntries(workId: string, orderedIds: string[]) {
  return getWritingStore().reorderBibleWorldEntries(workId, orderedIds);
}

export async function listBibleForeshadowing(workId: string) {
  return getWritingStore().listBibleForeshadowing(workId);
}
export async function addBibleForeshadow(
  workId: string,
  input: Parameters<ReturnType<typeof getWritingStore>["addBibleForeshadow"]>[1],
) {
  return getWritingStore().addBibleForeshadow(workId, input);
}
export async function updateBibleForeshadow(
  id: string,
  patch: Partial<Omit<BibleForeshadow, "id" | "workId">>,
) {
  return getWritingStore().updateBibleForeshadow(id, patch);
}
export async function deleteBibleForeshadow(id: string) {
  return getWritingStore().deleteBibleForeshadow(id);
}
export async function reorderBibleForeshadowing(workId: string, orderedIds: string[]) {
  return getWritingStore().reorderBibleForeshadowing(workId, orderedIds);
}

export async function listBibleTimelineEvents(workId: string) {
  return getWritingStore().listBibleTimelineEvents(workId);
}
export async function addBibleTimelineEvent(
  workId: string,
  input: Parameters<ReturnType<typeof getWritingStore>["addBibleTimelineEvent"]>[1],
) {
  return getWritingStore().addBibleTimelineEvent(workId, input);
}
export async function updateBibleTimelineEvent(
  id: string,
  patch: Partial<Omit<BibleTimelineEvent, "id" | "workId">>,
) {
  return getWritingStore().updateBibleTimelineEvent(id, patch);
}
export async function deleteBibleTimelineEvent(id: string) {
  return getWritingStore().deleteBibleTimelineEvent(id);
}
export async function reorderBibleTimelineEvents(workId: string, orderedIds: string[]) {
  return getWritingStore().reorderBibleTimelineEvents(workId, orderedIds);
}

export async function listLogicPlaceNodes(workId: string) {
  return getWritingStore().listLogicPlaceNodes(workId);
}
export async function addLogicPlaceNode(
  workId: string,
  input: Parameters<ReturnType<typeof getWritingStore>["addLogicPlaceNode"]>[1],
) {
  return getWritingStore().addLogicPlaceNode(workId, input);
}
export async function updateLogicPlaceNode(
  id: string,
  patch: Partial<Omit<LogicPlaceNode, "id" | "workId">>,
) {
  return getWritingStore().updateLogicPlaceNode(id, patch);
}
export async function deleteLogicPlaceNode(id: string) {
  return getWritingStore().deleteLogicPlaceNode(id);
}

export async function listLogicPlaceEvents(workId: string) {
  return getWritingStore().listLogicPlaceEvents(workId);
}
export async function addLogicPlaceEvent(
  workId: string,
  input: Parameters<ReturnType<typeof getWritingStore>["addLogicPlaceEvent"]>[1],
) {
  return getWritingStore().addLogicPlaceEvent(workId, input);
}
export async function updateLogicPlaceEvent(
  id: string,
  patch: Partial<Omit<LogicPlaceEvent, "id" | "workId">>,
) {
  return getWritingStore().updateLogicPlaceEvent(id, patch);
}
export async function deleteLogicPlaceEvent(id: string) {
  return getWritingStore().deleteLogicPlaceEvent(id);
}

export async function getTuiyanState(workId: string): Promise<TuiyanState | undefined> {
  return getWritingStore().getTuiyanState(workId);
}

export async function upsertTuiyanState(
  workId: string,
  patch: Parameters<ReturnType<typeof getWritingStore>["upsertTuiyanState"]>[1],
): Promise<TuiyanState> {
  return getWritingStore().upsertTuiyanState(workId, patch);
}

export async function listBibleChapterTemplates(workId: string) {
  return getWritingStore().listBibleChapterTemplates(workId);
}
export async function addBibleChapterTemplate(
  workId: string,
  input: Parameters<ReturnType<typeof getWritingStore>["addBibleChapterTemplate"]>[1],
) {
  return getWritingStore().addBibleChapterTemplate(workId, input);
}
export async function updateBibleChapterTemplate(
  id: string,
  patch: Partial<Omit<BibleChapterTemplate, "id" | "workId">>,
) {
  return getWritingStore().updateBibleChapterTemplate(id, patch);
}
export async function deleteBibleChapterTemplate(id: string) {
  return getWritingStore().deleteBibleChapterTemplate(id);
}

export async function getChapterBible(chapterId: string): Promise<ChapterBible | undefined> {
  return getWritingStore().getChapterBible(chapterId);
}
export async function upsertChapterBible(
  input: Omit<ChapterBible, "id" | "updatedAt"> & { id?: string },
): Promise<ChapterBible> {
  return getWritingStore().upsertChapterBible(input);
}

export async function listBibleGlossaryTerms(workId: string) {
  return getWritingStore().listBibleGlossaryTerms(workId);
}
export async function addBibleGlossaryTerm(
  workId: string,
  input: Parameters<ReturnType<typeof getWritingStore>["addBibleGlossaryTerm"]>[1],
) {
  return getWritingStore().addBibleGlossaryTerm(workId, input);
}
export async function updateBibleGlossaryTerm(
  id: string,
  patch: Partial<Omit<BibleGlossaryTerm, "id" | "workId">>,
) {
  return getWritingStore().updateBibleGlossaryTerm(id, patch);
}
export async function deleteBibleGlossaryTerm(id: string) {
  return getWritingStore().deleteBibleGlossaryTerm(id);
}

export async function listWritingPromptTemplates(workId: string): Promise<WritingPromptTemplate[]> {
  return getWritingStore().listWritingPromptTemplates(workId);
}

export async function addWritingPromptTemplate(
  workId: string,
  input: Partial<Omit<WritingPromptTemplate, "id" | "workId" | "sortOrder" | "createdAt" | "updatedAt">>,
): Promise<WritingPromptTemplate> {
  return getWritingStore().addWritingPromptTemplate(workId, input);
}

export async function updateWritingPromptTemplate(
  id: string,
  patch: Partial<Omit<WritingPromptTemplate, "id" | "workId">>,
): Promise<void> {
  return getWritingStore().updateWritingPromptTemplate(id, patch);
}

export async function deleteWritingPromptTemplate(id: string): Promise<void> {
  return getWritingStore().deleteWritingPromptTemplate(id);
}

export async function reorderWritingPromptTemplates(workId: string, orderedIds: string[]): Promise<void> {
  return getWritingStore().reorderWritingPromptTemplates(workId, orderedIds);
}

export async function listWritingStyleSamples(workId: string): Promise<WritingStyleSample[]> {
  return getWritingStore().listWritingStyleSamples(workId);
}

export async function addWritingStyleSample(
  workId: string,
  input: Partial<Omit<WritingStyleSample, "id" | "workId" | "sortOrder" | "createdAt" | "updatedAt">>,
): Promise<WritingStyleSample> {
  return getWritingStore().addWritingStyleSample(workId, input);
}

export async function updateWritingStyleSample(
  id: string,
  patch: Partial<Omit<WritingStyleSample, "id" | "workId">>,
): Promise<void> {
  return getWritingStore().updateWritingStyleSample(id, patch);
}

export async function deleteWritingStyleSample(id: string): Promise<void> {
  return getWritingStore().deleteWritingStyleSample(id);
}

export async function reorderWritingStyleSamples(workId: string, orderedIds: string[]): Promise<void> {
  return getWritingStore().reorderWritingStyleSamples(workId, orderedIds);
}

export async function exportBibleMarkdown(workId: string): Promise<string> {
  const store = getWritingStore();
  const w = await store.getWork(workId);
  if (!w) return "";
  const [characters, world, foreshadow, timeline, templates, glossary] = await Promise.all([
    store.listBibleCharacters(workId),
    store.listBibleWorldEntries(workId),
    store.listBibleForeshadowing(workId),
    store.listBibleTimelineEvents(workId),
    store.listBibleChapterTemplates(workId),
    store.listBibleGlossaryTerms(workId),
  ]);
  return buildBibleMarkdownExport({
    workTitle: w.title,
    characters,
    world,
    foreshadow,
    timeline,
    templates,
    glossary,
  });
}

export async function getWorkStyleCard(workId: string): Promise<WorkStyleCard | undefined> {
  return getWritingStore().getWorkStyleCard(workId);
}

export async function upsertWorkStyleCard(
  workId: string,
  patch: Partial<Omit<WorkStyleCard, "id" | "workId" | "updatedAt">>,
): Promise<WorkStyleCard> {
  return getWritingStore().upsertWorkStyleCard(workId, patch);
}

export async function listInspirationFragments(): Promise<InspirationFragment[]> {
  return getWritingStore().listInspirationFragments();
}

export async function addInspirationFragment(
  input: Partial<Omit<InspirationFragment, "id" | "createdAt" | "updatedAt">> & { body: string },
): Promise<InspirationFragment> {
  return getWritingStore().addInspirationFragment(input);
}

export async function updateInspirationFragment(
  id: string,
  patch: Partial<Pick<InspirationFragment, "body" | "tags" | "workId" | "collectionId">>,
): Promise<void> {
  return getWritingStore().updateInspirationFragment(id, patch);
}

export async function listInspirationCollections(): Promise<InspirationCollection[]> {
  return getWritingStore().listInspirationCollections();
}

export async function addInspirationCollection(
  input: Partial<Omit<InspirationCollection, "id" | "createdAt" | "updatedAt">> & { name: string },
): Promise<InspirationCollection> {
  return getWritingStore().addInspirationCollection(input);
}

export async function updateInspirationCollection(
  id: string,
  patch: Partial<Pick<InspirationCollection, "name" | "sortOrder">>,
): Promise<void> {
  return getWritingStore().updateInspirationCollection(id, patch);
}

export async function deleteInspirationCollection(id: string): Promise<void> {
  return getWritingStore().deleteInspirationCollection(id);
}

export async function deleteInspirationFragment(id: string): Promise<void> {
  return getWritingStore().deleteInspirationFragment(id);
}

export async function exportAllData(): Promise<{
  works: Work[];
  volumes: Volume[];
  chapters: Chapter[];
  chapterSnapshots: ChapterSnapshot[];
  referenceLibrary: ReferenceLibraryEntry[];
  referenceChunks: ReferenceChunk[];
  referenceTokenPostings: ReferenceTokenPosting[];
  referenceExcerpts: ReferenceExcerpt[];
  referenceTags: ReferenceTag[];
  referenceExcerptTags: ReferenceExcerptTag[];
  referenceChapterHeads: ReferenceChapterHead[];
  bibleCharacters: BibleCharacter[];
  bibleWorldEntries: BibleWorldEntry[];
  bibleForeshadowing: BibleForeshadow[];
  bibleTimelineEvents: BibleTimelineEvent[];
  bibleChapterTemplates: BibleChapterTemplate[];
  chapterBible: ChapterBible[];
  bibleGlossaryTerms: BibleGlossaryTerm[];
  workStyleCards: WorkStyleCard[];
  inspirationCollections: InspirationCollection[];
  inspirationFragments: InspirationFragment[];
  writingPromptTemplates: WritingPromptTemplate[];
  writingStyleSamples: WritingStyleSample[];
  logicPlaceNodes: LogicPlaceNode[];
  logicPlaceEvents: LogicPlaceEvent[];
}> {
  return getWritingStore().exportAllData();
}

export async function importAllData(data: {
  works: Work[];
  chapters: Chapter[];
  volumes?: Volume[];
  chapterSnapshots?: ChapterSnapshot[];
  referenceLibrary?: ReferenceLibraryEntry[];
  referenceChunks?: ReferenceChunk[];
  referenceTokenPostings?: ReferenceTokenPosting[];
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
  inspirationCollections?: InspirationCollection[];
  inspirationFragments?: InspirationFragment[];
  writingPromptTemplates?: WritingPromptTemplate[];
  writingStyleSamples?: WritingStyleSample[];
  logicPlaceNodes?: LogicPlaceNode[];
  logicPlaceEvents?: LogicPlaceEvent[];
}): Promise<void> {
  return getWritingStore().importAllData(data);
}

export async function importAllDataMerge(data: {
  works: Work[];
  chapters: Chapter[];
  volumes?: Volume[];
  chapterSnapshots?: ChapterSnapshot[];
  referenceLibrary?: ReferenceLibraryEntry[];
  referenceChunks?: ReferenceChunk[];
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
  inspirationCollections?: InspirationCollection[];
  inspirationFragments?: InspirationFragment[];
  writingPromptTemplates?: WritingPromptTemplate[];
  writingStyleSamples?: WritingStyleSample[];
  logicPlaceNodes?: LogicPlaceNode[];
  logicPlaceEvents?: LogicPlaceEvent[];
}): Promise<void> {
  return getWritingStore().importAllDataMerge(data);
}

// ── 提炼要点（P1-03）—— 本地专用，直接访问 IndexedDB ────────────────────

export async function listReferenceExtracts(
  refWorkId: string,
  type?: ReferenceExtractType,
): Promise<ReferenceExtract[]> {
  const db = getDB();
  if (type) {
    return db.referenceExtracts
      .where("[refWorkId+type]")
      .equals([refWorkId, type])
      .reverse()
      .sortBy("createdAt")
      .then((rows) => rows.reverse());
  }
  return db.referenceExtracts
    .where("refWorkId")
    .equals(refWorkId)
    .reverse()
    .sortBy("createdAt")
    .then((rows) => rows.reverse());
}

export async function addReferenceExtract(
  input: Omit<ReferenceExtract, "id" | "createdAt">,
): Promise<ReferenceExtract> {
  const entity: ReferenceExtract = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };
  await getDB().referenceExtracts.add(entity);
  return entity;
}

export async function updateReferenceExtract(
  id: string,
  patch: Partial<Pick<ReferenceExtract, "body" | "importedBibleId">>,
): Promise<void> {
  await getDB().referenceExtracts.update(id, patch);
}

export async function deleteReferenceExtract(id: string): Promise<void> {
  await getDB().referenceExtracts.delete(id);
}

export async function deleteAllReferenceExtractsForBook(refWorkId: string): Promise<void> {
  await getDB().referenceExtracts.where("refWorkId").equals(refWorkId).delete();
}

// ── 全局提示词库（Sprint 1 + Sprint 2）────────────────────────────────────────

export async function listGlobalPromptTemplates(): Promise<GlobalPromptTemplate[]> {
  return getWritingStore().listGlobalPromptTemplates();
}

/** Sprint 2：返回所有 status=approved 的模板（含他人已发布） */
export async function listApprovedPromptTemplates(): Promise<GlobalPromptTemplate[]> {
  return getWritingStore().listApprovedPromptTemplates();
}

/** 管理员审核：返回所有 status=submitted 的模板（需配套 Supabase RLS 策略） */
export async function listSubmittedPromptTemplates(): Promise<GlobalPromptTemplate[]> {
  return getWritingStore().listSubmittedPromptTemplates();
}

export async function addGlobalPromptTemplate(
  input: Omit<GlobalPromptTemplate, "id" | "sortOrder" | "createdAt" | "updatedAt">,
): Promise<GlobalPromptTemplate> {
  return getWritingStore().addGlobalPromptTemplate(input);
}

export async function updateGlobalPromptTemplate(
  id: string,
  patch: Partial<Omit<GlobalPromptTemplate, "id" | "createdAt">>,
): Promise<void> {
  return getWritingStore().updateGlobalPromptTemplate(id, patch);
}

export async function deleteGlobalPromptTemplate(id: string): Promise<void> {
  return getWritingStore().deleteGlobalPromptTemplate(id);
}

export async function reorderGlobalPromptTemplates(orderedIds: string[]): Promise<void> {
  return getWritingStore().reorderGlobalPromptTemplates(orderedIds);
}

// ─────────────────────────────────────────────────────────────────────────────

export { isChapterSaveConflictError } from "../storage/chapter-save-conflict";
export type { UpdateChapterOptions } from "../storage/writing-store";
