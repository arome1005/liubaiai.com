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
  ReferenceExcerptTag,
  ReferenceLibraryEntry,
  ReferenceSearchHit,
  ReferenceTag,
  ReferenceTokenPosting,
  Volume,
  Work,
  WorkStyleCard,
} from "../db/types";

/**
 * 创作数据存储抽象。
 * - **Web 当前**：`WritingStoreIndexedDB`（浏览器 IndexedDB，经 Dexie）。
 * - **桌面二期**：实现相同接口的 `WritingStoreSqlite`（或 Tauri SQL 插件），在启动时 `setWritingStore(...)` 注入即可。
 *
 * 业务代码只应通过 `src/db/repo.ts`（内部调用 `getWritingStore()`）访问，不要直接依赖 Dexie/SQLite。
 */
export interface WritingStore {
  /** 打开连接、迁移、元数据初始化 */
  init(): Promise<void>;

  listWorks(): Promise<Work[]>;
  getWork(id: string): Promise<Work | undefined>;
  createWork(title: string): Promise<Work>;
  updateWork(
    id: string,
    patch: Partial<Pick<Work, "title" | "progressCursor">>,
  ): Promise<void>;
  deleteWork(id: string): Promise<void>;

  listVolumes(workId: string): Promise<Volume[]>;
  createVolume(workId: string, title?: string): Promise<Volume>;
  updateVolume(id: string, patch: Partial<Pick<Volume, "title" | "order">>): Promise<void>;
  deleteVolume(volumeId: string): Promise<void>;

  listChapters(workId: string): Promise<Chapter[]>;
  createChapter(workId: string, title?: string, volumeId?: string): Promise<Chapter>;
  updateChapter(
    id: string,
    patch: Partial<Pick<Chapter, "title" | "content" | "volumeId" | "summary">>,
  ): Promise<void>;
  deleteChapter(id: string): Promise<void>;
  reorderChapters(workId: string, orderedIds: string[]): Promise<void>;

  /** 全书纯文本搜索（字面量，非正则） */
  searchWork(workId: string, query: string, scope?: BookSearchScope): Promise<BookSearchHit[]>;

  listChapterSnapshots(chapterId: string): Promise<ChapterSnapshot[]>;
  /** 若与最新一条正文相同则跳过；超出条数删最旧 */
  addChapterSnapshot(chapterId: string, content: string): Promise<void>;
  deleteChapterSnapshot(snapshotId: string): Promise<void>;

  /** 参考库（3.x）：列表元数据 */
  listReferenceLibrary(): Promise<ReferenceLibraryEntry[]>;
  getReferenceLibraryEntry(id: string): Promise<ReferenceLibraryEntry | undefined>;
  /** 分块写入，支持百万字级 .txt；可选 onProgress 用于大文件索引阶段 UI */
  createReferenceFromPlainText(
    input: {
      title: string;
      sourceName?: string;
      fullText: string;
      category?: string;
    },
    options?: {
      onProgress?: (p: { phase: "chunks" | "index"; percent: number; label?: string }) => void;
    },
  ): Promise<ReferenceLibraryEntry>;
  updateReferenceLibraryEntry(
    id: string,
    patch: Partial<Pick<ReferenceLibraryEntry, "title" | "category">>,
  ): Promise<void>;
  deleteReferenceLibraryEntry(id: string): Promise<void>;
  listReferenceChunks(refWorkId: string): Promise<ReferenceChunk[]>;
  /** 正则检测到的章节标题行（用于书目侧栏导航） */
  listReferenceChapterHeads(refWorkId: string): Promise<ReferenceChapterHead[]>;
  /** 按全书正文重算章节元数据与章节表（并重建该书倒排索引） */
  syncChapterMetadataForRefWork(refWorkId: string): Promise<void>;
  getReferenceChunk(chunkId: string): Promise<ReferenceChunk | undefined>;

  /** 参考库全文检索（倒排索引召回 + 字面量精排） */
  searchReferenceLibrary(
    query: string,
    opts?: { refWorkId?: string; limit?: number },
  ): Promise<ReferenceSearchHit[]>;

  /** 3.7：按序按需取块（复合索引），避免一次加载全书分块正文 */
  getReferenceChunkAt(refWorkId: string, ordinal: number): Promise<ReferenceChunk | undefined>;

  listReferenceTags(): Promise<ReferenceTag[]>;
  createReferenceTag(name: string): Promise<ReferenceTag>;
  deleteReferenceTag(id: string): Promise<void>;

  listReferenceExcerpts(refWorkId: string): Promise<ReferenceExcerpt[]>;
  /** 含每条摘录的标签 id（3.5） */
  listReferenceExcerptsWithTagIds(refWorkId: string): Promise<
    Array<ReferenceExcerpt & { tagIds: string[] }>
  >;
  /** 全部参考摘录（跨书），用于编辑器「灵感便签」 */
  listAllReferenceExcerpts(): Promise<
    Array<ReferenceExcerpt & { refTitle: string; tagIds: string[] }>
  >;
  addReferenceExcerpt(input: Omit<ReferenceExcerpt, "id" | "createdAt">): Promise<ReferenceExcerpt>;
  updateReferenceExcerpt(
    id: string,
    patch: Partial<
      Pick<ReferenceExcerpt, "note" | "linkedWorkId" | "linkedChapterId">
    > & { tagIds?: string[] },
  ): Promise<void>;
  setExcerptTags(excerptId: string, tagIds: string[]): Promise<void>;
  deleteReferenceExcerpt(id: string): Promise<void>;

