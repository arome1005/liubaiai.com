/**
 * 生成推演节点后，自动从 summary/draft 文本中提取 chip 的上下文描述，
 * 批量写入书斋人物库（BibleCharacter）和词条库（BibleGlossaryTerm）。
 *
 * 逻辑：
 *  1. 解析 structuredMeta 里的 chip 字段（人物/地点/势力/道具）
 *  2. 对每个 chip 名字，从 summary 中找第一句包含该名字的句子作为基本描述
 *  3. 调用 upsertBibleCharactersByWork / upsertBibleGlossaryTermsByWork
 *     （均为 merge-safe：不覆盖已有内容）
 */
import type {
  PlanningNodeStructuredMeta,
  TuiyanExtractedCharacter,
  TuiyanExtractedTerm,
  TuiyanPlanningLevel,
} from "../db/types"
import { upsertBibleCharactersByWork, upsertBibleGlossaryTermsByWork } from "../db/repo"

// ── 辅助 ──────────────────────────────────────────────────────────────────────

function parseNames(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(/[,，、\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * 从文本里找第一句含有 name 的句子，截断到 120 字。
 * 如果文本里有"name：说明"或"name—说明"格式，优先提取后面的说明。
 */
function extractContextForName(text: string, name: string): string {
  // 尝试找"方源：..." 或 "方源—..." 格式的内嵌描述
  const inlineRe = new RegExp(`${name}[：—:－\\-]+([^。！？!?\n]{4,100})`)
  const inlineM = text.match(inlineRe)
  if (inlineM?.[1]?.trim()) return inlineM[1].trim().slice(0, 120)

  // 找第一句包含该名字的完整句子
  const sentences = text.split(/[。！？!?\n]+/).map((s) => s.trim()).filter(Boolean)
  const hit = sentences.find((s) => s.includes(name))
  if (!hit) return ""
  return hit.length > 120 ? hit.slice(0, 120) + "…" : hit
}

// ── 入口 ──────────────────────────────────────────────────────────────────────

export type AutoLinkItem = {
  /** 节点正文/摘要，用于上下文提取 */
  summary: string
  structuredMeta: PlanningNodeStructuredMeta
  level: TuiyanPlanningLevel
  nodeId: string
}

/**
 * 从一批生成节点里提取 chip 信息并批量入库。
 * 使用 merge-safe upsert：已有内容不覆盖。
 * 此函数建议以 fire-and-forget 方式调用（不阻塞 UI）。
 */
export async function autoLinkChipsFromNodes(
  workId: string,
  items: AutoLinkItem[],
): Promise<{ characters: number; terms: number }> {
  const charMap = new Map<string, TuiyanExtractedCharacter>()
  const termMap = new Map<string, TuiyanExtractedTerm>()

  for (const { summary, structuredMeta, level, nodeId } of items) {
    // ── 人物字段 ────────────────────────────────────────────────────────────
    const charFields = [
      structuredMeta.appearedCharacters,
      structuredMeta.coreCharacters,
      structuredMeta.mainCharacters,
    ]
    for (const field of charFields) {
      for (const name of parseNames(field)) {
        if (!charMap.has(name)) {
          charMap.set(name, {
            name,
            motivation: extractContextForName(summary, name),
            voiceNotes: "",
            relationships: "",
            taboos: "",
            sourceLevel: level,
            sourceNodeId: nodeId,
          })
        }
      }
    }

    // ── 地点字段 → category "name" ──────────────────────────────────────────
    const locationFields = [structuredMeta.locations, structuredMeta.keyLocations]
    for (const field of locationFields) {
      for (const title of parseNames(field)) {
        if (!termMap.has(title)) {
          termMap.set(title, {
            entryKind: "地点",
            title,
            body: extractContextForName(summary, title),
            sourceLevel: level,
            sourceNodeId: nodeId,
          })
        }
      }
    }

    // ── 势力字段 → category "term" ──────────────────────────────────────────
    const factionFields = [structuredMeta.mainFactions, structuredMeta.coreFactions]
    for (const field of factionFields) {
      for (const title of parseNames(field)) {
        if (!termMap.has(title)) {
          termMap.set(title, {
            entryKind: "势力",
            title,
            body: extractContextForName(summary, title),
            sourceLevel: level,
            sourceNodeId: nodeId,
          })
        }
      }
    }

    // ── 道具/法宝字段 → category "term" ────────────────────────────────────
    for (const title of parseNames(structuredMeta.keyItems)) {
      if (!termMap.has(title)) {
        termMap.set(title, {
          entryKind: "法宝",
          title,
          body: extractContextForName(summary, title),
          sourceLevel: level,
          sourceNodeId: nodeId,
        })
      }
    }

    // ── 世界观核心词条（总纲）→ category "term" ─────────────────────────────
    for (const title of parseNames(structuredMeta.worldSettingTerms)) {
      if (!termMap.has(title)) {
        termMap.set(title, {
          entryKind: "术语",
          title,
          body: extractContextForName(summary, title),
          sourceLevel: level,
          sourceNodeId: nodeId,
        })
      }
    }
  }

  const chars = [...charMap.values()]
  const terms = [...termMap.values()]

  if (!chars.length && !terms.length) return { characters: 0, terms: 0 }

  const [cResult, tResult] = await Promise.all([
    chars.length ? upsertBibleCharactersByWork(workId, chars) : Promise.resolve({ added: 0, updated: 0 }),
    terms.length ? upsertBibleGlossaryTermsByWork(workId, terms) : Promise.resolve({ added: 0, updated: 0 }),
  ])

  return {
    characters: cResult.added + cResult.updated,
    terms: tResult.added + tResult.updated,
  }
}
