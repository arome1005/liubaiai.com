/**
 * 推演知识库抽取：从规划节点内容中提取人物与世界观词条，用于推送时落入书斋。
 * 冲突点不入库，仅保留在细纲正文与结构化字段。
 * 分层收敛原则：总纲少量核心条目，大纲/卷纲/细纲逐层细化。
 */
import type { PlanningNodeStructuredMeta, TuiyanPlanningLevel } from "../db/types";
import type { TuiyanExtractedCharacter, TuiyanExtractedTerm } from "../db/types";
import { generateWithProvider } from "./client";
import { isLocalAiProvider } from "./local-provider";
import { getProviderConfig, loadAiSettings } from "./storage";
import type { AiSettings } from "./types";

export type KnowledgeExtractInput = {
  nodeId: string;
  level: TuiyanPlanningLevel;
  title: string;
  content: string;
  structuredMeta?: PlanningNodeStructuredMeta;
};

export type KnowledgeExtractResult = {
  characters: TuiyanExtractedCharacter[];
  terms: TuiyanExtractedTerm[];
};

// ── 每层最大抽取数量（分层收敛）────────────────────────────────────────────────

const MAX_CHARS_BY_LEVEL: Record<TuiyanPlanningLevel, number> = {
  master_outline: 6,
  outline: 4,
  volume: 6,
  chapter_outline: 4,
  chapter_detail: 3,
};

const MAX_TERMS_BY_LEVEL: Record<TuiyanPlanningLevel, number> = {
  master_outline: 8,
  outline: 6,
  volume: 10,
  chapter_outline: 6,
  chapter_detail: 4,
};

// ── 估算 token 消耗（粗略，供 UI 展示）──────────────────────────────────────

/** 估算单个节点的输入 token 数（中文约 1.5 字/token，英文约 4 字/token，粗算） */
function estimateInputTokens(input: KnowledgeExtractInput): number {
  const text = [
    input.title,
    input.content,
    ...Object.values(input.structuredMeta ?? {}),
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return Math.ceil(text.length / 1.5);
}

/** 估算一批节点的总 token 消耗区间（输入 + 输出） */
export function estimateKnowledgeTokenRange(inputs: KnowledgeExtractInput[]): {
  low: number;
  high: number;
} {
  const inputTotal = inputs.reduce((s, n) => s + estimateInputTokens(n), 0);
  const outputEst = inputs.length * 600;
  return {
    low: Math.round((inputTotal + outputEst) * 0.8),
    high: Math.round((inputTotal + outputEst) * 1.4),
  };
}

// ── 系统 Prompt ───────────────────────────────────────────────────────────────

function buildSystemPrompt(level: TuiyanPlanningLevel): string {
  const maxChars = MAX_CHARS_BY_LEVEL[level];
  const maxTerms = MAX_TERMS_BY_LEVEL[level];

  return `你是小说世界观整理助手。请从用户提供的规划节点内容中抽取人物与世界观词条。

规则：
- 人物：只抽取有名有姓（或明确绰号）的人物，最多 ${maxChars} 个。
- 词条：从以下类别中选取本节点最核心的条目，最多 ${maxTerms} 个：
  功法、武器、丹药、境界、术法、阵法、神通、法则、法宝、秘境、禁地、宗门、势力、种族、血统、体质、妖兽、灵植、矿产、材料、货币、历史、纪元、信仰、神祇、律法、禁忌、伏笔、线索、主线、预言、传说、位面、星系、战绩、遗迹、契约、权能、宿命、灵根、心魔、天劫、图腾、神格、信仰力、战阵、兵法、流言、真相、绰号、地点
- 不要抽取冲突点（conflictPoints）。
- 简写即可，body 字段 50-150 字。

必须严格输出以下 JSON，不要输出任何其他内容：
{
  "characters": [
    { "name": "人物名", "motivation": "动机/目的（简短）", "relationships": "主要关系（简短）", "voiceNotes": "口吻/性格特征（简短）", "taboos": "禁忌/不可触碰事项（简短）" }
  ],
  "terms": [
    { "entryKind": "类别（如：功法）", "title": "词条名称", "body": "简短说明" }
  ]
}`;
}

// ── 解析 JSON 输出 ────────────────────────────────────────────────────────────

function parseExtractOutput(
  raw: string,
  input: KnowledgeExtractInput,
): KnowledgeExtractResult {
  const characters: TuiyanExtractedCharacter[] = [];
  const terms: TuiyanExtractedTerm[] = [];

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { characters, terms };
    const parsed = JSON.parse(jsonMatch[0]) as {
      characters?: Array<{
        name?: string;
        motivation?: string;
        relationships?: string;
        voiceNotes?: string;
        taboos?: string;
      }>;
      terms?: Array<{
        entryKind?: string;
        title?: string;
        body?: string;
      }>;
    };

    for (const c of parsed.characters ?? []) {
      if (!c.name?.trim()) continue;
      characters.push({
        name: c.name.trim(),
        motivation: c.motivation?.trim() ?? "",
        relationships: c.relationships?.trim() ?? "",
        voiceNotes: c.voiceNotes?.trim() ?? "",
        taboos: c.taboos?.trim() ?? "",
        sourceLevel: input.level,
        sourceNodeId: input.nodeId,
      });
    }

    for (const t of parsed.terms ?? []) {
      if (!t.title?.trim()) continue;
      terms.push({
        entryKind: t.entryKind?.trim() ?? "设定",
        title: t.title.trim(),
        body: t.body?.trim() ?? "",
        sourceLevel: input.level,
        sourceNodeId: input.nodeId,
      });
    }
  } catch {
    // 解析失败时返回空结果，上层处理
  }

  return { characters, terms };
}

