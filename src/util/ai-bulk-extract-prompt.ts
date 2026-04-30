/**
 * 跨作品 AI 批量提取人物 / 词条：
 * 给 AI 喂入指定作品的若干章节正文，让其输出 JSON 数组，前端解析后供用户勾选。
 *
 * 与 src/components/study/AiGenerateCharacterModal.tsx 的"单角色生成"区别：
 * - 单角色：1 条 prompt + 6 章上下文 → 1 个 JSON 对象
 * - 此处：直接读全章正文 → JSON 数组（多个对象）
 */

import type { AiChatMessage } from "../ai/types";
import type { Chapter } from "../db/types";

/** AI 提取的人物草稿（无 DB id，导入时再 addCharacter 生成）*/
export type ExtractedCharacterDraft = {
  /** 临时合成的 id，仅用于前端勾选追踪；写入时丢弃 */
  id: string;
  name: string;
  motivation: string;
  voiceNotes: string;
  relationships: string;
  taboos: string;
};

/** AI 提取的词条草稿 */
export type ExtractedTermDraft = {
  id: string;
  term: string;
  category: "name" | "term";
  note: string;
};

/** 单章节最多取多少字（避免单章超长把 prompt 撑爆）*/
export const PER_CHAPTER_CHAR_CAP = 1500;
/** 总 prompt 字符上限（粗略对应 token 上限；中文 1 字符 ≈ 1 token）*/
export const TOTAL_CHAR_CAP = 80_000;
/** system + user 前缀等粗略加成（与正文合计用于「约多少 token」提示，非精确计费） */
export const EXTRACT_PROMPT_OVERHEAD_CHARS = 1400;

function accumulateChapterSegments(
  sortedWithContent: Chapter[],
): { selected: Chapter[]; totalChars: number; truncated: boolean } {
  let totalChars = 0;
  let truncated = false;
  const selected: Chapter[] = [];
  for (const ch of sortedWithContent) {
    const raw = (ch.content ?? "").replace(/\s+/g, " ").trim();
    const segment = raw.slice(0, PER_CHAPTER_CHAR_CAP);
    if (raw.length > PER_CHAPTER_CHAR_CAP) truncated = true;
    if (totalChars + segment.length > TOTAL_CHAR_CAP) {
      truncated = true;
      break;
    }
    totalChars += segment.length;
    selected.push({ ...ch, content: segment });
  }
  return { selected, totalChars, truncated };
}

/** 选取章节并截断每章正文，避免超 token；按 order 升序保留前 N 章 */
export function selectChaptersForExtract(
  chapters: Chapter[],
  maxChapters: number,
): { selected: Chapter[]; totalChars: number; truncated: boolean } {
  const sorted = [...chapters]
    .filter((c) => (c.content ?? "").trim())
    .sort((a, b) => a.order - b.order);
  const limited = sorted.slice(0, Math.max(1, maxChapters));
  return accumulateChapterSegments(limited);
}

/** 按用户勾选的章节 id（order 升序）拼接，仍受单章与总字数上限约束 */
export function selectChaptersForExtractByIds(
  chapters: Chapter[],
  chapterIds: string[],
): { selected: Chapter[]; totalChars: number; truncated: boolean } {
  const idSet = new Set(chapterIds);
  const sorted = [...chapters]
    .filter((c) => idSet.has(c.id) && (c.content ?? "").trim())
    .sort((a, b) => a.order - b.order);
  return accumulateChapterSegments(sorted);
}

/** 预估将进入模型的正文约字数、是否截断、输入侧 token 粗算（1 字≈1 token + 固定开销） */
export function estimateExtractInputPreview(
  chapters: Chapter[],
  chapterIds: string[],
): { totalChars: number; truncated: boolean; effectiveChapters: number; inputTokensApprox: number } {
  const { selected, totalChars, truncated } = selectChaptersForExtractByIds(chapters, chapterIds);
  const inputTokensApprox = Math.ceil(totalChars + EXTRACT_PROMPT_OVERHEAD_CHARS);
  return {
    totalChars,
    truncated,
    effectiveChapters: selected.length,
    inputTokensApprox,
  };
}

function joinChapterText(chapters: Chapter[]): string {
  return chapters
    .map((ch) => `【第${ch.order}章 ${ch.title || "无题"}】\n${ch.content ?? ""}`)
    .join("\n\n---\n\n");
}

const CHARACTER_SYSTEM = `你是一个小说人物提取助手。我会给你一部小说的若干章节正文，请提取出其中**所有重要角色**（包括主角、配角、反派；轻微出场或仅被提及的可酌情忽略）。

严格按下列 JSON 数组格式返回，**不要**任何解释、Markdown 包裹或前后缀：

[
  {
    "name": "角色名（中文，必填，不超过 15 字）",
    "motivation": "角色身份与目标动机（一两句，最多 200 字）",
    "voiceNotes": "性格 / 说话风格 / 显著特征（最多 200 字）",
    "relationships": "与其他主要角色的关系（如：与某某是兄妹 / 师徒 / 仇敌；最多 200 字）",
    "taboos": "禁忌或避讳（如有；可空）"
  }
]

要求：
1. 同一角色不要重复（按姓名去重）
2. 信息缺失的字段填空字符串 ""，不要填"未知"或"无"
3. 仅返回数组本身，开头是 [，结尾是 ]，中间不要有任何其他字符
4. 角色不超过 50 个；若实际更多，按重要度优先返回前 50`;

