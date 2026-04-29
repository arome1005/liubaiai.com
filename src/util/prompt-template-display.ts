import type { GlobalPromptTemplate } from "../db/types";

/** 兼容旧行（IndexedDB/合并结果可能缺 `intro` 字段） */
export function ensureGlobalPromptShape(t: GlobalPromptTemplate): GlobalPromptTemplate {
  return {
    ...t,
    intro: t.intro?.trim() ?? "",
    usageMethod: t.usageMethod?.trim() ? t.usageMethod.trim() : undefined,
  };
}

/** 提示词库卡片仅可展示此字段：禁止用 body 做列表预览。 */
const INTRO_PLACEHOLDER = "（未填写介绍）在编辑页填写「提示词介绍」后，这里会展示对外的效果说明；正文不会出现在库列表中。";

const PREVIEW_MAX = 280;

/**
 * 列表/卡片上用于展示的纯文本（来自 `intro` 字段，永不回退到 `body`）。
 */
export function promptLibraryListPreview(t: GlobalPromptTemplate): { text: string; isPlaceholder: boolean } {
  const s = t.intro?.trim() ?? "";
  if (!s) return { text: INTRO_PLACEHOLDER, isPlaceholder: true };
  if (s.length > PREVIEW_MAX) return { text: s.slice(0, PREVIEW_MAX) + "…", isPlaceholder: false };
  return { text: s, isPlaceholder: false };
}

/**
 * 搜索是否可匹配到介绍（不依赖展示 body）。
 */
export function matchesPromptListSearch(t: GlobalPromptTemplate, q: string): boolean {
  const d = t.intro?.toLowerCase() ?? "";
  return t.title.toLowerCase().includes(q) || d.includes(q) || t.tags.some((tag) => tag.toLowerCase().includes(q));
  // 可额外匹配 body 便于「自己」在本地检索，但不在此函数用于他人可见逻辑
}

/**
 * 在「自己」的模板列表中允许按正文内容搜索（不展示、仅筛选用）。
 */
export function matchesPromptListSearchWithBody(t: GlobalPromptTemplate, q: string): boolean {
  if (matchesPromptListSearch(t, q)) return true;
  return t.body.toLowerCase().includes(q);
}
