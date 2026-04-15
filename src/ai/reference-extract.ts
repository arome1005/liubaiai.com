/**
 * P1-03 · 藏经·提炼要点
 *
 * 对参考书目（原著）做四类结构化提炼：
 *   - characters    人物关系网络
 *   - worldbuilding 世界观规则
 *   - plot_beats    情节节拍
 *   - craft         技法摘要
 *
 * 原著全文分块后 **批量** 发送给 AI，输出 Markdown 格式正文。
 * 支持流式回调（onDelta），方便 UI 实时展示。
 */
import { generateWithProviderStream } from "./client";
import { isLocalAiProvider } from "./local-provider";
import { getProviderConfig, loadAiSettings } from "./storage";
import type { AiSettings } from "./types";
import type { ReferenceExtractType } from "../db/types";

/** 每批最多喂给 AI 的原文字符数（避免超上下文） */
const BATCH_MAX_CHARS = 28_000;

// ── 每种类型的提炼指令 ────────────────────────────────────────────────────

const TYPE_CONFIGS: Record<
  ReferenceExtractType,
  { label: string; instruction: string }
> = {
  characters: {
    label: "人物关系网络",
    instruction: `请从以下原著片段中**提炼人物关系网络**，要求：
- 列出所有出现的主要人物（姓名 + 一句核心身份描述）
- 标注人物间的关系（家庭/师徒/对立/盟友/恋爱等），形如：A → B（关系描述）
- 若有阵营、门派、家族结构，请单列一节说明
- 输出纯 Markdown，无需开场白，直接给内容
- 简洁即可，不要堆砌原文引用`,
  },
  worldbuilding: {
    label: "世界观规则",
    instruction: `请从以下原著片段中**提炼世界观规则**，要求：
- 提炼修炼/魔法/科技/政治体系的核心规则（条目化）
- 地理、种族、历史背景中的关键设定
- 物品/道具/特殊概念的定义（如有）
- 输出纯 Markdown 条目列表，无需开场白，直接给内容
- 聚焦"规则和设定"，不要复述情节`,
  },
  plot_beats: {
    label: "情节节拍",
    instruction: `请从以下原著片段中**提炼情节节拍**，要求：
- 按时序列出核心事件（每条一句话，含因果关系）
- 标注关键转折点（用「转折：」前缀）
- 标注高潮场景（用「高潮：」前缀）
- 输出纯 Markdown 有序列表，无需开场白，直接给内容
- 不要细节描写，只要骨架`,
  },
  craft: {
    label: "技法摘要",
    instruction: `请从以下原著片段中**提炼写作技法**，要求：
- 分析作者常用的叙事技巧（视角/节奏/蒙太奇/伏笔等）
- 提炼句式、段落结构的典型风格特征
- 如有独特的描写手法（环境/动作/对话），各举 1-2 处原文例子说明
- 输出纯 Markdown，无需开场白，直接给内容
- 聚焦"技巧本身"，供仿写参考`,
  },
};

// ── 隐私校验 ─────────────────────────────────────────────────────────────

export class ReferenceExtractError extends Error {
  override readonly name = "ReferenceExtractError";
  constructor(message: string) {
    super(message);
  }
}

function assertCanExtract(settings: AiSettings): void {
  const cloud = !isLocalAiProvider(settings.provider);
  if (!cloud) return;
  if (!settings.privacy.consentAccepted || !settings.privacy.allowCloudProviders) {
    throw new ReferenceExtractError("请先在设置中同意云端 AI 并允许调用。");
  }
  if (!settings.privacy.allowChapterContent) {
    throw new ReferenceExtractError(
      "提炼要点需将参考原文发送给 AI，请在隐私设置中开启「允许正文上云」。",
    );
  }
}

// ── 核心函数 ─────────────────────────────────────────────────────────────

/**
 * 将 chunks 按 BATCH_MAX_CHARS 分批合并，返回分批列表。
 * 这样大书（几十万字）也能分多轮处理再合并。
 */
