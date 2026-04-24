import type { Work } from "../db/types";

/** 路由里 `/work/:id` 的 `id` 为纯数字时，按书号解析，否则按作品 UUID 解析。 */
export function isWorkBookNoRouteParam(param: string): boolean {
  return /^\d{1,12}$/.test(param.trim());
}

/**
 * 生成该作品在应用内使用的路径段：`/work/{段}/…`
 * 有书号时用书号，否则用 UUID（兼容老链接）。
 */
export function workPathSegment(w: Pick<Work, "id" | "bookNo">): string {
  return w.bookNo != null && Number.isFinite(w.bookNo) && w.bookNo > 0 ? String(w.bookNo) : w.id;
}

/**
 * 在已拉取的作品列表中按内部 id 解析路径段；不在列表中则退回 `internalId`（多为 UUID，兼容未同步到列表的瞬态）。
 */
export function workPathSegmentForId(
  works: readonly Pick<Work, "id" | "bookNo">[] | null | undefined,
  internalId: string,
): string {
  const w = works?.find((x) => x.id === internalId);
  return w ? workPathSegment(w) : internalId;
}
