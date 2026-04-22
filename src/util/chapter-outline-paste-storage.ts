export const CHAPTER_OUTLINE_PASTE_UPDATED_EVENT = "liubai:chapter-outline-paste-updated";

const KEY_PREFIX = "liubai:chapterOutlinePaste:v1:";

export function chapterOutlinePasteKey(workId: string, chapterId: string): string {
  return `${KEY_PREFIX}${workId}:${chapterId}`;
}

export function loadChapterOutlinePaste(workId: string, chapterId: string): string {
  try {
    return localStorage.getItem(chapterOutlinePasteKey(workId, chapterId)) ?? "";
  } catch {
    return "";
  }
}

export function saveChapterOutlinePaste(workId: string, chapterId: string, next: string): void {
  try {
    localStorage.setItem(chapterOutlinePasteKey(workId, chapterId), next ?? "");
    window.dispatchEvent(new CustomEvent(CHAPTER_OUTLINE_PASTE_UPDATED_EVENT, { detail: { workId, chapterId } }));
  } catch {
    /* ignore */
  }
}

