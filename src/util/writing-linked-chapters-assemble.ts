import type { Chapter } from "../db/types";
import type { LinkedChaptersState } from "./linked-chapters-storage";

function takeTailChars(s: string, maxChars: number): string {
  const t = s.trim();
  if (!t) return "";
  if (t.length <= maxChars) return t;
  return t.slice(t.length - maxChars);
}

function headCap(s: string, maxChars: number): string {
  const t = s.trim();
  if (!t) return "";
  if (t.length <= maxChars) return t;
  return t.slice(0, Math.max(0, maxChars - 24)) + "\n\n…（已截断）";
}

function chapterOrder(c: Chapter | undefined): number {
  return typeof c?.order === "number" && Number.isFinite(c.order) ? c.order : -1;
}

/**
 * 将「知识库 · 关联章节」转为写作侧栏装配用的两段文本（概要块 / 正文块）。
 * - 概要：按章 order 升序拼接。
 * - 正文：按章 order 升序；其中「衔接章」= 所关联正文中 order 最大的一章，只取其正文末尾 `bridgeTailMaxChars` 字，便于新章开篇直接接龙。
 * - 其余关联正文章：取正文前 `earlierFullMaxChars` 字作节选（兼顾 tokens）。
 */
export function buildWritingLinkedChaptersPromptBlocks(args: {
  chapters: Chapter[];
  currentChapterId: string;
  linked: LinkedChaptersState;
  earlierFullMaxChars: number;
  bridgeTailMaxChars: number;
}): {
  summaryBlock: string;
  fullBlock: string;
  bridgeChapterOrder: number | null;
  /** 实际写入概要块的章节数（有概要文本） */
  includedSummaryCount: number;
  /** 实际写入正文块的章节数（有正文） */
  includedFullCount: number;
} {
  const { chapters, currentChapterId, linked, earlierFullMaxChars, bridgeTailMaxChars } = args;
  const byId = new Map(chapters.map((c) => [c.id, c]));
  const cur = byId.get(currentChapterId);
  const curOrder = chapterOrder(cur);

  const summaryIds = [...new Set(linked.summaryChapterIds)].filter((id) => id && id !== currentChapterId && byId.has(id));
  summaryIds.sort((a, b) => chapterOrder(byId.get(a)) - chapterOrder(byId.get(b)));

  const fullIds = [...new Set(linked.fullChapterIds)].filter((id) => id && id !== currentChapterId && byId.has(id));
  fullIds.sort((a, b) => chapterOrder(byId.get(a)) - chapterOrder(byId.get(b)));

  const fullChapters = fullIds
    .map((id) => byId.get(id)!)
    .filter((c) => (c.content ?? "").trim().length > 0);

  let bridgeId: string | null = null;
  if (fullChapters.length > 0) {
    const underCurrent =
      curOrder >= 0 ? fullChapters.filter((c) => chapterOrder(c) < curOrder) : fullChapters;
    const pool = underCurrent.length > 0 ? underCurrent : fullChapters;
    let best = pool[0]!;
    for (const c of pool) {
      if (chapterOrder(c) > chapterOrder(best)) best = c;
    }
    bridgeId = best.id;
  }

  const summaryParts: string[] = [];
  for (const id of summaryIds) {
    const c = byId.get(id)!;
    const sum = (c.summary ?? "").trim();
    if (!sum) continue;
    summaryParts.push(`【#${c.order}｜${c.title}】\n${sum}`);
  }
  const summaryBlock = summaryParts.join("\n\n---\n\n");

  const fullParts: string[] = [];
  for (const id of fullIds) {
    const c = byId.get(id)!;
    const raw = (c.content ?? "").trim();
    if (!raw) continue;
    if (bridgeId && id === bridgeId) {
      const tail = takeTailChars(raw, bridgeTailMaxChars);
      fullParts.push(
        `【#${c.order}｜${c.title}】\n` +
          "（以下为该章正文末尾，供当前章开篇直接衔接；勿复述上文，从情节自然顺接。）\n\n" +
          tail,
      );
    } else {
      fullParts.push(`【#${c.order}｜${c.title}】\n` + headCap(raw, earlierFullMaxChars));
    }
  }
  const fullBlock = fullParts.join("\n\n---\n\n");

  const bridgeChapterOrder = bridgeId ? chapterOrder(byId.get(bridgeId)) : null;
  return {
    summaryBlock,
    fullBlock,
    bridgeChapterOrder: Number.isFinite(bridgeChapterOrder) && bridgeChapterOrder >= 0 ? bridgeChapterOrder : null,
    includedSummaryCount: summaryParts.length,
    includedFullCount: fullParts.length,
  };
}
