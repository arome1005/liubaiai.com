/**
 * 写作侧栏 AiPanel 草稿（§11 步 11/12）在 sessionStorage 的存储约定。
 * 推演（步 33）等外部入口写入草稿时，必须与 AiPanel 同源，避免写到其它“草稿恢复”通道。
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

