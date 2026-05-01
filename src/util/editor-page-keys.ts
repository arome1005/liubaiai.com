/**
 * 编辑页本地持久化 key 集中管理。
 *
 * 历史散落在 `EditorPage.tsx` 顶部，重构搬家时统一收口；
 * **不**改 key 字面值，否则会丢已登录用户的现有偏好。
 */

export const SIDEBAR_KEY = "liubai:editorSidebarCollapsed";
export const CHAPTER_LIST_KEY = "liubai:chapterListCollapsed";
export const CHAPTER_SORT_DIR_KEY_PREFIX = "liubai:chapterListSortDir:";
