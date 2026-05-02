/**
 * 藏经正文：识别常见网文章节标题行（Parser 层，与分块存储配合）。
 * 与 `ReferenceChunk` 的 `isChapterHead` / `chapterTitle` 及 `referenceChapterHeads` 表一致。
 */
import { CHAPTER_HEAD_LINE_REGEX } from "../util/chapter-heading-pattern";
export { CHAPTER_HEAD_LINE_REGEX };

/** 倒排索引中的保留 token：命中表示该块含章节标题行（见 `buildPostingRowsForChunk`） */
export const REFERENCE_CHAPTER_HEAD_POSTING_TOKEN = "__REF_CHAPTER_HEAD__";

export type ChapterHeadMatch = {
  /** UTF-16 偏移（全书） */
  offset: number;
  title: string;
};

/** 在全文中扫描独立成行、匹配 {@link CHAPTER_HEAD_LINE_REGEX} 的章节标题 */
export function findChapterHeadMatches(fullText: string): ChapterHeadMatch[] {
  const re = new RegExp(CHAPTER_HEAD_LINE_REGEX.source, "gm");
  const out: ChapterHeadMatch[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(fullText)) !== null) {
    out.push({ offset: m.index, title: m[0].trim() });
  }
  return out;
}

export type ChunkChapterAnnotation = {
  isChapterHead: boolean;
  chapterTitle?: string;
  /** 本块内章节标题行的 UTF-16 偏移（相对块起点） */
  chapterOffsetsInChunk: number[];
};

export type HeadRowDraft = {
  startOffset: number;
  title: string;
  ordinal: number;
};

/**
 * 将固定长度分块与全书章节匹配对齐：每块是否含章节行、块内偏移（供倒排 `__REF_CHAPTER_HEAD__`）。
 */
export function annotateReferenceParts(
  fullText: string,
  parts: string[],
): {
  perChunk: ChunkChapterAnnotation[];
  chapterHeadCount: number;
  headsForDb: HeadRowDraft[];
} {
  const matches = findChapterHeadMatches(fullText);
  let cum = 0;
  const perChunk: ChunkChapterAnnotation[] = [];
  const headsForDb: HeadRowDraft[] = [];

  for (let i = 0; i < parts.length; i++) {
    const content = parts[i];
    const start = cum;
    const end = cum + content.length;
    cum = end;
    const inChunk = matches.filter((m) => m.offset >= start && m.offset < end);
    const chapterOffsetsInChunk = inChunk.map((m) => m.offset - start);
    perChunk.push({
      isChapterHead: inChunk.length > 0,
      chapterTitle: inChunk[0]?.title,
      chapterOffsetsInChunk,
    });
    for (const m of inChunk) {
      headsForDb.push({
        startOffset: m.offset,
        title: m.title,
        ordinal: i,
      });
    }
  }

  return {
    perChunk,
    chapterHeadCount: matches.length,
    headsForDb,
  };
}
