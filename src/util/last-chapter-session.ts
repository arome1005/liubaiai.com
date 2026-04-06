/** 与 {@link EditorPage} 同步：本会话内「当前打开章节」的 sessionStorage 键前缀 */
export const LAST_CHAPTER_SESSION_KEY_PREFIX = "liubai:lastChapter:";

export function readLastChapterIdFromSession(workId: string): string | null {
  try {
    return sessionStorage.getItem(LAST_CHAPTER_SESSION_KEY_PREFIX + workId);
  } catch {
    return null;
  }
}
