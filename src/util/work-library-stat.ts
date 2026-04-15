import type { Chapter, Work } from "../db/types";
import { wordCount } from "./wordCount";

/** 作品库卡片用：章节数、总字数、进度游标所在章与条形进度比例 */
export type WorkLibraryStat = {
  chapterCount: number;
  totalWords: number;
  /** 进度游标指向的章节标题（或说明文案） */
  progressChapterTitle: string;
  /** 0–100：游标在全书排序中的位置比例（无章则为 0） */
  progressPercent: number;
};

export function computeWorkLibraryStat(work: Work, chapters: Chapter[]): WorkLibraryStat {
  const sorted = [...chapters].sort((a, b) => a.order - b.order);
  const chapterCount = sorted.length;
  const totalWords = sorted.reduce((s, c) => s + (c.wordCountCache ?? wordCount(c.content)), 0);

  if (chapterCount === 0) {
    return {
      chapterCount: 0,
      totalWords: 0,
      progressChapterTitle: "尚无章节",
      progressPercent: 0,
    };
  }

  if (!work.progressCursor) {
    return {
      chapterCount,
      totalWords,
      progressChapterTitle: "未设进度游标",
      progressPercent: 0,
    };
  }

  const idx = sorted.findIndex((c) => c.id === work.progressCursor);
  if (idx < 0) {
    return {
      chapterCount,
      totalWords,
      progressChapterTitle: "进度游标已失效",
      progressPercent: 0,
    };
  }

  const progressPercent = Math.round(((idx + 1) / chapterCount) * 100);
  return {
    chapterCount,
    totalWords,
    progressChapterTitle: sorted[idx]!.title,
    progressPercent,
  };
}
