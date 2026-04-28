import type { Work } from "../db/types";
import { workPathSegment } from "./work-url";

/** 与 `ShengHui` 进页、与 `EditorPage` 的 `?chapter=` 保持同一套 query 名。 */
export const SHENG_HUI_Q = {
  work: "work",
  chapter: "chapter",
} as const;

/**
 * 生辉进页带作品/章节（可分享、可收藏；消费后 `useShengHuiDeepLink` 会 strip）。
 * 参数名与写作页 `?chapter=` 一致，便于记。
 */
export function buildShengHuiUrl(workId: string, chapterId: string | null): string {
  const p = new URLSearchParams();
  p.set(SHENG_HUI_Q.work, workId);
  if (chapterId) p.set(SHENG_HUI_Q.chapter, chapterId);
  return `/sheng-hui?${p.toString()}`;
}

const EDITOR_CHAPTER = "chapter";
const EDITOR_AI = "ai";

/**
 * 写作本作品某章。`openAi` 为 true 时与 {@link useEditorOpenAiFromQuery} 消费 `?ai=1` 对齐，打开右栏 AI 以便合并侧栏草稿。
 */
export function buildWorkEditorUrl(
  w: Pick<Work, "id" | "bookNo">,
  chapterId: string | null,
  openAi: boolean = false,
): string {
  const path = `/work/${workPathSegment(w)}`;
  if (!chapterId && !openAi) return path;
  const p = new URLSearchParams();
  if (chapterId) p.set(EDITOR_CHAPTER, chapterId);
  if (openAi) p.set(EDITOR_AI, "1");
  const s = p.toString();
  return s ? `${path}?${s}` : path;
}
