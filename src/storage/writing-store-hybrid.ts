import { getDB } from "../db/database";
import type {
  BibleCharacter,
  BibleChapterTemplate,
  BibleForeshadow,
  BibleGlossaryTerm,
  BibleTimelineEvent,
  BibleWorldEntry,
  GlobalPromptTemplate,
  LogicPlaceEvent,
  LogicPlaceNode,
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
  ReferenceLibraryEntry,
  ReferenceSearchHit,
  ReferenceTag,
  Volume,
  Work,
  WorkStyleCard,
  WritingPromptTemplate,
  WritingStyleSample,
  TuiyanState,
} from "../db/types";
import { remapImportMergePayload } from "./backup-merge-remap";
import type { UpdateChapterOptions, WritingStore } from "./writing-store";
import { WritingStoreIndexedDB } from "./writing-store-indexeddb";
import { WritingStoreSupabase } from "./writing-store-supabase";

/**
 * Web + Supabase：作品 / 章节 / 本书锦囊 / 风格卡走云端；参考库（藏经）仍 IndexedDB。
 */
export class WritingStoreHybrid implements WritingStore {
  private readonly local = new WritingStoreIndexedDB();
  private readonly remote = new WritingStoreSupabase();

  /**
   * 读取时优先走云端；网络失联或未登录时降级到本地 IndexedDB 缓存，
   * 保障锦囊/风格卡等数据在离线状态下可读。
   */
  private async tryRemote<T>(remote: () => Promise<T>, local: () => Promise<T>): Promise<T> {
    try {
      return await remote();
    } catch {
      return local();
    }
  }

