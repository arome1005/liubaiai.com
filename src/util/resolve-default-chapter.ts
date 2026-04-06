import type { Chapter, Work } from "../db/types";
import { readLastChapterIdFromSession } from "./last-chapter-session";

/**
 * 与 {@link AppShell} 顶栏「最近 · 书名 · 章」一致：本会话最近打开的章优先，
 * 其次进度游标章，否则全书排序首章。
 */
export function resolveDefaultChapterId(
  workId: string,
  chapters: Chapter[],
  work: Work | null | undefined,
): string | null {
  const sorted = [...chapters].sort((a, b) => a.order - b.order);
  if (sorted.length === 0) return null;
  const sessionId = readLastChapterIdFromSession(workId);
  if (sessionId && sorted.some((c) => c.id === sessionId)) return sessionId;
  if (work?.progressCursor && sorted.some((c) => c.id === work.progressCursor)) {
    return work.progressCursor;
  }
  return sorted[0]!.id;
}
