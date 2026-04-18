import { getDB, initDB } from "../db/database";
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
  ReferenceChunk,
  ReferenceChapterHead,
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
  TuiyanState,
} from "../db/types";
import { SNAPSHOT_CAP_PER_CHAPTER, SNAPSHOT_MAX_AGE_MS } from "../db/types";
import { annotateReferenceParts } from "./chapter-detector";
import { splitTextIntoReferenceChunks } from "./reference-chunks";
import {
  buildPostingRowsForChunk,
  MAX_CHUNKS_PER_TOKEN_QUERY,
  MAX_HYBRID_CHUNKS_TO_SCORE,
  refineHybridHit,
  refineLiteralHits,
  tokenizeQuery,
  type ReferenceSearchHitDraft,
} from "./reference-search-index";
import { normalizeWorkTagList } from "../util/work-tags";
import { wordCount } from "../util/wordCount";
import { ChapterSaveConflictError } from "./chapter-save-conflict";
import type { UpdateChapterOptions, WritingStore } from "./writing-store";
import { normalizeImportRows } from "./import-normalize";
import { remapImportMergePayload, type MergeRemapResult } from "./backup-merge-remap";

/** 3.7：无 token 时的字面检索回退路径最多扫描的分块数，避免巨库一次读入过多正文 */
const LITERAL_FALLBACK_MAX_CHUNKS = 500;

function now() {
  return Date.now();
}

async function excerptTagIdsMap(db: ReturnType<typeof getDB>, excerptIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  for (const id of excerptIds) map.set(id, []);
  if (excerptIds.length === 0) return map;
  const rows = await db.referenceExcerptTags.where("excerptId").anyOf(excerptIds).toArray();
  for (const r of rows) {
    const list = map.get(r.excerptId) ?? [];
    list.push(r.tagId);
    map.set(r.excerptId, list);
  }
  return map;
}

/**
 * Web 端实现：数据在 **浏览器 IndexedDB**（非本地磁盘文件路径）。
 * 与「桌面 SQLite 文件」对位时，仅替换本类为 SQLite 实现即可。
 */
export class WritingStoreIndexedDB implements WritingStore {
  async init(): Promise<void> {
    await initDB();
    await this.ensureReferenceChapterMetadataV10();
    await this.ensureReferenceSearchIndex();
  }

  /**
   * v10：为已存在的参考库补全章节检测、referenceChapterHeads 与书目 chapterHeadCount（一次性）。
   */
  private async ensureReferenceChapterMetadataV10(): Promise<void> {
    const db = getDB();
    const row = await db.meta.get("referenceChapterV10Backfill");
    if (row?.value === true) return;
    const refs = await db.referenceLibrary.toArray();
    for (const r of refs) {
      await this.syncChapterMetadataForRefWork(r.id);
    }
    await db.meta.put({ key: "referenceChapterV10Backfill", value: true });
  }

