/**
 * 写作侧栏 AiPanel 草稿（§11 步 11/12）在 sessionStorage 的存储约定。
 * 推演（步 33）等外部入口写入草稿时，必须与 AiPanel 同源，避免写到其它"草稿恢复"通道。
 */

export function aiPanelDraftStorageKey(workId: string, chapterId: string): string {
  return `liubai:aiPanelDraft:v1:${workId}:${chapterId}`;
}

export function writeAiPanelDraft(workId: string, chapterId: string, draft: string): { ok: true } | { ok: false; error: string } {
  const key = aiPanelDraftStorageKey(workId, chapterId);
  try {
    sessionStorage.setItem(key, draft);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "写入失败";
    return { ok: false, error: `写入侧栏草稿失败（${msg}）。可能是浏览器存储空间不足或被禁用。` };
  }
}

export function readAiPanelDraft(workId: string, chapterId: string): string {
  const key = aiPanelDraftStorageKey(workId, chapterId);
  try {
    return sessionStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

// ── P1-C：草稿历史（最近 5 条）────────────────────────────────────────────────

const DRAFT_HISTORY_MAX = 5;

export type AiDraftHistoryEntry = {
  content: string;
  savedAt: number;
  preview: string; // 前 60 字
};

function draftHistoryKey(workId: string, chapterId: string): string {
  return `liubai:aiDraftHistory:v1:${workId}:${chapterId}`;
}

export function readDraftHistory(workId: string, chapterId: string): AiDraftHistoryEntry[] {
  try {
    const raw = sessionStorage.getItem(draftHistoryKey(workId, chapterId));
    if (!raw) return [];
    return JSON.parse(raw) as AiDraftHistoryEntry[];
  } catch {
    return [];
  }
}

/** 将一条新草稿推入历史（最多保留 DRAFT_HISTORY_MAX 条，最旧的被移除） */
export function pushDraftHistory(workId: string, chapterId: string, content: string): void {
  if (!content.trim()) return;
  try {
    const existing = readDraftHistory(workId, chapterId);
    const entry: AiDraftHistoryEntry = {
      content,
      savedAt: Date.now(),
      preview: content.trim().slice(0, 60).replace(/\n/g, " "),
    };
    const next = [entry, ...existing].slice(0, DRAFT_HISTORY_MAX);
    sessionStorage.setItem(draftHistoryKey(workId, chapterId), JSON.stringify(next));
  } catch {
    /* quota */
  }
}

export function deleteDraftHistoryEntry(workId: string, chapterId: string, savedAt: number): void {
  try {
    const existing = readDraftHistory(workId, chapterId).filter((e) => e.savedAt !== savedAt);
    sessionStorage.setItem(draftHistoryKey(workId, chapterId), JSON.stringify(existing));
  } catch {
    /* quota */
  }
}

/**
 * 写入侧栏当前章草稿槽，**成功**后再将同一内容推入「草稿历史」（与 AiPanel 侧栏 `useAiPanelDraftHistory` 同源）。
 * 生辉「写回侧栏」等跨页入口应使用此，避免只覆盖当前槽、写作页历史里看不到从生辉推来的版本。
 */
export function writeAiPanelDraftWithHistory(
  workId: string,
  chapterId: string,
  draft: string,
): { ok: true } | { ok: false; error: string } {
  const result = writeAiPanelDraft(workId, chapterId, draft);
  if (result.ok) {
    pushDraftHistory(workId, chapterId, draft);
  }
  return result;
}