const TERM_SYSTEM = `你是一个小说设定词条提取助手。我会给你一部小说的若干章节正文，请提取其中的**世界观设定 / 功法名称 / 物品 / 地名 / 组织 / 重要术语**等词条（不要提取人物姓名——人物会另行处理）。

严格按下列 JSON 数组格式返回，**不要**任何解释或 Markdown 包裹：

[
  {
    "term": "词条名（必填，不超过 20 字）",
    "category": "term",
    "note": "词条解释（一两句，最多 200 字）"
  }
]

要求：
1. category 一律填 "term"
2. 同名词条不要重复
3. 仅返回数组本身，开头是 [，结尾是 ]
4. 词条不超过 50 个`;

/** 构造提取角色的对话消息 */
export function buildExtractCharactersMessages(args: {
  chapters: Chapter[];
  workTitle: string;
  /** 与 chapterIds 二选一：未传 chapterIds 时用前 maxChapters 章 */
  maxChapters?: number;
  /** 若传入且非空，则只使用这些章节（order 升序，仍受字数上限截断） */
  chapterIds?: string[];
}): { messages: AiChatMessage[]; scannedChapters: number; totalChars: number; truncated: boolean } {
  const useIds = Array.isArray(args.chapterIds) && args.chapterIds.length > 0;
  const { selected, totalChars, truncated } = useIds
    ? selectChaptersForExtractByIds(args.chapters, args.chapterIds!)
    : selectChaptersForExtract(args.chapters, args.maxChapters ?? 50);
  const scopeLabel = useIds ? `已选 ${selected.length} 章` : `前 ${selected.length} 章`;
  const userText = `小说《${args.workTitle || "未命名作品"}》正文（${scopeLabel}）：

${joinChapterText(selected)}

请提取角色清单。`;
  return {
    messages: [
      { role: "system", content: CHARACTER_SYSTEM },
      { role: "user", content: userText },
    ],
    scannedChapters: selected.length,
    totalChars,
    truncated,
  };
}

/** 构造提取词条的对话消息 */
export function buildExtractTermsMessages(args: {
  chapters: Chapter[];
  workTitle: string;
  maxChapters?: number;
  chapterIds?: string[];
}): { messages: AiChatMessage[]; scannedChapters: number; totalChars: number; truncated: boolean } {
  const useIds = Array.isArray(args.chapterIds) && args.chapterIds.length > 0;
  const { selected, totalChars, truncated } = useIds
    ? selectChaptersForExtractByIds(args.chapters, args.chapterIds!)
    : selectChaptersForExtract(args.chapters, args.maxChapters ?? 50);
  const scopeLabel = useIds ? `已选 ${selected.length} 章` : `前 ${selected.length} 章`;
  const userText = `小说《${args.workTitle || "未命名作品"}》正文（${scopeLabel}）：

${joinChapterText(selected)}

请提取设定词条清单。`;
  return {
    messages: [
      { role: "system", content: TERM_SYSTEM },
      { role: "user", content: userText },
    ],
    scannedChapters: selected.length,
    totalChars,
    truncated,
  };
}

/**
 * 容错从 AI 输出中抽出 JSON 数组：
 * - 兼容 ```json ... ``` 包裹
 * - 兼容数组前后有解释文字
 * - 流式中途被掐断、最后一项不完整时，截断到上一个完整对象
 */
function extractJsonArray(text: string): string | null {
  const stripped = text
    .replace(/^[\s\S]*?```(?:json)?\s*/i, "")
    .replace(/```[\s\S]*$/i, "")
    .trim();
  // 尝试两种：剥过 fence 的 stripped；以及原文
  for (const candidate of [stripped, text]) {
    const start = candidate.indexOf("[");
    if (start < 0) continue;
    // 找配对的 ]，注意忽略字符串内的 ]
    let depth = 0;
    let inStr = false;
    let escaped = false;
    let end = -1;
    for (let i = start; i < candidate.length; i++) {
      const ch = candidate[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (inStr) {
        if (ch === "\\") escaped = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === "[") depth += 1;
      else if (ch === "]") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end > start) return candidate.slice(start, end + 1);
    // 流式被掐：尝试找最后一个 } 然后补 ]
    const lastObj = candidate.lastIndexOf("}");
    if (lastObj > start) {
      return candidate.slice(start, lastObj + 1) + "]";
    }
  }
  return null;
}

function ensureString(v: unknown, max = 1000): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

let synthIdCounter = 0;
function synthId(prefix: string): string {
  synthIdCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${synthIdCounter}`;
}

/** 解析 AI 返回的角色 JSON 数组；解析失败返回 [] */
export function parseExtractedCharacters(text: string): ExtractedCharacterDraft[] {
  const json = extractJsonArray(text);
  if (!json) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const out: ExtractedCharacterDraft[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const name = ensureString(obj.name, 50);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: synthId("char"),
      name,
      motivation: ensureString(obj.motivation, 800),
      voiceNotes: ensureString(obj.voiceNotes ?? obj.personality, 800),
      relationships: ensureString(obj.relationships, 800),
      taboos: ensureString(obj.taboos, 400),
    });
  }
  return out;
}

/** 解析 AI 返回的词条 JSON 数组；解析失败返回 [] */
export function parseExtractedTerms(text: string): ExtractedTermDraft[] {
  const json = extractJsonArray(text);
  if (!json) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const out: ExtractedTermDraft[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const term = ensureString(obj.term, 100);
    if (!term) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: synthId("term"),
      term,
      category: "term",
      note: ensureString(obj.note ?? obj.description, 800),
    });
  }
  return out;
}