  /** 仅重建参考库倒排索引（不动正文分块与元数据） */
  rebuildAllReferenceSearchIndex(
    onProgress?: (p: { phase: string; percent: number; label?: string }) => void,
  ): Promise<void>;
  /** 清空全部参考库数据（索引、分块、摘录；不影响作品正文） */
  clearAllReferenceLibraryData(): Promise<void>;

  /** 第 4 组：一致性护栏 / 圣经 */
  listBibleCharacters(workId: string): Promise<BibleCharacter[]>;
  addBibleCharacter(
    workId: string,
    input: Partial<Omit<BibleCharacter, "id" | "workId" | "sortOrder" | "createdAt" | "updatedAt">>,
  ): Promise<BibleCharacter>;
  updateBibleCharacter(id: string, patch: Partial<Omit<BibleCharacter, "id" | "workId">>): Promise<void>;
  deleteBibleCharacter(id: string): Promise<void>;
  reorderBibleCharacters(workId: string, orderedIds: string[]): Promise<void>;

  listBibleWorldEntries(workId: string): Promise<BibleWorldEntry[]>;
  addBibleWorldEntry(
    workId: string,
    input: Partial<Omit<BibleWorldEntry, "id" | "workId" | "sortOrder" | "createdAt" | "updatedAt">>,
  ): Promise<BibleWorldEntry>;
  updateBibleWorldEntry(id: string, patch: Partial<Omit<BibleWorldEntry, "id" | "workId">>): Promise<void>;
  deleteBibleWorldEntry(id: string): Promise<void>;
  reorderBibleWorldEntries(workId: string, orderedIds: string[]): Promise<void>;

  listBibleForeshadowing(workId: string): Promise<BibleForeshadow[]>;
  addBibleForeshadow(
    workId: string,
    input: Partial<Omit<BibleForeshadow, "id" | "workId" | "sortOrder" | "createdAt" | "updatedAt">>,
  ): Promise<BibleForeshadow>;
  updateBibleForeshadow(id: string, patch: Partial<Omit<BibleForeshadow, "id" | "workId">>): Promise<void>;
  deleteBibleForeshadow(id: string): Promise<void>;
  reorderBibleForeshadowing(workId: string, orderedIds: string[]): Promise<void>;

  listBibleTimelineEvents(workId: string): Promise<BibleTimelineEvent[]>;
  addBibleTimelineEvent(
    workId: string,
    input: Partial<Omit<BibleTimelineEvent, "id" | "workId" | "sortOrder" | "createdAt" | "updatedAt">>,
  ): Promise<BibleTimelineEvent>;
  updateBibleTimelineEvent(id: string, patch: Partial<Omit<BibleTimelineEvent, "id" | "workId">>): Promise<void>;
  deleteBibleTimelineEvent(id: string): Promise<void>;
  reorderBibleTimelineEvents(workId: string, orderedIds: string[]): Promise<void>;

  listBibleChapterTemplates(workId: string): Promise<BibleChapterTemplate[]>;
  addBibleChapterTemplate(
    workId: string,
    input: Partial<Omit<BibleChapterTemplate, "id" | "workId" | "createdAt" | "updatedAt">>,
  ): Promise<BibleChapterTemplate>;
  updateBibleChapterTemplate(
    id: string,
    patch: Partial<Omit<BibleChapterTemplate, "id" | "workId">>,
  ): Promise<void>;
  deleteBibleChapterTemplate(id: string): Promise<void>;

  getChapterBible(chapterId: string): Promise<ChapterBible | undefined>;
  upsertChapterBible(
    input: Omit<ChapterBible, "id" | "updatedAt"> & { id?: string },
  ): Promise<ChapterBible>;

  listBibleGlossaryTerms(workId: string): Promise<BibleGlossaryTerm[]>;
  addBibleGlossaryTerm(
    workId: string,
    input: Partial<Omit<BibleGlossaryTerm, "id" | "workId" | "createdAt" | "updatedAt">>,
  ): Promise<BibleGlossaryTerm>;
  updateBibleGlossaryTerm(id: string, patch: Partial<Omit<BibleGlossaryTerm, "id" | "workId">>): Promise<void>;
  deleteBibleGlossaryTerm(id: string): Promise<void>;

  /** 第 5 组：全书级风格卡 / 调性锁（5.3） */
  getWorkStyleCard(workId: string): Promise<WorkStyleCard | undefined>;
  upsertWorkStyleCard(
    workId: string,
    patch: Partial<Omit<WorkStyleCard, "id" | "workId" | "updatedAt">>,
  ): Promise<WorkStyleCard>;

  exportAllData(): Promise<{
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
  }>;
  importAllData(data: {
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
  }): Promise<void>;
  /** 合并导入：生成新 id，追加到现有库 */
  importAllDataMerge(data: {
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
  }): Promise<void>;
}
