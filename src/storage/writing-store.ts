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
  GlobalPromptTemplate,
  ReferenceChapterHead,
  ReferenceChunk,
  ReferenceExcerpt,
  ReferenceExcerptTag,
  ReferenceLibraryEntry,
  ReferenceSearchHit,
  ReferenceTag,
  ReferenceTokenPosting,
  InspirationCollection,
  InspirationFragment,
  Volume,
  Work,
  WorkStyleCard,
  WritingPromptTemplate,
  WritingStyleSample,
  LogicPlaceEvent,
  LogicPlaceNode,
  TuiyanState,
} from "../db/types";

/** {@link WritingStore.updateChapter} 可选行为（步 25 乐观锁） */
export type UpdateChapterOptions = {
  expectedUpdatedAt?: number;
};

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
  createWork(title: string, opts?: { tags?: string[]; description?: string; status?: Work["status"] }): Promise<Work>;
  updateWork(
    id: string,
    patch: Partial<Pick<Work, "title" | "progressCursor" | "coverImage" | "tags" | "description" | "status" | "bookNo">>,
  ): Promise<void>;
  deleteWork(id: string): Promise<void>;

  listVolumes(workId: string): Promise<Volume[]>;
  createVolume(workId: string, title?: string): Promise<Volume>;
  updateVolume(id: string, patch: Partial<Pick<Volume, "title" | "order" | "summary">>): Promise<void>;
  deleteVolume(volumeId: string): Promise<void>;

  listChapters(workId: string): Promise<Chapter[]>;
  createChapter(workId: string, title?: string, volumeId?: string): Promise<Chapter>;
  /**
   * @returns 写入后的 `updatedAt`（毫秒时间戳），章不存在时 `undefined`（仅本地 IndexedDB 可能无操作）
   */
  updateChapter(
    id: string,
    patch: Partial<
      Pick<
        Chapter,
        "title" | "content" | "volumeId" | "summary" | "summaryUpdatedAt" | "summaryScopeFromOrder" | "summaryScopeToOrder" | "outlineDraft" | "outlineNodeId" | "outlinePushedAt"
      >
    >,
    options?: UpdateChapterOptions,
  ): Promise<number | undefined>;
  /** 按书号查内部作品 id（同用户下唯一） */
  getWorkIdByBookNo(bookNo: number): Promise<string | undefined>;
  deleteChapter(id: string): Promise<void>;
  reorderChapters(workId: string, orderedIds: string[]): Promise<void>;

  /** 全书纯文本搜索（字面量，非正则） */
  searchWork(workId: string, query: string, scope?: BookSearchScope, isRegex?: boolean): Promise<BookSearchHit[]>;

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
      /** 可选：用于取消导入/索引 */
      signal?: AbortSignal;
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

  /** 参考库全文检索：`strict` 多词 AND + 整句字面量；`hybrid` 多词 OR + 相关度排序（步 40） */
  searchReferenceLibrary(
    query: string,
    opts?: { refWorkId?: string; limit?: number; mode?: "strict" | "hybrid" },
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

  /** 第 4 组：一致性护栏 / 锦囊 */
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

  /** §11 步 34：推演地图/地点事件（独立表） */
  listLogicPlaceNodes(workId: string): Promise<LogicPlaceNode[]>;
  addLogicPlaceNode(
    workId: string,
    input: Partial<Omit<LogicPlaceNode, "id" | "workId" | "createdAt" | "updatedAt">> & { name: string },
  ): Promise<LogicPlaceNode>;
  updateLogicPlaceNode(id: string, patch: Partial<Omit<LogicPlaceNode, "id" | "workId">>): Promise<void>;
  deleteLogicPlaceNode(id: string): Promise<void>;

  listLogicPlaceEvents(workId: string): Promise<LogicPlaceEvent[]>;
  addLogicPlaceEvent(
    workId: string,
    input: Partial<Omit<LogicPlaceEvent, "id" | "workId" | "createdAt" | "updatedAt">> & { placeId: string; label: string },
  ): Promise<LogicPlaceEvent>;
  updateLogicPlaceEvent(id: string, patch: Partial<Omit<LogicPlaceEvent, "id" | "workId">>): Promise<void>;
  deleteLogicPlaceEvent(id: string): Promise<void>;

  /** 推演工作台：与作品绑定的状态（对话/文策/定稿标记等） */
  getTuiyanState(workId: string): Promise<TuiyanState | undefined>;
  upsertTuiyanState(
    workId: string,
    patch: Partial<Omit<TuiyanState, "id" | "workId" | "updatedAt">> & { updatedAt?: number },
  ): Promise<TuiyanState>;

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

  /** Sprint 1：全局（跨作品）提示词库（仅返回当前用户自己的所有模板） */
  listGlobalPromptTemplates(): Promise<GlobalPromptTemplate[]>;
  /**
   * Sprint 2：返回所有 status=approved 的模板（含他人已发布）。
   * Supabase RLS 自动过滤可见性；IndexedDB 退化为本地 approved。
   */
  listApprovedPromptTemplates(): Promise<GlobalPromptTemplate[]>;
  /**
   * 管理员审核：返回所有 status=submitted 的模板（含他人提交）。
   * Supabase 端需配套 RLS 策略允许管理员账号读取全部 submitted 行；
   * IndexedDB 退化为本地 submitted 行。
   */
  listSubmittedPromptTemplates(): Promise<GlobalPromptTemplate[]>;
  addGlobalPromptTemplate(
    input: Omit<GlobalPromptTemplate, "id" | "sortOrder" | "createdAt" | "updatedAt">,
  ): Promise<GlobalPromptTemplate>;
  updateGlobalPromptTemplate(
    id: string,
    patch: Partial<Omit<GlobalPromptTemplate, "id" | "createdAt">>,
  ): Promise<void>;
  deleteGlobalPromptTemplate(id: string): Promise<void>;
  reorderGlobalPromptTemplates(orderedIds: string[]): Promise<void>;

  /** §11 步 42：可复用「额外要求」模板 */
  listWritingPromptTemplates(workId: string): Promise<WritingPromptTemplate[]>;
  addWritingPromptTemplate(
    workId: string,
    input: Partial<Omit<WritingPromptTemplate, "id" | "workId" | "sortOrder" | "createdAt" | "updatedAt">>,
  ): Promise<WritingPromptTemplate>;
  updateWritingPromptTemplate(
    id: string,
    patch: Partial<Omit<WritingPromptTemplate, "id" | "workId">>,
  ): Promise<void>;
  deleteWritingPromptTemplate(id: string): Promise<void>;
  reorderWritingPromptTemplates(workId: string, orderedIds: string[]): Promise<void>;

  /** §11 步 43：笔感参考样本（注入 user 上下文） */
  listWritingStyleSamples(workId: string): Promise<WritingStyleSample[]>;
  addWritingStyleSample(
    workId: string,
    input: Partial<Omit<WritingStyleSample, "id" | "workId" | "sortOrder" | "createdAt" | "updatedAt">>,
  ): Promise<WritingStyleSample>;
  updateWritingStyleSample(
    id: string,
    patch: Partial<Omit<WritingStyleSample, "id" | "workId">>,
  ): Promise<void>;
  deleteWritingStyleSample(id: string): Promise<void>;
  reorderWritingStyleSamples(workId: string, orderedIds: string[]): Promise<void>;

  /** 第 5 组：全书级风格卡 / 调性锁（5.3） */
  getWorkStyleCard(workId: string): Promise<WorkStyleCard | undefined>;
  upsertWorkStyleCard(
    workId: string,
    patch: Partial<Omit<WorkStyleCard, "id" | "workId" | "updatedAt">>,
  ): Promise<WorkStyleCard>;

  /** §11 步 35：流光碎片 */
  listInspirationFragments(): Promise<InspirationFragment[]>;
  addInspirationFragment(
    input: Partial<Omit<InspirationFragment, "id" | "createdAt" | "updatedAt">> & { body: string },
  ): Promise<InspirationFragment>;
  updateInspirationFragment(
    id: string,
    patch: Partial<Pick<InspirationFragment, "body" | "tags" | "workId" | "collectionId">>,
  ): Promise<void>;
  deleteInspirationFragment(id: string): Promise<void>;

  /** §G-07：流光集合 */
  listInspirationCollections(): Promise<InspirationCollection[]>;
  addInspirationCollection(
    input: Partial<Omit<InspirationCollection, "id" | "createdAt" | "updatedAt">> & { name: string },
  ): Promise<InspirationCollection>;
  updateInspirationCollection(
    id: string,
    patch: Partial<Pick<InspirationCollection, "name" | "sortOrder">>,
  ): Promise<void>;
  deleteInspirationCollection(id: string): Promise<void>;

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
    inspirationCollections: InspirationCollection[];
    inspirationFragments: InspirationFragment[];
    writingPromptTemplates: WritingPromptTemplate[];
    writingStyleSamples: WritingStyleSample[];
    logicPlaceNodes: LogicPlaceNode[];
    logicPlaceEvents: LogicPlaceEvent[];
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
    inspirationCollections?: InspirationCollection[];
    inspirationFragments?: InspirationFragment[];
    writingPromptTemplates?: WritingPromptTemplate[];
    writingStyleSamples?: WritingStyleSample[];
    logicPlaceNodes?: LogicPlaceNode[];
    logicPlaceEvents?: LogicPlaceEvent[];
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
    inspirationCollections?: InspirationCollection[];
    inspirationFragments?: InspirationFragment[];
    writingPromptTemplates?: WritingPromptTemplate[];
    writingStyleSamples?: WritingStyleSample[];
    logicPlaceNodes?: LogicPlaceNode[];
    logicPlaceEvents?: LogicPlaceEvent[];
  }): Promise<void>;
}
