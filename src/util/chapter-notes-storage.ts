/** 章节轻量笔记（P1-F）：存 localStorage，key = liubai:chapterNote:{chapterId} */

const prefix = "liubai:chapterNote:";

export function loadChapterNote(chapterId: string): string {
  try {
    return localStorage.getItem(prefix + chapterId) ?? "";
  } catch {
    return "";
  }
}

export function saveChapterNote(chapterId: string, note: string): void {
  try {
    if (!note) {
      localStorage.removeItem(prefix + chapterId);
    } else {
      localStorage.setItem(prefix + chapterId, note);
    }
  } catch {
    /* quota */
  }
}

export function hasChapterNote(chapterId: string): boolean {
  try {
    const v = localStorage.getItem(prefix + chapterId);
    return !!v?.trim();
  } catch {
    return false;
  }
}
