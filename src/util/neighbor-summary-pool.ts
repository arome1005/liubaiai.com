import type { Chapter } from "../db/types";

/** 与 `AiPanel` 邻章概要池逻辑一致：当前章之前、按 recentN 截断、仅保留已有概要的章 */
export function neighborSummaryPoolChaptersForWritingPanel(
  chapters: Chapter[],
  activeChapter: Chapter | null,
  recentN: number,
): Chapter[] {
  if (!activeChapter) return [];
  const n = Math.max(0, Math.min(12, recentN));
  if (n <= 0) return [];
  const curOrder = activeChapter.order;
  return [...chapters]
    .filter((c) => c.order < curOrder)
    .sort((a, b) => b.order - a.order)
    .slice(0, n)
    .reverse()
    .filter((c) => (c.summary ?? "").trim());
}
