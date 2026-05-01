/**
 * 编辑页左侧栏章节列表的纯函数：
 * - `makeChapterOrderCmp`：根据排序方向生成比较器
 * - `computeOrphanChapters`：找出 volumeId 不在 volumes 列表中的「孤儿」章节
 * - `buildFlatChapterItems`：把卷头 + 章节行扁平化成虚拟滚动的输入
 *
 * 所有函数与 React 解耦，便于单测；语义与原 `EditorPage.tsx` 内联实现一致。
 */

import type { Chapter, Volume } from "../db/types";

/** 章节排序方向；与 `liubai:chapterListSortDir:<id>` 持久化值一致 */
export type ChapterSortDir = "asc" | "desc";

/** P1-B：扁平化章节列表元素（卷头行 + 章节行），供虚拟滚动使用 */
export type FlatItem =
  | { kind: "vol-head"; volId: string; title: string; canDelete: boolean }
  | { kind: "chapter"; chapter: Chapter }
  | { kind: "orphan-head"; count: number }
  | { kind: "orphan-chapter"; chapter: Chapter };

export function makeChapterOrderCmp(dir: ChapterSortDir): (a: Chapter, b: Chapter) => number {
  return (a, b) => (dir === "asc" ? a.order - b.order : b.order - a.order);
}

/**
 * 卷的 id 与章节里存的 volumeId 不一致时，章节不会出现在任何卷下
 * （合并/导入/删卷遗留）；须单独展示并允许并入首卷。
 */
export function computeOrphanChapters(
  chapters: Chapter[],
  volumes: Volume[],
  cmp: (a: Chapter, b: Chapter) => number,
): Chapter[] {
  const volumeIdSet = new Set(volumes.map((v) => v.id));
  return [...chapters].filter((c) => !volumeIdSet.has(c.volumeId)).sort(cmp);
}

export function buildFlatChapterItems(args: {
  volumes: Volume[];
  chapters: Chapter[];
  orphanChapters: Chapter[];
  cmp: (a: Chapter, b: Chapter) => number;
}): FlatItem[] {
  const { volumes, chapters, orphanChapters, cmp } = args;
  const items: FlatItem[] = [];
  for (const vol of volumes) {
    items.push({ kind: "vol-head", volId: vol.id, title: vol.title, canDelete: volumes.length > 1 });
    const volChaps = chapters.filter((c) => c.volumeId === vol.id).sort(cmp);
    for (const c of volChaps) items.push({ kind: "chapter", chapter: c });
  }
  if (orphanChapters.length > 0) {
    items.push({ kind: "orphan-head", count: orphanChapters.length });
    for (const c of orphanChapters) items.push({ kind: "orphan-chapter", chapter: c });
  }
  return items;
}
