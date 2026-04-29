import type { PlanningNodeStructuredMeta, TuiyanImitationMode } from "../db/types";
import { countCharsWithPunct } from "../util/tuiyan-planning";
import {
  type PlanningThickness,
  normalizePlanningThickness,
} from "../util/tuiyan-planning-thickness";
import { logTuiyanReferenceTouchpoint } from "../util/tuiyan-reference-dev-log";
import { mergeTuiyanPlanningSystemWithReferenceHardRules } from "./tuiyan-reference-planning-system";
import { generateWithProviderStream } from "./client";
import { isLocalAiProvider } from "./local-provider";
import { getProviderConfig, loadAiSettings } from "./storage";
import type { AiChatMessage, AiSettings } from "./types";

export type TuiyanPlanningListLevel = "master_outline" | "outline" | "volume" | "chapter_outline";

const PLANNING_TASK_LABEL: Record<TuiyanPlanningListLevel, string> = {
  master_outline: "观云·总纲",
  outline: "观云·一级大纲",
  volume: "观云·卷纲",
  chapter_outline: "观云·章细纲",
};

export class TuiyanPlanningGenerateError extends Error {
  override readonly name = "TuiyanPlanningGenerateError";
  constructor(message: string) {
    super(message);
  }
}

function assertCanSend(settings: AiSettings): void {
  if (isLocalAiProvider(settings.provider)) return;
  if (!settings.privacy.consentAccepted || !settings.privacy.allowCloudProviders) {
    throw new TuiyanPlanningGenerateError("请先在设置中同意云端 AI 并允许调用。");
  }
  if (!settings.privacy.allowMetadata) {
    throw new TuiyanPlanningGenerateError("推演生成需上传作品/节点信息，请在隐私设置中允许作品元数据。");
  }
  if (!settings.privacy.allowChapterContent) {
    throw new TuiyanPlanningGenerateError("推演生成需上传构思/细纲文本，请在隐私设置中允许正文内容。");
  }
}

// ── 字段名 → structuredMeta key 映射 ─────────────────────────────────────────

const FIELD_NAME_MAP: Record<string, keyof PlanningNodeStructuredMeta> = {
  // master_outline
  "核心创意": "logline",
  // outline
  "阶段目标": "stageGoal",
  "人物分配": "characterAllocation",
  "主要势力": "mainFactions",
  "人物弧光": "characterArcs",
  // volume
  "本卷人物": "mainCharacters",
  "核心势力": "coreFactions",
  "关键地点": "keyLocations",
  "关键道具": "keyItems",
  "本卷钩子": "volumeHook",
  // chapter_outline + chapter_detail
  "冲突点": "conflictPoints",
  "登场人物": "appearedCharacters",
  "涉及地点": "locations",
  "关键节拍": "keyBeats",
  "必出现信息": "requiredInfo",
  "标签": "tags",
  // master_outline aliases
  "世界观": "worldSetting",
  "世界观核心词条": "worldSettingTerms",
  "主要冲突": "mainConflict",
  "核心人物": "coreCharacters",
  "故事阶段": "storyStages",
};

// ── 每个层级追加到格式末尾的结构化字段行 ────────────────────────────────────

const LEVEL_STRUCTURED_FIELDS: Record<TuiyanPlanningListLevel, string> = {
  master_outline: `核心创意：
世界观：
世界观核心词条：（用逗号分隔的核心设定词条，如：境界体系名称、特殊力量、核心宗门等，5-15 个）
主要冲突：
核心人物：
故事阶段：`,
  outline: `阶段目标：
人物分配：
主要势力：
人物弧光：`,
  volume: `本卷人物：
核心势力：
关键地点：
关键道具：
本卷钩子：`,
  chapter_outline: `冲突点：
登场人物：
涉及地点：
关键节拍：
必出现信息：
标签：`,
};

