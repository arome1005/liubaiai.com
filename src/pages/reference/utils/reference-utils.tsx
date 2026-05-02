import type { Chapter } from "../../../db/types";

/** 统计非标点符号字符数 */
export function countNonPunctuation(s: string): number {
  return s.replace(/[\s\p{P}\p{S}]/gu, "").length;
}

/** 生成书目封面的色相 */
export function refCoverHue(refId: string): number {
  let h = 0;
  for (let i = 0; i < refId.length; i++) h = (h * 31 + refId.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** 与全书搜索「仅进度前」一致：关联章节 order 严格小于进度章 order */
export function isLinkedChapterBeforeProgress(
  chapters: Chapter[],
  progressCursor: string | null,
  linkedChapterId: string | null | undefined,
): boolean {
  if (!linkedChapterId || !progressCursor) return true;
  const cur = chapters.find((c) => c.id === progressCursor);
  const linkCh = chapters.find((c) => c.id === linkedChapterId);
  if (!cur || !linkCh) return true;
  return linkCh.order < cur.order;
}

/** 在文本中高亮指定范围 */
export function highlightChunkText(text: string, start: number, end: number) {
  if (start < 0 || end > text.length || start >= end) {
    return <>{text}</>;
  }
  return (
    <>
      {text.slice(0, start)}
      <mark className="reference-highlight-mark">{text.slice(start, end)}</mark>
      {text.slice(end)}
    </>
  );
}
