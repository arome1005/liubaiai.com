/**
 * 写作侧栏 AiPanel
 * - **当前章草稿槽**：`sessionStorage`（`aiPanelDraftStorageKey`），关标签后清空。
 * - **生成历史**（`readDraftHistory` / `pushDraftHistory`）：`localStorage` v2，本机每章最多
 *   {@link AI_DRAFT_HISTORY_MAX_ENTRIES} 条、保留约 {@link AI_DRAFT_HISTORY_RETENTION_DAYS} 天；旧版 v1
 *   在 session 中的数据会一次性迁到 v2。
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

// ── P1-C：草稿历史（每章最多 AI_DRAFT_HISTORY_MAX_ENTRIES 条；本机 localStorage 保留约 AI_DRAFT_HISTORY_RETENTION_DAYS 天）──

/** 本机保留天数（超期条目在读/写时自动剔除） */
export const AI_DRAFT_HISTORY_RETENTION_DAYS = 15;

/** 单章生成历史条数上限（最旧被挤出） */
export const AI_DRAFT_HISTORY_MAX_ENTRIES = 5;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const AI_DRAFT_HISTORY_RETENTION_MS = AI_DRAFT_HISTORY_RETENTION_DAYS * MS_PER_DAY;

export type AiDraftHistoryEntry = {
  content: string;
  savedAt: number;
  preview: string; // 前 60 字
};

const LEGACY_DRAFT_HISTORY_KEY = (workId: string, chapterId: string) =>
  `liubai:aiDraftHistory:v1:${workId}:${chapterId}`;

function draftHistoryKey(workId: string, chapterId: string): string {
  return `liubai:aiDraftHistory:v2:${workId}:${chapterId}`;
}

function tryMigrateV1SessionToV2Local(workId: string, chapterId: string): void {
  const v2k = draftHistoryKey(workId, chapterId);
  const v1k = LEGACY_DRAFT_HISTORY_KEY(workId, chapterId);
  try {
    if (localStorage.getItem(v2k)) {
      sessionStorage.removeItem(v1k);
      return;
    }
    const raw = sessionStorage.getItem(v1k);
    if (!raw) return;
    localStorage.setItem(v2k, raw);
    sessionStorage.removeItem(v1k);
  } catch {
    /* quota / private mode */
  }
}

function pruneDraftHistoryByAge(entries: AiDraftHistoryEntry[]): AiDraftHistoryEntry[] {
  const cutoff = Date.now() - AI_DRAFT_HISTORY_RETENTION_MS;
  return entries.filter(
    (e) => typeof e.savedAt === "number" && Number.isFinite(e.savedAt) && e.savedAt >= cutoff,
  );
}

function persistDraftHistory(workId: string, chapterId: string, entries: AiDraftHistoryEntry[]): void {
  try {
    localStorage.setItem(draftHistoryKey(workId, chapterId), JSON.stringify(entries));
  } catch {
    /* quota */
  }
}

/**
 * 读取本章生成历史：自动从旧版 session v1 迁移到 v2 local，并剔除超过保留天数的条目。
 */
export function readDraftHistory(workId: string, chapterId: string): AiDraftHistoryEntry[] {
  tryMigrateV1SessionToV2Local(workId, chapterId);
  let entries: AiDraftHistoryEntry[] = [];
  try {
    const raw = localStorage.getItem(draftHistoryKey(workId, chapterId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    entries = parsed as AiDraftHistoryEntry[];
  } catch {
    return [];
  }
  const pruned = pruneDraftHistoryByAge(entries);
  if (pruned.length !== entries.length) {
    persistDraftHistory(workId, chapterId, pruned);
  }
  return pruned;
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
    const next = [entry, ...existing].slice(0, AI_DRAFT_HISTORY_MAX_ENTRIES);
    persistDraftHistory(workId, chapterId, next);
  } catch {
    /* quota */
  }
}

export function deleteDraftHistoryEntry(workId: string, chapterId: string, savedAt: number): void {
  try {
    const existing = readDraftHistory(workId, chapterId).filter((e) => e.savedAt !== savedAt);
    persistDraftHistory(workId, chapterId, existing);
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