// ── 单节点抽取 ─────────────────────────────────────────────────────────────────

async function extractFromNode(
  input: KnowledgeExtractInput,
  settings: AiSettings,
  signal?: AbortSignal,
): Promise<KnowledgeExtractResult> {
  const cfg = getProviderConfig(settings, settings.provider);
  const meta = input.structuredMeta ?? {};
  const metaText = Object.entries(meta)
    .filter(([, v]) => v?.trim())
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  const userText = [
    `节点标题：${input.title}`,
    `层级：${input.level}`,
    input.content?.trim() ? `内容：\n${input.content}` : "",
    metaText ? `结构化字段：\n${metaText}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const r = await generateWithProvider({
    provider: settings.provider,
    config: cfg,
    messages: [
      { role: "system", content: buildSystemPrompt(input.level) },
      { role: "user", content: userText },
    ],
    temperature: 0.3,
    signal,
  });

  const raw = (r.text ?? "").trim();
  if (!raw) return { characters: [], terms: [] };
  return parseExtractOutput(raw, input);
}

// ── 批量抽取（串行，可 abort）────────────────────────────────────────────────

export async function extractKnowledgeFromNodes(args: {
  inputs: KnowledgeExtractInput[];
  settings?: AiSettings;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}): Promise<KnowledgeExtractResult> {
  const settings = args.settings ?? loadAiSettings();

  if (!isLocalAiProvider(settings.provider)) {
    if (!settings.privacy.consentAccepted || !settings.privacy.allowCloudProviders) {
      throw new Error("请先在设置中同意云端 AI 并允许调用。");
    }
    if (!settings.privacy.allowMetadata) {
      throw new Error("知识库生成需上传节点信息，请在隐私设置中允许作品元数据。");
    }
  }

  const allCharacters: TuiyanExtractedCharacter[] = [];
  const allTerms: TuiyanExtractedTerm[] = [];
  const seenCharKeys = new Set<string>();
  const seenTermKeys = new Set<string>();

  for (let i = 0; i < args.inputs.length; i++) {
    args.signal?.throwIfAborted();
    const result = await extractFromNode(args.inputs[i], settings, args.signal);

    for (const c of result.characters) {
      const key = c.name.replace(/\s/g, "").toLowerCase();
      if (!seenCharKeys.has(key)) {
        seenCharKeys.add(key);
        allCharacters.push(c);
      }
    }
    for (const t of result.terms) {
      const key = (t.entryKind + t.title).replace(/\s/g, "").toLowerCase();
      if (!seenTermKeys.has(key)) {
        seenTermKeys.add(key);
        allTerms.push(t);
      }
    }

    args.onProgress?.(i + 1, args.inputs.length);
  }

  return { characters: allCharacters, terms: allTerms };
}