  /**
   * 全局提示词 id 去重合并：优先远端顺序，再补上仅存在于 IndexedDB 的行。
   * 解决：写入 Supabase 后 warmLocal 已有数据，但 SELECT 因会话/RLS 短暂为空时列表仍可见。
   */
  private mergeGlobalPromptLists(
    remote: GlobalPromptTemplate[],
    local: GlobalPromptTemplate[],
  ): GlobalPromptTemplate[] {
    const seen = new Set<string>();
    const out: GlobalPromptTemplate[] = [];
    for (const t of remote) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      out.push(t);
    }
    for (const t of local) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      out.push(t);
    }
    out.sort((a, b) => a.sortOrder - b.sortOrder);
    return out;
  }

  /** 写操作成功后，静默更新本地 IndexedDB 缓存（不阻塞主流程，失败忽略）。 */
  private warmLocal(op: () => Promise<unknown>): void {
    op().catch(() => {});
  }

  async init(): Promise<void> {
    await this.local.init();
    await this.remote.init();
  }

  async listWorks(): Promise<Work[]> {
    return this.remote.listWorks();
  }
  async getWork(id: string): Promise<Work | undefined> {
    return this.remote.getWork(id);
  }
  async createWork(title: string, opts?: { tags?: string[]; description?: string; status?: Work["status"] }): Promise<Work> {
    return this.remote.createWork(title, opts);
  }
  async updateWork(
    id: string,
    patch: Partial<Pick<Work, "title" | "progressCursor" | "coverImage" | "tags" | "description" | "status" | "bookNo">>,
  ): Promise<void> {
    return this.remote.updateWork(id, patch);
  }
  async deleteWork(id: string): Promise<void> {
    await this.remote.deleteWork(id);
    const db = getDB();
    await db.referenceExcerpts
      .where("linkedWorkId")
      .equals(id)
      .modify({ linkedWorkId: null, linkedChapterId: null });
  }

  async listVolumes(workId: string): Promise<Volume[]> {
    return this.remote.listVolumes(workId);
  }
  async createVolume(workId: string, title?: string): Promise<Volume> {
    return this.remote.createVolume(workId, title);
  }
  async updateVolume(id: string, patch: Partial<Pick<Volume, "title" | "order" | "summary">>): Promise<void> {
    return this.remote.updateVolume(id, patch);
  }
  async deleteVolume(volumeId: string): Promise<void> {
    return this.remote.deleteVolume(volumeId);
  }

  async listChapters(workId: string): Promise<Chapter[]> {
    return this.remote.listChapters(workId);
  }
  async createChapter(workId: string, title?: string, volumeId?: string): Promise<Chapter> {
    return this.remote.createChapter(workId, title, volumeId);
  }
  async updateChapter(
    id: string,
    patch: Partial<
      Pick<
        Chapter,
        "title" | "content" | "volumeId" | "summary" | "summaryUpdatedAt" | "summaryScopeFromOrder" | "summaryScopeToOrder"
      >
    >,
    options?: UpdateChapterOptions,
  ): Promise<number | undefined> {
    return this.remote.updateChapter(id, patch, options);
  }
  async getWorkIdByBookNo(bookNo: number): Promise<string | undefined> {
    return this.remote.getWorkIdByBookNo(bookNo);
  }
  async deleteChapter(id: string): Promise<void> {
    await this.remote.deleteChapter(id);
    const db = getDB();
    await db.referenceExcerpts
      .where("linkedChapterId")
      .equals(id)
      .modify({ linkedWorkId: null, linkedChapterId: null });
  }
  async reorderChapters(workId: string, orderedIds: string[]): Promise<void> {
    return this.remote.reorderChapters(workId, orderedIds);
  }

  async searchWork(workId: string, query: string, scope?: BookSearchScope, isRegex?: boolean): Promise<BookSearchHit[]> {
    return this.remote.searchWork(workId, query, scope, isRegex);
  }

  async listChapterSnapshots(chapterId: string): Promise<ChapterSnapshot[]> {
    return this.remote.listChapterSnapshots(chapterId);
  }
  async addChapterSnapshot(chapterId: string, content: string): Promise<void> {
    return this.remote.addChapterSnapshot(chapterId, content);
  }
  async deleteChapterSnapshot(snapshotId: string): Promise<void> {
    return this.remote.deleteChapterSnapshot(snapshotId);
  }

  async listReferenceLibrary(): Promise<ReferenceLibraryEntry[]> {
    return this.local.listReferenceLibrary();
  }
  async getReferenceLibraryEntry(id: string): Promise<ReferenceLibraryEntry | undefined> {
    return this.local.getReferenceLibraryEntry(id);
  }
  async createReferenceFromPlainText(
    input: {
      title: string;
      sourceName?: string;
      fullText: string;
      category?: string;
    },
    options?: {
      onProgress?: (p: { phase: "chunks" | "index"; percent: number; label?: string }) => void;
      signal?: AbortSignal;
    },
  ): Promise<ReferenceLibraryEntry> {
    return this.local.createReferenceFromPlainText(input, options);
  }
  async updateReferenceLibraryEntry(
    id: string,
    patch: Partial<Pick<ReferenceLibraryEntry, "title" | "category">>,
  ): Promise<void> {
    return this.local.updateReferenceLibraryEntry(id, patch);
  }
  async deleteReferenceLibraryEntry(id: string): Promise<void> {
    return this.local.deleteReferenceLibraryEntry(id);
  }
  async listReferenceChunks(refWorkId: string): Promise<ReferenceChunk[]> {
    return this.local.listReferenceChunks(refWorkId);
  }
  async listReferenceChapterHeads(refWorkId: string): Promise<ReferenceChapterHead[]> {
    return this.local.listReferenceChapterHeads(refWorkId);
  }
  async syncChapterMetadataForRefWork(refWorkId: string): Promise<void> {
    return this.local.syncChapterMetadataForRefWork(refWorkId);
  }
  async getReferenceChunk(chunkId: string): Promise<ReferenceChunk | undefined> {
    return this.local.getReferenceChunk(chunkId);
  }
  async searchReferenceLibrary(
    query: string,
    opts?: { refWorkId?: string; limit?: number; mode?: "strict" | "hybrid" },
  ): Promise<ReferenceSearchHit[]> {
    return this.local.searchReferenceLibrary(query, opts);
  }
  async getReferenceChunkAt(refWorkId: string, ordinal: number): Promise<ReferenceChunk | undefined> {
    return this.local.getReferenceChunkAt(refWorkId, ordinal);
  }

  async listReferenceTags(): Promise<ReferenceTag[]> {
    return this.local.listReferenceTags();
  }
  async createReferenceTag(name: string): Promise<ReferenceTag> {
    return this.local.createReferenceTag(name);
  }
  async deleteReferenceTag(id: string): Promise<void> {
    return this.local.deleteReferenceTag(id);
  }

  async listReferenceExcerpts(refWorkId: string): Promise<ReferenceExcerpt[]> {
    return this.local.listReferenceExcerpts(refWorkId);
  }
  async listReferenceExcerptsWithTagIds(refWorkId: string): Promise<
    Array<ReferenceExcerpt & { tagIds: string[] }>
  > {
    return this.local.listReferenceExcerptsWithTagIds(refWorkId);
  }
  async listAllReferenceExcerpts(): Promise<
    Array<ReferenceExcerpt & { refTitle: string; tagIds: string[] }>
  > {
    return this.local.listAllReferenceExcerpts();
  }
  async addReferenceExcerpt(input: Omit<ReferenceExcerpt, "id" | "createdAt">): Promise<ReferenceExcerpt> {
    return this.local.addReferenceExcerpt(input);
  }
  async updateReferenceExcerpt(
    id: string,
    patch: Partial<
      Pick<ReferenceExcerpt, "note" | "linkedWorkId" | "linkedChapterId">
    > & { tagIds?: string[] },
  ): Promise<void> {
    return this.local.updateReferenceExcerpt(id, patch);
  }
  async setExcerptTags(excerptId: string, tagIds: string[]): Promise<void> {
    return this.local.setExcerptTags(excerptId, tagIds);
  }
  async deleteReferenceExcerpt(id: string): Promise<void> {
    return this.local.deleteReferenceExcerpt(id);
  }

  async rebuildAllReferenceSearchIndex(
    onProgress?: (p: { phase: string; percent: number; label?: string }) => void,
  ): Promise<void> {
    return this.local.rebuildAllReferenceSearchIndex(onProgress);
  }
  async clearAllReferenceLibraryData(): Promise<void> {
    return this.local.clearAllReferenceLibraryData();
  }

  async listBibleCharacters(workId: string): Promise<BibleCharacter[]> {
    return this.tryRemote(
      () => this.remote.listBibleCharacters(workId),
      () => this.local.listBibleCharacters(workId),
    );
  }
  async addBibleCharacter(
    workId: string,
    input: Partial<Omit<BibleCharacter, "id" | "workId" | "sortOrder" | "createdAt" | "updatedAt">>,
  ): Promise<BibleCharacter> {
    const entity = await this.remote.addBibleCharacter(workId, input);
    this.warmLocal(() => getDB().bibleCharacters.put(entity));
    return entity;
  }
  async updateBibleCharacter(id: string, patch: Partial<Omit<BibleCharacter, "id" | "workId">>): Promise<void> {
    await this.remote.updateBibleCharacter(id, patch);
    this.warmLocal(() => getDB().bibleCharacters.update(id, { ...patch, updatedAt: Date.now() }));
  }
  async deleteBibleCharacter(id: string): Promise<void> {
    await this.remote.deleteBibleCharacter(id);
    this.warmLocal(() => getDB().bibleCharacters.delete(id));
  }
  async reorderBibleCharacters(workId: string, orderedIds: string[]): Promise<void> {
    return this.remote.reorderBibleCharacters(workId, orderedIds);
  }

  async listBibleWorldEntries(workId: string): Promise<BibleWorldEntry[]> {
    return this.tryRemote(
      () => this.remote.listBibleWorldEntries(workId),
      () => this.local.listBibleWorldEntries(workId),
    );
  }
  async addBibleWorldEntry(
    workId: string,
    input: Partial<Omit<BibleWorldEntry, "id" | "workId" | "sortOrder" | "createdAt" | "updatedAt">>,
  ): Promise<BibleWorldEntry> {
    const entity = await this.remote.addBibleWorldEntry(workId, input);
    this.warmLocal(() => getDB().bibleWorldEntries.put(entity));
    return entity;
  }
  async updateBibleWorldEntry(id: string, patch: Partial<Omit<BibleWorldEntry, "id" | "workId">>): Promise<void> {
    await this.remote.updateBibleWorldEntry(id, patch);
    this.warmLocal(() => getDB().bibleWorldEntries.update(id, { ...patch, updatedAt: Date.now() }));
  }
  async deleteBibleWorldEntry(id: string): Promise<void> {
    await this.remote.deleteBibleWorldEntry(id);
    this.warmLocal(() => getDB().bibleWorldEntries.delete(id));
  }
  async reorderBibleWorldEntries(workId: string, orderedIds: string[]): Promise<void> {
    return this.remote.reorderBibleWorldEntries(workId, orderedIds);
  }

  async listBibleForeshadowing(workId: string): Promise<BibleForeshadow[]> {
    return this.tryRemote(
      () => this.remote.listBibleForeshadowing(workId),
      () => this.local.listBibleForeshadowing(workId),
    );
  }
  async addBibleForeshadow(
    workId: string,
    input: Partial<Omit<BibleForeshadow, "id" | "workId" | "sortOrder" | "createdAt" | "updatedAt">>,
  ): Promise<BibleForeshadow> {
    const entity = await this.remote.addBibleForeshadow(workId, input);
    this.warmLocal(() => getDB().bibleForeshadowing.put(entity));
    return entity;
  }
  async updateBibleForeshadow(id: string, patch: Partial<Omit<BibleForeshadow, "id" | "workId">>): Promise<void> {
    await this.remote.updateBibleForeshadow(id, patch);
    this.warmLocal(() => getDB().bibleForeshadowing.update(id, { ...patch, updatedAt: Date.now() }));
  }
  async deleteBibleForeshadow(id: string): Promise<void> {
    await this.remote.deleteBibleForeshadow(id);
    this.warmLocal(() => getDB().bibleForeshadowing.delete(id));
  }
  async reorderBibleForeshadowing(workId: string, orderedIds: string[]): Promise<void> {
    return this.remote.reorderBibleForeshadowing(workId, orderedIds);
  }

  async listBibleTimelineEvents(workId: string): Promise<BibleTimelineEvent[]> {
    return this.tryRemote(
      () => this.remote.listBibleTimelineEvents(workId),
      () => this.local.listBibleTimelineEvents(workId),
    );
  }
  async addBibleTimelineEvent(
    workId: string,
    input: Partial<Omit<BibleTimelineEvent, "id" | "workId" | "sortOrder" | "createdAt" | "updatedAt">>,
  ): Promise<BibleTimelineEvent> {
    const entity = await this.remote.addBibleTimelineEvent(workId, input);
    this.warmLocal(() => getDB().bibleTimelineEvents.put(entity));
    return entity;
  }
  async updateBibleTimelineEvent(
    id: string,
    patch: Partial<Omit<BibleTimelineEvent, "id" | "workId">>,
  ): Promise<void> {
    await this.remote.updateBibleTimelineEvent(id, patch);
    this.warmLocal(() => getDB().bibleTimelineEvents.update(id, { ...patch, updatedAt: Date.now() }));
  }
  async deleteBibleTimelineEvent(id: string): Promise<void> {
    await this.remote.deleteBibleTimelineEvent(id);
    this.warmLocal(() => getDB().bibleTimelineEvents.delete(id));
  }
  async reorderBibleTimelineEvents(workId: string, orderedIds: string[]): Promise<void> {
    return this.remote.reorderBibleTimelineEvents(workId, orderedIds);
  }

  async listLogicPlaceNodes(workId: string): Promise<LogicPlaceNode[]> {
    return this.remote.listLogicPlaceNodes(workId);
  }
  async addLogicPlaceNode(
    workId: string,
    input: Partial<Omit<LogicPlaceNode, "id" | "workId" | "createdAt" | "updatedAt">> & { name: string },
  ): Promise<LogicPlaceNode> {
    return this.remote.addLogicPlaceNode(workId, input);
  }
  async updateLogicPlaceNode(id: string, patch: Partial<Omit<LogicPlaceNode, "id" | "workId">>): Promise<void> {
    return this.remote.updateLogicPlaceNode(id, patch);
  }
  async deleteLogicPlaceNode(id: string): Promise<void> {
    return this.remote.deleteLogicPlaceNode(id);
  }

  async listLogicPlaceEvents(workId: string): Promise<LogicPlaceEvent[]> {
    return this.remote.listLogicPlaceEvents(workId);
  }
  async addLogicPlaceEvent(
    workId: string,
    input: Partial<Omit<LogicPlaceEvent, "id" | "workId" | "createdAt" | "updatedAt">> & { placeId: string; label: string },
  ): Promise<LogicPlaceEvent> {
    return this.remote.addLogicPlaceEvent(workId, input);
  }
  async updateLogicPlaceEvent(id: string, patch: Partial<Omit<LogicPlaceEvent, "id" | "workId">>): Promise<void> {
    return this.remote.updateLogicPlaceEvent(id, patch);
  }
  async deleteLogicPlaceEvent(id: string): Promise<void> {
    return this.remote.deleteLogicPlaceEvent(id);
  }

  async getTuiyanState(workId: string): Promise<TuiyanState | undefined> {
    const [local, remote] = await Promise.allSettled([
      this.local.getTuiyanState(workId),
      this.remote.getTuiyanState(workId),
    ]);
    const l = local.status === "fulfilled" ? local.value : undefined;
    const r = remote.status === "fulfilled" ? remote.value : undefined;
    if (!l) return r;
    if (!r) return l;
    return (r.updatedAt ?? 0) >= (l.updatedAt ?? 0) ? r : l;
  }

  async upsertTuiyanState(
    workId: string,
    patch: Partial<Omit<TuiyanState, "id" | "workId" | "updatedAt">> & { updatedAt?: number },
  ): Promise<TuiyanState> {
    // Always persist locally first for offline refresh-safety; then best-effort sync to cloud.
    const local = await this.local.upsertTuiyanState(workId, patch);
    try {
      const remote = await this.remote.upsertTuiyanState(workId, patch);
      return remote.updatedAt >= local.updatedAt ? remote : local;
    } catch {
      return local;
    }
  }

  async listBibleChapterTemplates(workId: string): Promise<BibleChapterTemplate[]> {
    return this.tryRemote(
      () => this.remote.listBibleChapterTemplates(workId),
      () => this.local.listBibleChapterTemplates(workId),
    );
  }
  async addBibleChapterTemplate(
    workId: string,
    input: Partial<Omit<BibleChapterTemplate, "id" | "workId" | "createdAt" | "updatedAt">>,
  ): Promise<BibleChapterTemplate> {
    const entity = await this.remote.addBibleChapterTemplate(workId, input);
    this.warmLocal(() => getDB().bibleChapterTemplates.put(entity));
    return entity;
  }
  async updateBibleChapterTemplate(
    id: string,
    patch: Partial<Omit<BibleChapterTemplate, "id" | "workId">>,
  ): Promise<void> {
    await this.remote.updateBibleChapterTemplate(id, patch);
    this.warmLocal(() => getDB().bibleChapterTemplates.update(id, { ...patch, updatedAt: Date.now() }));
  }
  async deleteBibleChapterTemplate(id: string): Promise<void> {
    await this.remote.deleteBibleChapterTemplate(id);
    this.warmLocal(() => getDB().bibleChapterTemplates.delete(id));
  }

  async getChapterBible(chapterId: string): Promise<ChapterBible | undefined> {
    return this.tryRemote(
      () => this.remote.getChapterBible(chapterId),
      () => this.local.getChapterBible(chapterId),
    );
  }
  async upsertChapterBible(
    input: Omit<ChapterBible, "id" | "updatedAt"> & { id?: string },
  ): Promise<ChapterBible> {
    const entity = await this.remote.upsertChapterBible(input);
    this.warmLocal(() => getDB().chapterBible.put(entity));
    return entity;
  }

  async listBibleGlossaryTerms(workId: string): Promise<BibleGlossaryTerm[]> {
    return this.tryRemote(
      () => this.remote.listBibleGlossaryTerms(workId),
      () => this.local.listBibleGlossaryTerms(workId),
    );
  }
  async addBibleGlossaryTerm(
    workId: string,
    input: Partial<Omit<BibleGlossaryTerm, "id" | "workId" | "createdAt" | "updatedAt">>,
  ): Promise<BibleGlossaryTerm> {
    const entity = await this.remote.addBibleGlossaryTerm(workId, input);
    this.warmLocal(() => getDB().bibleGlossaryTerms.put(entity));
    return entity;
  }
  async updateBibleGlossaryTerm(id: string, patch: Partial<Omit<BibleGlossaryTerm, "id" | "workId">>): Promise<void> {
    await this.remote.updateBibleGlossaryTerm(id, patch);
    this.warmLocal(() => getDB().bibleGlossaryTerms.update(id, { ...patch, updatedAt: Date.now() }));
  }
  async deleteBibleGlossaryTerm(id: string): Promise<void> {
    await this.remote.deleteBibleGlossaryTerm(id);
    this.warmLocal(() => getDB().bibleGlossaryTerms.delete(id));
  }

  async listWritingPromptTemplates(workId: string): Promise<WritingPromptTemplate[]> {
    return this.tryRemote(
      () => this.remote.listWritingPromptTemplates(workId),
      () => this.local.listWritingPromptTemplates(workId),
    );
  }
  async addWritingPromptTemplate(
    workId: string,
    input: Partial<Omit<WritingPromptTemplate, "id" | "workId" | "sortOrder" | "createdAt" | "updatedAt">>,
  ): Promise<WritingPromptTemplate> {
    const entity = await this.remote.addWritingPromptTemplate(workId, input);
    this.warmLocal(() => getDB().writingPromptTemplates.put(entity));
    return entity;
  }
  async updateWritingPromptTemplate(
    id: string,
    patch: Partial<Omit<WritingPromptTemplate, "id" | "workId">>,
  ): Promise<void> {
    await this.remote.updateWritingPromptTemplate(id, patch);
    this.warmLocal(() => getDB().writingPromptTemplates.update(id, { ...patch, updatedAt: Date.now() }));
  }
  async deleteWritingPromptTemplate(id: string): Promise<void> {
    await this.remote.deleteWritingPromptTemplate(id);
    this.warmLocal(() => getDB().writingPromptTemplates.delete(id));
  }
  async reorderWritingPromptTemplates(workId: string, orderedIds: string[]): Promise<void> {
    return this.remote.reorderWritingPromptTemplates(workId, orderedIds);
  }

  async listWritingStyleSamples(workId: string): Promise<WritingStyleSample[]> {
    return this.tryRemote(
      () => this.remote.listWritingStyleSamples(workId),
      () => this.local.listWritingStyleSamples(workId),
    );
  }
  async addWritingStyleSample(
    workId: string,
    input: Partial<Omit<WritingStyleSample, "id" | "workId" | "sortOrder" | "createdAt" | "updatedAt">>,
  ): Promise<WritingStyleSample> {
    const entity = await this.remote.addWritingStyleSample(workId, input);
    this.warmLocal(() => getDB().writingStyleSamples.put(entity));
    return entity;
  }
  async updateWritingStyleSample(
    id: string,
    patch: Partial<Omit<WritingStyleSample, "id" | "workId">>,
  ): Promise<void> {
    await this.remote.updateWritingStyleSample(id, patch);
    this.warmLocal(() => getDB().writingStyleSamples.update(id, { ...patch, updatedAt: Date.now() }));
  }
  async deleteWritingStyleSample(id: string): Promise<void> {
    await this.remote.deleteWritingStyleSample(id);
    this.warmLocal(() => getDB().writingStyleSamples.delete(id));
  }
  async reorderWritingStyleSamples(workId: string, orderedIds: string[]): Promise<void> {
    return this.remote.reorderWritingStyleSamples(workId, orderedIds);
  }

  async getWorkStyleCard(workId: string): Promise<WorkStyleCard | undefined> {
    return this.tryRemote(
      () => this.remote.getWorkStyleCard(workId),
      () => this.local.getWorkStyleCard(workId),
    );
  }
  async upsertWorkStyleCard(
    workId: string,
    patch: Partial<Omit<WorkStyleCard, "id" | "workId" | "updatedAt">>,
  ): Promise<WorkStyleCard> {
    const entity = await this.remote.upsertWorkStyleCard(workId, patch);
    this.warmLocal(() => getDB().workStyleCards.put(entity));
    return entity;
  }

  async listInspirationFragments(): Promise<InspirationFragment[]> {
    return this.remote.listInspirationFragments();
  }
  async addInspirationFragment(
    input: Partial<Omit<InspirationFragment, "id" | "createdAt" | "updatedAt">> & { body: string },
  ): Promise<InspirationFragment> {
    return this.remote.addInspirationFragment(input);
  }
  async updateInspirationFragment(
    id: string,
    patch: Partial<Pick<InspirationFragment, "body" | "tags" | "workId" | "collectionId">>,
  ): Promise<void> {
    return this.remote.updateInspirationFragment(id, patch);
  }
  async deleteInspirationFragment(id: string): Promise<void> {
    return this.remote.deleteInspirationFragment(id);
  }

  async listInspirationCollections(): Promise<InspirationCollection[]> {
    return this.remote.listInspirationCollections();
  }
  async addInspirationCollection(
    input: Partial<Omit<InspirationCollection, "id" | "createdAt" | "updatedAt">> & { name: string },
  ): Promise<InspirationCollection> {
    return this.remote.addInspirationCollection(input);
  }
  async updateInspirationCollection(
    id: string,
    patch: Partial<Pick<InspirationCollection, "name" | "sortOrder">>,
  ): Promise<void> {
    return this.remote.updateInspirationCollection(id, patch);
  }
  async deleteInspirationCollection(id: string): Promise<void> {
    return this.remote.deleteInspirationCollection(id);
  }

  // ── 全局提示词库（Sprint 1）─────────────────────────────────────────────────

  async listGlobalPromptTemplates(): Promise<GlobalPromptTemplate[]> {
    let remote: GlobalPromptTemplate[] = [];
    try {
      remote = await this.remote.listGlobalPromptTemplates();
    } catch {
      /* 网络/鉴权失败时 remote 置空，完全依赖 local */
    }
    const local = await this.local.listGlobalPromptTemplates();
    return this.mergeGlobalPromptLists(remote, local);
  }

  async addGlobalPromptTemplate(
    input: Omit<GlobalPromptTemplate, "id" | "sortOrder" | "createdAt" | "updatedAt">,
  ): Promise<GlobalPromptTemplate> {
    const entity = await this.remote.addGlobalPromptTemplate(input);
    this.warmLocal(() => getDB().globalPromptTemplates.put(entity));
    return entity;
  }

  async updateGlobalPromptTemplate(
    id: string,
    patch: Partial<Omit<GlobalPromptTemplate, "id" | "createdAt">>,
  ): Promise<void> {
    await this.remote.updateGlobalPromptTemplate(id, patch);
    this.warmLocal(() =>
      getDB().globalPromptTemplates.update(id, { ...patch, updatedAt: Date.now() }),
    );
  }

  async deleteGlobalPromptTemplate(id: string): Promise<void> {
    await this.remote.deleteGlobalPromptTemplate(id);
    this.warmLocal(() => getDB().globalPromptTemplates.delete(id));
  }

  async reorderGlobalPromptTemplates(orderedIds: string[]): Promise<void> {
    return this.remote.reorderGlobalPromptTemplates(orderedIds);
  }

  async listApprovedPromptTemplates(): Promise<GlobalPromptTemplate[]> {
    let remote: GlobalPromptTemplate[] = [];
    try {
      remote = await this.remote.listApprovedPromptTemplates();
    } catch {
      /* 同上 */
    }
    const local = await this.local.listApprovedPromptTemplates();
    return this.mergeGlobalPromptLists(remote, local);
  }

  async listSubmittedPromptTemplates(): Promise<GlobalPromptTemplate[]> {
    // 待审核模板需从远端获取（Supabase RLS 需配套管理员策略）；离线时退化为本地
    return this.tryRemote(
      () => this.remote.listSubmittedPromptTemplates(),
      () => this.local.listSubmittedPromptTemplates(),
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────

  async exportAllData(): ReturnType<WritingStore["exportAllData"]> {
    const base = await this.remote.exportAllData();
    const db = getDB();
    const [
      referenceLibrary,
      referenceChunks,
      referenceTokenPostings,
      referenceExcerpts,
      referenceTags,
      referenceExcerptTags,
      referenceChapterHeads,
    ] = await Promise.all([
      db.referenceLibrary.toArray(),
      db.referenceChunks.toArray(),
      db.referenceTokenPostings.toArray(),
      db.referenceExcerpts.toArray(),
      db.referenceTags.toArray(),
      db.referenceExcerptTags.toArray(),
      db.referenceChapterHeads.toArray(),
    ]);
    return {
      ...base,
      referenceLibrary,
      referenceChunks,
      referenceTokenPostings,
      referenceExcerpts,
      referenceTags,
      referenceExcerptTags,
      referenceChapterHeads,
    };
  }

  async importAllData(data: Parameters<WritingStore["importAllData"]>[0]): Promise<void> {
    await this.remote.importAllData(data);
    await this.local.importReferenceOnlyReplace(data);
  }

  async importAllDataMerge(data: Parameters<WritingStore["importAllDataMerge"]>[0]): Promise<void> {
    const m = remapImportMergePayload(data, () => Date.now());
    await this.remote.applyRemappedMergeWritingOnly(m);
    await this.local.applyRemappedMergeReferenceOnly(m);
  }
}
