/**
 * 各层规划节点生成后：按 KnowledgeExtractInput 批/单条抽人物与词条，落入书斋。
 * 多节点时与 `extractKnowledgeFromNodes` 一致：逐节点串行，合并去重后 upsert。
 */
import type { KnowledgeExtractInput } from "./tuiyan-knowledge-extract"
import { extractKnowledgeFromNodes } from "./tuiyan-knowledge-extract"
import { upsertBibleCharactersByWork, upsertBibleGlossaryTermsByWork } from "../db/repo"

export type PlanningLibraryApplyStats = {
  characters: { added: number; updated: number }
  terms: { added: number; updated: number }
}

export async function applyPlanningKnowledgeToLibrary(
  workId: string,
  inputs: KnowledgeExtractInput[],
  signal?: AbortSignal,
): Promise<PlanningLibraryApplyStats> {
  if (inputs.length === 0) {
    return { characters: { added: 0, updated: 0 }, terms: { added: 0, updated: 0 } }
  }
  const { characters, terms } = await extractKnowledgeFromNodes({ inputs, signal })
  const [c, t] = await Promise.all([
    characters.length ? upsertBibleCharactersByWork(workId, characters) : Promise.resolve({ added: 0, updated: 0 }),
    terms.length ? upsertBibleGlossaryTermsByWork(workId, terms) : Promise.resolve({ added: 0, updated: 0 }),
  ])
  return { characters: c, terms: t }
}
