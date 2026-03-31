/**
 * 对外导出：存储契约与类型（给将来桌面 SQLite 适配器复用）。
 */
export type { WritingStore } from "./writing-store";
export type {
  Work,
  Chapter,
  Volume,
  ProgressCursor,
  ChapterSnapshot,
  BookSearchHit,
  BookSearchScope,
  ReferenceLibraryEntry,
  ReferenceChunk,
  ReferenceSearchHit,
  ReferenceExcerpt,
  ReferenceTokenPosting,
} from "../db/types";
export { getWritingStore, setWritingStore } from "./instance";
