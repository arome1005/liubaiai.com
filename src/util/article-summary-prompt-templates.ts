import { listApprovedPromptTemplates, listGlobalPromptTemplates } from "../db/repo";
import type { GlobalPromptTemplate, PromptSlot, PromptType } from "../db/types";

function mergeDedupeMineApproved(
  mine: GlobalPromptTemplate[],
  approved: GlobalPromptTemplate[],
): GlobalPromptTemplate[] {
  const seen = new Set<string>();
  const out: GlobalPromptTemplate[] = [];
  for (const t of [...mine, ...approved]) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
  }
  return out;
}

/** 按类型与槽位（与 PromptPicker 一致）收窄模板列表 */
export function filterPromptTemplatesByTypesAndSlots(
  templates: GlobalPromptTemplate[],
  filterTypes: PromptType[],
  filterSlots?: PromptSlot[],
): GlobalPromptTemplate[] {
  const byType = templates.filter((t) => filterTypes.includes(t.type));
  if (!filterSlots?.length) return byType;
  return byType.filter(
    (t) => !t.slots?.length || t.slots.some((s) => filterSlots.includes(s)),
  );
}

/** 合并「我的 + 精选」后按类型/槽位过滤（非驳回） */
export async function loadGlobalPromptTemplatesMergedByTypes(
  filterTypes: PromptType[],
  filterSlots?: PromptSlot[],
): Promise<GlobalPromptTemplate[]> {
  const [mine, approved] = await Promise.all([
    listGlobalPromptTemplates(),
    listApprovedPromptTemplates(),
  ]);
  const merged = mergeDedupeMineApproved(mine, approved).filter((t) => t.status !== "rejected");
  return filterPromptTemplatesByTypesAndSlots(merged, filterTypes, filterSlots);
}

/** 仅「我的」库，按类型/槽位过滤后按更新时间排序 */
export async function listMinePromptTemplatesByTypes(
  filterTypes: PromptType[],
  filterSlots?: PromptSlot[],
): Promise<GlobalPromptTemplate[]> {
  const mine = await listGlobalPromptTemplates();
  return filterPromptTemplatesByTypesAndSlots(
    mine.filter((t) => t.status !== "rejected"),
    filterTypes,
    filterSlots,
  ).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** 合并「我的 + 精选」并只保留文章概括类、非驳回 */
export async function loadArticleSummaryTemplatesMerged(): Promise<GlobalPromptTemplate[]> {
  const [mine, approved] = await Promise.all([
    listGlobalPromptTemplates(),
    listApprovedPromptTemplates(),
  ]);
  return mergeDedupeMineApproved(mine, approved).filter(
    (t) => t.type === "article_summary" && t.status !== "rejected",
  );
}

/** 人气：按最近更新时间 */
export function sortByPopularity(list: GlobalPromptTemplate[]): GlobalPromptTemplate[] {
  return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
}

/** 精选：来自全库已发布列表（含他人贡献），仅文章概括 */
export async function loadArticleSummaryFeatured(): Promise<GlobalPromptTemplate[]> {
  const approved = await listApprovedPromptTemplates();
  return approved
    .filter((t) => t.type === "article_summary" && t.status !== "rejected")
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** 最新：按创建时间 */
export function sortByLatest(list: GlobalPromptTemplate[]): GlobalPromptTemplate[] {
  return [...list].sort((a, b) => b.createdAt - a.createdAt);
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** 最近 7 天内创建的模板 */
export function filterCreatedInLastWeek(list: GlobalPromptTemplate[]): GlobalPromptTemplate[] {
  const cutoff = Date.now() - WEEK_MS;
  return list.filter((t) => t.createdAt >= cutoff).sort((a, b) => b.createdAt - a.createdAt);
}
