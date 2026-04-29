/**
 * 生辉主稿区「手改/未生成」正文：按作品+章节持久化到 localStorage，切回章节可恢复
 *（与只含生成物快照的 `sheng-hui-snapshots` 分工不同）。
 */
const KEY_PREFIX = "liubai:shengHuiMainDraft:v1:";

export function shengHuiMainDraftStorageKey(workId: string, chapterId: string | null): string {
  return `${KEY_PREFIX}${workId}:${chapterId ?? "none"}`;
}

/**
 * 若有记录则返回字符串（可含空串 `""`）；**从未**写入过则返回 `null`（与「空主稿已保存」区分）。
 */
export function readShengHuiMainDraft(workId: string, chapterId: string | null): string | null {
  if (!workId) return null;
  try {
    const raw = localStorage.getItem(shengHuiMainDraftStorageKey(workId, chapterId));
    if (raw === null) return null;
    // JSON 以便稳定保存换行/引号
    return JSON.parse(raw) as string;
  } catch {
    return null;
  }
}

export function writeShengHuiMainDraft(workId: string, chapterId: string | null, text: string): void {
  if (!workId) return;
  try {
    const key = shengHuiMainDraftStorageKey(workId, chapterId);
    if (text === "") {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, JSON.stringify(text));
  } catch {
    /* quota */
  }
}