function listSystemPrompt(
  level: TuiyanPlanningListLevel,
  count: number,
  thickness: PlanningThickness,
): string {
  const levelLabel =
    level === "master_outline"
      ? "总纲"
      : level === "outline"
        ? "一级大纲"
        : level === "volume"
          ? "卷纲"
          : "章节细纲";
  const outlineListCount = Math.max(1, count);
  const outlinePerItem = Math.max(200, Math.floor(thickness.outlineTotalWithPunct / outlineListCount));
  const levelRules =
    level === "master_outline"
      ? `
- 总纲必须像作品的"灵魂定海神针"，重点写清：核心创意(Logline)、世界观/力量体系、主线起承转合、卖点与风格、不可违背的排他性规则。
- 总纲不需要拆到具体章节，但必须能约束后续大纲、卷纲和章纲，避免后续推演跑偏。
- 【字数要求】摘要正文去掉标点符号后，有效字数必须不低于 ${thickness.masterOutlineMinNoPunct} 字，不足则继续扩写，禁止截断。`
      : level === "outline"
        ? `
- 一级大纲必须服从总纲，把故事拆成可执行的阶段/大剧情，写清阶段目标、人物弧光、关键里程碑与伏笔回收方向。
- 【字数要求】每条一级大纲的摘要含标点不低于 ${outlinePerItem} 字，${count} 条**合计**含标点不低于 ${thickness.outlineTotalWithPunct} 字，不足必须继续扩写。`
        : level === "volume"
          ? `
- 卷纲必须服从总纲与一级大纲，写清本卷地图/势力、小BOSS、关键道具或能力、节奏高潮与卷尾钩子。
- 标题必须使用"第N卷：卷名"的形式，N 与候选序号一致。
- 【字数要求】本卷摘要含标点必须不低于 ${thickness.volumeWithPunct} 字，需充分展开剧情地图、人物行动线与节奏设计，不足必须继续扩写。`
          : `
- 章节细纲必须服从上层所有约束，写清单章目标、冲突推进、场景拆解、爽点/虐点、结尾钩子。
- 标题必须使用"第N章：章名"的形式，N 与候选序号一致。
- 【字数要求】每条章节细纲的标题、摘要与下方各结构化字段**合计**含标点不低于 ${thickness.chapterOutlineMinPerNodeWithPunct} 字，不足必须继续扩写。`;

  const structuredFields = LEVEL_STRUCTURED_FIELDS[level];

  return `你是小说规划助手。请基于用户输入，输出 ${count} 条${levelLabel}候选。
要求：
- 必须紧扣给定上下文，不可与已知设定冲突。
- 每条都要有明确推进价值，不能空泛。
- 后续层级必须向下继承上层约束；若上层已确定风格、设定或排他规则，不得反向推翻。
${levelRules}
- 输出必须严格遵循以下格式，不要输出其它文字：
<<<1>>>
标题：
摘要：
${structuredFields}
<<<2>>>
标题：
摘要：
${structuredFields}
...`;
}

// ── 解析结构化字段块 ─────────────────────────────────────────────────────────

function parseStructuredFields(block: string): PlanningNodeStructuredMeta {
  const result: PlanningNodeStructuredMeta = {};
  // 构造字段名正则（按最长优先排序避免前缀匹配干扰）
  const fieldNames = Object.keys(FIELD_NAME_MAP).sort((a, b) => b.length - a.length);
  const fieldPattern = new RegExp(
    `(${fieldNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})：`,
    "g",
  );

  let match: RegExpExecArray | null;
  const positions: Array<{ name: string; key: keyof PlanningNodeStructuredMeta; start: number }> = [];

  while ((match = fieldPattern.exec(block)) !== null) {
    const name = match[1];
    const key = FIELD_NAME_MAP[name];
    if (key) positions.push({ name, key, start: match.index + match[0].length });
  }

  for (let i = 0; i < positions.length; i++) {
    const { key, start } = positions[i];
    const end = i + 1 < positions.length ? positions[i + 1].start - positions[i + 1].name.length - 1 : block.length;
    const value = block.slice(start, end).trim();
    if (value) (result as Record<string, string>)[key] = value;
  }

  return result;
}

const PARSE_MAX_ITEMS = 100;

