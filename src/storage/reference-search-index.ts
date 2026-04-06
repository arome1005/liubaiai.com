import type { ReferenceChunk, ReferenceTokenPosting } from "../db/types";
import { REFERENCE_CHAPTER_HEAD_POSTING_TOKEN } from "./chapter-detector";

/** 单 token 在单块内最多记录的命中偏移 */
export const MAX_OFFSETS_PER_POSTING = 32;
/** 单 token 全局最多参与的结果块数 */
export const MAX_CHUNKS_PER_TOKEN_QUERY = 800;
/** 混合检索：参与打分的最大块数（控制内存与耗时） */
export const MAX_HYBRID_CHUNKS_TO_SCORE = 640;

const MAX_TOKEN_LEN = 48;

function normalizeToken(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (t.length > MAX_TOKEN_LEN) return t.slice(0, MAX_TOKEN_LEN);
  if (/^[a-zA-Z0-9]+$/.test(t)) return t.toLowerCase();
  return t;
}

let segmenter: Intl.Segmenter | null | undefined;

function getSegmenter(): Intl.Segmenter | null {
  if (segmenter !== undefined) return segmenter;
  try {
    segmenter = new Intl.Segmenter("zh-Hans", { granularity: "word" });
  } catch {
    segmenter = null;
  }
  return segmenter;
}

/** 建索引分词 */
export function tokenizeForIndex(text: string): string[] {
  const out: string[] = [];
  const seg = getSegmenter();
  if (seg) {
    for (const s of seg.segment(text)) {
      const part = typeof s.segment === "string" ? s.segment : String(s.segment);
      const n = normalizeToken(part);
      if (n.length >= 1) out.push(n);
    }
  } else {
    for (const part of text.split(/[\s\n\r\t，。！？、；：""''（）【】《》]+/u)) {
      const n = normalizeToken(part);
      if (n.length >= 1) out.push(n);
    }
  }
  if (!seg) {
    const s = text.replace(/\s+/g, "");
    for (let i = 0; i < s.length - 1; i++) {
      const bi = s.slice(i, i + 2);
      if (/^[\u4e00-\u9fff]{2}$/.test(bi)) out.push(bi);
    }
  }
  return out;
}

export function tokenizeQuery(text: string): string[] {
  const raw = text.trim();
  if (!raw) return [];
  return tokenizeForIndex(raw);
}

/** 单块生成倒排行 */
export function buildPostingRowsForChunk(
  chunkId: string,
  refWorkId: string,
  ordinal: number,
  content: string,
  /** 本块内章节标题行的 UTF-16 偏移；有则额外写入保留 token 倒排行 */
  chapterOffsetsInChunk?: number[],
): ReferenceTokenPosting[] {
  const tokenToOffsets = new Map<string, number[]>();
  const seenTokens = new Set(tokenizeForIndex(content));

  for (const tok of seenTokens) {
    if (!tok) continue;
    let from = 0;
    while (from < content.length) {
      const idx = content.indexOf(tok, from);
      if (idx < 0) break;
      const list = tokenToOffsets.get(tok) ?? [];
      if (list.length < MAX_OFFSETS_PER_POSTING) list.push(idx);
      tokenToOffsets.set(tok, list);
      from = idx + Math.max(1, tok.length);
    }
  }

  const rows: ReferenceTokenPosting[] = [];
  const dedupe = new Set<string>();
  for (const [token, offsets] of tokenToOffsets) {
    if (!token || offsets.length === 0) continue;
    const key = `${chunkId}\0${token}`;
    if (dedupe.has(key)) continue;
    dedupe.add(key);
    offsets.sort((a, b) => a - b);
    rows.push({
      id: crypto.randomUUID(),
      token,
      refWorkId,
      chunkId,
      ordinal,
      offsetsJson: JSON.stringify(offsets),
    });
  }
  if (chapterOffsetsInChunk && chapterOffsetsInChunk.length > 0) {
    const sorted = [...chapterOffsetsInChunk].sort((a, b) => a - b);
    rows.push({
      id: crypto.randomUUID(),
      token: REFERENCE_CHAPTER_HEAD_POSTING_TOKEN,
      refWorkId,
      chunkId,
      ordinal,
      offsetsJson: JSON.stringify(sorted),
    });
  }
  return rows;
}

export type ReferenceSearchHitDraft = {
  refWorkId: string;
  chunkId: string;
  ordinal: number;
  matchCount: number;
  highlightStart: number;
  highlightEnd: number;
  preview: string;
  snippetBefore: string;
  snippetMatch: string;
  snippetAfter: string;
};

