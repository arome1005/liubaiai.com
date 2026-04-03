import { getDB } from "../db/database";
import type {
  BibleCharacter,
  BibleChapterTemplate,
  BibleForeshadow,
  BibleGlossaryTerm,
  BibleTimelineEvent,
  BibleWorldEntry,
  BookSearchHit,
  BookSearchScope,
  Chapter,
  ChapterBible,
  ChapterSnapshot,
  ReferenceChapterHead,
  ReferenceChunk,
  ReferenceExcerpt,
  ReferenceLibraryEntry,
  ReferenceSearchHit,
  ReferenceTag,
  Volume,
  Work,
  WorkStyleCard,
} from "../db/types";
import { remapImportMergePayload } from "./backup-merge-remap";
import type { WritingStore } from "./writing-store";
import { WritingStoreIndexedDB } from "./writing-store-indexeddb";
import { WritingStoreSupabase } from "./writing-store-supabase";

/**
 * Web + Supabase：作品 / 章节 / 圣经 / 风格卡走云端；参考库（藏经）仍 IndexedDB。
 */
export class WritingStoreHybrid implements WritingStore {
  private readonly local = new WritingStoreIndexedDB();
  private readonly remote = new WritingStoreSupabase();

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
  async createWork(title: string): Promise<Work> {
    return this.remote.createWork(title);
  }
  async updateWork(
    id: string,
    patch: Partial<Pick<Work, "title" | "progressCursor">>,
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
  async updateVolume(id: string, patch: Partial<Pick<Volume, "title" | "order">>): Promise<void> {
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
    patch: Partial<Pick<Chapter, "title" | "content" | "volumeId" | "summary">>,
  ): Promise<void> {
    return this.remote.updateChapter(id, patch);
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

  async searchWork(workId: string, query: string, scope?: BookSearchScope): Promise<BookSearchHit[]> {
    return this.remote.searchWork(workId, query, scope);
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
    opts?: { refWorkId?: string; limit?: number },
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
    return this.remote.listBibleCharacters(workId);
  }
  async addBibleCharacter(
    workId: string,
    input: Partial<Omit<BibleCharacter, "id" | "workId" | "sortOrder" | "createdAt" | "updatedAt">>,
  ): Promise<BibleCharacter> {
    return this.remote.addBibleCharacter(workId, input);
  }
  async updateBibleCharacter(id: string, patch: Partial<Omit<BibleCharacter, "id" | "workId">>): Promise<void> {
    return this.remote.updateBibleCharacter(id, patch);
  }
  async deleteBibleCharacter(id: string): Promise<void> {
    return this.remote.deleteBibleCharacter(id);
  }
  async reorderBibleCharacters(workId: string, orderedIds: string[]): Promise<void> {
    return this.remote.reorderBibleCharacters(workId, orderedIds);
  }

  async listBibleWorldEntries(workId: string): Promise<BibleWorldEntry[]> {
    return this.remote.listBibleWorldEntries(workId);
  }
  async addBibleWorldEntry(
    workId: string,
    input: Partial<Omit<BibleWorldEntry, "id" | "workId" | "sortOrder" | "createdAt" | "updatedAt">>,
  ): Promise<BibleWorldEntry> {
    return this.remote.addBibleWorldEntry(workId, input);
  }
  async updateBibleWorldEntry(id: string, patch: Partial<Omit<BibleWorldEntry, "id" | "workId">>): Promise<void> {
    return this.remote.updateBibleWorldEntry(id, patch);
  }
  async deleteBibleWorldEntry(id: string): Promise<void> {
    return this.remote.deleteBibleWorldEntry(id);
  }
  async reorderBibleWorldEntries(workId: string, orderedIds: string[]): Promise<void> {
    return this.remote.reorderBibleWorldEntries(workId, orderedIds);
  }

  async listBibleForeshadowing(workId: string): Promise<BibleForeshadow[]> {
    return this.remote.listBibleForeshadowing(workId);
  }
  async addBibleForeshadow(
    workId: string,
    input: Partial<Omit<BibleForeshadow, "id" | "workId" | "sortOrder" | "createdAt" | "updatedAt">>,
  ): Promise<BibleForeshadow> {
    return this.remote.addBibleForeshadow(workId, input);
  }
  async updateBibleForeshadow(id: string, patch: Partial<Omit<BibleForeshadow, "id" | "workId">>): Promise<void> {
    return this.remote.updateBibleForeshadow(id, patch);
  }
  async deleteBibleForeshadow(id: string): Promise<void> {
    return this.remote.deleteBibleForeshadow(id);
  }
  async reorderBibleForeshadowing(workId: string, orderedIds: string[]): Promise<void> {
    return this.remote.reorderBibleForeshadowing(workId, orderedIds);
  }

  async listBibleTimelineEvents(workId: string): Promise<BibleTimelineEvent[]> {
    return this.remote.listBibleTimelineEvents(workId);
  }
  async addBibleTimelineEvent(
    workId: string,
    input: Partial<Omit<BibleTimelineEvent, "id" | "workId" | "sortOrder" | "createdAt" | "updatedAt">>,
  ): Promise<BibleTimelineEvent> {
    return this.remote.addBibleTimelineEvent(workId, input);
  }
  async updateBibleTimelineEvent(
    id: string,
    patch: Partial<Omit<BibleTimelineEvent, "id" | "workId">>,
  ): Promise<void> {
    return this.remote.updateBibleTimelineEvent(id, patch);
  }
  async deleteBibleTimelineEvent(id: string): Promise<void> {
    return this.remote.deleteBibleTimelineEvent(id);
  }
  async reorderBibleTimelineEvents(workId: string, orderedIds: string[]): Promise<void> {
    return this.remote.reorderBibleTimelineEvents(workId, orderedIds);
  }

  async listBibleChapterTemplates(workId: string): Promise<BibleChapterTemplate[]> {
    return this.remote.listBibleChapterTemplates(workId);
  }
  async addBibleChapterTemplate(
    workId: string,
    input: Partial<Omit<BibleChapterTemplate, "id" | "workId" | "createdAt" | "updatedAt">>,
  ): Promise<BibleChapterTemplate> {
    return this.remote.addBibleChapterTemplate(workId, input);
  }
  async updateBibleChapterTemplate(
    id: string,
    patch: Partial<Omit<BibleChapterTemplate, "id" | "workId">>,
  ): Promise<void> {
    return this.remote.updateBibleChapterTemplate(id, patch);
  }
  async deleteBibleChapterTemplate(id: string): Promise<void> {
    return this.remote.deleteBibleChapterTemplate(id);
  }

  async getChapterBible(chapterId: string): Promise<ChapterBible | undefined> {
    return this.remote.getChapterBible(chapterId);
  }
  async upsertChapterBible(
    input: Omit<ChapterBible, "id" | "updatedAt"> & { id?: string },
  ): Promise<ChapterBible> {
    return this.remote.upsertChapterBible(input);
  }

  async listBibleGlossaryTerms(workId: string): Promise<BibleGlossaryTerm[]> {
    return this.remote.listBibleGlossaryTerms(workId);
  }
  async addBibleGlossaryTerm(
    workId: string,
    input: Partial<Omit<BibleGlossaryTerm, "id" | "workId" | "createdAt" | "updatedAt">>,
  ): Promise<BibleGlossaryTerm> {
    return this.remote.addBibleGlossaryTerm(workId, input);
  }
  async updateBibleGlossaryTerm(id: string, patch: Partial<Omit<BibleGlossaryTerm, "id" | "workId">>): Promise<void> {
    return this.remote.updateBibleGlossaryTerm(id, patch);
  }
  async deleteBibleGlossaryTerm(id: string): Promise<void> {
    return this.remote.deleteBibleGlossaryTerm(id);
  }

  async getWorkStyleCard(workId: string): Promise<WorkStyleCard | undefined> {
    return this.remote.getWorkStyleCard(workId);
  }
  async upsertWorkStyleCard(
    workId: string,
    patch: Partial<Omit<WorkStyleCard, "id" | "workId" | "updatedAt">>,
  ): Promise<WorkStyleCard> {
    return this.remote.upsertWorkStyleCard(workId, patch);
  }

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
