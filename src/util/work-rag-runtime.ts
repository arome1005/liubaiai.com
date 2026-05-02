/**
 * 步 24：本书锦囊导出 / 章节正文 **运行时** 分块 + 混合打分（无持久倒排表）。
 * 藏经仍用 IndexedDB `referenceChunks` + `referenceTokenPostings`。
 */
import type { Chapter, ReferenceChunk, ReferenceSearchHit } from "../db/types";
import { buildBibleMarkdownExport } from "../storage/bible-markdown";
import { refineHybridHit, tokenizeQuery, MAX_HYBRID_CHUNKS_TO_SCORE } from "../storage/reference-search-index";
import { getWritingStore } from "../storage/instance";

/** 与藏经导入分块不同：本书内检索用较小块以提高定位粒度 */
export const WORK_RAG_CHUNK_CHAR_TARGET = 4096;

/** 单请求内正文块池上限（控制内存与耗时） */
const MAX_MANUSCRIPT_CHUNKS_TO_POOL = 420;

export type WritingRagSources = {
  referenceLibrary: boolean;
  workBibleExport: boolean;
  workManuscript: boolean;
};

/** 默认全关：避免未勾选时仍检索藏经消耗 token；启用 RAG 后按需勾选范围 */
export const DEFAULT_WRITING_RAG_SOURCES: WritingRagSources = {
  referenceLibrary: false,
  workBibleExport: false,
  workManuscript: false,
};

function toRefChunk(partial: Pick<ReferenceChunk, "id" | "refWorkId" | "ordinal" | "content">): ReferenceChunk {
  return {
    id: partial.id,
    refWorkId: partial.refWorkId,
    ordinal: partial.ordinal,
    content: partial.content,
    embeddings: null,
    isChapterHead: false,
  };
}

export function chunkPlainText(text: string, targetChars: number): string[] {
  const t = text.trim();
  if (!t) return [];
  const out: string[] = [];
  for (let i = 0; i < t.length; i += targetChars) {
    out.push(t.slice(i, i + targetChars));
  }
  return out;
}

/** 进度游标及之前的章节（按 order）；游标为空则全书 */
export function filterChaptersByProgressCursor(chapters: Chapter[], progressCursorChapterId: string | null | undefined): Chapter[] {
  const sorted = [...chapters].sort((a, b) => a.order - b.order);
  if (!progressCursorChapterId) return sorted;
  const idx = sorted.findIndex((c) => c.id === progressCursorChapterId);
  if (idx < 0) return sorted;
  return sorted.slice(0, idx + 1);
}

function candidateChunksFromPool(
  pool: ReferenceChunk[],
  rawQuery: string,
  tokens: string[],
): ReferenceChunk[] {
  const q = rawQuery.trim();
  const out: ReferenceChunk[] = [];
  for (const ch of pool) {
    if (out.length >= MAX_HYBRID_CHUNKS_TO_SCORE) break;
    const content = ch.content;
    if (q && content.includes(q)) {
      out.push(ch);
      continue;
    }
    let hit = false;
    for (const t of tokens) {
      if (t && content.includes(t)) {
        hit = true;
        break;
      }
    }
    if (hit) out.push(ch);
  }
  return out;
}

function scoreChunks(rawQuery: string, tokens: string[], chunks: ReferenceChunk[]): Array<{ draft: ReferenceSearchHit; score: number }> {
  const rows: Array<{ draft: ReferenceSearchHit; score: number }> = [];
  for (const ch of chunks) {
    const r = refineHybridHit(rawQuery, tokens, ch);
    if (!r) continue;
    const d = r.draft;
    rows.push({
      score: r.score,
      draft: {
        refWorkId: d.refWorkId,
        refTitle: "",
        chunkId: d.chunkId,
        ordinal: d.ordinal,
        matchCount: d.matchCount,
        preview: d.preview,
        snippetBefore: d.snippetBefore,
        snippetMatch: d.snippetMatch,
        snippetAfter: d.snippetAfter,
        highlightStart: d.highlightStart,
        highlightEnd: d.highlightEnd,
      },
    });
  }
  return rows;
}

async function loadBibleMarkdownExport(workId: string): Promise<string> {
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

function searchRuntimeChunksAsHits(args: {
  workId: string;
  query: string;
  limit: number;
  labelPrefix: string;
  parts: string[];
  ordinalOffset?: number;
}): ReferenceSearchHit[] {
  const q = args.query.trim();
  if (!q || args.limit <= 0 || args.parts.length === 0) return [];
  const tokens = tokenizeQuery(q);
  const pool: ReferenceChunk[] = args.parts.map((content, i) =>
    toRefChunk({
      id: `runtime-${args.labelPrefix}-${args.ordinalOffset ?? 0}-${i}`,
      refWorkId: args.workId,
      ordinal: (args.ordinalOffset ?? 0) + i,
      content,
    }),
  );
  const candidates = candidateChunksFromPool(pool, q, tokens);
  const scored = scoreChunks(q, tokens, candidates);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, args.limit).map(({ draft: d }) => ({
    ...d,
    refTitle: `${args.labelPrefix} · 段 ${d.ordinal + 1}`,
  }));
}

