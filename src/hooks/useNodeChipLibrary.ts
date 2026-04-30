/**
 * 为推演节点 chip 字段提供书斋（BibleCharacter + BibleGlossaryTerm）的加载、
 * 匹配、创建与更新能力，避免每个 chip 字段各自重复请求数据库。
 *
 * 词条库对应书斋侧边栏的"词条"标签（BibleGlossaryTerm），
 * 字段：term（词条名称）/ note（备注）；入库默认 category 为 term。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import type { BibleCharacter, BibleGlossaryTerm } from "../db/types"
import {
  listBibleCharacters,
  listBibleGlossaryTerms,
  addBibleCharacter,
  addBibleGlossaryTerm,
  updateBibleCharacter,
  updateBibleGlossaryTerm,
} from "../db/repo"

// ── 归一化合并键（去空白/标点，转小写）────────────────────────────────────────

function normalizeKey(s: string): string {
  return s.replace(/[\s\p{P}\uff00-\uffef]/gu, "").toLowerCase()
}

// ── 类型 ──────────────────────────────────────────────────────────────────────

export type CharacterPatch = Partial<
  Pick<BibleCharacter, "name" | "voiceNotes" | "motivation" | "relationships" | "taboos" | "gender">
>

export type TermPatch = Partial<Pick<BibleGlossaryTerm, "term" | "note">>

export type NodeChipLibrary = {
  characters: BibleCharacter[]
  glossaryTerms: BibleGlossaryTerm[]
  /** 按 normalize(name) 查找人物，找不到返回 undefined */
  findCharacter: (name: string) => BibleCharacter | undefined
  /** 按 normalize(term) 查找词条，找不到返回 undefined */
  findTerm: (name: string) => BibleGlossaryTerm | undefined
  /** 所有人物名（用于自动补全候选） */
  characterNames: string[]
  /** 所有词条名（用于自动补全候选） */
  termNames: string[]
  /** 创建人物并写入本地缓存 */
  createCharacter: (
    name: string,
    extra?: { voiceNotes?: string; motivation?: string; gender?: BibleCharacter["gender"] },
  ) => Promise<BibleCharacter>
  /** 创建词条并写入本地缓存 */
  createTerm: (name: string, note?: string) => Promise<BibleGlossaryTerm>
  /** 更新书斋人物卡（voiceNotes = 角色性格，motivation = 角色信息） */
  updateCharacter: (id: string, patch: CharacterPatch) => Promise<void>
  /** 更新书斋词条 */
  updateTerm: (id: string, patch: TermPatch) => Promise<void>
  /** 手动触发重新加载 */
  refresh: () => void
}

// ── hook ──────────────────────────────────────────────────────────────────────

/**
 * @param refreshKey 外部传入的数字，变化时触发重新加载（用于自动入库后刷新 chip 状态）
 */
export function useNodeChipLibrary(workId: string | null, refreshKey = 0): NodeChipLibrary {
  const [characters, setCharacters] = useState<BibleCharacter[]>([])
  const [glossaryTerms, setGlossaryTerms] = useState<BibleGlossaryTerm[]>([])

  const charMapRef = useRef<Map<string, BibleCharacter>>(new Map())
  const termMapRef = useRef<Map<string, BibleGlossaryTerm>>(new Map())
  const loadCounterRef = useRef(0)

  const load = useCallback(async () => {
    if (!workId) {
      setCharacters([])
      setGlossaryTerms([])
      charMapRef.current = new Map()
      termMapRef.current = new Map()
      return
    }
    const counter = ++loadCounterRef.current
    const [chars, terms] = await Promise.all([
      listBibleCharacters(workId),
      listBibleGlossaryTerms(workId),
    ])
    if (counter !== loadCounterRef.current) return

    const charMap = new Map<string, BibleCharacter>()
    for (const c of chars) charMap.set(normalizeKey(c.name), c)
    charMapRef.current = charMap

    const termMap = new Map<string, BibleGlossaryTerm>()
    for (const t of terms) termMap.set(normalizeKey(t.term), t)
    termMapRef.current = termMap

    setCharacters(chars)
    setGlossaryTerms(terms)
  }, [workId])

  useEffect(() => {
    void load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, refreshKey])

  const findCharacter = useCallback(
    (name: string) => charMapRef.current.get(normalizeKey(name)),
    [],
  )

  const findTerm = useCallback(
    (name: string) => termMapRef.current.get(normalizeKey(name)),
    [],
  )

  const createCharacter = useCallback(
    async (
      name: string,
      extra?: { voiceNotes?: string; motivation?: string; gender?: BibleCharacter["gender"] },
    ): Promise<BibleCharacter> => {
      if (!workId) throw new Error("workId is null")
      const char = await addBibleCharacter(workId, {
        name,
        voiceNotes: extra?.voiceNotes ?? "",
        motivation: extra?.motivation ?? "",
        relationships: "",
        taboos: "",
        ...(extra?.gender ? { gender: extra.gender } : {}),
      })
      charMapRef.current.set(normalizeKey(name), char)
      setCharacters((prev) => [...prev, char])
      return char
    },
    [workId],
  )

  const createTerm = useCallback(
    async (name: string, note = ""): Promise<BibleGlossaryTerm> => {
      if (!workId) throw new Error("workId is null")
      const term = await addBibleGlossaryTerm(workId, { term: name, note })
      termMapRef.current.set(normalizeKey(name), term)
      setGlossaryTerms((prev) => [...prev, term])
      return term
    },
    [workId],
  )

  const updateCharacterFn = useCallback(async (id: string, patch: CharacterPatch) => {
    await updateBibleCharacter(id, patch)
    setCharacters((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
    // 同步 ref（不涉及 name key 变化时无需重建整个 map）
    const updated = charMapRef.current
    for (const [k, v] of updated) {
      if (v.id === id) {
        updated.set(k, { ...v, ...patch })
        break
      }
    }
  }, [])

  const updateTermFn = useCallback(async (id: string, patch: TermPatch) => {
    await updateBibleGlossaryTerm(id, patch)
    setGlossaryTerms((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
    const updated = termMapRef.current
    for (const [k, v] of updated) {
      if (v.id === id) {
        updated.set(k, { ...v, ...patch })
        break
      }
    }
  }, [])

  return {
    characters,
    glossaryTerms,
    findCharacter,
    findTerm,
    characterNames: characters.map((c) => c.name),
    termNames: glossaryTerms.map((t) => t.term),
    createCharacter,
    createTerm,
    updateCharacter: updateCharacterFn,
    updateTerm: updateTermFn,
    refresh: load,
  }
}