const SNIPPET_BEFORE = 72;
const SNIPPET_AFTER = 96;

function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function previewAround(content: string, start: number, end: number): string {
  const pad = 48;
  const a = Math.max(0, start - pad);
  const b = Math.min(content.length, end + pad);
  const slice = content.slice(a, b).replace(/\s+/g, " ").trim();
  return slice.length ? `…${slice}…` : "…";
}

/** 搜索引擎式：前 / 命中 / 后 三段，便于列表预览 */
export function buildSnippetParts(
  content: string,
  start: number,
  end: number,
): { before: string; match: string; after: string; preview: string } {
  const a = Math.max(0, start - SNIPPET_BEFORE);
  const b = Math.min(content.length, end + SNIPPET_AFTER);
  const beforeRaw = content.slice(a, start);
  const matchRaw = content.slice(start, end);
  const afterRaw = content.slice(end, b);
  const before = (a > 0 ? "…" : "") + oneLine(beforeRaw);
  const match = oneLine(matchRaw);
  const after = oneLine(afterRaw) + (b < content.length ? "…" : "");
  return {
    before,
    match,
    after,
    preview: previewAround(content, start, end),
  };
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let pos = 0;
  while (pos < haystack.length) {
    const i = haystack.indexOf(needle, pos);
    if (i < 0) break;
    count++;
    pos = i + Math.max(1, needle.length);
  }
  return count;
}

/**
 * 混合检索单块：多词任一命中即可入候选；整句字面量加权；摘要优先整句否则最长词。
 */
export function refineHybridHit(
  rawQuery: string,
  tokens: string[],
  chunk: ReferenceChunk,
): { draft: ReferenceSearchHitDraft; score: number } | null {
  const q = rawQuery.trim();
  const content = chunk.content;
  const unique = [...new Set(tokens.filter((t) => t.length > 0))];

  const literalCount = q ? countOccurrences(content, q) : 0;
  const tokenCounts = new Map<string, number>();
  for (const t of unique) {
    tokenCounts.set(t, countOccurrences(content, t));
  }
  const tokensHit = [...tokenCounts.values()].filter((c) => c > 0).length;
  if (literalCount === 0 && tokensHit === 0) return null;

  let score = 0;
  if (literalCount > 0) {
    score += 8000 + literalCount * 24;
  }
  score += tokensHit * 160;
  for (const [, c] of tokenCounts) {
    if (c > 0) score += Math.min(c, 18) * 9;
  }

  let start = 0;
  let end = 0;
  let matchCount = 0;

  if (literalCount > 0) {
    start = content.indexOf(q);
    end = start + q.length;
    matchCount = literalCount;
  } else {
    const withHits = unique.filter((t) => (tokenCounts.get(t) ?? 0) > 0);
    withHits.sort((a, b) => b.length - a.length);
    const pick = withHits[0]!;
    start = content.indexOf(pick);
    end = start + pick.length;
    matchCount = [...tokenCounts.entries()]
      .filter(([, c]) => c > 0)
      .reduce((s, [, c]) => s + Math.min(c, 6), 0);
  }

  const sn = buildSnippetParts(content, start, end);
  const draft: ReferenceSearchHitDraft = {
    refWorkId: chunk.refWorkId,
    chunkId: chunk.id,
    ordinal: chunk.ordinal,
    matchCount,
    highlightStart: start,
    highlightEnd: end,
    preview: sn.preview,
    snippetBefore: sn.before,
    snippetMatch: sn.match,
    snippetAfter: sn.after,
  };
  return { draft, score };
}

export function refineLiteralHits(query: string, chunks: ReferenceChunk[]): ReferenceSearchHitDraft[] {
  const q = query.trim();
  if (!q) return [];
  const hits: ReferenceSearchHitDraft[] = [];
  for (const ch of chunks) {
    let count = 0;
    let pos = 0;
    while (pos < ch.content.length) {
      const i = ch.content.indexOf(q, pos);
      if (i < 0) break;
      count++;
      pos = i + q.length;
    }
    if (count === 0) continue;
    const first = ch.content.indexOf(q);
    const start = first;
    const end = first + q.length;
    const sn = buildSnippetParts(ch.content, start, end);
    hits.push({
      refWorkId: ch.refWorkId,
      chunkId: ch.id,
      ordinal: ch.ordinal,
      matchCount: count,
      highlightStart: start,
      highlightEnd: end,
      preview: sn.preview,
      snippetBefore: sn.before,
      snippetMatch: sn.match,
      snippetAfter: sn.after,
    });
  }
  return hits;
}
