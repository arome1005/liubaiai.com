import type { Chapter, Volume } from "../db/types";

/** 与 V0 推演页 `OutlineNode` 一致，供数据层映射 */
export type V0OutlineNode = {
  id: string;
  title: string;
  type: "volume" | "chapter" | "scene";
  status: "draft" | "refining" | "finalized" | "locked";
  summary?: string;
  wordCountTarget?: number;
  children?: V0OutlineNode[];
  collapsed?: boolean;
  tags?: string[];
  conflictPoints?: string[];
  emotionalArc?: string;
  linkedCharacters?: string[];
  linkedLocations?: string[];
};

function wordCount(ch: Chapter): number {
  return ch.wordCountCache ?? (ch.content?.length ?? 0);
}

function chapterToNode(ch: Chapter): V0OutlineNode {
  const wc = wordCount(ch);
  let status: V0OutlineNode["status"] = "draft";
  if (wc > 800) status = "finalized";
  else if (wc > 0) status = "refining";
  return {
    id: ch.id,
    title: ch.title.trim() || "未命名章节",
    type: "chapter",
    status,
    summary: (ch.summary ?? "").trim() || "（本章暂无概要）",
    children: undefined,
    collapsed: false,
  };
}

function volumeStatusFromChildren(children: V0OutlineNode[]): V0OutlineNode["status"] {
  if (children.length === 0) return "draft";
  if (children.some((c) => c.status === "draft")) return "draft";
  if (children.some((c) => c.status === "refining")) return "refining";
  return "finalized";
}

/**
 * 将本地卷、章映射为 V0 推演页大纲树（章为叶子；无独立「场景」实体）。
 * 若某章的 volumeId 不在卷列表中，归入「未分配卷」节点。
 */
export function buildV0TuiyanOutline(volumes: Volume[], chapters: Chapter[]): V0OutlineNode[] {
  const volSorted = [...volumes].sort((a, b) => a.order - b.order);
  const chSorted = [...chapters].sort((a, b) => a.order - b.order);
  const volumeIds = new Set(volSorted.map((v) => v.id));
  const byVol = new Map<string, Chapter[]>();
  for (const ch of chSorted) {
    if (!volumeIds.has(ch.volumeId)) continue;
    const arr = byVol.get(ch.volumeId) ?? [];
    arr.push(ch);
    byVol.set(ch.volumeId, arr);
  }
  const orphan = chSorted.filter((ch) => !volumeIds.has(ch.volumeId));
  const out: V0OutlineNode[] = volSorted.map((vol) => {
    const volChapters = (byVol.get(vol.id) ?? []).sort((a, b) => a.order - b.order);
    const children = volChapters.map(chapterToNode);
    return {
      id: vol.id,
      title: vol.title.trim() || "未命名卷",
      type: "volume",
      status: volumeStatusFromChildren(children),
      summary: vol.summary?.trim() || undefined,
      wordCountTarget: undefined,
      children,
      collapsed: false,
    };
  });
  if (orphan.length > 0) {
    const children = [...orphan].sort((a, b) => a.order - b.order).map(chapterToNode);
    out.push({
      id: "__v0_orphan_chapters__",
      title: "未分配卷",
      type: "volume",
      status: volumeStatusFromChildren(children),
      summary: "所属卷缺失时的章节暂放此处",
      children,
      collapsed: false,
    });
  }
  return out;
}

export function firstChapterIdInTree(nodes: V0OutlineNode[]): string | null {
  for (const n of nodes) {
    if (n.type === "chapter") return n.id;
    if (n.children?.length) {
      const id = firstChapterIdInTree(n.children);
      if (id) return id;
    }
  }
  return null;
}