  /** 按全书正文重算某参考书的章节元数据、章节表并重建该书的倒排索引 */
  async syncChapterMetadataForRefWork(refWorkId: string): Promise<void> {
    const db = getDB();
    const chunks = await db.referenceChunks.where("refWorkId").equals(refWorkId).sortBy("ordinal");
    if (chunks.length === 0) {
      await db.referenceLibrary.update(refWorkId, { chapterHeadCount: 0, updatedAt: now() });
      return;
    }
    const fullText = chunks.map((c) => c.content).join("");
    const parts = chunks.map((c) => c.content);
    const { perChunk, chapterHeadCount, headsForDb } = annotateReferenceParts(fullText, parts);
    const t = now();
    const headRows: ReferenceChapterHead[] = headsForDb.map((h) => ({
      id: crypto.randomUUID(),
      refWorkId,
      chunkId: chunks[h.ordinal]!.id,
      ordinal: h.ordinal,
      startOffset: h.startOffset,
      title: h.title,
    }));
    await db.transaction("rw", [db.referenceChunks, db.referenceLibrary, db.referenceChapterHeads], async () => {
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i]!;
        const ann = perChunk[i]!;
        await db.referenceChunks.update(c.id, {
          isChapterHead: ann.isChapterHead,
          chapterTitle: ann.chapterTitle,
        });
      }
      await db.referenceChapterHeads.where("refWorkId").equals(refWorkId).delete();
      if (headRows.length) await db.referenceChapterHeads.bulkAdd(headRows);
      await db.referenceLibrary.update(refWorkId, { chapterHeadCount, updatedAt: t });
    });
    await this.rebuildReferenceSearchIndexForRefWork(refWorkId);
  }

  /** v5→v6：有正文块但无倒排行时全量建索引 */
  private async ensureReferenceSearchIndex(): Promise<void> {
    const db = getDB();
    const cCount = await db.referenceChunks.count();
    const pCount = await db.referenceTokenPostings.count();
    if (cCount > 0 && pCount === 0) {
      await this.rebuildAllReferenceSearchIndex();
    }
  }

  private async bulkAddReferencePostings(
    rows: ReferenceChunk[],
    onProgress?: (done: number, total: number) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const db = getDB();
    const fullText = rows.map((r) => r.content).join("");
    const parts = rows.map((r) => r.content);
    const { perChunk } = annotateReferenceParts(fullText, parts);
    const ACC = 4000;
    let batch: ReferenceTokenPosting[] = [];
    const total = rows.length;
    let done = 0;
    for (let i = 0; i < rows.length; i++) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const row = rows[i]!;
      const offsets = perChunk[i]?.chapterOffsetsInChunk ?? [];
      batch.push(
        ...buildPostingRowsForChunk(
          row.id,
          row.refWorkId,
          row.ordinal,
          row.content,
          offsets.length ? offsets : undefined,
        ),
      );
      if (batch.length >= ACC) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        await db.referenceTokenPostings.bulkAdd(batch);
        batch = [];
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
      }
      done++;
      onProgress?.(done, total);
    }
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (batch.length) await db.referenceTokenPostings.bulkAdd(batch);
  }

  async rebuildReferenceSearchIndexForRefWork(
    refWorkId: string,
    onProgress?: (done: number, total: number) => void,
  ): Promise<void> {
    const db = getDB();
    await db.referenceTokenPostings.where("refWorkId").equals(refWorkId).delete();
    const chunks = await db.referenceChunks.where("refWorkId").equals(refWorkId).sortBy("ordinal");
    await this.bulkAddReferencePostings(chunks, onProgress);
  }

  async rebuildAllReferenceSearchIndex(
    onProgress?: (p: { phase: string; percent: number; label?: string }) => void,
  ): Promise<void> {
    const db = getDB();
    await db.referenceTokenPostings.clear();
    const refs = await db.referenceLibrary.toArray();
    const n = refs.length;
    if (n === 0) {
      onProgress?.({ phase: "index", percent: 100, label: "完成" });
      return;
    }
    for (let i = 0; i < n; i++) {
      const r = refs[i]!;
      const chunks = await db.referenceChunks.where("refWorkId").equals(r.id).sortBy("ordinal");
      await this.bulkAddReferencePostings(chunks, (done, tot) => {
        const base = (i / n) * 100;
        const sub = (done / tot) * (100 / n);
        onProgress?.({
          phase: "index",
          percent: Math.min(99, Math.round(base + sub)),
          label: `重建索引 ${i + 1}/${n} · ${r.title}`,
        });
      });
    }
    onProgress?.({ phase: "index", percent: 100, label: "完成" });
  }

  async clearAllReferenceLibraryData(): Promise<void> {
    const db = getDB();
    await db.transaction(
      "rw",
      [
        db.referenceExcerptTags,
        db.referenceTags,
        db.referenceExcerpts,
        db.referenceTokenPostings,
        db.referenceChunks,
        db.referenceChapterHeads,
        db.referenceLibrary,
      ],
      async () => {
        await db.referenceExcerptTags.clear();
        await db.referenceTags.clear();
        await db.referenceExcerpts.clear();
        await db.referenceTokenPostings.clear();
        await db.referenceChapterHeads.clear();
        await db.referenceChunks.clear();
        await db.referenceLibrary.clear();
      },
    );
  }

  async listWorks(): Promise<Work[]> {
    return getDB().works.orderBy("updatedAt").reverse().toArray();
  }

  async getWork(id: string): Promise<Work | undefined> {
    return getDB().works.get(id);
  }

  async createWork(title: string, opts?: { tags?: string[]; description?: string; status?: Work["status"] }): Promise<Work> {
    const db = getDB();
    const id = crypto.randomUUID();
    const t = now();
    const tags = normalizeWorkTagList(opts?.tags);
    const desc = (opts?.description ?? "").trim();
    const status = opts?.status ?? "serializing";
    const work: Work = {
      id,
      title: title.trim() || "未命名作品",
      createdAt: t,
      updatedAt: t,
      progressCursor: null,
      ...(desc ? { description: desc } : {}),
      ...(status ? { status } : {}),
      ...(tags?.length ? { tags } : {}),
    };
    await db.works.add(work);
    const vid = crypto.randomUUID();
    await db.volumes.add({
      id: vid,
      workId: id,
      title: "正文",
      order: 0,
      createdAt: t,
      summary: "",
    });
    return work;
  }

  async updateWork(
    id: string,
    patch: Partial<Pick<Work, "title" | "progressCursor" | "coverImage" | "tags" | "description" | "status">>,
  ): Promise<void> {
    const db = getDB();
    const cur = await db.works.get(id);
    if (!cur) return;
    const next: Work = { ...cur, ...patch, updatedAt: now() };
    if (patch.tags !== undefined) {
      const n = normalizeWorkTagList(patch.tags);
      if (n?.length) next.tags = n;
      else delete next.tags;
    }
    if (patch.description !== undefined) {
      const d = String(patch.description ?? "").trim();
      if (d) next.description = d;
      else delete next.description;
    }
    if (patch.status !== undefined) {
      const s = patch.status;
      if (s === "serializing" || s === "completed" || s === "archived" || s === "deleted") next.status = s;
      else delete next.status;
    }
    await db.works.put(next);
  }

  async deleteWork(id: string): Promise<void> {
    const db = getDB();
    const chapters = await db.chapters.where("workId").equals(id).toArray();
    for (const c of chapters) {
      await db.chapterSnapshots.where("chapterId").equals(c.id).delete();
    }
    await db.chapters.where("workId").equals(id).delete();
    await db.volumes.where("workId").equals(id).delete();
    await db.referenceExcerpts
      .where("linkedWorkId")
      .equals(id)
      .modify({ linkedWorkId: null, linkedChapterId: null });
    await db.chapterBible.where("workId").equals(id).delete();
    await db.bibleCharacters.where("workId").equals(id).delete();
    await db.bibleWorldEntries.where("workId").equals(id).delete();
    await db.bibleForeshadowing.where("workId").equals(id).delete();
    await db.bibleTimelineEvents.where("workId").equals(id).delete();
    await db.bibleChapterTemplates.where("workId").equals(id).delete();
    await db.bibleGlossaryTerms.where("workId").equals(id).delete();
    await db.workStyleCards.where("workId").equals(id).delete();
    await db.logicPlaceEvents.where("workId").equals(id).delete();
    await db.logicPlaceNodes.where("workId").equals(id).delete();
    await db.inspirationFragments.where("workId").equals(id).modify({ workId: null });
    await db.works.delete(id);
  }

  async listVolumes(workId: string): Promise<Volume[]> {
    return getDB().volumes.where("workId").equals(workId).sortBy("order");
  }

  async createVolume(workId: string, title?: string): Promise<Volume> {
    const db = getDB();
    const existing = await db.volumes.where("workId").equals(workId).sortBy("order");
    const maxOrder = existing.length === 0 ? -1 : Math.max(...existing.map((v) => v.order));
    const id = crypto.randomUUID();
    const t = now();
    const vol: Volume = {
      id,
      workId,
      title: title?.trim() || `第 ${existing.length + 1} 卷`,
      order: maxOrder + 1,
      createdAt: t,
      summary: "",
    };
    await db.volumes.add(vol);
    await db.works.update(workId, { updatedAt: t });
    return vol;
  }

  async updateVolume(id: string, patch: Partial<Pick<Volume, "title" | "order" | "summary">>): Promise<void> {
    await getDB().volumes.update(id, { ...patch });
  }

  async deleteVolume(volumeId: string): Promise<void> {
    const db = getDB();
    const vol = await db.volumes.get(volumeId);
    if (!vol) return;
    const siblings = await db.volumes.where("workId").equals(vol.workId).sortBy("order");
    if (siblings.length <= 1) {
      throw new Error("至少保留一卷");
    }
    const target = siblings.find((v) => v.id !== volumeId)!;
    const chapters = await db.chapters.where("volumeId").equals(volumeId).toArray();
    const t = now();
    await db.transaction("rw", db.chapters, db.volumes, async () => {
      for (const ch of chapters) {
        await db.chapters.update(ch.id, { volumeId: target.id, updatedAt: t });
      }
      await db.volumes.delete(volumeId);
    });
    await db.works.update(vol.workId, { updatedAt: t });
  }

  async listChapters(workId: string): Promise<Chapter[]> {
    return getDB().chapters.where("workId").equals(workId).sortBy("order");
  }

  async createChapter(workId: string, title?: string, volumeId?: string): Promise<Chapter> {
    const db = getDB();
    const vols = await this.listVolumes(workId);
    const vid = volumeId ?? vols[0]?.id;
    if (!vid) {
      throw new Error("作品无卷，请先创建作品");
    }
    const existing = await db.chapters.where("workId").equals(workId).sortBy("order");
    const maxOrder = existing.length === 0 ? -1 : Math.max(...existing.map((c) => c.order));
    const id = crypto.randomUUID();
    const t = now();
    const chapter: Chapter = {
      id,
      workId,
      volumeId: vid,
      title: title?.trim() || `第 ${existing.length + 1} 章`,
      content: "",
      summary: "",
      order: maxOrder + 1,
      updatedAt: t,
      wordCountCache: 0,
    };
    await db.chapters.add(chapter);
    await db.works.update(workId, { updatedAt: t });
    return chapter;
  }

  async updateChapter(
    id: string,
    patch: Partial<
      Pick<
        Chapter,
        "title" | "content" | "volumeId" | "summary" | "summaryUpdatedAt" | "summaryScopeFromOrder" | "summaryScopeToOrder" | "outlineDraft" | "outlineNodeId" | "outlinePushedAt"
      >
    >,
    options?: UpdateChapterOptions,
  ): Promise<void> {
    const db = getDB();
    const row = await db.chapters.get(id);
    if (!row) return;
    if (
      options?.expectedUpdatedAt !== undefined &&
      row.updatedAt !== options.expectedUpdatedAt
    ) {
      throw new ChapterSaveConflictError();
    }
    const t = now();
    const merged: Partial<Chapter> = { ...patch, updatedAt: t };
    if (patch.content !== undefined) {
      merged.wordCountCache = wordCount(patch.content);
    }
    if (patch.summary !== undefined && patch.summaryUpdatedAt === undefined) {
      merged.summaryUpdatedAt = t;
    }
    await db.chapters.update(id, merged);
  }

  async deleteChapter(id: string): Promise<void> {
    const db = getDB();
    const ch = await db.chapters.get(id);
    if (!ch) return;
    const w = await db.works.get(ch.workId);
    await db.chapterSnapshots.where("chapterId").equals(id).delete();
    await db.chapters.delete(id);
    await db.referenceExcerpts
      .where("linkedChapterId")
      .equals(id)
      .modify({ linkedWorkId: null, linkedChapterId: null });
    await db.chapterBible.where("chapterId").equals(id).delete();
    await db.bibleForeshadowing.where("chapterId").equals(id).modify({ chapterId: null });
    await db.bibleTimelineEvents.where("chapterId").equals(id).modify({ chapterId: null });
    const patch: Partial<Work> = { updatedAt: now() };
    if (w?.progressCursor === id) {
      patch.progressCursor = null;
    }
    await db.works.update(ch.workId, patch);
  }

  async reorderChapters(workId: string, orderedIds: string[]): Promise<void> {
    const db = getDB();
    const t = now();
    await db.transaction("rw", db.chapters, async () => {
      for (let i = 0; i < orderedIds.length; i++) {
        await db.chapters.update(orderedIds[i], { order: i, updatedAt: t });
      }
    });
    await db.works.update(workId, { updatedAt: t });
  }

  async searchWork(
    workId: string,
    query: string,
    scope?: BookSearchScope,
    isRegex?: boolean,
  ): Promise<BookSearchHit[]> {
    const q = query.trim();
    if (!q) return [];

    // Build regex: if isRegex=true use raw pattern; otherwise escape and use literal
    let re: RegExp;
    try {
      re = isRegex
        ? new RegExp(q, "g")
        : new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    } catch {
      // Invalid regex → fall back to literal
      re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    }

    const work = await this.getWork(workId);
    let chapters = await this.listChapters(workId);
    if (scope === "beforeProgress" && work?.progressCursor) {
      const cur = chapters.find((c) => c.id === work.progressCursor);
      const curOrder = cur?.order ?? Infinity;
      chapters = chapters.filter((c) => c.order < curOrder);
    }

    const CONTEXT = 60; // chars before/after
    const MAX_CONTEXTS = 3;

    const hits: BookSearchHit[] = [];
    for (const ch of chapters) {
      const text = ch.content;
      const offsets: number[] = [];
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        offsets.push(m.index);
        if (offsets.length > 500) break; // safety cap
      }
      if (offsets.length === 0) continue;

      const firstOffset = offsets[0];
      // Legacy preview (first match, ~120 chars)
      const start0 = Math.max(0, firstOffset - 40);
      const preview = text.slice(start0, start0 + 120).replace(/\s+/g, " ").trim();

      // Rich contexts: up to MAX_CONTEXTS non-overlapping snippets
      const contexts: string[] = [];
      let lastEnd = -1;
      for (const off of offsets) {
        if (off < lastEnd) continue; // skip overlapping
        const cStart = Math.max(0, off - CONTEXT);
        const cEnd = Math.min(text.length, off + CONTEXT + q.length);
        const snippet = text.slice(cStart, cEnd).replace(/\s+/g, " ").trim();
        contexts.push(`${cStart > 0 ? "…" : ""}${snippet}${cEnd < text.length ? "…" : ""}`);
        lastEnd = off + q.length;
        if (contexts.length >= MAX_CONTEXTS) break;
      }

      hits.push({
        chapterId: ch.id,
        chapterTitle: ch.title,
        matchCount: offsets.length,
        preview: preview.length ? `…${preview}…` : "…",
        contexts,
        firstMatchOffset: firstOffset,
      });
    }
    return hits;
  }

  async listChapterSnapshots(chapterId: string): Promise<ChapterSnapshot[]> {
    const list = await getDB()
      .chapterSnapshots.where("chapterId")
      .equals(chapterId)
      .sortBy("createdAt");
    return list.reverse();
  }

  async addChapterSnapshot(chapterId: string, content: string): Promise<void> {
    const db = getDB();
    const existing = await db.chapterSnapshots
      .where("chapterId")
      .equals(chapterId)
      .sortBy("createdAt");
    const last = existing[existing.length - 1];
    if (last && last.content === content) return;

    const id = crypto.randomUUID();
    const t = now();
    await db.chapterSnapshots.add({ id, chapterId, content, createdAt: t });

    const cutoff = now() - SNAPSHOT_MAX_AGE_MS;
    let ordered = await db.chapterSnapshots.where("chapterId").equals(chapterId).sortBy("createdAt");
    for (const s of ordered) {
      if (s.createdAt < cutoff) await db.chapterSnapshots.delete(s.id);
    }
    ordered = await db.chapterSnapshots.where("chapterId").equals(chapterId).sortBy("createdAt");
    while (ordered.length > SNAPSHOT_CAP_PER_CHAPTER) {
      await db.chapterSnapshots.delete(ordered[0].id);
      ordered = await db.chapterSnapshots.where("chapterId").equals(chapterId).sortBy("createdAt");
    }
  }

  async deleteChapterSnapshot(snapshotId: string): Promise<void> {
    await getDB().chapterSnapshots.delete(snapshotId);
  }

  async listReferenceLibrary(): Promise<ReferenceLibraryEntry[]> {
    return getDB().referenceLibrary.orderBy("updatedAt").reverse().toArray();
  }

  async getReferenceLibraryEntry(id: string): Promise<ReferenceLibraryEntry | undefined> {
    return getDB().referenceLibrary.get(id);
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
    const db = getDB();
    const id = crypto.randomUUID();
    const t = now();
    const signal = options?.signal;
    const parts = splitTextIntoReferenceChunks(input.fullText);
    const { perChunk, chapterHeadCount, headsForDb } = annotateReferenceParts(input.fullText, parts);
    const cat = (input.category ?? "").trim();
    const entry: ReferenceLibraryEntry = {
      id,
      title: input.title.trim() || "未命名参考",
      sourceName: input.sourceName,
      category: cat || undefined,
      totalChars: input.fullText.length,
      chunkCount: parts.length,
      chapterHeadCount,
      createdAt: t,
      updatedAt: t,
    };
    const allRows: ReferenceChunk[] = parts.map((content, idx) => {
      const ann = perChunk[idx]!;
      return {
        id: crypto.randomUUID(),
        refWorkId: id,
        ordinal: idx,
        content,
        embeddings: null,
        isChapterHead: ann.isChapterHead,
        chapterTitle: ann.chapterTitle,
      };
    });
    const headRows: ReferenceChapterHead[] = headsForDb.map((h) => ({
      id: crypto.randomUUID(),
      refWorkId: id,
      chunkId: allRows[h.ordinal]!.id,
      ordinal: h.ordinal,
      startOffset: h.startOffset,
      title: h.title,
    }));
    const partsLen = parts.length;
    let committed = false;
    try {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      await db.transaction("rw", [db.referenceLibrary, db.referenceChunks, db.referenceChapterHeads], async () => {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        await db.referenceLibrary.add(entry);
        const BATCH = 150;
        for (let i = 0; i < allRows.length; i += BATCH) {
          if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
          const slice = allRows.slice(i, i + BATCH);
          await db.referenceChunks.bulkAdd(slice);
          const end = Math.min(i + BATCH, partsLen);
          options?.onProgress?.({
            phase: "chunks",
            percent: partsLen ? Math.round((end / partsLen) * 38) : 38,
            label: "写入正文分块…",
          });
        }
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        if (headRows.length) await db.referenceChapterHeads.bulkAdd(headRows);
      });

      await this.bulkAddReferencePostings(
        allRows,
        (done, total) => {
          options?.onProgress?.({
            phase: "index",
            percent: 38 + Math.round((done / Math.max(1, total)) * 62),
            label: "建立检索索引…",
          });
        },
        signal,
      );

      committed = true;
      return entry;
    } catch (e) {
      // 取消或失败：清理半成品，避免残留分块/索引
      try {
        await this.deleteReferenceLibraryEntry(id);
      } catch {
        /* ignore */
      }
      throw e;
    } finally {
      // 若 future refactor 改为多阶段提交，这里用于兜底
      if (!committed && signal?.aborted) {
        /* already cleaned */
      }
    }
  }

  async updateReferenceLibraryEntry(
    id: string,
    patch: Partial<Pick<ReferenceLibraryEntry, "title" | "category">>,
  ): Promise<void> {
    await getDB().referenceLibrary.update(id, { ...patch, updatedAt: now() });
  }

  async listAllReferenceExcerpts(): Promise<
    Array<ReferenceExcerpt & { refTitle: string; tagIds: string[] }>
  > {
    const db = getDB();
    const ex = await db.referenceExcerpts.orderBy("createdAt").reverse().toArray();
    const refs = await db.referenceLibrary.toArray();
    const titleMap = new Map(refs.map((r) => [r.id, r.title]));
    const ids = ex.map((e) => e.id);
    const tagMap = await excerptTagIdsMap(db, ids);
    return ex.map((e) => ({
      ...e,
      refTitle: titleMap.get(e.refWorkId) ?? "（参考已删）",
      tagIds: tagMap.get(e.id) ?? [],
    }));
  }

  async listReferenceExcerptsWithTagIds(
    refWorkId: string,
  ): Promise<Array<ReferenceExcerpt & { tagIds: string[] }>> {
    const list = await this.listReferenceExcerpts(refWorkId);
    const ids = list.map((e) => e.id);
    const tagMap = await excerptTagIdsMap(getDB(), ids);
    return list.map((e) => ({ ...e, tagIds: tagMap.get(e.id) ?? [] }));
  }

  async deleteReferenceLibraryEntry(id: string): Promise<void> {
    const db = getDB();
    const exIds = (await db.referenceExcerpts.where("refWorkId").equals(id).toArray()).map((e) => e.id);
    if (exIds.length > 0) {
      await db.referenceExcerptTags.where("excerptId").anyOf(exIds).delete();
    }
    await db.referenceTokenPostings.where("refWorkId").equals(id).delete();
    await db.referenceExcerpts.where("refWorkId").equals(id).delete();
    await db.referenceChapterHeads.where("refWorkId").equals(id).delete();
    await db.referenceChunks.where("refWorkId").equals(id).delete();
    await db.referenceLibrary.delete(id);
  }

  async listReferenceChapterHeads(refWorkId: string): Promise<ReferenceChapterHead[]> {
    return getDB().referenceChapterHeads.where("refWorkId").equals(refWorkId).sortBy("ordinal");
  }

  async listReferenceChunks(refWorkId: string): Promise<ReferenceChunk[]> {
    return getDB().referenceChunks.where("refWorkId").equals(refWorkId).sortBy("ordinal");
  }

  async getReferenceChunkAt(refWorkId: string, ordinal: number): Promise<ReferenceChunk | undefined> {
    return getDB()
      .referenceChunks.where("[refWorkId+ordinal]")
      .equals([refWorkId, ordinal])
      .first();
  }

  async getReferenceChunk(chunkId: string): Promise<ReferenceChunk | undefined> {
    return getDB().referenceChunks.get(chunkId);
  }

  async listReferenceTags(): Promise<ReferenceTag[]> {
    return getDB().referenceTags.orderBy("name").toArray();
  }

  async createReferenceTag(name: string): Promise<ReferenceTag> {
    const n = name.trim();
    if (!n) throw new Error("标签名不能为空");
    const db = getDB();
    const existing = await db.referenceTags.where("name").equals(n).first();
    if (existing) return existing;
    const row: ReferenceTag = { id: crypto.randomUUID(), name: n, createdAt: now() };
    await db.referenceTags.add(row);
    return row;
  }

  async deleteReferenceTag(id: string): Promise<void> {
    const db = getDB();
    await db.referenceExcerptTags.where("tagId").equals(id).delete();
    await db.referenceTags.delete(id);
  }

  async searchReferenceLibrary(
    query: string,
    opts?: { refWorkId?: string; limit?: number; mode?: "strict" | "hybrid" },
  ): Promise<ReferenceSearchHit[]> {
    if (opts?.mode === "hybrid") {
      return this.searchReferenceLibraryHybrid(query, opts);
    }
    const q = query.trim();
    if (!q) return [];
    const limit = opts?.limit ?? 80;
    const db = getDB();
    const refMap = new Map((await db.referenceLibrary.toArray()).map((r) => [r.id, r.title]));

    const tokens = tokenizeQuery(q);
    if (tokens.length === 0) {
      return this.searchReferenceLiteralFallback(q, opts?.refWorkId, limit, refMap);
    }

    let chunkIdSet: Set<string> | null = null;
    for (const tok of tokens) {
      const part = await this.chunkIdsMatchingToken(tok, opts?.refWorkId);
      if (chunkIdSet === null) {
        chunkIdSet = part;
      } else {
        const next = new Set<string>();
        for (const cid of chunkIdSet) {
          if (part.has(cid)) next.add(cid);
        }
        chunkIdSet = next;
      }
      if (chunkIdSet.size === 0) return [];
    }

    const ids = [...chunkIdSet!];
    const chunks = (
      await Promise.all(ids.map((cid) => db.referenceChunks.get(cid)))
    ).filter((c): c is ReferenceChunk => c != null);
    const drafts = refineLiteralHits(q, chunks);
    const hits: ReferenceSearchHit[] = drafts.map((d) => ({
      refWorkId: d.refWorkId,
      refTitle: refMap.get(d.refWorkId) ?? "",
      chunkId: d.chunkId,
      ordinal: d.ordinal,
      matchCount: d.matchCount,
      preview: d.preview,
      snippetBefore: d.snippetBefore,
      snippetMatch: d.snippetMatch,
      snippetAfter: d.snippetAfter,
      highlightStart: d.highlightStart,
      highlightEnd: d.highlightEnd,
    }));
    hits.sort((a, b) => a.refTitle.localeCompare(b.refTitle) || a.ordinal - b.ordinal);
    return hits.slice(0, limit);
  }

  /** 步 40：分词 OR 召回 + 块内加权，无向量依赖 */
  private async searchReferenceLibraryHybrid(
    query: string,
    opts?: { refWorkId?: string; limit?: number },
  ): Promise<ReferenceSearchHit[]> {
    const q = query.trim();
    if (!q) return [];
    const limit = opts?.limit ?? 80;
    const db = getDB();
    const refMap = new Map((await db.referenceLibrary.toArray()).map((r) => [r.id, r.title]));

    const tokens = tokenizeQuery(q);
    if (tokens.length === 0) {
      return this.searchReferenceLiteralFallback(q, opts?.refWorkId, limit, refMap);
    }

    const chunkIdSet = new Set<string>();
    for (const tok of tokens) {
      const part = await this.chunkIdsMatchingToken(tok, opts?.refWorkId);
      for (const cid of part) {
        chunkIdSet.add(cid);
        if (chunkIdSet.size >= MAX_HYBRID_CHUNKS_TO_SCORE) break;
      }
      if (chunkIdSet.size >= MAX_HYBRID_CHUNKS_TO_SCORE) break;
    }
    if (chunkIdSet.size === 0) return [];

    const ids = [...chunkIdSet];
    const chunks = (
      await Promise.all(ids.map((cid) => db.referenceChunks.get(cid)))
    ).filter((c): c is ReferenceChunk => c != null);

    const rows: Array<{ draft: ReferenceSearchHitDraft; score: number }> = [];
    for (const ch of chunks) {
      const r = refineHybridHit(q, tokens, ch);
      if (r) rows.push(r);
    }
    rows.sort(
      (a, b) =>
        b.score - a.score ||
        (refMap.get(a.draft.refWorkId) ?? "").localeCompare(refMap.get(b.draft.refWorkId) ?? "") ||
        a.draft.ordinal - b.draft.ordinal,
    );

    const hits: ReferenceSearchHit[] = rows.slice(0, limit).map(({ draft: d }) => ({
      refWorkId: d.refWorkId,
      refTitle: refMap.get(d.refWorkId) ?? "",
      chunkId: d.chunkId,
      ordinal: d.ordinal,
      matchCount: d.matchCount,
      preview: d.preview,
      snippetBefore: d.snippetBefore,
      snippetMatch: d.snippetMatch,
      snippetAfter: d.snippetAfter,
      highlightStart: d.highlightStart,
      highlightEnd: d.highlightEnd,
    }));
    return hits;
  }

  private async chunkIdsMatchingToken(token: string, refWorkId?: string): Promise<Set<string>> {
    const db = getDB();
    const set = new Set<string>();
    if (refWorkId) {
      const rows = await db.referenceTokenPostings
        .where("[token+refWorkId]")
        .equals([token, refWorkId])
        .toArray();
      for (const r of rows) set.add(r.chunkId);
      return set;
    }
    const rows = await db.referenceTokenPostings.where("token").equals(token).toArray();
    for (const r of rows) {
      set.add(r.chunkId);
      if (set.size >= MAX_CHUNKS_PER_TOKEN_QUERY) break;
    }
    return set;
  }

  private async searchReferenceLiteralFallback(
    q: string,
    refWorkId: string | undefined,
    limit: number,
    refMap: Map<string, string>,
  ): Promise<ReferenceSearchHit[]> {
    const db = getDB();
    let chunks: ReferenceChunk[] = [];
    if (refWorkId) {
      chunks = await db.referenceChunks.where("refWorkId").equals(refWorkId).sortBy("ordinal");
    } else {
      await db.referenceChunks.each((c) => {
        chunks.push(c);
        if (chunks.length >= LITERAL_FALLBACK_MAX_CHUNKS) return false;
      });
    }
    const drafts = refineLiteralHits(q, chunks);
    const hits: ReferenceSearchHit[] = drafts.map((d) => ({
      refWorkId: d.refWorkId,
      refTitle: refMap.get(d.refWorkId) ?? "",
      chunkId: d.chunkId,
      ordinal: d.ordinal,
      matchCount: d.matchCount,
      preview: d.preview,
      snippetBefore: d.snippetBefore,
      snippetMatch: d.snippetMatch,
      snippetAfter: d.snippetAfter,
      highlightStart: d.highlightStart,
      highlightEnd: d.highlightEnd,
    }));
    hits.sort((a, b) => a.refTitle.localeCompare(b.refTitle) || a.ordinal - b.ordinal);
    return hits.slice(0, limit);
  }

  async listReferenceExcerpts(refWorkId: string): Promise<ReferenceExcerpt[]> {
    const list = await getDB()
      .referenceExcerpts.where("refWorkId")
      .equals(refWorkId)
      .sortBy("createdAt");
    return list.reverse();
  }

  async addReferenceExcerpt(
    input: Omit<ReferenceExcerpt, "id" | "createdAt">,
  ): Promise<ReferenceExcerpt> {
    const db = getDB();
    const row: ReferenceExcerpt = {
      ...input,
      linkedWorkId: input.linkedWorkId ?? null,
      linkedChapterId: input.linkedChapterId ?? null,
      id: crypto.randomUUID(),
      createdAt: now(),
    };
    await db.referenceExcerpts.add(row);
    return row;
  }

  async updateReferenceExcerpt(
    id: string,
    patch: Partial<Pick<ReferenceExcerpt, "note" | "linkedWorkId" | "linkedChapterId">> & {
      tagIds?: string[];
    },
  ): Promise<void> {
    const db = getDB();
    const { tagIds, ...rest } = patch;
    const fields: Partial<Pick<ReferenceExcerpt, "note" | "linkedWorkId" | "linkedChapterId">> = {};
    if (rest.note !== undefined) fields.note = rest.note;
    if (rest.linkedWorkId !== undefined) fields.linkedWorkId = rest.linkedWorkId;
    if (rest.linkedChapterId !== undefined) fields.linkedChapterId = rest.linkedChapterId;
    if (Object.keys(fields).length > 0) {
      await db.referenceExcerpts.update(id, fields);
    }
    if (tagIds !== undefined) {
      await this.setExcerptTags(id, tagIds);
    }
  }

  async setExcerptTags(excerptId: string, tagIds: string[]): Promise<void> {
    const db = getDB();
    await db.transaction("rw", db.referenceExcerptTags, async () => {
      await db.referenceExcerptTags.where("excerptId").equals(excerptId).delete();
      const rows: ReferenceExcerptTag[] = tagIds.map((tagId) => ({
        id: crypto.randomUUID(),
        excerptId,
        tagId,
      }));
      if (rows.length) await db.referenceExcerptTags.bulkAdd(rows);
    });
  }

  async deleteReferenceExcerpt(id: string): Promise<void> {
    const db = getDB();
    await db.referenceExcerptTags.where("excerptId").equals(id).delete();
    await db.referenceExcerpts.delete(id);
  }

  async listBibleCharacters(workId: string): Promise<BibleCharacter[]> {
    return getDB().bibleCharacters.where("workId").equals(workId).sortBy("sortOrder");
  }

  async addBibleCharacter(
    workId: string,
    input: Partial<Omit<BibleCharacter, "id" | "workId" | "sortOrder" | "createdAt" | "updatedAt">>,
  ): Promise<BibleCharacter> {
    const db = getDB();
    const list = await db.bibleCharacters.where("workId").equals(workId).sortBy("sortOrder");
    const maxOrder = list.length === 0 ? -1 : Math.max(...list.map((c) => c.sortOrder));
    const t = now();
    const row: BibleCharacter = {
      id: crypto.randomUUID(),
      workId,
      name: (input.name ?? "").trim() || "未命名",
      motivation: input.motivation ?? "",
      relationships: input.relationships ?? "",
      voiceNotes: input.voiceNotes ?? "",
      taboos: input.taboos ?? "",
      sortOrder: maxOrder + 1,
      createdAt: t,
      updatedAt: t,
    };
    await db.bibleCharacters.add(row);
    return row;
  }

  async updateBibleCharacter(
    id: string,
    patch: Partial<Omit<BibleCharacter, "id" | "workId">>,
  ): Promise<void> {
    await getDB().bibleCharacters.update(id, { ...patch, updatedAt: now() });
  }

  async deleteBibleCharacter(id: string): Promise<void> {
    await getDB().bibleCharacters.delete(id);
  }

  async reorderBibleCharacters(_workId: string, orderedIds: string[]): Promise<void> {
    void _workId;
    const db = getDB();
    const t = now();
    await db.transaction("rw", db.bibleCharacters, async () => {
      for (let i = 0; i < orderedIds.length; i++) {
        await db.bibleCharacters.update(orderedIds[i], { sortOrder: i, updatedAt: t });
      }
    });
  }

  async listBibleWorldEntries(workId: string): Promise<BibleWorldEntry[]> {
    return getDB().bibleWorldEntries.where("workId").equals(workId).sortBy("sortOrder");
  }

  async addBibleWorldEntry(
    workId: string,
    input: Partial<Omit<BibleWorldEntry, "id" | "workId" | "sortOrder" | "createdAt" | "updatedAt">>,
  ): Promise<BibleWorldEntry> {
    const db = getDB();
    const list = await db.bibleWorldEntries.where("workId").equals(workId).sortBy("sortOrder");
    const maxOrder = list.length === 0 ? -1 : Math.max(...list.map((c) => c.sortOrder));
    const t = now();
    const row: BibleWorldEntry = {
      id: crypto.randomUUID(),
      workId,
      entryKind: (input.entryKind ?? "条目").trim() || "条目",
      title: (input.title ?? "").trim() || "未命名",
      body: input.body ?? "",
      sortOrder: maxOrder + 1,
      createdAt: t,
      updatedAt: t,
    };
    await db.bibleWorldEntries.add(row);
    return row;
  }

  async updateBibleWorldEntry(
    id: string,
    patch: Partial<Omit<BibleWorldEntry, "id" | "workId">>,
  ): Promise<void> {
    await getDB().bibleWorldEntries.update(id, { ...patch, updatedAt: now() });
  }

  async deleteBibleWorldEntry(id: string): Promise<void> {
    await getDB().bibleWorldEntries.delete(id);
  }

  async reorderBibleWorldEntries(_workId: string, orderedIds: string[]): Promise<void> {
    void _workId;
    const db = getDB();
    const t = now();
    await db.transaction("rw", db.bibleWorldEntries, async () => {
      for (let i = 0; i < orderedIds.length; i++) {
        await db.bibleWorldEntries.update(orderedIds[i], { sortOrder: i, updatedAt: t });
      }
    });
  }

  async listBibleForeshadowing(workId: string): Promise<BibleForeshadow[]> {
    return getDB().bibleForeshadowing.where("workId").equals(workId).sortBy("sortOrder");
  }

  async addBibleForeshadow(
    workId: string,
    input: Partial<Omit<BibleForeshadow, "id" | "workId" | "sortOrder" | "createdAt" | "updatedAt">>,
  ): Promise<BibleForeshadow> {
    const db = getDB();
    const list = await db.bibleForeshadowing.where("workId").equals(workId).sortBy("sortOrder");
    const maxOrder = list.length === 0 ? -1 : Math.max(...list.map((c) => c.sortOrder));
    const t = now();
    const row: BibleForeshadow = {
      id: crypto.randomUUID(),
      workId,
      title: (input.title ?? "").trim() || "未命名伏笔",
      plantedWhere: input.plantedWhere ?? "",
      plannedResolve: input.plannedResolve ?? "",
      status: input.status ?? "pending",
      note: input.note ?? "",
      chapterId: input.chapterId ?? null,
      sortOrder: maxOrder + 1,
      createdAt: t,
      updatedAt: t,
    };
    await db.bibleForeshadowing.add(row);
    return row;
  }

  async updateBibleForeshadow(
    id: string,
    patch: Partial<Omit<BibleForeshadow, "id" | "workId">>,
  ): Promise<void> {
    await getDB().bibleForeshadowing.update(id, { ...patch, updatedAt: now() });
  }

  async deleteBibleForeshadow(id: string): Promise<void> {
    await getDB().bibleForeshadowing.delete(id);
  }

  async reorderBibleForeshadowing(_workId: string, orderedIds: string[]): Promise<void> {
    void _workId;
    const db = getDB();
    const t = now();
    await db.transaction("rw", db.bibleForeshadowing, async () => {
      for (let i = 0; i < orderedIds.length; i++) {
        await db.bibleForeshadowing.update(orderedIds[i], { sortOrder: i, updatedAt: t });
      }
    });
  }

  async listBibleTimelineEvents(workId: string): Promise<BibleTimelineEvent[]> {
    return getDB().bibleTimelineEvents.where("workId").equals(workId).sortBy("sortOrder");
  }

  async addBibleTimelineEvent(
    workId: string,
    input: Partial<Omit<BibleTimelineEvent, "id" | "workId" | "sortOrder" | "createdAt" | "updatedAt">>,
  ): Promise<BibleTimelineEvent> {
    const db = getDB();
    const list = await db.bibleTimelineEvents.where("workId").equals(workId).sortBy("sortOrder");
    const maxOrder = list.length === 0 ? -1 : Math.max(...list.map((c) => c.sortOrder));
    const t = now();
    const row: BibleTimelineEvent = {
      id: crypto.randomUUID(),
      workId,
      label: (input.label ?? "").trim() || "事件",
      sortOrder: maxOrder + 1,
      note: input.note ?? "",
      chapterId: input.chapterId ?? null,
      createdAt: t,
      updatedAt: t,
    };
    await db.bibleTimelineEvents.add(row);
    return row;
  }

  async updateBibleTimelineEvent(
    id: string,
    patch: Partial<Omit<BibleTimelineEvent, "id" | "workId">>,
  ): Promise<void> {
    await getDB().bibleTimelineEvents.update(id, { ...patch, updatedAt: now() });
  }

  async deleteBibleTimelineEvent(id: string): Promise<void> {
    await getDB().bibleTimelineEvents.delete(id);
  }

  async reorderBibleTimelineEvents(_workId: string, orderedIds: string[]): Promise<void> {
    void _workId;
    const db = getDB();
    const t = now();
    await db.transaction("rw", db.bibleTimelineEvents, async () => {
      for (let i = 0; i < orderedIds.length; i++) {
        await db.bibleTimelineEvents.update(orderedIds[i], { sortOrder: i, updatedAt: t });
      }
    });
  }

  async listLogicPlaceNodes(workId: string): Promise<LogicPlaceNode[]> {
    return getDB().logicPlaceNodes.where("workId").equals(workId).sortBy("updatedAt");
  }

  async addLogicPlaceNode(
    workId: string,
    input: Partial<Omit<LogicPlaceNode, "id" | "workId" | "createdAt" | "updatedAt">> & { name: string },
  ): Promise<LogicPlaceNode> {
    const db = getDB();
    const t = now();
    const x = Number.isFinite(input.x as number) ? Number(input.x) : 50;
    const y = Number.isFinite(input.y as number) ? Number(input.y) : 50;
    const row: LogicPlaceNode = {
      id: crypto.randomUUID(),
      workId,
      name: (input.name ?? "").trim() || "地点",
      note: input.note ?? "",
      x: Math.max(0, Math.min(100, Math.round(x))),
      y: Math.max(0, Math.min(100, Math.round(y))),
      createdAt: t,
      updatedAt: t,
    };
    await db.logicPlaceNodes.add(row);
    return row;
  }

  async updateLogicPlaceNode(id: string, patch: Partial<Omit<LogicPlaceNode, "id" | "workId">>): Promise<void> {
    const upd: Record<string, unknown> = { updatedAt: now() };
    if (patch.name !== undefined) upd.name = (patch.name ?? "").trim() || "地点";
    if (patch.note !== undefined) upd.note = patch.note ?? "";
    if (patch.x !== undefined) upd.x = Math.max(0, Math.min(100, Math.round(Number(patch.x))));
    if (patch.y !== undefined) upd.y = Math.max(0, Math.min(100, Math.round(Number(patch.y))));
    await getDB().logicPlaceNodes.update(id, upd as Partial<LogicPlaceNode>);
  }

  async deleteLogicPlaceNode(id: string): Promise<void> {
    const db = getDB();
    await db.logicPlaceEvents.where("placeId").equals(id).delete();
    await db.logicPlaceNodes.delete(id);
  }

  async listLogicPlaceEvents(workId: string): Promise<LogicPlaceEvent[]> {
    return getDB().logicPlaceEvents.where("workId").equals(workId).sortBy("updatedAt");
  }

  async addLogicPlaceEvent(
    workId: string,
    input: Partial<Omit<LogicPlaceEvent, "id" | "workId" | "createdAt" | "updatedAt">> & { placeId: string; label: string },
  ): Promise<LogicPlaceEvent> {
    const db = getDB();
    const t = now();
    const row: LogicPlaceEvent = {
      id: crypto.randomUUID(),
      workId,
      placeId: input.placeId,
      label: (input.label ?? "").trim() || "事件",
      note: input.note ?? "",
      chapterId: input.chapterId ?? null,
      createdAt: t,
      updatedAt: t,
    };
    await db.logicPlaceEvents.add(row);
    return row;
  }

  async updateLogicPlaceEvent(id: string, patch: Partial<Omit<LogicPlaceEvent, "id" | "workId">>): Promise<void> {
    const upd: Record<string, unknown> = { updatedAt: now() };
    if (patch.placeId !== undefined) upd.placeId = patch.placeId;
    if (patch.label !== undefined) upd.label = (patch.label ?? "").trim() || "事件";
    if (patch.note !== undefined) upd.note = patch.note ?? "";
    if (patch.chapterId !== undefined) upd.chapterId = patch.chapterId;
    await getDB().logicPlaceEvents.update(id, upd as Partial<LogicPlaceEvent>);
  }

  async deleteLogicPlaceEvent(id: string): Promise<void> {
    await getDB().logicPlaceEvents.delete(id);
  }

  async getTuiyanState(workId: string): Promise<TuiyanState | undefined> {
    return getDB().tuiyanStates.get(workId);
  }

  async upsertTuiyanState(
    workId: string,
    patch: Partial<Omit<TuiyanState, "id" | "workId" | "updatedAt">> & { updatedAt?: number },
  ): Promise<TuiyanState> {
    const db = getDB();
    const prev = await db.tuiyanStates.get(workId);
    const t = Number.isFinite(patch.updatedAt) ? Number(patch.updatedAt) : now();
    const next: TuiyanState = {
      id: workId,
      workId,
      updatedAt: t,
      chatHistory: patch.chatHistory ?? prev?.chatHistory ?? [],
      wenCe: patch.wenCe ?? prev?.wenCe ?? [],
      finalizedNodeIds: patch.finalizedNodeIds ?? prev?.finalizedNodeIds ?? [],
      statusByNodeId: patch.statusByNodeId ?? prev?.statusByNodeId ?? {},
      linkedRefWorkIds: patch.linkedRefWorkIds ?? prev?.linkedRefWorkIds ?? [],
      mindmap: patch.mindmap ?? prev?.mindmap ?? { nodes: [], edges: [] },
      scenes: patch.scenes ?? prev?.scenes ?? [],
    };
    await db.tuiyanStates.put(next);
    return next;
  }

  async listBibleChapterTemplates(workId: string): Promise<BibleChapterTemplate[]> {
    return getDB().bibleChapterTemplates.where("workId").equals(workId).sortBy("name");
  }

  async addBibleChapterTemplate(
    workId: string,
    input: Partial<Omit<BibleChapterTemplate, "id" | "workId" | "createdAt" | "updatedAt">>,
  ): Promise<BibleChapterTemplate> {
    const db = getDB();
    const t = now();
    const row: BibleChapterTemplate = {
      id: crypto.randomUUID(),
      workId,
      name: (input.name ?? "").trim() || "未命名模板",
      goalText: input.goalText ?? "",
      forbidText: input.forbidText ?? "",
      povText: input.povText ?? "",
      createdAt: t,
      updatedAt: t,
    };
    await db.bibleChapterTemplates.add(row);
    return row;
  }

  async updateBibleChapterTemplate(
    id: string,
    patch: Partial<Omit<BibleChapterTemplate, "id" | "workId">>,
  ): Promise<void> {
    await getDB().bibleChapterTemplates.update(id, { ...patch, updatedAt: now() });
  }

  async deleteBibleChapterTemplate(id: string): Promise<void> {
    await getDB().bibleChapterTemplates.delete(id);
  }

  async getChapterBible(chapterId: string): Promise<ChapterBible | undefined> {
    const row = await getDB().chapterBible.where("chapterId").equals(chapterId).first();
    if (!row) return undefined;
    return { ...row, characterStateText: row.characterStateText ?? "" };
  }

  async upsertChapterBible(
    input: Omit<ChapterBible, "id" | "updatedAt"> & { id?: string },
  ): Promise<ChapterBible> {
    const db = getDB();
    const existing = await db.chapterBible.where("chapterId").equals(input.chapterId).first();
    const t = now();
    if (existing) {
      await db.chapterBible.update(existing.id, {
        goalText: input.goalText,
        forbidText: input.forbidText,
        povText: input.povText,
        sceneStance: input.sceneStance,
        characterStateText: input.characterStateText ?? "",
        updatedAt: t,
      });
      return {
        ...existing,
        goalText: input.goalText,
        forbidText: input.forbidText,
        povText: input.povText,
        sceneStance: input.sceneStance,
        characterStateText: input.characterStateText ?? "",
        updatedAt: t,
      };
    }
    const row: ChapterBible = {
      id: crypto.randomUUID(),
      chapterId: input.chapterId,
      workId: input.workId,
      goalText: input.goalText ?? "",
      forbidText: input.forbidText ?? "",
      povText: input.povText ?? "",
      sceneStance: input.sceneStance ?? "",
      characterStateText: input.characterStateText ?? "",
      updatedAt: t,
    };
    await db.chapterBible.add(row);
    return row;
  }

  async listBibleGlossaryTerms(workId: string): Promise<BibleGlossaryTerm[]> {
    return getDB().bibleGlossaryTerms.where("workId").equals(workId).sortBy("term");
  }

  async addBibleGlossaryTerm(
    workId: string,
    input: Partial<Omit<BibleGlossaryTerm, "id" | "workId" | "createdAt" | "updatedAt">>,
  ): Promise<BibleGlossaryTerm> {
    const db = getDB();
    const t = now();
    const row: BibleGlossaryTerm = {
      id: crypto.randomUUID(),
      workId,
      term: (input.term ?? "").trim() || "术语",
      category: input.category ?? "term",
      note: input.note ?? "",
      createdAt: t,
      updatedAt: t,
    };
    await db.bibleGlossaryTerms.add(row);
    return row;
  }

  async updateBibleGlossaryTerm(
    id: string,
    patch: Partial<Omit<BibleGlossaryTerm, "id" | "workId">>,
  ): Promise<void> {
    await getDB().bibleGlossaryTerms.update(id, { ...patch, updatedAt: now() });
  }

  async deleteBibleGlossaryTerm(id: string): Promise<void> {
    await getDB().bibleGlossaryTerms.delete(id);
  }

  async listWritingPromptTemplates(workId: string): Promise<WritingPromptTemplate[]> {
    return getDB().writingPromptTemplates.where("workId").equals(workId).sortBy("sortOrder");
  }

  async addWritingPromptTemplate(
    workId: string,
    input: Partial<Omit<WritingPromptTemplate, "id" | "workId" | "sortOrder" | "createdAt" | "updatedAt">>,
  ): Promise<WritingPromptTemplate> {
    const db = getDB();
    const list = await db.writingPromptTemplates.where("workId").equals(workId).sortBy("sortOrder");
    const maxOrder = list.length === 0 ? -1 : Math.max(...list.map((c) => c.sortOrder));
    const t = now();
    const row: WritingPromptTemplate = {
      id: crypto.randomUUID(),
      workId,
      category: (input.category ?? "").trim(),
      title: (input.title ?? "").trim() || "未命名模板",
      body: input.body ?? "",
      sortOrder: maxOrder + 1,
      createdAt: t,
      updatedAt: t,
    };
    await db.writingPromptTemplates.add(row);
    return row;
  }

  async updateWritingPromptTemplate(
    id: string,
    patch: Partial<Omit<WritingPromptTemplate, "id" | "workId">>,
  ): Promise<void> {
    const upd: Record<string, unknown> = { updatedAt: now() };
    if (patch.category !== undefined) upd.category = patch.category.trim();
    if (patch.title !== undefined) upd.title = patch.title.trim() || "未命名模板";
    if (patch.body !== undefined) upd.body = patch.body;
    if (patch.sortOrder !== undefined) upd.sortOrder = patch.sortOrder;
    await getDB().writingPromptTemplates.update(id, upd as Partial<WritingPromptTemplate>);
  }

  async deleteWritingPromptTemplate(id: string): Promise<void> {
    await getDB().writingPromptTemplates.delete(id);
  }

  async reorderWritingPromptTemplates(workId: string, orderedIds: string[]): Promise<void> {
    void workId;
    const db = getDB();
    const t = now();
    await db.transaction("rw", db.writingPromptTemplates, async () => {
      for (let i = 0; i < orderedIds.length; i++) {
        await db.writingPromptTemplates.update(orderedIds[i], { sortOrder: i, updatedAt: t });
      }
    });
  }

  // ── 全局提示词库（Sprint 1）─────────────────────────────────────────────────

  async listGlobalPromptTemplates(): Promise<GlobalPromptTemplate[]> {
    return getDB().globalPromptTemplates.orderBy("sortOrder").toArray();
  }

  async addGlobalPromptTemplate(
    input: Omit<GlobalPromptTemplate, "id" | "sortOrder" | "createdAt" | "updatedAt">,
  ): Promise<GlobalPromptTemplate> {
    const db = getDB();
    const all = await db.globalPromptTemplates.orderBy("sortOrder").toArray();
    const maxOrder = all.length === 0 ? -1 : Math.max(...all.map((r) => r.sortOrder));
    const t = now();
    const row: GlobalPromptTemplate = {
      id: crypto.randomUUID(),
      title: (input.title ?? "").trim() || "未命名模板",
      type: input.type,
      tags: input.tags ?? [],
      body: input.body ?? "",
      status: input.status ?? "draft",
      sortOrder: maxOrder + 1,
      createdAt: t,
      updatedAt: t,
    };
    await db.globalPromptTemplates.add(row);
    return row;
  }

  async updateGlobalPromptTemplate(
    id: string,
    patch: Partial<Omit<GlobalPromptTemplate, "id" | "createdAt">>,
  ): Promise<void> {
    const upd: Record<string, unknown> = { updatedAt: now() };
    if (patch.title !== undefined) upd.title = (patch.title ?? "").trim() || "未命名模板";
    if (patch.type !== undefined) upd.type = patch.type;
    if (patch.tags !== undefined) upd.tags = patch.tags;
    if (patch.body !== undefined) upd.body = patch.body;
    if (patch.status !== undefined) upd.status = patch.status;
    if (patch.reviewNote !== undefined) upd.reviewNote = patch.reviewNote;
    if (patch.sortOrder !== undefined) upd.sortOrder = patch.sortOrder;
    await getDB().globalPromptTemplates.update(id, upd as Partial<GlobalPromptTemplate>);
  }

  async deleteGlobalPromptTemplate(id: string): Promise<void> {
    await getDB().globalPromptTemplates.delete(id);
  }

  async reorderGlobalPromptTemplates(orderedIds: string[]): Promise<void> {
    const db = getDB();
    const t = now();
    await db.transaction("rw", db.globalPromptTemplates, async () => {
      for (let i = 0; i < orderedIds.length; i++) {
        await db.globalPromptTemplates.update(orderedIds[i], { sortOrder: i, updatedAt: t });
      }
    });
  }

  async listApprovedPromptTemplates(): Promise<GlobalPromptTemplate[]> {
    // 本地 IndexedDB 无法访问他人数据，退化为自己的 approved 行
    const rows = await getDB()
      .globalPromptTemplates.where("status")
      .equals("approved")
      .toArray();
    return rows.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async listSubmittedPromptTemplates(): Promise<GlobalPromptTemplate[]> {
    // 本地 IndexedDB 退化为自己的 submitted 行
    const rows = await getDB()
      .globalPromptTemplates.where("status")
      .equals("submitted")
      .toArray();
    return rows.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  // ─────────────────────────────────────────────────────────────────────────────

  async listWritingStyleSamples(workId: string): Promise<WritingStyleSample[]> {
    return getDB().writingStyleSamples.where("workId").equals(workId).sortBy("sortOrder");
  }

  async addWritingStyleSample(
    workId: string,
    input: Partial<Omit<WritingStyleSample, "id" | "workId" | "sortOrder" | "createdAt" | "updatedAt">>,
  ): Promise<WritingStyleSample> {
    const db = getDB();
    const list = await db.writingStyleSamples.where("workId").equals(workId).sortBy("sortOrder");
    const maxOrder = list.length === 0 ? -1 : Math.max(...list.map((c) => c.sortOrder));
    const t = now();
    const row: WritingStyleSample = {
      id: crypto.randomUUID(),
      workId,
      title: (input.title ?? "").trim() || "未命名样本",
      body: input.body ?? "",
      sortOrder: maxOrder + 1,
      createdAt: t,
      updatedAt: t,
    };
    await db.writingStyleSamples.add(row);
    return row;
  }

  async updateWritingStyleSample(
    id: string,
    patch: Partial<Omit<WritingStyleSample, "id" | "workId">>,
  ): Promise<void> {
    const upd: Record<string, unknown> = { updatedAt: now() };
    if (patch.title !== undefined) upd.title = patch.title.trim() || "未命名样本";
    if (patch.body !== undefined) upd.body = patch.body;
    if (patch.sortOrder !== undefined) upd.sortOrder = patch.sortOrder;
    await getDB().writingStyleSamples.update(id, upd as Partial<WritingStyleSample>);
  }

  async deleteWritingStyleSample(id: string): Promise<void> {
    await getDB().writingStyleSamples.delete(id);
  }

  async reorderWritingStyleSamples(workId: string, orderedIds: string[]): Promise<void> {
    void workId;
    const db = getDB();
    const t = now();
    await db.transaction("rw", db.writingStyleSamples, async () => {
      for (let i = 0; i < orderedIds.length; i++) {
        await db.writingStyleSamples.update(orderedIds[i], { sortOrder: i, updatedAt: t });
      }
    });
  }

  async getWorkStyleCard(workId: string): Promise<WorkStyleCard | undefined> {
    return getDB().workStyleCards.get(workId);
  }

  async upsertWorkStyleCard(
    workId: string,
    patch: Partial<Omit<WorkStyleCard, "id" | "workId" | "updatedAt">>,
  ): Promise<WorkStyleCard> {
    const db = getDB();
    const existing = await db.workStyleCards.get(workId);
    const t = now();
    const next: WorkStyleCard = {
      id: workId,
      workId,
      pov: patch.pov ?? existing?.pov ?? "",
      tone: patch.tone ?? existing?.tone ?? "",
      bannedPhrases: patch.bannedPhrases ?? existing?.bannedPhrases ?? "",
      styleAnchor: patch.styleAnchor ?? existing?.styleAnchor ?? "",
      extraRules: patch.extraRules ?? existing?.extraRules ?? "",
      sentenceRhythm: patch.sentenceRhythm ?? existing?.sentenceRhythm,
      punctuationStyle: patch.punctuationStyle ?? existing?.punctuationStyle,
      dialogueDensity: patch.dialogueDensity ?? existing?.dialogueDensity,
      emotionStyle: patch.emotionStyle ?? existing?.emotionStyle,
      narrativeDistance: patch.narrativeDistance ?? existing?.narrativeDistance,
      updatedAt: t,
    };
    await db.workStyleCards.put(next);
    return next;
  }

  async listInspirationFragments(): Promise<InspirationFragment[]> {
    return getDB().inspirationFragments.orderBy("createdAt").reverse().toArray();
  }

  async addInspirationFragment(
    input: Partial<Omit<InspirationFragment, "id" | "createdAt" | "updatedAt">> & { body: string },
  ): Promise<InspirationFragment> {
    const db = getDB();
    const wid = input.workId ?? null;
    if (wid && !(await db.works.get(wid))) throw new Error("作品不存在");
    const cid = input.collectionId ?? null;
    if (cid && !(await db.inspirationCollections.get(cid))) throw new Error("集合不存在");
    const t = now();
    const row: InspirationFragment = {
      id: crypto.randomUUID(),
      workId: wid,
      collectionId: cid,
      title: input.title?.trim() || undefined,
      sourceName: input.sourceName?.trim() || undefined,
      sourceUrl: input.sourceUrl?.trim() || undefined,
      urlTitle: input.urlTitle?.trim() || undefined,
      urlSite: input.urlSite?.trim() || undefined,
      urlDescription: input.urlDescription?.trim() || undefined,
      urlFetchedAt: typeof input.urlFetchedAt === "number" ? input.urlFetchedAt : undefined,
      links: Array.isArray(input.links) ? input.links : [],
      body: input.body.trim() || "（空碎片）",
      tags: normalizeWorkTagList(input.tags) ?? [],
      isFavorite: input.isFavorite ?? false,
      isPrivate: input.isPrivate ?? false,
      archived: input.archived ?? false,
      createdAt: t,
      updatedAt: t,
    };
    await db.inspirationFragments.add(row);
    return row;
  }

  async updateInspirationFragment(
    id: string,
    patch: Partial<
      Pick<
        InspirationFragment,
        | "body"
        | "tags"
        | "workId"
        | "collectionId"
        | "title"
        | "sourceName"
        | "sourceUrl"
        | "urlTitle"
        | "urlSite"
        | "urlDescription"
        | "urlFetchedAt"
        | "links"
        | "isFavorite"
        | "isPrivate"
        | "archived"
      >
    >,
  ): Promise<void> {
    const db = getDB();
    if (patch.workId !== undefined && patch.workId !== null && !(await db.works.get(patch.workId))) {
      throw new Error("作品不存在");
    }
    if (patch.collectionId !== undefined && patch.collectionId !== null) {
      if (!(await db.inspirationCollections.get(patch.collectionId))) throw new Error("集合不存在");
    }
    const cur = await db.inspirationFragments.get(id);
    if (!cur) throw new Error("碎片不存在");
    const upd: Record<string, unknown> = { updatedAt: now() };
    if (patch.body !== undefined) upd.body = patch.body.trim() || "（空碎片）";
    if (patch.tags !== undefined) upd.tags = normalizeWorkTagList(patch.tags) ?? [];
    if (patch.workId !== undefined) upd.workId = patch.workId;
    if (patch.collectionId !== undefined) upd.collectionId = patch.collectionId;
    if (patch.title !== undefined) upd.title = patch.title?.trim() || undefined;
    if (patch.sourceName !== undefined) upd.sourceName = patch.sourceName?.trim() || undefined;
    if (patch.sourceUrl !== undefined) upd.sourceUrl = patch.sourceUrl?.trim() || undefined;
    if (patch.urlTitle !== undefined) upd.urlTitle = patch.urlTitle?.trim() || undefined;
    if (patch.urlSite !== undefined) upd.urlSite = patch.urlSite?.trim() || undefined;
    if (patch.urlDescription !== undefined) upd.urlDescription = patch.urlDescription?.trim() || undefined;
    if (patch.urlFetchedAt !== undefined) upd.urlFetchedAt = patch.urlFetchedAt ?? undefined;
    if (patch.links !== undefined) upd.links = Array.isArray(patch.links) ? patch.links : [];
    if (patch.isFavorite !== undefined) upd.isFavorite = !!patch.isFavorite;
    if (patch.isPrivate !== undefined) upd.isPrivate = !!patch.isPrivate;
    if (patch.archived !== undefined) upd.archived = !!patch.archived;
    await db.inspirationFragments.update(id, upd as Partial<InspirationFragment>);
  }

  async deleteInspirationFragment(id: string): Promise<void> {
    await getDB().inspirationFragments.delete(id);
  }

  async listInspirationCollections(): Promise<InspirationCollection[]> {
    const rows = await getDB().inspirationCollections.orderBy("sortOrder").toArray();
    return rows.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);
  }

  async addInspirationCollection(
    input: Partial<Omit<InspirationCollection, "id" | "createdAt" | "updatedAt">> & { name: string },
  ): Promise<InspirationCollection> {
    const db = getDB();
    const t = now();
    const existing = await db.inspirationCollections.orderBy("sortOrder").last();
    const sortOrder = (existing?.sortOrder ?? -1) + 1;
    const row: InspirationCollection = {
      id: crypto.randomUUID(),
      name: (input.name ?? "").trim() || "未命名集合",
      sortOrder: input.sortOrder ?? sortOrder,
      createdAt: t,
      updatedAt: t,
    };
    await db.inspirationCollections.add(row);
    return row;
  }

  async updateInspirationCollection(
    id: string,
    patch: Partial<Pick<InspirationCollection, "name" | "sortOrder">>,
  ): Promise<void> {
    const db = getDB();
    const cur = await db.inspirationCollections.get(id);
    if (!cur) throw new Error("集合不存在");
    const upd: Record<string, unknown> = { updatedAt: now() };
    if (patch.name !== undefined) upd.name = (patch.name ?? "").trim() || "未命名集合";
    if (patch.sortOrder !== undefined) upd.sortOrder = patch.sortOrder;
    await db.inspirationCollections.update(id, upd as Partial<InspirationCollection>);
  }

  async deleteInspirationCollection(id: string): Promise<void> {
    const db = getDB();
    await db.inspirationFragments.where("collectionId").equals(id).modify({ collectionId: null });
    await db.inspirationCollections.delete(id);
  }

  async exportAllData(): Promise<{
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
    const db = getDB();
    const works = await db.works.toArray();
    const volumes = await db.volumes.toArray();
    const chapters = await db.chapters.toArray();
    const chapterSnapshots = await db.chapterSnapshots.toArray();
    const referenceLibrary = await db.referenceLibrary.toArray();
    const referenceChunks = await db.referenceChunks.toArray();
    const referenceTokenPostings = await db.referenceTokenPostings.toArray();
    const referenceExcerpts = await db.referenceExcerpts.toArray();
    const referenceTags = await db.referenceTags.toArray();
    const referenceExcerptTags = await db.referenceExcerptTags.toArray();
    const referenceChapterHeads = await db.referenceChapterHeads.toArray();
    const bibleCharacters = await db.bibleCharacters.toArray();
    const bibleWorldEntries = await db.bibleWorldEntries.toArray();
    const bibleForeshadowing = await db.bibleForeshadowing.toArray();
    const bibleTimelineEvents = await db.bibleTimelineEvents.toArray();
    const bibleChapterTemplates = await db.bibleChapterTemplates.toArray();
    const chapterBible = await db.chapterBible.toArray();
    const bibleGlossaryTerms = await db.bibleGlossaryTerms.toArray();
    const workStyleCards = await db.workStyleCards.toArray();
    const inspirationCollections = await db.inspirationCollections.toArray();
    const inspirationFragments = await db.inspirationFragments.toArray();
    const writingPromptTemplates = await db.writingPromptTemplates.toArray();
    const writingStyleSamples = await db.writingStyleSamples.toArray();
    const logicPlaceNodes = await db.logicPlaceNodes.toArray();
    const logicPlaceEvents = await db.logicPlaceEvents.toArray();
    return {
      works,
      volumes,
      chapters,
      chapterSnapshots,
      referenceLibrary,
      referenceChunks,
      referenceTokenPostings,
      referenceExcerpts,
      referenceTags,
      referenceExcerptTags,
      referenceChapterHeads,
      bibleCharacters,
      bibleWorldEntries,
      bibleForeshadowing,
      bibleTimelineEvents,
      bibleChapterTemplates,
      chapterBible,
      bibleGlossaryTerms,
      workStyleCards,
      inspirationCollections,
      inspirationFragments,
      writingPromptTemplates,
      writingStyleSamples,
      logicPlaceNodes,
      logicPlaceEvents,
    };
  }

  async importAllData(data: {
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
    const normalized = normalizeImportRows(data);
    const refLib = data.referenceLibrary ?? [];
    const refChunks = data.referenceChunks ?? [];
    const refChapterHeads = data.referenceChapterHeads ?? [];
    const refPostings = data.referenceTokenPostings ?? [];
    const refExcerpts = data.referenceExcerpts ?? [];
    const refTags = data.referenceTags ?? [];
    const refExcerptTags = data.referenceExcerptTags ?? [];
    const bibleCharacters = data.bibleCharacters ?? [];
    const bibleWorldEntries = data.bibleWorldEntries ?? [];
    const bibleForeshadowing = data.bibleForeshadowing ?? [];
    const bibleTimelineEvents = data.bibleTimelineEvents ?? [];
    const bibleChapterTemplates = data.bibleChapterTemplates ?? [];
    const chapterBible = data.chapterBible ?? [];
    const bibleGlossaryTerms = data.bibleGlossaryTerms ?? [];
    const workStyleCards = data.workStyleCards ?? [];
    const inspirationCollections = data.inspirationCollections ?? [];
    const inspirationFragments = data.inspirationFragments ?? [];
    const writingPromptTemplates = data.writingPromptTemplates ?? [];
    const writingStyleSamples = data.writingStyleSamples ?? [];
    const logicPlaceNodes = data.logicPlaceNodes ?? [];
    const logicPlaceEvents = data.logicPlaceEvents ?? [];
    const db = getDB();
    await db.transaction(
      "rw",
      [
        db.works,
        db.chapters,
        db.volumes,
        db.chapterSnapshots,
        db.referenceLibrary,
        db.referenceChunks,
        db.referenceTokenPostings,
        db.referenceExcerpts,
        db.referenceTags,
        db.referenceExcerptTags,
        db.referenceChapterHeads,
        db.bibleCharacters,
        db.bibleWorldEntries,
        db.bibleForeshadowing,
        db.bibleTimelineEvents,
        db.bibleChapterTemplates,
        db.chapterBible,
        db.bibleGlossaryTerms,
        db.workStyleCards,
        db.inspirationCollections,
        db.inspirationFragments,
        db.writingPromptTemplates,
        db.writingStyleSamples,
        db.logicPlaceNodes,
        db.logicPlaceEvents,
      ],
      async () => {
        await db.referenceTokenPostings.clear();
        await db.referenceExcerptTags.clear();
        await db.referenceTags.clear();
        await db.referenceExcerpts.clear();
        await db.referenceChapterHeads.clear();
        await db.referenceChunks.clear();
        await db.referenceLibrary.clear();
        await db.bibleGlossaryTerms.clear();
        await db.chapterBible.clear();
        await db.bibleChapterTemplates.clear();
        await db.bibleTimelineEvents.clear();
        await db.bibleForeshadowing.clear();
        await db.bibleWorldEntries.clear();
        await db.bibleCharacters.clear();
        await db.workStyleCards.clear();
        await db.inspirationFragments.clear();
        await db.inspirationCollections.clear();
        await db.writingPromptTemplates.clear();
        await db.writingStyleSamples.clear();
        await db.logicPlaceEvents.clear();
        await db.logicPlaceNodes.clear();
        await db.chapterSnapshots.clear();
        await db.chapters.clear();
        await db.volumes.clear();
        await db.works.clear();
        if (normalized.works.length) await db.works.bulkAdd(normalized.works);
        if (normalized.volumes.length) await db.volumes.bulkAdd(normalized.volumes);
        if (normalized.chapters.length) await db.chapters.bulkAdd(normalized.chapters);
        if (normalized.chapterSnapshots.length) {
          await db.chapterSnapshots.bulkAdd(normalized.chapterSnapshots);
        }
        if (refLib.length) {
          await db.referenceLibrary.bulkAdd(
            refLib.map((r) => ({
              ...r,
              category: r.category ?? "",
              chapterHeadCount: r.chapterHeadCount ?? 0,
            })),
          );
        }
        if (refChunks.length) {
          await db.referenceChunks.bulkAdd(
            refChunks.map((c) => ({
              ...c,
              isChapterHead: c.isChapterHead ?? false,
              embeddings: c.embeddings ?? null,
            })),
          );
        }
        if (refChapterHeads.length) await db.referenceChapterHeads.bulkAdd(refChapterHeads);
        if (refPostings.length) await db.referenceTokenPostings.bulkAdd(refPostings);
        if (refExcerpts.length) {
          await db.referenceExcerpts.bulkAdd(
            refExcerpts.map((e) => ({
              ...e,
              linkedWorkId: e.linkedWorkId ?? null,
              linkedChapterId: e.linkedChapterId ?? null,
            })),
          );
        }
        if (refTags.length) await db.referenceTags.bulkAdd(refTags);
        if (refExcerptTags.length) await db.referenceExcerptTags.bulkAdd(refExcerptTags);
        if (bibleCharacters.length) await db.bibleCharacters.bulkAdd(bibleCharacters);
        if (bibleWorldEntries.length) await db.bibleWorldEntries.bulkAdd(bibleWorldEntries);
        if (bibleForeshadowing.length) await db.bibleForeshadowing.bulkAdd(bibleForeshadowing);
        if (bibleTimelineEvents.length) await db.bibleTimelineEvents.bulkAdd(bibleTimelineEvents);
        if (bibleChapterTemplates.length) await db.bibleChapterTemplates.bulkAdd(bibleChapterTemplates);
        if (chapterBible.length) await db.chapterBible.bulkAdd(chapterBible);
        if (bibleGlossaryTerms.length) await db.bibleGlossaryTerms.bulkAdd(bibleGlossaryTerms);
        if (workStyleCards.length) {
          await db.workStyleCards.bulkAdd(
            workStyleCards.map((r) => ({
              ...r,
              id: r.id || r.workId,
              workId: r.workId || r.id,
              updatedAt: r.updatedAt ?? now(),
              pov: r.pov ?? "",
              tone: r.tone ?? "",
              bannedPhrases: r.bannedPhrases ?? "",
              styleAnchor: r.styleAnchor ?? "",
              extraRules: r.extraRules ?? "",
            })),
          );
        }
        if (inspirationCollections.length) {
          await db.inspirationCollections.bulkAdd(
            inspirationCollections.map((c) => ({
              ...c,
              name: (c.name ?? "").trim() || "未命名集合",
              sortOrder: c.sortOrder ?? 0,
              createdAt: c.createdAt ?? now(),
              updatedAt: c.updatedAt ?? now(),
            })),
          );
        }
        if (inspirationFragments.length) {
          await db.inspirationFragments.bulkAdd(
            inspirationFragments.map((f) => ({
              ...f,
              workId: f.workId ?? null,
              collectionId: f.collectionId ?? null,
              tags: normalizeWorkTagList(f.tags) ?? [],
              body: (f.body ?? "").trim() || "（空碎片）",
              createdAt: f.createdAt ?? now(),
              updatedAt: f.updatedAt ?? now(),
            })),
          );
        }
        if (writingPromptTemplates.length) {
          await db.writingPromptTemplates.bulkAdd(
            writingPromptTemplates.map((p) => ({
              ...p,
              category: (p.category ?? "").trim(),
              title: (p.title ?? "").trim() || "未命名模板",
              body: p.body ?? "",
              sortOrder: p.sortOrder ?? 0,
              createdAt: p.createdAt ?? now(),
              updatedAt: p.updatedAt ?? now(),
            })),
          );
        }
        if (writingStyleSamples.length) {
          await db.writingStyleSamples.bulkAdd(
            writingStyleSamples.map((s) => ({
              ...s,
              title: (s.title ?? "").trim() || "未命名样本",
              body: s.body ?? "",
              sortOrder: s.sortOrder ?? 0,
              createdAt: s.createdAt ?? now(),
              updatedAt: s.updatedAt ?? now(),
            })),
          );
        }
        if (logicPlaceNodes.length) {
          await db.logicPlaceNodes.bulkAdd(
            logicPlaceNodes.map((p) => ({
              ...p,
              name: (p.name ?? "").trim() || "地点",
              note: p.note ?? "",
              x: Number.isFinite(p.x) ? Math.max(0, Math.min(100, Math.round(p.x))) : 50,
              y: Number.isFinite(p.y) ? Math.max(0, Math.min(100, Math.round(p.y))) : 50,
              createdAt: p.createdAt ?? now(),
              updatedAt: p.updatedAt ?? now(),
            })),
          );
        }
        if (logicPlaceEvents.length) {
          await db.logicPlaceEvents.bulkAdd(
            logicPlaceEvents.map((ev) => ({
              ...ev,
              label: (ev.label ?? "").trim() || "事件",
              note: ev.note ?? "",
              chapterId: ev.chapterId ?? null,
              createdAt: ev.createdAt ?? now(),
              updatedAt: ev.updatedAt ?? now(),
            })),
          );
        }
      },
    );
    if (refChunks.length > 0 && refChapterHeads.length === 0) {
      const ids = [...new Set(refChunks.map((c) => c.refWorkId))];
      for (const rid of ids) {
        await this.syncChapterMetadataForRefWork(rid);
      }
    } else if (refChunks.length > 0 && refPostings.length === 0) {
      await this.rebuildAllReferenceSearchIndex();
    }
  }

  async importAllDataMerge(data: {
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
    const m = remapImportMergePayload(data, now);
    await this.bulkAddFullMergeRemap(m);
    const db = getDB();
    const nodes = data.logicPlaceNodes ?? [];
    const events = data.logicPlaceEvents ?? [];
    if (nodes.length || events.length) {
      await db.transaction("rw", [db.logicPlaceNodes, db.logicPlaceEvents], async () => {
        for (const n of nodes) {
          const existing = await db.logicPlaceNodes.get(n.id);
          if (existing) continue;
          await db.logicPlaceNodes.add({
            ...n,
            name: (n.name ?? "").trim() || "地点",
            note: n.note ?? "",
            x: Number.isFinite(n.x) ? Math.max(0, Math.min(100, Math.round(n.x))) : 50,
            y: Number.isFinite(n.y) ? Math.max(0, Math.min(100, Math.round(n.y))) : 50,
            createdAt: n.createdAt ?? now(),
            updatedAt: n.updatedAt ?? now(),
          });
        }
        for (const ev of events) {
          const existing = await db.logicPlaceEvents.get(ev.id);
          if (existing) continue;
          await db.logicPlaceEvents.add({
            ...ev,
            label: (ev.label ?? "").trim() || "事件",
            note: ev.note ?? "",
            chapterId: ev.chapterId ?? null,
            createdAt: ev.createdAt ?? now(),
            updatedAt: ev.updatedAt ?? now(),
          });
        }
      });
    }
  }

  /**
   * Hybrid 存储：合并导入时仅把参考库相关行写入 IndexedDB（写作侧已由 Supabase 写入）。
   */
  async applyRemappedMergeReferenceOnly(m: MergeRemapResult): Promise<void> {
    const db = getDB();
    await db.transaction(
      "rw",
      [
        db.referenceLibrary,
        db.referenceChunks,
        db.referenceExcerpts,
        db.referenceTags,
        db.referenceExcerptTags,
        db.referenceChapterHeads,
      ],
      async () => {
        if (m.newRefLib.length) await db.referenceLibrary.bulkAdd(m.newRefLib);
        if (m.newRefChunks.length) await db.referenceChunks.bulkAdd(m.newRefChunks);
        if (m.newRefChapterHeads.length) await db.referenceChapterHeads.bulkAdd(m.newRefChapterHeads);
        if (m.newExcerpts.length) await db.referenceExcerpts.bulkAdd(m.newExcerpts);
        if (m.newTags.length) await db.referenceTags.bulkAdd(m.newTags);
        if (m.newExcerptTags.length) await db.referenceExcerptTags.bulkAdd(m.newExcerptTags);
      },
    );
    for (const r of m.newRefLib) {
      await this.rebuildReferenceSearchIndexForRefWork(r.id);
    }
  }

  /**
   * Hybrid：全量导入时仅替换参考库相关表（写作数据已由 Supabase 写入）。
   */
  async importReferenceOnlyReplace(data: {
    referenceLibrary?: ReferenceLibraryEntry[];
    referenceChunks?: ReferenceChunk[];
    referenceTokenPostings?: ReferenceTokenPosting[];
    referenceExcerpts?: ReferenceExcerpt[];
    referenceTags?: ReferenceTag[];
    referenceExcerptTags?: ReferenceExcerptTag[];
    referenceChapterHeads?: ReferenceChapterHead[];
  }): Promise<void> {
    const refLib = data.referenceLibrary ?? [];
    const refChunks = data.referenceChunks ?? [];
    const refChapterHeads = data.referenceChapterHeads ?? [];
    const refPostings = data.referenceTokenPostings ?? [];
    const refExcerpts = data.referenceExcerpts ?? [];
    const refTags = data.referenceTags ?? [];
    const refExcerptTags = data.referenceExcerptTags ?? [];
    const db = getDB();
    await db.transaction(
      "rw",
      [
        db.referenceLibrary,
        db.referenceChunks,
        db.referenceTokenPostings,
        db.referenceExcerpts,
        db.referenceTags,
        db.referenceExcerptTags,
        db.referenceChapterHeads,
      ],
      async () => {
        await db.referenceTokenPostings.clear();
        await db.referenceExcerptTags.clear();
        await db.referenceTags.clear();
        await db.referenceExcerpts.clear();
        await db.referenceChapterHeads.clear();
        await db.referenceChunks.clear();
        await db.referenceLibrary.clear();
        if (refLib.length) {
          await db.referenceLibrary.bulkAdd(
            refLib.map((r) => ({
              ...r,
              category: r.category ?? "",
              chapterHeadCount: r.chapterHeadCount ?? 0,
            })),
          );
        }
        if (refChunks.length) {
          await db.referenceChunks.bulkAdd(
            refChunks.map((c) => ({
              ...c,
              isChapterHead: c.isChapterHead ?? false,
              embeddings: c.embeddings ?? null,
            })),
          );
        }
        if (refChapterHeads.length) await db.referenceChapterHeads.bulkAdd(refChapterHeads);
        if (refPostings.length) await db.referenceTokenPostings.bulkAdd(refPostings);
        if (refExcerpts.length) {
          await db.referenceExcerpts.bulkAdd(
            refExcerpts.map((e) => ({
              ...e,
              linkedWorkId: e.linkedWorkId ?? null,
              linkedChapterId: e.linkedChapterId ?? null,
            })),
          );
        }
        if (refTags.length) await db.referenceTags.bulkAdd(refTags);
        if (refExcerptTags.length) await db.referenceExcerptTags.bulkAdd(refExcerptTags);
      },
    );
    if (refChunks.length > 0 && refChapterHeads.length === 0) {
      const ids = [...new Set(refChunks.map((c) => c.refWorkId))];
      for (const rid of ids) {
        await this.syncChapterMetadataForRefWork(rid);
      }
    } else if (refChunks.length > 0 && refPostings.length === 0) {
      await this.rebuildAllReferenceSearchIndex();
    }
  }

  private async bulkAddFullMergeRemap(m: MergeRemapResult): Promise<void> {
    const db = getDB();
    await db.transaction(
      "rw",
      [
        db.works,
        db.chapters,
        db.volumes,
        db.chapterSnapshots,
        db.referenceLibrary,
        db.referenceChunks,
        db.referenceExcerpts,
        db.referenceTags,
        db.referenceExcerptTags,
        db.referenceChapterHeads,
        db.bibleCharacters,
        db.bibleWorldEntries,
        db.bibleForeshadowing,
        db.bibleTimelineEvents,
        db.bibleChapterTemplates,
        db.chapterBible,
        db.bibleGlossaryTerms,
        db.workStyleCards,
        db.inspirationCollections,
        db.inspirationFragments,
        db.writingPromptTemplates,
        db.writingStyleSamples,
      ],
      async () => {
        if (m.newWorks.length) await db.works.bulkAdd(m.newWorks);
        if (m.newVolumes.length) await db.volumes.bulkAdd(m.newVolumes);
        if (m.newChapters.length) await db.chapters.bulkAdd(m.newChapters);
        if (m.newSnaps.length) await db.chapterSnapshots.bulkAdd(m.newSnaps);
        if (m.newRefLib.length) await db.referenceLibrary.bulkAdd(m.newRefLib);
        if (m.newRefChunks.length) await db.referenceChunks.bulkAdd(m.newRefChunks);
        if (m.newRefChapterHeads.length) await db.referenceChapterHeads.bulkAdd(m.newRefChapterHeads);
        if (m.newExcerpts.length) await db.referenceExcerpts.bulkAdd(m.newExcerpts);
        if (m.newTags.length) await db.referenceTags.bulkAdd(m.newTags);
        if (m.newExcerptTags.length) await db.referenceExcerptTags.bulkAdd(m.newExcerptTags);
        if (m.newBibleChars.length) await db.bibleCharacters.bulkAdd(m.newBibleChars);
        if (m.newBibleWorld.length) await db.bibleWorldEntries.bulkAdd(m.newBibleWorld);
        if (m.newBibleFore.length) await db.bibleForeshadowing.bulkAdd(m.newBibleFore);
        if (m.newBibleTime.length) await db.bibleTimelineEvents.bulkAdd(m.newBibleTime);
        if (m.newBibleTpl.length) await db.bibleChapterTemplates.bulkAdd(m.newBibleTpl);
        if (m.newChapterBible.length) await db.chapterBible.bulkAdd(m.newChapterBible);
        if (m.newBibleGloss.length) await db.bibleGlossaryTerms.bulkAdd(m.newBibleGloss);
        if (m.newStyleCards.length) await db.workStyleCards.bulkAdd(m.newStyleCards);
        if (m.newInspirationCollections.length) await db.inspirationCollections.bulkAdd(m.newInspirationCollections);
        if (m.newInspirationFragments.length) await db.inspirationFragments.bulkAdd(m.newInspirationFragments);
        if (m.newWritingPromptTemplates.length) {
          await db.writingPromptTemplates.bulkAdd(m.newWritingPromptTemplates);
        }
        if (m.newWritingStyleSamples.length) {
          await db.writingStyleSamples.bulkAdd(m.newWritingStyleSamples);
        }
      },
    );
    for (const r of m.newRefLib) {
      await this.rebuildReferenceSearchIndexForRefWork(r.id);
    }
  }
}
