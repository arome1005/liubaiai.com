/** 章节字数目标（P0-C）：全局一个目标值，0 表示不启用 */
const KEY = "liubai:chapterGoalWords";

export function loadChapterGoal(): number {
  try {
    const v = localStorage.getItem(KEY);
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

export function saveChapterGoal(n: number): void {
  try {
    localStorage.setItem(KEY, String(Math.max(0, Math.floor(n))));
  } catch {
    /* quota */
  }
}