function splitIntoBatches(chunkTexts: string[]): string[] {
  const batches: string[] = [];
  let cur = "";
  for (const text of chunkTexts) {
    if (cur.length + text.length > BATCH_MAX_CHARS && cur.length > 0) {
      batches.push(cur);
      cur = text;
    } else {
      cur += (cur ? "\n\n" : "") + text;
    }
  }
  if (cur) batches.push(cur);
  return batches;
}

/**
 * 提炼要点主函数。
 *
 * @param args.chunkTexts  书目所有分块的正文文本数组（由调用方从 IndexedDB 读取）
 * @param args.type        提炼类型
 * @param args.bookTitle   书名（用于 prompt 提示）
 * @param args.onDelta     流式回调（每个增量片段）
 * @param args.signal      AbortController signal
 * @returns 完整提炼结果（Markdown 文本）
 */
export async function extractReferenceContent(args: {
  chunkTexts: string[];
  type: ReferenceExtractType;
  bookTitle: string;
  onDelta?: (delta: string) => void;
  signal?: AbortSignal;
}): Promise<string> {
  const { chunkTexts, type, bookTitle, onDelta, signal } = args;
  const settings = loadAiSettings();
  assertCanExtract(settings);
  const config = getProviderConfig(settings, settings.provider);
  const { instruction, label } = TYPE_CONFIGS[type];

  const batches = splitIntoBatches(chunkTexts);
  if (batches.length === 0) {
    throw new ReferenceExtractError("书目内容为空，无法提炼。");
  }

  const systemPrompt = `你是专业的文学分析助手，协助网文/小说作者从参考原著中提炼创作参考资料。请严格按照用户指令输出，不要添加无关说明。`;

  let fullResult = "";

  // 多批次时先每批独立提炼，最后合并整理
  const batchResults: string[] = [];

  for (let i = 0; i < batches.length; i++) {
    if (signal?.aborted) break;
    const isLast = i === batches.length - 1;
    const batchLabel =
      batches.length > 1
        ? `（第 ${i + 1}/${batches.length} 批）`
        : "";
    const userPrompt = `【书名】${bookTitle}${batchLabel}

【原著片段】
${batches[i]}

【任务】
${instruction}`;

    let batchText = "";
    await generateWithProviderStream({
      provider: settings.provider,
      config,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      signal,
      onDelta: (delta) => {
        batchText += delta;
        onDelta?.(delta);
      },
    });
    batchResults.push(batchText);

    // 批次间分隔符
    if (!isLast && !signal?.aborted) {
      const sep = `\n\n---\n\n`;
      onDelta?.(sep);
      batchResults.push(sep);
    }
  }

  // 多批次时追加合并整理段落
  if (batches.length > 1 && !signal?.aborted) {
    const mergePrompt = `你是专业的文学分析助手。以下是对《${bookTitle}》按批次提炼的「${label}」结果，请将它们**去重合并**，整理成一份结构清晰的最终版本。不要改变已有内容的准确性，只做结构整理和去重。

${batchResults.join("")}`;

    const mergeHeader = `\n\n---\n\n## 合并整理版本\n\n`;
    onDelta?.(mergeHeader);
    let mergeText = mergeHeader;

    await generateWithProviderStream({
      provider: settings.provider,
      config,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: mergePrompt },
      ],
      signal,
      onDelta: (delta) => {
        mergeText += delta;
        onDelta?.(delta);
      },
    });
    fullResult = mergeText;
  } else {
    fullResult = batchResults.join("");
  }

  return fullResult;
}

/** 返回类型的中文标签 */
export function getExtractTypeLabel(type: ReferenceExtractType): string {
  return TYPE_CONFIGS[type].label;
}

export const EXTRACT_TYPES: ReferenceExtractType[] = [
  "characters",
  "worldbuilding",
  "plot_beats",
  "craft",
];
