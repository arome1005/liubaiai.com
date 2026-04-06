/** 步 25：章节 `updatedAt` 乐观锁冲突（多窗口 / 多端同时改同一章）。 */
export class ChapterSaveConflictError extends Error {
  override readonly name = "ChapterSaveConflictError";
  constructor(message = "章节已在其它地方更新，与当前编辑版本不一致。") {
    super(message);
  }
}

export function isChapterSaveConflictError(e: unknown): e is ChapterSaveConflictError {
  return e instanceof ChapterSaveConflictError;
}
