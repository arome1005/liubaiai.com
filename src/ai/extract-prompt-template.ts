/**
 * 藏经 → 提炼提示词（Sprint §藏经-Phase1）
 *
 * 基于摘录文本或整书 chunkTexts，生成结构化的 Prompt Template 正文。
 * 输出格式遵循规格 §4.1：
 *   ## 任务
 *   ## 输入（变量）
 *   ## 输出要求
 *
 * 支持流式回调（onDelta），与 reference-extract.ts 管线一致。
 */

import { generateWithProviderStream } from "./client";
import { isLocalAiProvider } from "./local-provider";
import { getProviderConfig, loadAiSettings } from "./storage";
import type { AiSettings } from "./types";
import type { PromptType } from "../db/types";

// ── 每种类型的提炼指令 ────────────────────────────────────────────────────────

const TYPE_INSTRUCTIONS: Record<
  PromptType,
  { label: string; taskDesc: string; outputRules: string }
> = {
  continue: {
    label: "续写",
    taskDesc: "根据提供的章节上下文，续写符合本书节奏与风格的正文片段。",
    outputRules: `- 输出为可直接接续正文的文本，不得复述前文
- 句式与节奏须贴合参考原著的叙事风格（短句/长句比例参见参考原著）
- 若涉及打斗/动作场景，须体现镜头调度感（推、拉、切）
- 禁止流水账与套路化开场（"时间飞逝""不知不觉"等）
- 长度参考：500-1500 字`,
  },
  outline: {
    label: "大纲",
    taskDesc: "为小说生成全书结构化大纲，包含卷/章层级与每章核心剧情。",
    outputRules: `- 输出 Markdown 有序列表，3-6 卷，每卷 6-15 章
- 每章一行：「第 N 章 标题 — 剧情推进 + 冲突点/信息增量」
- 须体现清晰的主线弧度与角色成长节拍
- 不堆砌细节，只给骨架`,
  },
  volume: {
    label: "卷纲",
    taskDesc: "针对指定卷，生成本卷所有章节标题与节拍规划。",
    outputRules: `- 输出 6-12 章标题 + 一句话核心剧情
- 三段节拍：开端（2-3 条要点）/ 发展（2-3 条）/ 高潮（2-3 条）
- 标注本卷核心冲突与结尾钩子`,
  },
  scene: {
    label: "细纲",
    taskDesc: "将一个章节拆分为 6-12 个场景，给出每个场景的执行指令。",
    outputRules: `- 每个场景包含：目的、冲突/张力、信息增量、结尾钩子、建议字数
- 输出 Markdown 列表，场景间须有因果/转折逻辑
- 不描写具体内容，只给场景结构指令`,
  },
  style: {
    label: "写作风格",
    taskDesc: "提炼参考原著的写作风格约束块，供注入 AI 侧栏或额外要求。",
    outputRules: `- 句式偏好：长/短句比例、常用句型
- 用词倾向：文白比例、生僻字使用频率、动词密度
- 比喻密度与类型（明喻/暗喻/通感）
- 情绪张力曲线特征（压抑→爆发 / 平稳克制等）
- 反例：明确写出"不要写成哪种风格"
- 整体输出为可直接粘贴进「额外要求」的约束段落`,
  },
  opening: {
    label: "黄金开篇",
    taskDesc: "提炼参考原著开篇章节的黄金法则，生成可复用的开篇写作指令。",
    outputRules: `- 分析参考原著前 3 章的钩子类型（悬念/动作/世界观冲击/人物魅力等）
- 提炼开篇"禁止清单"（3-5 条反例）
- 给出一套「开篇执行公式」：第 1 段做什么、第 2 段做什么……
- 输出为指令性正文，可直接作为 Prompt Template`,
  },
  character: {
    label: "人设",
    taskDesc: "基于参考原著中的典型角色，生成可复用的人设创作提示词。",
    outputRules: `- 提炼角色三核：核心欲望、核心矛盾、标志性行为模式
- 给出人设创作公式：如何在 1000 字内立住一个角色
- 反例：常见扁平化/工具人写法的特征
- 输出可直接注入 AI 侧栏的人设创作指令块`,
  },
  worldbuilding: {
    label: "世界观",
    taskDesc: "提炼参考原著的世界观建构方式，生成世界观创作提示词。",
    outputRules: `- 提炼该书世界观"披露节奏"策略（埋设 vs. 揭示时机）
- 核心规则体系的结构化公式（修炼体系/政治/地理等）
- 常见世界观写崩的失误（与该书的成功对照）
- 输出为世界观创作指令，可直接用于推演或续写辅助`,
  },
};

// ── 隐私校验 ─────────────────────────────────────────────────────────────────

export class PromptExtractError extends Error {
  override readonly name = "PromptExtractError";
  constructor(message: string) {
    super(message);
  }
}

