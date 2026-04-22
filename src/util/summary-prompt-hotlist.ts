import { listApprovedPromptTemplates, listGlobalPromptTemplates } from "../db/repo";
import type { GlobalPromptTemplate } from "../db/types";

function isSummaryLike(t: GlobalPromptTemplate): boolean {
  if (t.type === "article_summary") return true;
  const hay = `${t.title}\n${t.tags.join(" ")}\n${t.body.slice(0, 400)}`.toLowerCase();
  return /概要|概括|提炼|提取|章纲|总结|剧情.*细节|记忆|压缩/.test(hay);
}

/**
 * 批量概要左侧「热门」：无独立热度字段时，用关键词命中 + 最近更新近似「火热」。
 */
export async function listSummaryPromptHotlist(limit = 5): Promise<GlobalPromptTemplate[]> {
  const [mine, approved] = await Promise.all([listGlobalPromptTemplates(), listApprovedPromptTemplates()]);
  const seen = new Set<string>();
  const merged: GlobalPromptTemplate[] = [];
  for (const t of [...mine, ...approved]) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    merged.push(t);
  }
  const hit = merged.filter((t) => t.status !== "rejected" && isSummaryLike(t));
  hit.sort((a, b) => b.updatedAt - a.updatedAt);
  if (hit.length >= limit) return hit.slice(0, limit);
  const rest = merged
    .filter((t) => !hit.some((h) => h.id === t.id) && t.status !== "rejected")
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return [...hit, ...rest].slice(0, limit);
}