function parseListOutput(
  raw: string,
): Array<{ title: string; summary: string; structuredMeta: PlanningNodeStructuredMeta }> {
  const out: Array<{ title: string; summary: string; structuredMeta: PlanningNodeStructuredMeta }> = [];
  for (let i = 1; i <= PARSE_MAX_ITEMS; i++) {
    // 不加 "m" flag：加 m 后 $ 会匹配每行末，lazy [\s\S]*? 遇第一个换行就停，block 只剩一行
    const re = new RegExp(`<<<${i}>>>\\s*([\\s\\S]*?)(?=<<<\\d+>>>|$)`);
    const m = raw.match(re);
    if (!m) continue;
    const block = m[1] ?? "";

    const titleM = block.match(/标题：\s*([^\n]+)/);
    const title = (titleM?.[1] ?? "").trim();

    // 摘要：逐行读取，遇到「2-6字+冒号」格式的字段标签行就停
    const summaryStart = block.indexOf("摘要：");
    const summaryLines: string[] = [];
    if (summaryStart !== -1) {
      const afterSummary = block.slice(summaryStart + "摘要：".length);
      for (const line of afterSummary.split("\n")) {
        if (/^[一-龥一-龥a-zA-Z]{2,6}[：:]/.test(line.trim())) break;
        summaryLines.push(line);
      }
    }
    const summary = summaryLines.join("\n").trim();

    if (title || summary) {
      const structuredMeta = parseStructuredFields(block);
      out.push({ title, summary, structuredMeta });
    }
  }
  return out;
}

// ── 列表层生成 ───────────────────────────────────────────────────────────────

export async function generateTuiyanPlanningList(args: {
  level: TuiyanPlanningListLevel;
  desiredCount: number;
  userInput: string;
  /** 与参考 Tab 全局 `imitationMode` 一致，有参考策略时写入 system 分模式侧重 */
  imitationMode?: TuiyanImitationMode;
  settings?: AiSettings;
  signal?: AbortSignal;
  /** 每收到一批 delta 时回调，参数为已累积的字符数（用于真实进度条） */
  onChunk?: (accumulatedChars: number) => void;
  workId?: string | null;
  /** 与 `normalizePlanningThickness` 对齐；缺省为产品默认（与现 PLANNING_MIN_CHARS 一致 + 章细纲/详细项） */
  planningThickness?: Partial<PlanningThickness>;
}): Promise<{
  items: Array<{ title: string; summary: string; structuredMeta: PlanningNodeStructuredMeta }>;
  rawText: string;
}> {
  const settings = args.settings ?? loadAiSettings();
  assertCanSend(settings);
  const cfg = getProviderConfig(settings, settings.provider);
  if (!isLocalAiProvider(settings.provider) && !cfg.apiKey?.trim()) {
    throw new TuiyanPlanningGenerateError("请先在设置中填写当前模型的 API Key。");
  }
  const t = normalizePlanningThickness(args.planningThickness);
  const count = Math.max(1, Math.min(PARSE_MAX_ITEMS, Math.floor(args.desiredCount)));
  const userInput = args.userInput.trim();
  logTuiyanReferenceTouchpoint(`planning_list:${args.level}`, userInput);
  const messages: AiChatMessage[] = [
    {
      role: "system",
      content: mergeTuiyanPlanningSystemWithReferenceHardRules(listSystemPrompt(args.level, count, t), userInput, {
        imitationMode: args.imitationMode,
      }),
    },
    { role: "user", content: userInput },
  ];
  let accumulated = 0;
  const r = await generateWithProviderStream({
    provider: settings.provider,
    config: cfg,
    messages,
    temperature: Math.min(1.1, Math.max(0.2, settings.geminiTemperature)),
    signal: args.signal,
    usageLog: { task: PLANNING_TASK_LABEL[args.level], workId: args.workId },
    onDelta: (delta) => {
      accumulated += delta.length;
      args.onChunk?.(accumulated);
    },
  });
  const rawText = (r.text ?? "").trim();
  if (!rawText) {
    throw new TuiyanPlanningGenerateError("模型返回为空，请重试或更换模型。");
  }
  const items = parseListOutput(rawText);
  if (!items.length) {
    throw new TuiyanPlanningGenerateError("返回格式未识别，请重试一次或切换模型。");
  }
  return { items, rawText };
}

// ── 详细细纲生成 ─────────────────────────────────────────────────────────────

const DETAIL_STRUCTURED_FIELDS_JSON = `\`\`\`json
{
  "tags": "爽点, 战斗",
  "conflictPoints": "...",
  "appearedCharacters": "人物A—状态；人物B—目的",
  "locations": "场景1 → 场景2",
  "keyBeats": "节拍1 → 节拍2 → 转折 → 钩子",
  "requiredInfo": "必须出现的信息点/伏笔/设定"
}
\`\`\``;

