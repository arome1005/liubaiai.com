export type OutlineSource = "manual_paste" | "outline_pull" | "mixed" | "unknown";

const SOURCE_KEY_PREFIX = "liubai:chapterOutlineSource:v1:";

function key(workId: string, chapterId: string): string {
  return `${SOURCE_KEY_PREFIX}${workId}:${chapterId}`;
}

function isOutlineSource(v: unknown): v is OutlineSource {
  return v === "manual_paste" || v === "outline_pull" || v === "mixed" || v === "unknown";
}

export function loadChapterOutlineSource(workId: string, chapterId: string): OutlineSource {
  try {
    const raw = localStorage.getItem(key(workId, chapterId));
    return isOutlineSource(raw) ? raw : "unknown";
  } catch {
    return "unknown";
  }
}

export function saveChapterOutlineSource(workId: string, chapterId: string, next: OutlineSource): void {
  try {
    localStorage.setItem(key(workId, chapterId), next);
  } catch {
    /* ignore */
  }
}

/** 用户手动键入：unknown→manual_paste，outline_pull→mixed，mixed/manual_paste 不变 */
export function reduceOnManualEdit(prev: OutlineSource): OutlineSource {
  if (prev === "outline_pull") return "mixed";
  if (prev === "mixed") return "mixed";
  if (prev === "manual_paste") return "manual_paste";
  return "manual_paste";
}

/** 章纲拉取事件：unknown→outline_pull，manual_paste→mixed，其余不变 */
export function reduceOnOutlinePull(prev: OutlineSource): OutlineSource {
  if (prev === "manual_paste") return "mixed";
  if (prev === "mixed") return "mixed";
  if (prev === "outline_pull") return "outline_pull";
  return "outline_pull";
}
