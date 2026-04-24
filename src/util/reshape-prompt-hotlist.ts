import { listApprovedPromptTemplates, listGlobalPromptTemplates } from "../db/repo";
import type { GlobalPromptTemplate, PromptSlot } from "../db/types";
import { PROMPT_SCOPE_SLOTS } from "../db/types";
import { filterPromptTemplatesByTypesAndSlots } from "./article-summary-prompt-templates";

const WRITER_SLOTS: PromptSlot[] = PROMPT_SCOPE_SLOTS.writer;

/**
 * 编辑器「重塑」左侧热门提示词：重塑类 + 写作槽位，按更新时间降序。
 */
export async function listReshapePromptHotlist(limit = 6): Promise<GlobalPromptTemplate[]> {
  const [mine, approved] = await Promise.all([listGlobalPromptTemplates(), listApprovedPromptTemplates()]);
  const seen = new Set<string>();
  const merged: GlobalPromptTemplate[] = [];
  for (const t of [...mine, ...approved]) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    merged.push(t);
  }
  const hit = filterPromptTemplatesByTypesAndSlots(
    merged.filter((t) => t.status !== "rejected"),
    ["book_split"],
    WRITER_SLOTS,
  );
  hit.sort((a, b) => b.updatedAt - a.updatedAt);
  return hit.slice(0, limit);
}