function buildDetailSystemPrompt(minTotalWithPunct: number): string {
  const suggestHi = Math.min(5000, Math.max(1200, Math.floor(minTotalWithPunct * 1.5)));
  return `你是小说规划助手。请输出一份可直接执行的详细细纲。整段输出（含下述 JSON 代码块与后文）含标点**总**字数：不低于 ${minTotalWithPunct} 字，以 ${minTotalWithPunct}–${suggestHi} 字为宜。
内容应包含目标、冲突、推进节奏、关键场景与收束点。

在正文开始之前，先输出以下 JSON 代码块（严格保持字段名不变，未知填空字符串）：
${DETAIL_STRUCTURED_FIELDS_JSON}

然后另起一行输出详细细纲正文，不要附加任何解释。`;
}

type DetailStructuredMeta = Pick<
  PlanningNodeStructuredMeta,
  "tags" | "conflictPoints" | "appearedCharacters" | "locations" | "keyBeats" | "requiredInfo"
>;

function parseDetailOutput(raw: string): {
  text: string;
  structuredMeta: DetailStructuredMeta;
} {
  let structuredMeta: DetailStructuredMeta = {};
  let text = raw;

  try {
    const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/);
    if (jsonMatch?.[1]) {
      const parsed = JSON.parse(jsonMatch[1]) as Record<string, string>;
      structuredMeta = {
        tags: parsed["tags"] ?? "",
        conflictPoints: parsed["conflictPoints"] ?? "",
        appearedCharacters: parsed["appearedCharacters"] ?? "",
        locations: parsed["locations"] ?? "",
        keyBeats: parsed["keyBeats"] ?? "",
        requiredInfo: parsed["requiredInfo"] ?? "",
      };
      text = raw.replace(/```json\s*[\s\S]*?```\s*/, "").trim();
    }
  } catch {
    // 解析失败：structuredMeta 保持空，text 保持原始输出
  }

  return { text, structuredMeta };
}

export async function generateTuiyanPlanningDetail(args: {
  userInput: string;
  imitationMode?: TuiyanImitationMode;
  settings?: AiSettings;
  signal?: AbortSignal;
  /** 每收到一批 delta 时回调，参数为已累积的字符数（用于真实进度条） */
  onChunk?: (accumulatedChars: number) => void;
  workId?: string | null;
  planningThickness?: Partial<PlanningThickness>;
}): Promise<{
  text: string;
  structuredMeta: DetailStructuredMeta;
}> {
  const settings = args.settings ?? loadAiSettings();
  assertCanSend(settings);
  const cfg = getProviderConfig(settings, settings.provider);
  if (!isLocalAiProvider(settings.provider) && !cfg.apiKey?.trim()) {
    throw new TuiyanPlanningGenerateError("请先在设置中填写当前模型的 API Key。");
  }
  const t = normalizePlanningThickness(args.planningThickness);
  const minDetail = t.detailMinTotalWithPunct;
  const userInput = args.userInput.trim();
  logTuiyanReferenceTouchpoint("planning_detail:chapter_detail", userInput);
  const messages: AiChatMessage[] = [
    {
      role: "system",
      content: mergeTuiyanPlanningSystemWithReferenceHardRules(buildDetailSystemPrompt(minDetail), userInput, {
        imitationMode: args.imitationMode,
      }),
    },
    { role: "user", content: userInput },
  ];
  let accumulated = 0;
  const r = await generateWithProviderStream({
    provider: settings.provider,
    config: cfg,
    messages,
    temperature: Math.min(1.0, Math.max(0.2, settings.geminiTemperature)),
    signal: args.signal,
    usageLog: { task: "观云·详细细纲", workId: args.workId },
    onDelta: (delta) => {
      accumulated += delta.length;
      args.onChunk?.(accumulated);
    },
  });
  const raw = (r.text ?? "").trim();
  if (!raw) {
    throw new TuiyanPlanningGenerateError("模型返回为空，请重试或更换模型。");
  }
  if (countCharsWithPunct(raw) < minDetail) {
    throw new TuiyanPlanningGenerateError(
      `详细细纲整段（含 JSON 与正文，含标点）为 ${countCharsWithPunct(raw)} 字，不足 ${minDetail} 字，请重试或调低「高级设置」中的下限。`,
    );
  }
  return parseDetailOutput(raw);
}
