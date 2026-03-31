const PREFIX = "liubai:chapterDraft:";

export function draftKey(workId: string, chapterId: string): string {
  return `${PREFIX}${workId}:${chapterId}`;
}

export function readDraft(workId: string, chapterId: string): { content: string; savedAt: number } | null {
  try {
    const raw = sessionStorage.getItem(draftKey(workId, chapterId));
    if (!raw) return null;
    const p = JSON.parse(raw) as { content?: string; savedAt?: number };
    if (typeof p.content !== "string" || typeof p.savedAt !== "number") return null;
    return { content: p.content, savedAt: p.savedAt };
  } catch {
    return null;
  }
}

export function writeDraftDebounced(
  workId: string,
  chapterId: string,
  content: string,
): void {
  try {
    const key = draftKey(workId, chapterId);
    const payload = JSON.stringify({ content, savedAt: Date.now() });
    sessionStorage.setItem(key, payload);
  } catch {
    /* quota */
  }
}

export function clearDraft(workId: string, chapterId: string): void {
  try {
    sessionStorage.removeItem(draftKey(workId, chapterId));
  } catch {
    /* ignore */
  }
}
