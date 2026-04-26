/**
 * 章节轻量笔记（P1-F）
 *
 * 主存储：IndexedDB（Chapter.chapterNote 字段）
 * 兼容：首次读取时如果 IndexedDB 无值则回退 localStorage（迁移前旧数据）
 *
 * 公共 API 保持同步签名不变（load 返回 string，save 返回 void）。
 * 内部通过缓存 + 后台写入实现无感迁移。
 */
import { getDB } from "../db/database";

const LS_PREFIX = "liubai:chapterNote:";

const cache = new Map<string, string>();

export function loadChapterNote(chapterId: string): string {
  if (cache.has(chapterId)) return cache.get(chapterId)!;
  // Synchronous fallback for first render — read localStorage (old path)
  try {
    const v = localStorage.getItem(LS_PREFIX + chapterId);
    if (v) {
      cache.set(chapterId, v);
      return v;
    }
  } catch {
    // localStorage unavailable
  }
  return "";
}

export function saveChapterNote(chapterId: string, note: string): void {
  const trimmed = note.trim() ? note : "";
  cache.set(chapterId, trimmed);
  // Persist to IndexedDB (async, fire-and-forget)
  void (async () => {
    try {
      await getDB().chapters.update(chapterId, { chapterNote: trimmed || undefined });
    } catch {
      // DB not open yet or chapter doesn't exist — fall back to localStorage
      try {
        if (!trimmed) localStorage.removeItem(LS_PREFIX + chapterId);
        else localStorage.setItem(LS_PREFIX + chapterId, trimmed);
      } catch {
        /* quota */
      }
    }
    // Clean up localStorage after successful IndexedDB write
    try {
      localStorage.removeItem(LS_PREFIX + chapterId);
    } catch {
      /* ignore */
    }
  })();
}

export function hasChapterNote(chapterId: string): boolean {
  if (cache.has(chapterId)) return !!cache.get(chapterId)?.trim();
  try {
    const v = localStorage.getItem(LS_PREFIX + chapterId);
    return !!v?.trim();
  } catch {
    return false;
  }
}

/**
 * Warm the cache from IndexedDB for a set of chapter IDs.
 * Call once after chapters are loaded to avoid stale localStorage reads.
 */
export async function warmChapterNoteCache(chapterIds: string[]): Promise<void> {
  try {
    const db = getDB();
    const rows = await db.chapters.where("id").anyOf(chapterIds).toArray();
    for (const row of rows) {
      if (row.chapterNote?.trim()) {
        cache.set(row.id, row.chapterNote);
      } else {
        // Check localStorage for migrated data not yet in DB
        try {
          const v = localStorage.getItem(LS_PREFIX + row.id);
          if (v?.trim()) {
            cache.set(row.id, v);
            // Migrate forward
            void db.chapters.update(row.id, { chapterNote: v }).then(() => {
              try { localStorage.removeItem(LS_PREFIX + row.id); } catch { /* */ }
            });
          }
        } catch {
          // localStorage unavailable
        }
      }
    }
  } catch {
    // DB not ready — loadChapterNote will fall back to localStorage
  }
}
