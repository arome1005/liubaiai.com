/**
 * 写作侧栏「本章正文字数」用户偏好（按 work + chapter 维度持久化）。
 *
 * - 0 / 空 → 不约束（不写入 prompt 字数指令）
 * - 用 sessionStorage 与 chapterOutlinePaste / aiPanelDraft 保持同档生命周期
 *   （切回章节会恢复，关闭浏览器会清空，避免长期残留）
 */

const KEY_PREFIX = "liubai:editor:chapter-target-wc:v1";

function key(workId: string, chapterId: string): string {
  return `${KEY_PREFIX}:${workId}:${chapterId}`;
}

export function loadChapterTargetWordCount(workId: string, chapterId: string): number {
  if (!workId || !chapterId) return 0;
  try {
    const raw = sessionStorage.getItem(key(workId, chapterId));
    if (!raw) return 0;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function saveChapterTargetWordCount(workId: string, chapterId: string, n: number): void {
  if (!workId || !chapterId) return;
  try {
    if (n > 0) {
      sessionStorage.setItem(key(workId, chapterId), String(n));
    } else {
      sessionStorage.removeItem(key(workId, chapterId));
    }
  } catch {
    /* quota / privacy mode */
  }
}