function assertCanExtract(settings: AiSettings): void {
  const cloud = !isLocalAiProvider(settings.provider);
  if (!cloud) return;
  if (!settings.privacy.consentAccepted || !settings.privacy.allowCloudProviders) {
    throw new PromptExtractError("请先在设置中同意云端 AI 并允许调用。");
  }
  if (!settings.privacy.allowChapterContent) {
    throw new PromptExtractError(
      "提炼提示词需将参考原文发送给 AI，请在隐私设置中开启「允许正文上云」。",
    );
  }
}

// ── 核心函数 ─────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `你是专业的网文创作顾问，擅长从参考原著中提炼可复用的写作提示词模板（Prompt Template）。
你的输出必须是结构化的 Markdown 提示词模板，格式严格如下：

## 任务
<一段话描述 AI 要完成的写作任务>

## 输入（变量）
- 参考书目：{{ref_title}}
- 作品标题：{{work_title}}
- 章节标题：{{chapter_title}}
- 章节正文（节选）：{{chapter_content}}
- 额外要求（可选）：{{user_hint}}

## 输出要求
<基于参考原著风格提炼的具体要求，以条目列出>

不要输出其他内容。不要开场白。不要解释你在做什么。直接输出模板正文。`;

/** 摘录提炼为提示词（入口 A） */
export async function extractPromptTemplateFromExcerpt(args: {
  excerptText: string;
  excerptNote?: string;
  bookTitle: string;
  type: PromptType;
  overrideProvider?: import("./types").AiProviderId;
  onDelta?: (delta: string) => void;
  signal?: AbortSignal;
  workId?: string | null;
}): Promise<string> {
  const settings = loadAiSettings();
  const provider = args.overrideProvider ?? settings.provider;
  assertCanExtract({ ...settings, provider });
  const config = getProviderConfig(settings, provider);
  const { taskDesc, outputRules, label } = TYPE_INSTRUCTIONS[args.type];

  const userPrompt = `【参考书目】《${args.bookTitle}》

【摘录原文】
${args.excerptText.trim()}
${args.excerptNote?.trim() ? `\n【摘录备注】${args.excerptNote.trim()}` : ""}

【任务类型】${label}（${args.type}）

请根据以上摘录，提炼一个「${label}」类型的可复用提示词模板，用于辅助写相似风格的小说。

模板任务参考：${taskDesc}

输出要求的最低规范：
${outputRules}

请严格按照 Markdown 三段结构输出（## 任务 / ## 输入（变量）/ ## 输出要求），不要输出其他内容。`;

  let result = "";
  await generateWithProviderStream({
    provider,
    config,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    signal: args.signal,
    usageLog: { task: `藏经·提示词·${label}`, workId: args.workId },
    onDelta: (delta) => {
      result += delta;
      args.onDelta?.(delta);
    },
  });

  if (!result.trim()) {
    throw new PromptExtractError("提炼结果为空，请换一段摘录或调整类型重试。");
  }
  return result;
}

/** 整书 chunkTexts 提炼为提示词（入口 B） */
export async function extractPromptTemplateFromBook(args: {
  chunkTexts: string[];
  bookTitle: string;
  type: PromptType;
  overrideProvider?: import("./types").AiProviderId;
  onDelta?: (delta: string) => void;
  signal?: AbortSignal;
  workId?: string | null;
}): Promise<string> {
  const settings = loadAiSettings();
  const provider = args.overrideProvider ?? settings.provider;
  assertCanExtract({ ...settings, provider });
  const config = getProviderConfig(settings, provider);
  const { taskDesc, outputRules, label } = TYPE_INSTRUCTIONS[args.type];

  // 整书：取前 20000 字（避免超上下文）
  const MAX_CHARS = 20_000;
  const combined = args.chunkTexts.join("\n\n");
  const excerpt =
    combined.length > MAX_CHARS
      ? combined.slice(0, MAX_CHARS) + "\n\n…（原文已截断，仅取前段）"
      : combined;

  const userPrompt = `【参考书目】《${args.bookTitle}》（整书节选，共 ${args.chunkTexts.length} 块）

【原著节选】
${excerpt}

【任务类型】${label}（${args.type}）

请根据以上整书内容，提炼一个「${label}」类型的可复用提示词模板。

模板任务参考：${taskDesc}

输出要求的最低规范：
${outputRules}

请严格按照 Markdown 三段结构输出（## 任务 / ## 输入（变量）/ ## 输出要求），不要输出其他内容。`;

  let result = "";
  await generateWithProviderStream({
    provider,
    config,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    signal: args.signal,
    usageLog: { task: `藏经·提示词·整书·${label}`, workId: args.workId },
    onDelta: (delta) => {
      result += delta;
      args.onDelta?.(delta);
    },
  });

  if (!result.trim()) {
    throw new PromptExtractError("提炼结果为空，请尝试切换类型或检查书目内容。");
  }
  return result;
}