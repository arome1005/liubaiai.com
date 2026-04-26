/**
 * Dexie / IndexedDB 定义：仅由 {@link ../storage/writing-store-indexeddb} 使用。
 * 业务代码请走 `repo` → `getWritingStore()`，勿直接依赖本模块。
 */
import Dexie, { type Table } from "dexie";
import type {
  BibleCharacter,
  BibleChapterTemplate,
  GlobalPromptTemplate,
  WritingPromptTemplate,
  WritingStyleSample,
  BibleForeshadow,
  BibleGlossaryTerm,
  BibleTimelineEvent,
  BibleWorldEntry,
  Chapter,
  ChapterBible,
  ChapterSnapshot,
  ReferenceChunk,
  ReferenceChapterHead,
  ReferenceExcerpt,
  ReferenceExcerptTag,
  ReferenceExtract,
  ReferenceLibraryEntry,
  ReferenceTag,
  ReferenceTokenPosting,
  Volume,
  Work,
  InspirationCollection,
  InspirationFragment,
  WorkStyleCard,
  LogicPlaceEvent,
  LogicPlaceNode,
  TuiyanState,
} from "./types";
import {
  DB_NAME,
  SCHEMA_VERSION,
  SNAPSHOT_CAP_PER_CHAPTER,
  SNAPSHOT_MAX_AGE_MS,
} from "./types";

export class LiubaiDB extends Dexie {
  works!: Table<Work, string>;
  chapters!: Table<Chapter, string>;
  volumes!: Table<Volume, string>;
  meta!: Table<{ key: string; value: unknown }, string>;
  chapterSnapshots!: Table<ChapterSnapshot, string>;
  /** 第 3 组参考库：原著元数据（Dexie 表名 camelCase，与路线图「reference_library」对应） */
  referenceLibrary!: Table<ReferenceLibraryEntry, string>;
  referenceChunks!: Table<ReferenceChunk, string>;
  referenceTokenPostings!: Table<ReferenceTokenPosting, string>;
  referenceExcerpts!: Table<ReferenceExcerpt, string>;
  /** 3.5 摘录标签（全局） */
  referenceTags!: Table<ReferenceTag, string>;
  referenceExcerptTags!: Table<ReferenceExcerptTag, string>;
  /** 参考库章节标题行索引（与 ReferenceChunk 章节检测一致） */
  referenceChapterHeads!: Table<ReferenceChapterHead, string>;
  /** 第 4 组 一致性护栏 / 锦囊 */
  bibleCharacters!: Table<BibleCharacter, string>;
  bibleWorldEntries!: Table<BibleWorldEntry, string>;
  bibleForeshadowing!: Table<BibleForeshadow, string>;
  bibleTimelineEvents!: Table<BibleTimelineEvent, string>;
  /** §11 步 34：推演地图/地点事件（独立表） */
  logicPlaceNodes!: Table<LogicPlaceNode, string>;
  logicPlaceEvents!: Table<LogicPlaceEvent, string>;
  bibleChapterTemplates!: Table<BibleChapterTemplate, string>;
  writingPromptTemplates!: Table<WritingPromptTemplate, string>;
  writingStyleSamples!: Table<WritingStyleSample, string>;
  chapterBible!: Table<ChapterBible, string>;
  bibleGlossaryTerms!: Table<BibleGlossaryTerm, string>;
  /** 第 5 组：全书级风格卡 / 调性锁（每作品一份） */
  workStyleCards!: Table<WorkStyleCard, string>;
  /** §11 步 35：流光碎片 */
  inspirationFragments!: Table<InspirationFragment, string>;
  /** §G-07：流光集合 */
  inspirationCollections!: Table<InspirationCollection, string>;
  /** 推演工作台状态（与作品绑定） */
  tuiyanStates!: Table<TuiyanState, string>;
  /** P1-03 提炼要点（本地，不上云） */
  referenceExtracts!: Table<ReferenceExtract, string>;
  /** 全局提示词库（跨作品，Sprint 1 仅 draft） */
  globalPromptTemplates!: Table<GlobalPromptTemplate, string>;