function buildManuscriptChunkPool(
  chapters: Chapter[],
  excludeChapterId: string | null | undefined,
): ReferenceChunk[] {
  const pool: ReferenceChunk[] = [];
  let ord = 0;
  outer: for (const ch of chapters) {
    if (excludeChapterId && ch.id === excludeChapterId) continue;
    const body = (ch.content ?? "").trim();
    if (!body) continue;
    const parts = chunkPlainText(body, WORK_RAG_CHUNK_CHAR_TARGET);
    for (let i = 0; i < parts.length; i++) {
      if (pool.length >= MAX_MANUSCRIPT_CHUNKS_TO_POOL) break outer;
      const content = parts[i]!;
      pool.push(
        toRefChunk({
          id: `runtime-ms|${ch.id}|${i}`,
          refWorkId: ch.workId,
          ordinal: ord++,
          content,
        }),
      );
    }
  }
  return pool;
}

function searchManuscriptHits(args: {
  workId: string;
  query: string;
  limit: number;
  chapters: Chapter[];
  excludeChapterId: string | null | undefined;
}): ReferenceSearchHit[] {
  const q = args.query.trim();
  if (!q || args.limit <= 0) return [];
  const tokens = tokenizeQuery(q);
  const pool = buildManuscriptChunkPool(args.chapters, args.excludeChapterId);
  const candidates = candidateChunksFromPool(pool, q, tokens);
  const scored = scoreChunks(q, tokens, candidates);
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, args.limit);
  const chapterById = new Map(args.chapters.map((c) => [c.id, c]));
  return top.map(({ draft: d }) => {
    const parts = d.chunkId.split("|");
    const chId = parts.length >= 3 ? parts[1] : "";
    const chunkIdx = parts.length >= 3 ? parseInt(parts[2]!, 10) : 0;
    const ch = chId ? chapterById.get(chId) : undefined;
    const title = (ch?.title ?? "").trim() || "未命名章节";
    return {
      ...d,
      refTitle: `正文 · ${title} · 段 ${chunkIdx + 1}`,
    };
  });
}

function allocateSlots(k: number, sources: WritingRagSources): { ref: number; bible: number; ms: number } {
  const order: Array<"ref" | "bible" | "ms"> = [];
  if (sources.referenceLibrary) order.push("ref");
  if (sources.workBibleExport) order.push("bible");
  if (sources.workManuscript) order.push("ms");
  if (order.length === 0 || k <= 0) return { ref: 0, bible: 0, ms: 0 };
  const base = Math.floor(k / order.length);
  const rem = k % order.length;
  let ref = 0;
  let bible = 0;
  let ms = 0;
  for (let i = 0; i < order.length; i++) {
    const slot = base + (i < rem ? 1 : 0);
    const key = order[i]!;
    if (key === "ref") ref = slot;
    else if (key === "bible") bible = slot;
    else ms = slot;
  }
  return { ref, bible, ms };
}

/**
 * 多源合并：藏经 hybrid + 本书锦囊分块 + 本书正文分块；顺序为 **藏经 → 锦囊 → 正文**，再整体 `slice(0, limit)`。
 */
export async function searchWritingRagMerged(args: {
  workId: string;
  query: string;
  limit: number;
  sources: WritingRagSources;
  chapters: Chapter[];
  progressCursorChapterId?: string | null;
  excludeManuscriptChapterId?: string | null;
  /** 已加载的锦囊导出 Markdown（与「注入本书锦囊」同源时可传入，避免二次聚合） */
  bibleMarkdownOverride?: string;
}): Promise<ReferenceSearchHit[]> {
  const q = args.query.trim();
  const k = Math.max(0, Math.min(20, args.limit));
  if (!q || k === 0) return [];

  const src = { ...DEFAULT_WRITING_RAG_SOURCES, ...args.sources };
  if (!src.referenceLibrary && !src.workBibleExport && !src.workManuscript) {
    return [];
  }

  const slots = allocateSlots(k, src);
  const store = getWritingStore();
  const out: ReferenceSearchHit[] = [];

  if (slots.ref > 0 && src.referenceLibrary) {
    const refHits = await store.searchReferenceLibrary(q, { limit: slots.ref, mode: "hybrid" });
    out.push(...refHits);
  }

  if (slots.bible > 0 && src.workBibleExport) {
    let md = (args.bibleMarkdownOverride ?? "").trim();
    if (!md) md = (await loadBibleMarkdownExport(args.workId)).trim();
    const parts = chunkPlainText(md, WORK_RAG_CHUNK_CHAR_TARGET);
    out.push(
      ...searchRuntimeChunksAsHits({
        workId: args.workId,
        query: q,
        limit: slots.bible,
        labelPrefix: "本书锦囊",
        parts,
        ordinalOffset: 0,
      }),
    );
  }

  if (slots.ms > 0 && src.workManuscript) {
    const scoped = filterChaptersByProgressCursor(args.chapters, args.progressCursorChapterId);
    out.push(
      ...searchManuscriptHits({
        workId: args.workId,
        query: q,
        limit: slots.ms,
        chapters: scoped,
        excludeChapterId: args.excludeManuscriptChapterId,
      }),
    );
  }

  return out.slice(0, k);
}

export function isRuntimeRagHit(hit: ReferenceSearchHit): boolean {
  return hit.chunkId.startsWith("runtime-");
}
