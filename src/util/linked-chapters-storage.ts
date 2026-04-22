export type LinkedChaptersState = {
  /** 关联全文（正文注入） */
  fullChapterIds: string[];
  /** 关联概要（概要注入） */
  summaryChapterIds: string[];
};

const KEY_PREFIX = "liubai:linkedChapters:v1:";
export const LINKED_CHAPTERS_UPDATED_EVENT = "liubai:linked-chapters-updated";

export function linkedChaptersStorageKey(workId: string, chapterId: string): string {
  return `${KEY_PREFIX}${workId}:${chapterId}`;
}

export function defaultLinkedChaptersState(): LinkedChaptersState {
  return { fullChapterIds: [], summaryChapterIds: [] };
}

function uniq(ids: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function loadLinkedChapters(workId: string, chapterId: string): LinkedChaptersState {
  try {
    const raw = localStorage.getItem(linkedChaptersStorageKey(workId, chapterId));
    if (!raw) return defaultLinkedChaptersState();
    const p = JSON.parse(raw) as Partial<LinkedChaptersState>;
    return {
      fullChapterIds: Array.isArray(p.fullChapterIds) ? uniq(p.fullChapterIds.filter((x) => typeof x === "string")) : [],
      summaryChapterIds: Array.isArray(p.summaryChapterIds)
        ? uniq(p.summaryChapterIds.filter((x) => typeof x === "string"))
        : [],
    };
  } catch {
    return defaultLinkedChaptersState();
  }
}

export function saveLinkedChapters(workId: string, chapterId: string, next: LinkedChaptersState): void {
  try {
    const v: LinkedChaptersState = {
      fullChapterIds: uniq(next.fullChapterIds),
      summaryChapterIds: uniq(next.summaryChapterIds),
    };
    localStorage.setItem(linkedChaptersStorageKey(workId, chapterId), JSON.stringify(v));
    window.dispatchEvent(new CustomEvent(LINKED_CHAPTERS_UPDATED_EVENT, { detail: { workId, chapterId } }));
  } catch {
    /* ignore */
  }
}