  constructor() {
    super(DB_NAME);
    this.version(1).stores({
      works: "id, updatedAt",
      chapters: "id, workId, order",
      meta: "key",
    });
    this.version(2)
      .stores({
        works: "id, updatedAt",
        chapters: "id, workId, order",
        meta: "key",
      })
      .upgrade(async (trans) => {
        await trans.table("works").toCollection().modify((w: Record<string, unknown>) => {
          const legacy = w.progressChapterId as string | null | undefined;
          w.progressCursor = (w.progressCursor ?? legacy ?? null) as string | null;
          delete w.progressChapterId;
        });
      });
    this.version(3).stores({
      works: "id, updatedAt",
      chapters: "id, workId, order",
      meta: "key",
      chapterSnapshots: "id, chapterId, createdAt",
    });
    this.version(4)
      .stores({
        works: "id, updatedAt",
        chapters: "id, workId, order, volumeId",
        volumes: "id, workId, order",
        meta: "key",
        chapterSnapshots: "id, chapterId, createdAt",
      })
      .upgrade(async (trans) => {
        const chaptersTable = trans.table("chapters");
        const volumesTable = trans.table("volumes");
        const allChapters = (await chaptersTable.toArray()) as Chapter[];
        const workIds = [...new Set(allChapters.map((c) => c.workId))];
        const t = Date.now();
        const workToDefaultVol = new Map<string, string>();
        for (const wid of workIds) {
          const vid = crypto.randomUUID();
          workToDefaultVol.set(wid, vid);
          await volumesTable.add({
            id: vid,
            workId: wid,
            title: "正文",
            order: 0,
            createdAt: t,
          });
        }
        const worksTable = trans.table("works");
        const allWorks = (await worksTable.toArray()) as Work[];
        for (const w of allWorks) {
          if (!workToDefaultVol.has(w.id)) {
            const vid = crypto.randomUUID();
            workToDefaultVol.set(w.id, vid);
            await volumesTable.add({
              id: vid,
              workId: w.id,
              title: "正文",
              order: 0,
              createdAt: t,
            });
          }
        }
        await chaptersTable.toCollection().modify((ch: Record<string, unknown>) => {
          const wid = ch.workId as string;
          const vid = workToDefaultVol.get(wid);
          const content = (ch.content as string) ?? "";
          ch.volumeId = vid;
          ch.wordCountCache = content.replace(/\s/g, "").length;
        });
      });
    this.version(5)
      .stores({
        works: "id, updatedAt",
        chapters: "id, workId, order, volumeId",
        volumes: "id, workId, order",
        meta: "key",
        chapterSnapshots: "id, chapterId, createdAt",
        referenceLibrary: "id, updatedAt",
        referenceChunks: "id, refWorkId, ordinal",
      })
      .upgrade(async (trans) => {
        const snapTable = trans.table("chapterSnapshots");
        const snaps = (await snapTable.toArray()) as ChapterSnapshot[];
        const cutoff = Date.now() - SNAPSHOT_MAX_AGE_MS;
        for (const s of snaps) {
          if (s.createdAt < cutoff) await snapTable.delete(s.id);
        }
        const remaining = (await snapTable.toArray()) as ChapterSnapshot[];
        const byChapter = new Map<string, ChapterSnapshot[]>();
        for (const s of remaining) {
          const list = byChapter.get(s.chapterId) ?? [];
          list.push(s);
          byChapter.set(s.chapterId, list);
        }
        for (const [, list] of byChapter) {
          list.sort((a, b) => a.createdAt - b.createdAt);
          while (list.length > SNAPSHOT_CAP_PER_CHAPTER) {
            const rm = list.shift()!;
            await snapTable.delete(rm.id);
          }
        }
      });
    this.version(6).stores({
      works: "id, updatedAt",
      chapters: "id, workId, order, volumeId",
      volumes: "id, workId, order",
      meta: "key",
      chapterSnapshots: "id, chapterId, createdAt",
      referenceLibrary: "id, updatedAt",
      referenceChunks: "id, refWorkId, ordinal",
      referenceTokenPostings: "id, token, refWorkId, chunkId, [token+refWorkId]",
      referenceExcerpts: "id, refWorkId, chunkId, createdAt",
    });
    this.version(7)
      .stores({
        works: "id, updatedAt",
        chapters: "id, workId, order, volumeId",
        volumes: "id, workId, order",
        meta: "key",
        chapterSnapshots: "id, chapterId, createdAt",
        referenceLibrary: "id, updatedAt, category",
        referenceChunks: "id, refWorkId, ordinal",
        referenceTokenPostings: "id, token, refWorkId, chunkId, [token+refWorkId]",
        referenceExcerpts: "id, refWorkId, chunkId, createdAt",
      })
      .upgrade(async (trans) => {
        const t = trans.table("referenceLibrary");
        await t.toCollection().modify((r: Record<string, unknown>) => {
          if (r.category === undefined) r.category = "";
        });
      });
    this.version(8)
      .stores({
        works: "id, updatedAt",
        chapters: "id, workId, order, volumeId",
        volumes: "id, workId, order",
        meta: "key",
        chapterSnapshots: "id, chapterId, createdAt",
        referenceLibrary: "id, updatedAt, category",
        referenceChunks: "id, refWorkId, ordinal, [refWorkId+ordinal]",
        referenceTokenPostings: "id, token, refWorkId, chunkId, [token+refWorkId]",
        referenceExcerpts: "id, refWorkId, chunkId, createdAt, linkedChapterId, linkedWorkId",
        referenceTags: "id, name, createdAt",
        referenceExcerptTags: "id, excerptId, tagId, [excerptId+tagId]",
      })
      .upgrade(async (trans) => {
        const ex = trans.table("referenceExcerpts");
        await ex.toCollection().modify((row: Record<string, unknown>) => {
          if (row.linkedWorkId === undefined) row.linkedWorkId = null;
          if (row.linkedChapterId === undefined) row.linkedChapterId = null;
        });
      });
    this.version(9).stores({
      works: "id, updatedAt",
      chapters: "id, workId, order, volumeId",
      volumes: "id, workId, order",
      meta: "key",
      chapterSnapshots: "id, chapterId, createdAt",
      referenceLibrary: "id, updatedAt, category",
      referenceChunks: "id, refWorkId, ordinal, [refWorkId+ordinal]",
      referenceTokenPostings: "id, token, refWorkId, chunkId, [token+refWorkId]",
      referenceExcerpts: "id, refWorkId, chunkId, createdAt, linkedChapterId, linkedWorkId",
      referenceTags: "id, name, createdAt",
      referenceExcerptTags: "id, excerptId, tagId, [excerptId+tagId]",
      bibleCharacters: "id, workId, sortOrder, name, [workId+sortOrder]",
      bibleWorldEntries: "id, workId, entryKind, sortOrder, [workId+sortOrder]",
      bibleForeshadowing: "id, workId, status, chapterId, sortOrder, [workId+status]",
      bibleTimelineEvents: "id, workId, chapterId, sortOrder, [workId+sortOrder]",
      bibleChapterTemplates: "id, workId, name, [workId+name]",
      chapterBible: "id, chapterId, workId, [chapterId+workId]",
      bibleGlossaryTerms: "id, workId, term, category, [workId+term]",
    });
    this.version(10)
      .stores({
        works: "id, updatedAt",
        chapters: "id, workId, order, volumeId",
        volumes: "id, workId, order",
        meta: "key",
        chapterSnapshots: "id, chapterId, createdAt",
        referenceLibrary: "id, updatedAt, category",
        referenceChunks: "id, refWorkId, ordinal, [refWorkId+ordinal]",
        referenceTokenPostings: "id, token, refWorkId, chunkId, [token+refWorkId]",
        referenceExcerpts: "id, refWorkId, chunkId, createdAt, linkedChapterId, linkedWorkId",
        referenceTags: "id, name, createdAt",
        referenceExcerptTags: "id, excerptId, tagId, [excerptId+tagId]",
        referenceChapterHeads: "id, refWorkId, chunkId, ordinal, startOffset, [refWorkId+ordinal]",
        bibleCharacters: "id, workId, sortOrder, name, [workId+sortOrder]",
        bibleWorldEntries: "id, workId, entryKind, sortOrder, [workId+sortOrder]",
        bibleForeshadowing: "id, workId, status, chapterId, sortOrder, [workId+status]",
        bibleTimelineEvents: "id, workId, chapterId, sortOrder, [workId+sortOrder]",
        bibleChapterTemplates: "id, workId, name, [workId+name]",
        chapterBible: "id, chapterId, workId, [chapterId+workId]",
        bibleGlossaryTerms: "id, workId, term, category, [workId+term]",
      })
      .upgrade(async (trans) => {
        const chunkTable = trans.table("referenceChunks");
        const libTable = trans.table("referenceLibrary");
        await chunkTable.toCollection().modify((c: Record<string, unknown>) => {
          if (c.isChapterHead === undefined) c.isChapterHead = false;
        });
        await libTable.toCollection().modify((e: Record<string, unknown>) => {
          if (e.chapterHeadCount === undefined) e.chapterHeadCount = 0;
        });
      });
    this.version(11)
      .stores({
        works: "id, updatedAt",
        chapters: "id, workId, order, volumeId",
        volumes: "id, workId, order",
        meta: "key",
        chapterSnapshots: "id, chapterId, createdAt",
        referenceLibrary: "id, updatedAt, category",
        referenceChunks: "id, refWorkId, ordinal, [refWorkId+ordinal]",
        referenceTokenPostings: "id, token, refWorkId, chunkId, [token+refWorkId]",
        referenceExcerpts: "id, refWorkId, chunkId, createdAt, linkedChapterId, linkedWorkId",
        referenceTags: "id, name, createdAt",
        referenceExcerptTags: "id, excerptId, tagId, [excerptId+tagId]",
        referenceChapterHeads: "id, refWorkId, chunkId, ordinal, startOffset, [refWorkId+ordinal]",
        bibleCharacters: "id, workId, sortOrder, name, [workId+sortOrder]",
        bibleWorldEntries: "id, workId, entryKind, sortOrder, [workId+sortOrder]",
        bibleForeshadowing: "id, workId, status, chapterId, sortOrder, [workId+status]",
        bibleTimelineEvents: "id, workId, chapterId, sortOrder, [workId+sortOrder]",
        bibleChapterTemplates: "id, workId, name, [workId+name]",
        chapterBible: "id, chapterId, workId, [chapterId+workId]",
        bibleGlossaryTerms: "id, workId, term, category, [workId+term]",
      })
      .upgrade(async (trans) => {
        const ch = trans.table("chapters");
        await ch.toCollection().modify((row: Record<string, unknown>) => {
          if (row.summary === undefined) row.summary = "";
        });
      });

    this.version(12).stores({
      works: "id, updatedAt",
      chapters: "id, workId, order, volumeId",
      volumes: "id, workId, order",
      meta: "key",
      chapterSnapshots: "id, chapterId, createdAt",
      referenceLibrary: "id, updatedAt, category",
      referenceChunks: "id, refWorkId, ordinal, [refWorkId+ordinal]",
      referenceTokenPostings: "id, token, refWorkId, chunkId, [token+refWorkId]",
      referenceExcerpts: "id, refWorkId, chunkId, createdAt, linkedChapterId, linkedWorkId",
      referenceTags: "id, name, createdAt",
      referenceExcerptTags: "id, excerptId, tagId, [excerptId+tagId]",
      referenceChapterHeads: "id, refWorkId, chunkId, ordinal, startOffset, [refWorkId+ordinal]",
      bibleCharacters: "id, workId, sortOrder, name, [workId+sortOrder]",
      bibleWorldEntries: "id, workId, entryKind, sortOrder, [workId+sortOrder]",
      bibleForeshadowing: "id, workId, status, chapterId, sortOrder, [workId+status]",
      bibleTimelineEvents: "id, workId, chapterId, sortOrder, [workId+sortOrder]",
      bibleChapterTemplates: "id, workId, name, [workId+name]",
      chapterBible: "id, chapterId, workId, [chapterId+workId]",
      bibleGlossaryTerms: "id, workId, term, category, [workId+term]",
      workStyleCards: "id, workId, updatedAt",
    });
    this.version(13)
      .stores({
        works: "id, updatedAt",
        chapters: "id, workId, order, volumeId",
        volumes: "id, workId, order",
        meta: "key",
        chapterSnapshots: "id, chapterId, createdAt",
        referenceLibrary: "id, updatedAt, category",
        referenceChunks: "id, refWorkId, ordinal, [refWorkId+ordinal]",
        referenceTokenPostings: "id, token, refWorkId, chunkId, [token+refWorkId]",
        referenceExcerpts: "id, refWorkId, chunkId, createdAt, linkedChapterId, linkedWorkId",
        referenceTags: "id, name, createdAt",
        referenceExcerptTags: "id, excerptId, tagId, [excerptId+tagId]",
        referenceChapterHeads: "id, refWorkId, chunkId, ordinal, startOffset, [refWorkId+ordinal]",
        bibleCharacters: "id, workId, sortOrder, name, [workId+sortOrder]",
        bibleWorldEntries: "id, workId, entryKind, sortOrder, [workId+sortOrder]",
        bibleForeshadowing: "id, workId, status, chapterId, sortOrder, [workId+status]",
        bibleTimelineEvents: "id, workId, chapterId, sortOrder, [workId+sortOrder]",
        bibleChapterTemplates: "id, workId, name, [workId+name]",
        chapterBible: "id, chapterId, workId, [chapterId+workId]",
        bibleGlossaryTerms: "id, workId, term, category, [workId+term]",
        workStyleCards: "id, workId, updatedAt",
      })
      .upgrade(async (trans) => {
        const volTable = trans.table("volumes");
        await volTable.toCollection().modify((row: Record<string, unknown>) => {
          if (row.summary === undefined) row.summary = "";
        });
        const chTable = trans.table("chapters");
        await chTable.toCollection().modify((row: Record<string, unknown>) => {
          const s = row.summary as string | undefined;
          if (s != null && String(s).trim() && row.summaryUpdatedAt === undefined) {
            row.summaryUpdatedAt = row.updatedAt as number;
          }
        });
      });
    this.version(14).stores({
      works: "id, updatedAt",
      chapters: "id, workId, order, volumeId",
      volumes: "id, workId, order",
      meta: "key",
      chapterSnapshots: "id, chapterId, createdAt",
      referenceLibrary: "id, updatedAt, category",
      referenceChunks: "id, refWorkId, ordinal, [refWorkId+ordinal]",
      referenceTokenPostings: "id, token, refWorkId, chunkId, [token+refWorkId]",
      referenceExcerpts: "id, refWorkId, chunkId, createdAt, linkedChapterId, linkedWorkId",
      referenceTags: "id, name, createdAt",
      referenceExcerptTags: "id, excerptId, tagId, [excerptId+tagId]",
      referenceChapterHeads: "id, refWorkId, chunkId, ordinal, startOffset, [refWorkId+ordinal]",
      bibleCharacters: "id, workId, sortOrder, name, [workId+sortOrder]",
      bibleWorldEntries: "id, workId, entryKind, sortOrder, [workId+sortOrder]",
      bibleForeshadowing: "id, workId, status, chapterId, sortOrder, [workId+status]",
      bibleTimelineEvents: "id, workId, chapterId, sortOrder, [workId+sortOrder]",
      bibleChapterTemplates: "id, workId, name, [workId+name]",
      chapterBible: "id, chapterId, workId, [chapterId+workId]",
      bibleGlossaryTerms: "id, workId, term, category, [workId+term]",
      workStyleCards: "id, workId, updatedAt",
      inspirationFragments: "id, workId, createdAt, [workId+createdAt]",
    });
    this.version(15).stores({
      works: "id, updatedAt",
      chapters: "id, workId, order, volumeId",
      volumes: "id, workId, order",
      meta: "key",
      chapterSnapshots: "id, chapterId, createdAt",
      referenceLibrary: "id, updatedAt, category",
      referenceChunks: "id, refWorkId, ordinal, [refWorkId+ordinal]",
      referenceTokenPostings: "id, token, refWorkId, chunkId, [token+refWorkId]",
      referenceExcerpts: "id, refWorkId, chunkId, createdAt, linkedChapterId, linkedWorkId",
      referenceTags: "id, name, createdAt",
      referenceExcerptTags: "id, excerptId, tagId, [excerptId+tagId]",
      referenceChapterHeads: "id, refWorkId, chunkId, ordinal, startOffset, [refWorkId+ordinal]",
      bibleCharacters: "id, workId, sortOrder, name, [workId+sortOrder]",
      bibleWorldEntries: "id, workId, entryKind, sortOrder, [workId+sortOrder]",
      bibleForeshadowing: "id, workId, status, chapterId, sortOrder, [workId+status]",
      bibleTimelineEvents: "id, workId, chapterId, sortOrder, [workId+sortOrder]",
      bibleChapterTemplates: "id, workId, name, [workId+name]",
      writingPromptTemplates: "id, workId, category, sortOrder, [workId+sortOrder], [workId+category]",
      chapterBible: "id, chapterId, workId, [chapterId+workId]",
      bibleGlossaryTerms: "id, workId, term, category, [workId+term]",
      workStyleCards: "id, workId, updatedAt",
      inspirationFragments: "id, workId, createdAt, [workId+createdAt]",
    });
    this.version(16).stores({
      works: "id, updatedAt",
      chapters: "id, workId, order, volumeId",
      volumes: "id, workId, order",
      meta: "key",
      chapterSnapshots: "id, chapterId, createdAt",
      referenceLibrary: "id, updatedAt, category",
      referenceChunks: "id, refWorkId, ordinal, [refWorkId+ordinal]",
      referenceTokenPostings: "id, token, refWorkId, chunkId, [token+refWorkId]",
      referenceExcerpts: "id, refWorkId, chunkId, createdAt, linkedChapterId, linkedWorkId",
      referenceTags: "id, name, createdAt",
      referenceExcerptTags: "id, excerptId, tagId, [excerptId+tagId]",
      referenceChapterHeads: "id, refWorkId, chunkId, ordinal, startOffset, [refWorkId+ordinal]",
      bibleCharacters: "id, workId, sortOrder, name, [workId+sortOrder]",
      bibleWorldEntries: "id, workId, entryKind, sortOrder, [workId+sortOrder]",
      bibleForeshadowing: "id, workId, status, chapterId, sortOrder, [workId+status]",
      bibleTimelineEvents: "id, workId, chapterId, sortOrder, [workId+sortOrder]",
      bibleChapterTemplates: "id, workId, name, [workId+name]",
      writingPromptTemplates: "id, workId, category, sortOrder, [workId+sortOrder], [workId+category]",
      writingStyleSamples: "id, workId, sortOrder, [workId+sortOrder]",
      chapterBible: "id, chapterId, workId, [chapterId+workId]",
      bibleGlossaryTerms: "id, workId, term, category, [workId+term]",
      workStyleCards: "id, workId, updatedAt",
      inspirationFragments: "id, workId, createdAt, [workId+createdAt]",
    });
    this.version(17)
      .stores({
        works: "id, updatedAt",
        chapters: "id, workId, order, volumeId",
        volumes: "id, workId, order",
        meta: "key",
        chapterSnapshots: "id, chapterId, createdAt",
        referenceLibrary: "id, updatedAt, category",
        referenceChunks: "id, refWorkId, ordinal, [refWorkId+ordinal]",
        referenceTokenPostings: "id, token, refWorkId, chunkId, [token+refWorkId]",
        referenceExcerpts: "id, refWorkId, chunkId, createdAt, linkedChapterId, linkedWorkId",
        referenceTags: "id, name, createdAt",
        referenceExcerptTags: "id, excerptId, tagId, [excerptId+tagId]",
        referenceChapterHeads: "id, refWorkId, chunkId, ordinal, startOffset, [refWorkId+ordinal]",
        bibleCharacters: "id, workId, sortOrder, name, [workId+sortOrder]",
        bibleWorldEntries: "id, workId, entryKind, sortOrder, [workId+sortOrder]",
        bibleForeshadowing: "id, workId, status, chapterId, sortOrder, [workId+status]",
        bibleTimelineEvents: "id, workId, chapterId, sortOrder, [workId+sortOrder]",
        bibleChapterTemplates: "id, workId, name, [workId+name]",
        writingPromptTemplates: "id, workId, category, sortOrder, [workId+sortOrder], [workId+category]",
        writingStyleSamples: "id, workId, sortOrder, [workId+sortOrder]",
        chapterBible: "id, chapterId, workId, [chapterId+workId]",
        bibleGlossaryTerms: "id, workId, term, category, [workId+term]",
        workStyleCards: "id, workId, updatedAt",
        inspirationCollections: "id, sortOrder, createdAt",
        inspirationFragments:
          "id, workId, collectionId, createdAt, [workId+createdAt], [collectionId+createdAt]",
      })
      .upgrade(async (trans) => {
        const frag = trans.table("inspirationFragments");
        await frag.toCollection().modify((row: Record<string, unknown>) => {
          if (row.collectionId === undefined) row.collectionId = null;
        });
      });
    this.version(18)
      .stores({
        works: "id, updatedAt",
        chapters: "id, workId, order, volumeId",
        volumes: "id, workId, order",
        meta: "key",
        chapterSnapshots: "id, chapterId, createdAt",
        referenceLibrary: "id, updatedAt, category",
        referenceChunks: "id, refWorkId, ordinal, [refWorkId+ordinal]",
        referenceTokenPostings: "id, token, refWorkId, chunkId, [token+refWorkId]",
        referenceExcerpts: "id, refWorkId, chunkId, createdAt, linkedChapterId, linkedWorkId",
        referenceTags: "id, name, createdAt",
        referenceExcerptTags: "id, excerptId, tagId, [excerptId+tagId]",
        referenceChapterHeads: "id, refWorkId, chunkId, ordinal, startOffset, [refWorkId+ordinal]",
        bibleCharacters: "id, workId, sortOrder, name, [workId+sortOrder]",
        bibleWorldEntries: "id, workId, entryKind, sortOrder, [workId+sortOrder]",
        bibleForeshadowing: "id, workId, status, chapterId, sortOrder, [workId+status]",
        bibleTimelineEvents: "id, workId, chapterId, sortOrder, [workId+sortOrder]",
        bibleChapterTemplates: "id, workId, name, [workId+name]",
        writingPromptTemplates: "id, workId, category, sortOrder, [workId+sortOrder], [workId+category]",
        writingStyleSamples: "id, workId, sortOrder, [workId+sortOrder]",
        chapterBible: "id, chapterId, workId, [chapterId+workId]",
        bibleGlossaryTerms: "id, workId, term, category, [workId+term]",
        workStyleCards: "id, workId, updatedAt",
        inspirationCollections: "id, sortOrder, createdAt",
        inspirationFragments:
          "id, workId, collectionId, createdAt, [workId+createdAt], [collectionId+createdAt]",
      })
      .upgrade(async (trans) => {
        const chTable = trans.table("chapters");
        await chTable.toCollection().modify((row: Record<string, unknown>) => {
          // 步 22：对已有"有概要"的章节补齐覆盖范围元数据（默认单章）
          const s = row.summary as string | undefined;
          const has = s != null && String(s).trim().length > 0;
          if (!has) return;
          if (row.summaryScopeFromOrder === undefined) row.summaryScopeFromOrder = row.order as number;
          if (row.summaryScopeToOrder === undefined) row.summaryScopeToOrder = row.order as number;
        });
      });
    this.version(19).stores({
      works: "id, updatedAt",
      chapters: "id, workId, order, volumeId",
      volumes: "id, workId, order",
      meta: "key",
      chapterSnapshots: "id, chapterId, createdAt",
      referenceLibrary: "id, updatedAt, category",
      referenceChunks: "id, refWorkId, ordinal, [refWorkId+ordinal]",
      referenceTokenPostings: "id, token, refWorkId, chunkId, [token+refWorkId]",
      referenceExcerpts: "id, refWorkId, chunkId, createdAt, linkedChapterId, linkedWorkId",
      referenceTags: "id, name, createdAt",
      referenceExcerptTags: "id, excerptId, tagId, [excerptId+tagId]",
      referenceChapterHeads: "id, refWorkId, chunkId, ordinal, startOffset, [refWorkId+ordinal]",
      bibleCharacters: "id, workId, sortOrder, name, [workId+sortOrder]",
      bibleWorldEntries: "id, workId, entryKind, sortOrder, [workId+sortOrder]",
      bibleForeshadowing: "id, workId, status, chapterId, sortOrder, [workId+status]",
      bibleTimelineEvents: "id, workId, chapterId, sortOrder, [workId+sortOrder]",
      bibleChapterTemplates: "id, workId, name, [workId+name]",
      writingPromptTemplates: "id, workId, category, sortOrder, [workId+sortOrder], [workId+category]",
      writingStyleSamples: "id, workId, sortOrder, [workId+sortOrder]",
      chapterBible: "id, chapterId, workId, [chapterId+workId]",
      bibleGlossaryTerms: "id, workId, term, category, [workId+term]",
      workStyleCards: "id, workId, updatedAt",
      inspirationCollections: "id, sortOrder, createdAt",
      inspirationFragments:
        "id, workId, collectionId, createdAt, [workId+createdAt], [collectionId+createdAt]",
      logicPlaceNodes: "id, workId, updatedAt, [workId+updatedAt]",
      logicPlaceEvents: "id, workId, placeId, updatedAt, [workId+updatedAt], [placeId+updatedAt]",
    });

    this.version(20).stores({
      works: "id, updatedAt",
      chapters: "id, workId, order, volumeId",
      volumes: "id, workId, order",
      meta: "key",
      chapterSnapshots: "id, chapterId, createdAt",
      referenceLibrary: "id, updatedAt, category",
      referenceChunks: "id, refWorkId, ordinal, [refWorkId+ordinal]",
      referenceTokenPostings: "id, token, refWorkId, chunkId, [token+refWorkId]",
      referenceExcerpts: "id, refWorkId, chunkId, createdAt, linkedChapterId, linkedWorkId",
      referenceTags: "id, name, createdAt",
      referenceExcerptTags: "id, excerptId, tagId, [excerptId+tagId]",
      referenceChapterHeads: "id, refWorkId, chunkId, ordinal, startOffset, [refWorkId+ordinal]",
      bibleCharacters: "id, workId, sortOrder, name, [workId+sortOrder]",
      bibleWorldEntries: "id, workId, entryKind, sortOrder, [workId+sortOrder]",
      bibleForeshadowing: "id, workId, status, chapterId, sortOrder, [workId+status]",
      bibleTimelineEvents: "id, workId, chapterId, sortOrder, [workId+sortOrder]",
      bibleChapterTemplates: "id, workId, name, [workId+name]",
      writingPromptTemplates: "id, workId, category, sortOrder, [workId+sortOrder], [workId+category]",
      writingStyleSamples: "id, workId, sortOrder, [workId+sortOrder]",
      chapterBible: "id, chapterId, workId, [chapterId+workId]",
      bibleGlossaryTerms: "id, workId, term, category, [workId+term]",
      workStyleCards: "id, workId, updatedAt",
      inspirationCollections: "id, sortOrder, createdAt",
      inspirationFragments:
        "id, workId, collectionId, createdAt, [workId+createdAt], [collectionId+createdAt]",
      logicPlaceNodes: "id, workId, updatedAt, [workId+updatedAt]",
      logicPlaceEvents: "id, workId, placeId, updatedAt, [workId+updatedAt], [placeId+updatedAt]",
      tuiyanStates: "id, workId, updatedAt, [workId+updatedAt]",
    });

    // v21: 推演状态补齐 statusByNodeId（schema 不变，仅 bump 以便与 SCHEMA_VERSION 对齐）
    this.version(21).stores({
      works: "id, updatedAt",
      chapters: "id, workId, order, volumeId",
      volumes: "id, workId, order",
      meta: "key",
      chapterSnapshots: "id, chapterId, createdAt",
      referenceLibrary: "id, updatedAt, category",
      referenceChunks: "id, refWorkId, ordinal, [refWorkId+ordinal]",
      referenceTokenPostings: "id, token, refWorkId, chunkId, [token+refWorkId]",
      referenceExcerpts: "id, refWorkId, chunkId, createdAt, linkedChapterId, linkedWorkId",
      referenceTags: "id, name, createdAt",
      referenceExcerptTags: "id, excerptId, tagId, [excerptId+tagId]",
      referenceChapterHeads: "id, refWorkId, chunkId, ordinal, startOffset, [refWorkId+ordinal]",
      bibleCharacters: "id, workId, sortOrder, name, [workId+sortOrder]",
      bibleWorldEntries: "id, workId, entryKind, sortOrder, [workId+sortOrder]",
      bibleForeshadowing: "id, workId, status, chapterId, sortOrder, [workId+status]",
      bibleTimelineEvents: "id, workId, chapterId, sortOrder, [workId+sortOrder]",
      bibleChapterTemplates: "id, workId, name, [workId+name]",
      writingPromptTemplates: "id, workId, category, sortOrder, [workId+sortOrder], [workId+category]",
      writingStyleSamples: "id, workId, sortOrder, [workId+sortOrder]",
      chapterBible: "id, chapterId, workId, [chapterId+workId]",
      bibleGlossaryTerms: "id, workId, term, category, [workId+term]",
      workStyleCards: "id, workId, updatedAt",
      inspirationCollections: "id, sortOrder, createdAt",
      inspirationFragments:
        "id, workId, collectionId, createdAt, [workId+createdAt], [collectionId+createdAt]",
      logicPlaceNodes: "id, workId, updatedAt, [workId+updatedAt]",
      logicPlaceEvents: "id, workId, placeId, updatedAt, [workId+updatedAt], [placeId+updatedAt]",
      tuiyanStates: "id, workId, updatedAt, [workId+updatedAt]",
    });

    // v22: 推演状态补齐 linkedRefWorkIds（schema 不变）
    this.version(22).stores({
      works: "id, updatedAt",
      chapters: "id, workId, order, volumeId",
      volumes: "id, workId, order",
      meta: "key",
      chapterSnapshots: "id, chapterId, createdAt",
      referenceLibrary: "id, updatedAt, category",
      referenceChunks: "id, refWorkId, ordinal, [refWorkId+ordinal]",
      referenceTokenPostings: "id, token, refWorkId, chunkId, [token+refWorkId]",
      referenceExcerpts: "id, refWorkId, chunkId, createdAt, linkedChapterId, linkedWorkId",
      referenceTags: "id, name, createdAt",
      referenceExcerptTags: "id, excerptId, tagId, [excerptId+tagId]",
      referenceChapterHeads: "id, refWorkId, chunkId, ordinal, startOffset, [refWorkId+ordinal]",
      bibleCharacters: "id, workId, sortOrder, name, [workId+sortOrder]",
      bibleWorldEntries: "id, workId, entryKind, sortOrder, [workId+sortOrder]",
      bibleForeshadowing: "id, workId, status, chapterId, sortOrder, [workId+status]",
      bibleTimelineEvents: "id, workId, chapterId, sortOrder, [workId+sortOrder]",
      bibleChapterTemplates: "id, workId, name, [workId+name]",
      writingPromptTemplates: "id, workId, category, sortOrder, [workId+sortOrder], [workId+category]",
      writingStyleSamples: "id, workId, sortOrder, [workId+sortOrder]",
      chapterBible: "id, chapterId, workId, [chapterId+workId]",
      bibleGlossaryTerms: "id, workId, term, category, [workId+term]",
      workStyleCards: "id, workId, updatedAt",
      inspirationCollections: "id, sortOrder, createdAt",
      inspirationFragments:
        "id, workId, collectionId, createdAt, [workId+createdAt], [collectionId+createdAt]",
      logicPlaceNodes: "id, workId, updatedAt, [workId+updatedAt]",
      logicPlaceEvents: "id, workId, placeId, updatedAt, [workId+updatedAt], [placeId+updatedAt]",
      tuiyanStates: "id, workId, updatedAt, [workId+updatedAt]",
    });

    // v23: 推演状态补齐 mindmap（schema 不变）
    this.version(23).stores({
      works: "id, updatedAt",
      chapters: "id, workId, order, volumeId",
      volumes: "id, workId, order",
      meta: "key",
      chapterSnapshots: "id, chapterId, createdAt",
      referenceLibrary: "id, updatedAt, category",
      referenceChunks: "id, refWorkId, ordinal, [refWorkId+ordinal]",
      referenceTokenPostings: "id, token, refWorkId, chunkId, [token+refWorkId]",
      referenceExcerpts: "id, refWorkId, chunkId, createdAt, linkedChapterId, linkedWorkId",
      referenceTags: "id, name, createdAt",
      referenceExcerptTags: "id, excerptId, tagId, [excerptId+tagId]",
      referenceChapterHeads: "id, refWorkId, chunkId, ordinal, startOffset, [refWorkId+ordinal]",
      bibleCharacters: "id, workId, sortOrder, name, [workId+sortOrder]",
      bibleWorldEntries: "id, workId, entryKind, sortOrder, [workId+sortOrder]",
      bibleForeshadowing: "id, workId, status, chapterId, sortOrder, [workId+status]",
      bibleTimelineEvents: "id, workId, chapterId, sortOrder, [workId+sortOrder]",
      bibleChapterTemplates: "id, workId, name, [workId+name]",
      writingPromptTemplates: "id, workId, category, sortOrder, [workId+sortOrder], [workId+category]",
      writingStyleSamples: "id, workId, sortOrder, [workId+sortOrder]",
      chapterBible: "id, chapterId, workId, [chapterId+workId]",
      bibleGlossaryTerms: "id, workId, term, category, [workId+term]",
      workStyleCards: "id, workId, updatedAt",
      inspirationCollections: "id, sortOrder, createdAt",
      inspirationFragments:
        "id, workId, collectionId, createdAt, [workId+createdAt], [collectionId+createdAt]",
      logicPlaceNodes: "id, workId, updatedAt, [workId+updatedAt]",
      logicPlaceEvents: "id, workId, placeId, updatedAt, [workId+updatedAt], [placeId+updatedAt]",
      tuiyanStates: "id, workId, updatedAt, [workId+updatedAt]",
    });

    // v24: 推演状态补齐 scenes（schema 不变）
    this.version(24).stores({
      works: "id, updatedAt",
      chapters: "id, workId, order, volumeId",
      volumes: "id, workId, order",
      meta: "key",
      chapterSnapshots: "id, chapterId, createdAt",
      referenceLibrary: "id, updatedAt, category",
      referenceChunks: "id, refWorkId, ordinal, [refWorkId+ordinal]",
      referenceTokenPostings: "id, token, refWorkId, chunkId, [token+refWorkId]",
      referenceExcerpts: "id, refWorkId, chunkId, createdAt, linkedChapterId, linkedWorkId",
      referenceTags: "id, name, createdAt",
      referenceExcerptTags: "id, excerptId, tagId, [excerptId+tagId]",
      referenceChapterHeads: "id, refWorkId, chunkId, ordinal, startOffset, [refWorkId+ordinal]",
      bibleCharacters: "id, workId, sortOrder, name, [workId+sortOrder]",
      bibleWorldEntries: "id, workId, entryKind, sortOrder, [workId+sortOrder]",
      bibleForeshadowing: "id, workId, status, chapterId, sortOrder, [workId+status]",
      bibleTimelineEvents: "id, workId, chapterId, sortOrder, [workId+sortOrder]",
      bibleChapterTemplates: "id, workId, name, [workId+name]",
      writingPromptTemplates: "id, workId, category, sortOrder, [workId+sortOrder], [workId+category]",
      writingStyleSamples: "id, workId, sortOrder, [workId+sortOrder]",
      chapterBible: "id, chapterId, workId, [chapterId+workId]",
      bibleGlossaryTerms: "id, workId, term, category, [workId+term]",
      workStyleCards: "id, workId, updatedAt",
      inspirationCollections: "id, sortOrder, createdAt",
      inspirationFragments:
        "id, workId, collectionId, createdAt, [workId+createdAt], [collectionId+createdAt]",
      logicPlaceNodes: "id, workId, updatedAt, [workId+updatedAt]",
      logicPlaceEvents: "id, workId, placeId, updatedAt, [workId+updatedAt], [placeId+updatedAt]",
      tuiyanStates: "id, workId, updatedAt, [workId+updatedAt]",
    });

    // v25: 流光碎片补齐字段（schema 升级；索引保持不变）
    this.version(25).stores({
      works: "id, updatedAt",
      chapters: "id, workId, order, volumeId",
      volumes: "id, workId, order",
      meta: "key",
      chapterSnapshots: "id, chapterId, createdAt",
      referenceLibrary: "id, updatedAt, category",
      referenceChunks: "id, refWorkId, ordinal, [refWorkId+ordinal]",
      referenceTokenPostings: "id, token, refWorkId, chunkId, [token+refWorkId]",
      referenceExcerpts: "id, refWorkId, chunkId, createdAt, linkedChapterId, linkedWorkId",
      referenceTags: "id, name, createdAt",
      referenceExcerptTags: "id, excerptId, tagId, [excerptId+tagId]",
      referenceChapterHeads: "id, refWorkId, chunkId, ordinal, startOffset, [refWorkId+ordinal]",
      bibleCharacters: "id, workId, sortOrder, name, [workId+sortOrder]",
      bibleWorldEntries: "id, workId, entryKind, sortOrder, [workId+sortOrder]",
      bibleForeshadowing: "id, workId, status, chapterId, sortOrder, [workId+status]",
      bibleTimelineEvents: "id, workId, chapterId, sortOrder, [workId+sortOrder]",
      bibleChapterTemplates: "id, workId, name, [workId+name]",
      writingPromptTemplates: "id, workId, category, sortOrder, [workId+sortOrder], [workId+category]",
      writingStyleSamples: "id, workId, sortOrder, [workId+sortOrder]",
      chapterBible: "id, chapterId, workId, [chapterId+workId]",
      bibleGlossaryTerms: "id, workId, term, category, [workId+term]",
      workStyleCards: "id, workId, updatedAt",
      inspirationCollections: "id, sortOrder, createdAt",
      inspirationFragments:
        "id, workId, collectionId, createdAt, [workId+createdAt], [collectionId+createdAt]",
      logicPlaceNodes: "id, workId, updatedAt, [workId+updatedAt]",
      logicPlaceEvents: "id, workId, placeId, updatedAt, [workId+updatedAt], [placeId+updatedAt]",
      tuiyanStates: "id, workId, updatedAt, [workId+updatedAt]",
    });

    // v26: 流光 URL 预览字段（schema 升级；索引保持不变）
    this.version(26).stores({
      works: "id, updatedAt",
      chapters: "id, workId, order, volumeId",
      volumes: "id, workId, order",
      meta: "key",
      chapterSnapshots: "id, chapterId, createdAt",
      referenceLibrary: "id, updatedAt, category",
      referenceChunks: "id, refWorkId, ordinal, [refWorkId+ordinal]",
      referenceTokenPostings: "id, token, refWorkId, chunkId, [token+refWorkId]",
      referenceExcerpts: "id, refWorkId, chunkId, createdAt, linkedChapterId, linkedWorkId",
      referenceTags: "id, name, createdAt",
      referenceExcerptTags: "id, excerptId, tagId, [excerptId+tagId]",
      referenceChapterHeads: "id, refWorkId, chunkId, ordinal, startOffset, [refWorkId+ordinal]",
      bibleCharacters: "id, workId, sortOrder, name, [workId+sortOrder]",
      bibleWorldEntries: "id, workId, entryKind, sortOrder, [workId+sortOrder]",
      bibleForeshadowing: "id, workId, status, chapterId, sortOrder, [workId+status]",
      bibleTimelineEvents: "id, workId, chapterId, sortOrder, [workId+sortOrder]",
      bibleChapterTemplates: "id, workId, name, [workId+name]",
      writingPromptTemplates: "id, workId, category, sortOrder, [workId+sortOrder], [workId+category]",
      writingStyleSamples: "id, workId, sortOrder, [workId+sortOrder]",
      chapterBible: "id, chapterId, workId, [chapterId+workId]",
      bibleGlossaryTerms: "id, workId, term, category, [workId+term]",
      workStyleCards: "id, workId, updatedAt",
      inspirationCollections: "id, sortOrder, createdAt",
      inspirationFragments:
        "id, workId, collectionId, createdAt, [workId+createdAt], [collectionId+createdAt]",
      logicPlaceNodes: "id, workId, updatedAt, [workId+updatedAt]",
      logicPlaceEvents: "id, workId, placeId, updatedAt, [workId+updatedAt], [placeId+updatedAt]",
      tuiyanStates: "id, workId, updatedAt, [workId+updatedAt]",
    });

    // v27: 流光碎片增加 links（schema 升级；索引保持不变）
    this.version(27).stores({
      works: "id, updatedAt",
      chapters: "id, workId, order, volumeId",
      volumes: "id, workId, order",
      meta: "key",
      chapterSnapshots: "id, chapterId, createdAt",
      referenceLibrary: "id, updatedAt, category",
      referenceChunks: "id, refWorkId, ordinal, [refWorkId+ordinal]",
      referenceTokenPostings: "id, token, refWorkId, chunkId, [token+refWorkId]",
      referenceExcerpts: "id, refWorkId, chunkId, createdAt, linkedChapterId, linkedWorkId",
      referenceTags: "id, name, createdAt",
      referenceExcerptTags: "id, excerptId, tagId, [excerptId+tagId]",
      referenceChapterHeads: "id, refWorkId, chunkId, ordinal, startOffset, [refWorkId+ordinal]",
      bibleCharacters: "id, workId, sortOrder, name, [workId+sortOrder]",
      bibleWorldEntries: "id, workId, entryKind, sortOrder, [workId+sortOrder]",
      bibleForeshadowing: "id, workId, status, chapterId, sortOrder, [workId+status]",
      bibleTimelineEvents: "id, workId, chapterId, sortOrder, [workId+sortOrder]",
      bibleChapterTemplates: "id, workId, name, [workId+name]",
      writingPromptTemplates: "id, workId, category, sortOrder, [workId+sortOrder], [workId+category]",
      writingStyleSamples: "id, workId, sortOrder, [workId+sortOrder]",
      chapterBible: "id, chapterId, workId, [chapterId+workId]",
      bibleGlossaryTerms: "id, workId, term, category, [workId+term]",
      workStyleCards: "id, workId, updatedAt",
      inspirationCollections: "id, sortOrder, createdAt",
      inspirationFragments:
        "id, workId, collectionId, createdAt, [workId+createdAt], [collectionId+createdAt]",
      logicPlaceNodes: "id, workId, updatedAt, [workId+updatedAt]",
      logicPlaceEvents: "id, workId, placeId, updatedAt, [workId+updatedAt], [placeId+updatedAt]",
      tuiyanStates: "id, workId, updatedAt, [workId+updatedAt]",
    });

    // v28: 提炼要点表（P1-03）
    this.version(28).stores({
      works: "id, updatedAt",
      chapters: "id, workId, order, volumeId",
      volumes: "id, workId, order",
      meta: "key",
      chapterSnapshots: "id, chapterId, createdAt",
      referenceLibrary: "id, updatedAt, category",
      referenceChunks: "id, refWorkId, ordinal, [refWorkId+ordinal]",
      referenceTokenPostings: "id, token, refWorkId, chunkId, [token+refWorkId]",
      referenceExcerpts: "id, refWorkId, chunkId, createdAt, linkedChapterId, linkedWorkId",
      referenceTags: "id, name, createdAt",
      referenceExcerptTags: "id, excerptId, tagId, [excerptId+tagId]",
      referenceChapterHeads: "id, refWorkId, chunkId, ordinal, startOffset, [refWorkId+ordinal]",
      bibleCharacters: "id, workId, sortOrder, name, [workId+sortOrder]",
      bibleWorldEntries: "id, workId, entryKind, sortOrder, [workId+sortOrder]",
      bibleForeshadowing: "id, workId, status, chapterId, sortOrder, [workId+status]",
      bibleTimelineEvents: "id, workId, chapterId, sortOrder, [workId+sortOrder]",
      bibleChapterTemplates: "id, workId, name, [workId+name]",
      writingPromptTemplates: "id, workId, category, sortOrder, [workId+sortOrder], [workId+category]",
      writingStyleSamples: "id, workId, sortOrder, [workId+sortOrder]",
      chapterBible: "id, chapterId, workId, [chapterId+workId]",
      bibleGlossaryTerms: "id, workId, term, category, [workId+term]",
      workStyleCards: "id, workId, updatedAt",
      inspirationCollections: "id, sortOrder, createdAt",
      inspirationFragments:
        "id, workId, collectionId, createdAt, [workId+createdAt], [collectionId+createdAt]",
      logicPlaceNodes: "id, workId, updatedAt, [workId+updatedAt]",
      logicPlaceEvents: "id, workId, placeId, updatedAt, [workId+updatedAt], [placeId+updatedAt]",
      tuiyanStates: "id, workId, updatedAt, [workId+updatedAt]",
      referenceExtracts: "id, refWorkId, type, createdAt, [refWorkId+type]",
    });
    this.version(29).stores({
      works: "id, updatedAt",
      chapters: "id, workId, order, volumeId",
      volumes: "id, workId, order",
      meta: "key",
      chapterSnapshots: "id, chapterId, createdAt",
      referenceLibrary: "id, updatedAt, category",
      referenceChunks: "id, refWorkId, ordinal, [refWorkId+ordinal]",
      referenceTokenPostings: "id, token, refWorkId, chunkId, [token+refWorkId]",
      referenceExcerpts: "id, refWorkId, chunkId, createdAt, linkedChapterId, linkedWorkId",
      referenceTags: "id, name, createdAt",
      referenceExcerptTags: "id, excerptId, tagId, [excerptId+tagId]",
      referenceChapterHeads: "id, refWorkId, chunkId, ordinal, startOffset, [refWorkId+ordinal]",
      bibleCharacters: "id, workId, sortOrder, name, [workId+sortOrder]",
      bibleWorldEntries: "id, workId, entryKind, sortOrder, [workId+sortOrder]",
      bibleForeshadowing: "id, workId, status, chapterId, sortOrder, [workId+status]",
      bibleTimelineEvents: "id, workId, chapterId, sortOrder, [workId+sortOrder]",
      bibleChapterTemplates: "id, workId, name, [workId+name]",
      writingPromptTemplates: "id, workId, category, sortOrder, [workId+sortOrder], [workId+category]",
      writingStyleSamples: "id, workId, sortOrder, [workId+sortOrder]",
      chapterBible: "id, chapterId, workId, [chapterId+workId]",
      bibleGlossaryTerms: "id, workId, term, category, [workId+term]",
      workStyleCards: "id, workId, updatedAt",
      inspirationCollections: "id, sortOrder, createdAt",
      inspirationFragments:
        "id, workId, collectionId, createdAt, [workId+createdAt], [collectionId+createdAt]",
      logicPlaceNodes: "id, workId, updatedAt, [workId+updatedAt]",
      logicPlaceEvents: "id, workId, placeId, updatedAt, [workId+updatedAt], [placeId+updatedAt]",
      tuiyanStates: "id, workId, updatedAt, [workId+updatedAt]",
      referenceExtracts: "id, refWorkId, type, createdAt, [refWorkId+type]",
      // Sprint 1 新增：全局提示词库
      globalPromptTemplates: "id, type, status, createdAt, updatedAt, [type+status]",
    });
    // v30：globalPromptTemplates 需为 sortOrder 建索引（orderBy("sortOrder")）
    this.version(30).stores({
      works: "id, updatedAt",
      chapters: "id, workId, order, volumeId",
      volumes: "id, workId, order",
      meta: "key",
      chapterSnapshots: "id, chapterId, createdAt",
      referenceLibrary: "id, updatedAt, category",
      referenceChunks: "id, refWorkId, ordinal, [refWorkId+ordinal]",
      referenceTokenPostings: "id, token, refWorkId, chunkId, [token+refWorkId]",
      referenceExcerpts: "id, refWorkId, chunkId, createdAt, linkedChapterId, linkedWorkId",
      referenceTags: "id, name, createdAt",
      referenceExcerptTags: "id, excerptId, tagId, [excerptId+tagId]",
      referenceChapterHeads: "id, refWorkId, chunkId, ordinal, startOffset, [refWorkId+ordinal]",
      bibleCharacters: "id, workId, sortOrder, name, [workId+sortOrder]",
      bibleWorldEntries: "id, workId, entryKind, sortOrder, [workId+sortOrder]",
      bibleForeshadowing: "id, workId, status, chapterId, sortOrder, [workId+status]",
      bibleTimelineEvents: "id, workId, chapterId, sortOrder, [workId+sortOrder]",
      bibleChapterTemplates: "id, workId, name, [workId+name]",
      writingPromptTemplates: "id, workId, category, sortOrder, [workId+sortOrder], [workId+category]",
      writingStyleSamples: "id, workId, sortOrder, [workId+sortOrder]",
      chapterBible: "id, chapterId, workId, [chapterId+workId]",
      bibleGlossaryTerms: "id, workId, term, category, [workId+term]",
      workStyleCards: "id, workId, updatedAt",
      inspirationCollections: "id, sortOrder, createdAt",
      inspirationFragments:
        "id, workId, collectionId, createdAt, [workId+createdAt], [collectionId+createdAt]",
      logicPlaceNodes: "id, workId, updatedAt, [workId+updatedAt]",
      logicPlaceEvents: "id, workId, placeId, updatedAt, [workId+updatedAt], [placeId+updatedAt]",
      tuiyanStates: "id, workId, updatedAt, [workId+updatedAt]",
      referenceExtracts: "id, refWorkId, type, createdAt, [refWorkId+type]",
      globalPromptTemplates: "id, type, status, sortOrder, createdAt, updatedAt, [type+status]",
    });
    // v31：作品书号 bookNo（用户侧唯一、短链接用）
    this.version(31).stores({
      works: "id, updatedAt, bookNo",
      chapters: "id, workId, order, volumeId",
      volumes: "id, workId, order",
      meta: "key",
      chapterSnapshots: "id, chapterId, createdAt",
      referenceLibrary: "id, updatedAt, category",
      referenceChunks: "id, refWorkId, ordinal, [refWorkId+ordinal]",
      referenceTokenPostings: "id, token, refWorkId, chunkId, [token+refWorkId]",
      referenceExcerpts: "id, refWorkId, chunkId, createdAt, linkedChapterId, linkedWorkId",
      referenceTags: "id, name, createdAt",
      referenceExcerptTags: "id, excerptId, tagId, [excerptId+tagId]",
      referenceChapterHeads: "id, refWorkId, chunkId, ordinal, startOffset, [refWorkId+ordinal]",
      bibleCharacters: "id, workId, sortOrder, name, [workId+sortOrder]",
      bibleWorldEntries: "id, workId, entryKind, sortOrder, [workId+sortOrder]",
      bibleForeshadowing: "id, workId, status, chapterId, sortOrder, [workId+status]",
      bibleTimelineEvents: "id, workId, chapterId, sortOrder, [workId+sortOrder]",
      bibleChapterTemplates: "id, workId, name, [workId+name]",
      writingPromptTemplates: "id, workId, category, sortOrder, [workId+sortOrder], [workId+category]",
      writingStyleSamples: "id, workId, sortOrder, [workId+sortOrder]",
      chapterBible: "id, chapterId, workId, [chapterId+workId]",
      bibleGlossaryTerms: "id, workId, term, category, [workId+term]",
      workStyleCards: "id, workId, updatedAt",
      inspirationCollections: "id, sortOrder, createdAt",
      inspirationFragments:
        "id, workId, collectionId, createdAt, [workId+createdAt], [collectionId+createdAt]",
      logicPlaceNodes: "id, workId, updatedAt, [workId+updatedAt]",
      logicPlaceEvents: "id, workId, placeId, updatedAt, [workId+updatedAt], [placeId+updatedAt]",
      tuiyanStates: "id, workId, updatedAt, [workId+updatedAt]",
      referenceExtracts: "id, refWorkId, type, createdAt, [refWorkId+type]",
      globalPromptTemplates: "id, type, status, sortOrder, createdAt, updatedAt, [type+status]",
    });
    // v32：章节轻量笔记字段（chapterNote）从 localStorage 迁至 Chapter 行内；无新索引
    this.version(32).stores({}).upgrade(async (trans) => {
      const prefix = "liubai:chapterNote:";
      const chapters = trans.table("chapters");
      const ids = await chapters.toCollection().primaryKeys();
      for (const id of ids) {
        try {
          const v = localStorage.getItem(prefix + String(id));
          if (v?.trim()) {
            await chapters.update(id, { chapterNote: v });
            localStorage.removeItem(prefix + String(id));
          }
        } catch {
          // localStorage unavailable — skip, notes stay orphaned
        }
      }
    });
    // v33：推演规划字段（TuiyanState 可选字段；无新索引；v34 起 UI 语义扩展为五层）
    this.version(33).stores({});
  }
}

let dbInstance: LiubaiDB | null = null;

export function getDB(): LiubaiDB {
  if (!dbInstance) {
    dbInstance = new LiubaiDB();
  }
  return dbInstance;
}

/** Vitest：关闭单例并删除 IndexedDB，避免用例间污染（需配合 fake-indexeddb） */
export async function resetLiubaiDBForTests(): Promise<void> {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      /* ignore */
    }
    dbInstance = null;
  }
  await Dexie.delete(DB_NAME);
}

export async function initDB(): Promise<void> {
  const db = getDB();
  await db.open();
  await db.meta.put({ key: "schemaVersion", value: SCHEMA_VERSION });
}
