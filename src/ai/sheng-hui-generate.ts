import { clampContextText, formatWorkStyleAndTagProfileBlock, takeTailText, type WritingWorkStyleSlice } from "./assemble-context";
import { generateWithProviderStream } from "./client";
import { isLocalAiProvider, requiresClientSavedApiKey } from "./local-provider";
import { getProviderConfig, getProviderTemperature, loadAiSettings } from "./storage";
import type { AiChatMessage, AiSettings } from "./types";
import { approxRoughTokenCount } from "./approx-tokens";
import { approxTotalTokensForMessages } from "../util/ai-injection-confirm";
import {
  WRITING_RAG_PER_HIT_MAX_CHARS,
  clampReferenceRagSnippetForAssembleBody,
} from "../util/tuiyan-reference-inject-text";
import { findOutlineMentionedCharacterNames } from "../util/sheng-hui-outline-character-detect";

const MAX_OUTLINE_CHARS = 48000;
const MAX_BODY_TAIL_CHARS = 12000;
const MAX_SETTING_INDEX_CHARS = 8000;
/** 生辉「藏经风格参考」多选合并上限：与 `RAG_LIMIT=8` 同宽思路，并硬顶 48k 防单消息过大（第十三批） */
const SHENG_HUI_STYLE_EXCERPTS_COMBINED_MAX_CHARS = Math.min(8 * WRITING_RAG_PER_HIT_MAX_CHARS, 48_000);
const MAX_DRAFT_PROCESS_CHARS = 24000;

/** 人物声音锁：单个人物的语气约束 */
export type CharacterVoiceLock = {
  name: string;
  voiceNotes: string; // 口吻/声音备注
  taboos: string; // 禁忌/禁止词
  /** 锦囊「经典台词」样例（N7） */
  quoteSamples?: string;
};

/**
 * 从大纲文本中检测出现了哪些人物名（与锦囊人物列表交叉匹配）。
 * 实现见 `findOutlineMentionedCharacterNames`（长名优先非重叠、单字名不自动检）。
 */
export function detectCharactersInOutline(
  outlineText: string,
  characters: { name: string }[],
): Set<string> {
  return findOutlineMentionedCharacterNames(outlineText, characters);
}

export function formatCharacterVoiceLocksForPrompt(locks: CharacterVoiceLock[]): string {
  if (!locks.length) return "";
  const lines = locks.map((c) => {
    const parts: string[] = [`【${c.name}】`];
    if (c.voiceNotes.trim()) parts.push(`口吻：${c.voiceNotes.trim()}`);
    if (c.taboos.trim()) parts.push(`禁忌：${c.taboos.trim()}`);
    if (c.quoteSamples?.trim()) parts.push(`经典台词示例：${c.quoteSamples.trim()}`);
    return parts.join("  ");
  });
  return lines.join("\n");
}

/** 场景状态卡：记录上一段落的收尾快照，帮助 AI 精准续接 */
/** 正文末尾段落数选项 */
export type BodyTailParagraphCount = 1 | 3 | 5 | "all";

/**
 * 从正文中取末尾 N 段（按双换行切分），或全部末尾（受 maxChars 保护）。
 * 空段落自动过滤。
 */
/**
 * C.5 修正：`count === "all"` 时改为先按段拆分，从末尾累加直到超 maxChars 为止，
 * 不再把截断点落在段落中间。
 */
export function takeTailByParagraphs(
  text: string,
  count: BodyTailParagraphCount,
  maxChars = MAX_BODY_TAIL_CHARS,
): string {
  const t = text.trim();
  if (!t) return "";
  const paras = t.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (count !== "all") {
    const selected = paras.slice(-count).join("\n\n");
    if (selected.length > maxChars) return takeTailText(selected, maxChars);
    return selected;
  }
  // "all"：从末尾往前累加整段，直到超 maxChars 为止
  const kept: string[] = [];
  let total = 0;
  for (let i = paras.length - 1; i >= 0; i--) {
    const p = paras[i];
    const add = p.length + (kept.length > 0 ? 2 : 0); // "\n\n" separator
    if (total + add > maxChars && kept.length > 0) break;
    kept.unshift(p);
    total += add;
  }
  return kept.join("\n\n");
}

export type SceneStateCard = {
  location: string;  // 当前场所
  timeOfDay: string; // 时间段
  charState: string; // 人物状态（谁在、什么情绪/状态）
  tension: string;   // 悬而未决的张力/悬念
};

export function isSceneStateCardEmpty(s: SceneStateCard): boolean {
  return !s.location.trim() && !s.timeOfDay.trim() && !s.charState.trim() && !s.tension.trim();
}

export function formatSceneStateForPrompt(s: SceneStateCard): string {
  const lines: string[] = [];
  if (s.location.trim()) lines.push(`场所：${s.location.trim()}`);
  if (s.timeOfDay.trim()) lines.push(`时间：${s.timeOfDay.trim()}`);
  if (s.charState.trim()) lines.push(`人物状态：${s.charState.trim()}`);
  if (s.tension.trim()) lines.push(`悬念/张力：${s.tension.trim()}`);
  return lines.join("\n");
}

/** 生辉生成模式：按纲仿写 / 续写 / 重写 / 精炼 / 场景骨架 / 对话优先 / 分段接龙 */
export type ShengHuiGenerateMode = "write" | "continue" | "rewrite" | "polish" | "skeleton" | "dialogue_first" | "segment";

export const MODE_LABELS: Record<ShengHuiGenerateMode, string> = {
  write: "按纲仿写",
  continue: "续写",
  rewrite: "重写",
  polish: "精炼",
  skeleton: "场景骨架",
  dialogue_first: "对话优先",
  segment: "分段接龙",
};

export const MODE_DESCS: Record<ShengHuiGenerateMode, string> = {
  write: "按大纲与文策从零生成正文",
  continue: "在当前草稿末尾续写",
  rewrite: "按大纲精神全新改写当前草稿",
  polish: "润色当前草稿，保持情节不变",
  skeleton: "先生成 5-8 个情节节拍，确认后展开为正文（两步）",
  dialogue_first: "先生成骨架对话，再补充动作与叙述描写（两步）",
  segment: "每次生成一个场景段落，自动携带上段末尾续接",
};

/** 右栏主模式：四段式切换 */
export const SHENG_HUI_MAIN_MODES: readonly ShengHuiGenerateMode[] = ["write", "continue", "rewrite", "polish"];
/** 高级模式下拉：骨架 / 对话优先 / 分段接龙 */
export const SHENG_HUI_ADVANCED_MODES: readonly ShengHuiGenerateMode[] = ["skeleton", "dialogue_first", "segment"];

export const SHENG_HUI_ADVANCED_MODE_SHORT_LABEL: Partial<Record<ShengHuiGenerateMode, string>> = {
  skeleton: "场景骨架",
  dialogue_first: "对话优先",
  segment: "分段接龙",
};

/** 右栏「高级」下拉的骨架/对话优先/接龙等是否命中当前模式 */
export function shengHuiIsAdvancedGenerateMode(m: ShengHuiGenerateMode): boolean {
  return (SHENG_HUI_ADVANCED_MODES as readonly string[]).includes(m);
}

/** 叙事「热度」：1 克制 … 5 热烈；写入 `WritingWorkStyleSlice.extraRules` 参与生成 */
export type ShengHuiEmotionTemperature = 1 | 2 | 3 | 4 | 5;

export function clampShengHuiEmotionTemperature(n: number): ShengHuiEmotionTemperature {
  const r = Math.round(Number.isFinite(n) ? n : 3);
  if (r <= 1) return 1;
  if (r >= 5) return 5;
  return r as ShengHuiEmotionTemperature;
}

/** 生辉 improve-plan 第 8 步：三档说明，拼入风格补充规则 */
export function shengHuiEmotionTemperaturePromptLine(t: ShengHuiEmotionTemperature): string {
  if (t <= 2) return "叙述克制，情绪内化，少用形容词，多用行为描写表达情感。";
  if (t === 3) return "情绪适中，自然表达。";
  return "情绪饱满，意象丰富，可适当抒情，感官描写密集。";
}

export function shengHuiIsTwoStepGenerateMode(m: ShengHuiGenerateMode): boolean {
  return m === "skeleton" || m === "dialogue_first";
}

export function shengHuiTwoStepPhaseFromIntermediate(intermediate: string | null): 1 | 2 {
  return intermediate ? 2 : 1;
}

/** 右栏主「生成」按钮：两步模式第一步/第二步与主模式标签 */
export function shengHuiComposePrimaryButtonLabel(
  m: ShengHuiGenerateMode,
  twoStepIntermediate: string | null,
): string {
  if (shengHuiIsTwoStepGenerateMode(m)) {
    return twoStepIntermediate ? "展开正文" : m === "skeleton" ? "生成骨架" : "对话骨架";
  }
  return MODE_LABELS[m];
}

const MODE_TASK_PREFIXES: Record<ShengHuiGenerateMode, string> = {
  write: "【任务：按纲仿写】请依照下方大纲与文策，生成本章正文。若有文风参考段落，请学习其笔法并自然融入。",
  continue: "【任务：续写】请在「当前草稿」末尾之后，按大纲精神延续情节，保持风格连贯。",
  rewrite: "【任务：重写】请将「当前草稿」按大纲精神全新创作：情节脉络不变，语言全面更新。",
  polish: "【任务：精炼】请对「当前草稿」进行语言润色与节奏优化：保持情节、人物与对白内容不变，只提升文字质量。",
  skeleton: "【任务：场景骨架·第一步】请依照下方大纲，列出本场景 5-8 个关键情节节拍（情节推进单元）。每个节拍一行，格式：「序号. 简短描述（15-40字）」。只输出节拍列表，不要展开正文。",
  dialogue_first: "【任务：对话优先·第一步】请依照下方大纲，先写出本场景的骨架对话——仅保留角色之间的对白台词，对白间用极简的动作标注（≤10字/条）占位。不展开叙述。直接输出对白骨架，不要开场白。",
  segment: "【任务：分段接龙】请依照大纲精神，生成下一个场景段落（约 300-600 字）。若提供「续接位置」请自然衔接；只输出该段落正文，不要其他解释。",
};

export const SHENG_HUI_SYSTEM_BASE = `你是严谨的中文小说写作助手。用户的任务是写出**可发表的章节正文**（叙述与对话为主）。
要求：
- 严格服从用户给出的大纲、文策与本书约束；不要引入与设定矛盾的情节。
- 若提供「文风参考段落」，请从中学习其**文字节奏、遣词风格与场景描摹手法**，将这种笔法自然地融入创作中。仿写的目的是习得风格与笔法，绝不是改写原文情节、搬运对白或复制文字——参考段落只作为风格锚定，不应原文出现在输出中。
- 若提供「续接正文」或「文风锚点」，需自然衔接、风格一致。
- 不要复述纲要条目；应展开为场景、对话与描写。
- 直接输出正文；不要开场白、不要对写作过程的说明、不要 Markdown 标题。`;

export class ShengHuiGenerateError extends Error {
  override readonly name = "ShengHuiGenerateError";
  constructor(message: string) {
    super(message);
  }
}

/**
 * C.2 / 第四节：用 `includeBodyContent` 区分是否含**正文片段**；仅含大纲/文策、段工具、节拍重生等
 * 不强制 `allowChapterContent`；含续接尾/草稿时仍要求开启。
 * `includeChapterSummary` 为真时仍要求 `allowRecentSummaries`（不变）。
 */
export function assertShengHuiPrivacy(
  settings: AiSettings,
  opts: {
    includeChapterSummary: boolean;
    /** 是否包含章节正文片段（body tail / draft / rewrite source） */
    includeBodyContent?: boolean;
  },
): void {
  const cloud = !isLocalAiProvider(settings.provider);
  if (!cloud) return;
  if (!settings.privacy.consentAccepted || !settings.privacy.allowCloudProviders) {
    throw new ShengHuiGenerateError("请先在设置中同意云端 AI 并允许调用。");
  }
  if (!settings.privacy.allowMetadata) {
    throw new ShengHuiGenerateError("生辉需上传书名与章节名，请在隐私设置中允许作品元数据。");
  }
  // 有实际正文片段（续接末尾 / 当前草稿）时才强制 allowChapterContent
  if (opts.includeBodyContent && !settings.privacy.allowChapterContent) {
    throw new ShengHuiGenerateError("已包含正文续接/当前草稿，请在隐私设置中允许章节正文上云。");
  }
  // 纯大纲/文策、段工具、节拍重生等 paths：不上强制 allowChapterContent（C.2 / 第四节 隐私 Gate 与主生成一致放宽）
  if (opts.includeChapterSummary && !settings.privacy.allowRecentSummaries) {
    throw new ShengHuiGenerateError("已勾选「章节概要」：请在隐私设置中允许云端上传章节概要。");
  }
}

const emptyStyleSlice = (): WritingWorkStyleSlice => ({
  pov: "",
  tone: "",
  bannedPhrases: "",
  styleAnchor: "",
  extraRules: "",
});

/**
 * 与 {@link generateShengHuiProseStream} 将发送的 messages 一致（用于粗估与确认）。
 */
export function buildShengHuiChatMessages(args: {
  workTitle: string;
  chapterTitle?: string;
  outlineAndStrategy: string;
  chapterSummary?: string;
  chapterBodyTail?: string;
  chapterBibleFormatted?: string;
  settingIndexText?: string;
  workStyle?: WritingWorkStyleSlice;
  tagProfileText?: string;
  /** 从藏经 RAG 检索到的风格参考段落（仅学习笔法，非洗稿） */
  referenceStyleExcerpts?: string[];
  generateMode?: ShengHuiGenerateMode;
  /** 续写/重写/精炼模式下的当前草稿 */
  draftToProcess?: string;
  /** 目标字数（0 = 不限制） */
  targetWordCount?: number;
  /** 场景状态卡：上一段落的收尾快照，帮助精准续接 */
  sceneStateText?: string;
  /** 人物声音锁：对话场景中匹配到的人物语气约束 */
  characterVoiceLocks?: CharacterVoiceLock[];
  /**
   * 两步模式的第几步（skeleton / dialogue_first 专用）。
   * step=1：生成骨架/对话骨架；step=2：基于 intermediateResult 展开为正文。
   */
  twoStepPhase?: 1 | 2;
  /** 第一步的中间结果（step=2 时传入） */
  intermediateResult?: string;
}): AiChatMessage[] {
  const mode = args.generateMode ?? "write";
  const outline = args.outlineAndStrategy.trim();
  const draft = (args.draftToProcess ?? "").trim();
  const phase = args.twoStepPhase ?? 1;

  if (mode === "write" && !outline) {
    throw new ShengHuiGenerateError("请先填写「大纲与文策」（可从推演定稿粘贴）。");
  }
  if (mode === "continue" && !outline && !draft) {
    throw new ShengHuiGenerateError("续写模式：请填写「大纲与文策」或在写作台输入当前草稿。");
  }
  if ((mode === "rewrite" || mode === "polish") && !draft) {
    throw new ShengHuiGenerateError(`${mode === "rewrite" ? "重写" : "精炼"}模式：请先生成或在写作台输入草稿。`);
  }
  if ((mode === "skeleton" || mode === "dialogue_first") && !outline) {
    throw new ShengHuiGenerateError("请先填写「大纲与文策」。");
  }
  if ((mode === "skeleton" || mode === "dialogue_first") && phase === 2 && !args.intermediateResult?.trim()) {
    throw new ShengHuiGenerateError("第二步需要第一步的生成结果，请先完成第一步。");
  }

  const ws = args.workStyle ?? emptyStyleSlice();
  const constraintBlock = formatWorkStyleAndTagProfileBlock(ws, args.tagProfileText);
  let systemContent = SHENG_HUI_SYSTEM_BASE;
  if (constraintBlock.trim()) {
    systemContent =
      SHENG_HUI_SYSTEM_BASE +
      "\n\n【写作约束（与写作侧栏装配器同源；请与下列材料一并遵守）】\n" +
      constraintBlock.trim();
  }

  const outlineClamped = outline ? clampContextText(outline, MAX_OUTLINE_CHARS) : "";
  const summary = (args.chapterSummary ?? "").trim();
  const bible = (args.chapterBibleFormatted ?? "").trim();
  const tailRaw = (args.chapterBodyTail ?? "").trim();
  const tail = tailRaw ? takeTailText(tailRaw, MAX_BODY_TAIL_CHARS) : "";
  const settingIdx = (args.settingIndexText ?? "").trim()
    ? clampContextText((args.settingIndexText ?? "").trim(), MAX_SETTING_INDEX_CHARS)
    : "";
  const anchor = ws.styleAnchor.trim();
  const chTitle = (args.chapterTitle ?? "").trim();

  const excerpts = (args.referenceStyleExcerpts ?? [])
    .map((e) => clampReferenceRagSnippetForAssembleBody(e))
    .filter((e) => e.length > 0);
  const excerptBlock = excerpts.length > 0
    ? clampContextText(excerpts.join("\n---\n"), SHENG_HUI_STYLE_EXCERPTS_COMBINED_MAX_CHARS)
    : "";

  const draftClamped = draft ? clampContextText(draft, MAX_DRAFT_PROCESS_CHARS) : "";

  const targetWords = typeof args.targetWordCount === "number" && args.targetWordCount > 0
    ? args.targetWordCount : 0;

  const userParts: string[] = [];

  // 两步模式 step=2：替换为展开任务指令
  const isTwoStepStep2 = (mode === "skeleton" || mode === "dialogue_first") && phase === 2;
  const step2Prefix = mode === "skeleton"
    ? `【任务：场景骨架·第二步】请依照下方「情节节拍」，展开为完整的场景正文${targetWords > 0 ? `（目标字数：约 ${targetWords.toLocaleString()} 字，可适当浮动 ±20%）` : ""}。每个节拍须充分展开为叙述、动作与对话，保持节奏连贯。直接输出正文，不要重复节拍标题。`
    : `【任务：对话优先·第二步】请基于下方「对话骨架」，补充动作描写、场景描摹与内心活动，将其扩写为完整的场景正文${targetWords > 0 ? `（目标字数：约 ${targetWords.toLocaleString()} 字，可适当浮动 ±20%）` : ""}。保留对话原文，不要修改台词。`;

  if (isTwoStepStep2) {
    userParts.push(step2Prefix);
  } else {
    const modePrefix = MODE_TASK_PREFIXES[mode];
    userParts.push(targetWords > 0 && mode !== "skeleton" && mode !== "dialogue_first"
      ? `${modePrefix}（目标字数：约 ${targetWords.toLocaleString()} 字，可适当浮动 ±20%）`
      : modePrefix);
  }

  userParts.push(`书名：${args.workTitle.trim() || "未命名"}`);
  if (chTitle) userParts.push(`章节：${chTitle}`);
  if (anchor) userParts.push(`文风锚点（尽量贴近其用词/节奏/句法）：\n${anchor}`);
  if (settingIdx) userParts.push(`【设定索引（摘录）】\n${settingIdx}`);
  if (summary) userParts.push(`【章节概要】\n${summary}`);
  const sceneState = (args.sceneStateText ?? "").trim();
  if (sceneState) userParts.push(`【场景状态（上一段落收尾，请保持衔接连贯）】\n${sceneState}`);
  const voiceLocks = args.characterVoiceLocks ?? [];
  if (voiceLocks.length > 0) {
    const voiceBlock = formatCharacterVoiceLocksForPrompt(voiceLocks);
    userParts.push(`【人物声音锁（写对话时严格遵守各人物口吻与禁忌）】\n${voiceBlock}`);
  }
  if (bible) userParts.push(`【本章锦囊要点】\n${bible}`);
  if (tail && (mode === "write" || mode === "segment")) userParts.push(`【续接位置：正文末尾节选】\n${tail}`);
  if (excerptBlock) {
    userParts.push(`【文风参考段落（仅学习笔法与风格，勿复制原文情节、人物名或对白）】\n${excerptBlock}`);
  }
  if (outlineClamped) userParts.push(`【大纲与文策（定稿）】\n${outlineClamped}`);

  if (mode === "continue" && draftClamped) {
    userParts.push(`【当前草稿（请在此末尾续写新内容）】\n${draftClamped}`);
  } else if (mode === "rewrite" && draftClamped) {
    userParts.push(`【当前草稿（请按以上大纲全新重写）】\n${draftClamped}`);
  } else if (mode === "polish" && draftClamped) {
    userParts.push(`【当前草稿（请润色以下内容，保持情节不变）】\n${draftClamped}`);
  } else if (isTwoStepStep2 && args.intermediateResult?.trim()) {
    const label = mode === "skeleton" ? "情节节拍（第一步输出，请依此展开正文）" : "对话骨架（第一步输出，请补充动作描写）";
    userParts.push(`【${label}】\n${clampContextText(args.intermediateResult.trim(), MAX_DRAFT_PROCESS_CHARS)}`);
  }

  const userContent = userParts.join("\n\n");
  return [
    { role: "system", content: systemContent },
    { role: "user", content: userContent },
  ];
}

/** N5：与 {@link buildShengHuiChatMessages} 同步的各块粗估与截断标记 */
export type ShengHuiContextTokenBlock = {
  id: string;
  label: string;
  charRaw: number;
  charInMessage: number;
  approxTokens: number;
  truncated: boolean;
};

/**
 * 按当前装配参数拆分 user 侧各块粗估 token（与将发送的 messages 一致；装配不合法时返回 `ok: false`）。
 */
export function computeShengHuiContextTokenBlocks(
  args: Parameters<typeof buildShengHuiChatMessages>[0],
):
  | { ok: true; systemApprox: number; blocks: ShengHuiContextTokenBlock[]; userTotalApprox: number; totalApprox: number }
  | { ok: false; error: string } {
  let messages: AiChatMessage[];
  try {
    messages = buildShengHuiChatMessages(args);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const mode = args.generateMode ?? "write";
  const outline = args.outlineAndStrategy.trim();
  const draft = (args.draftToProcess ?? "").trim();
  const phase = args.twoStepPhase ?? 1;
  const ws = args.workStyle ?? emptyStyleSlice();
  const constraintBlock = formatWorkStyleAndTagProfileBlock(ws, args.tagProfileText);
  let systemContent = SHENG_HUI_SYSTEM_BASE;
  if (constraintBlock.trim()) {
    systemContent =
      SHENG_HUI_SYSTEM_BASE +
      "\n\n【写作约束（与写作侧栏装配器同源；请与下列材料一并遵守）】\n" +
      constraintBlock.trim();
  }
  const systemApprox = approxRoughTokenCount(systemContent);

  const outlineClamped = outline ? clampContextText(outline, MAX_OUTLINE_CHARS) : "";
  const summary = (args.chapterSummary ?? "").trim();
  const bible = (args.chapterBibleFormatted ?? "").trim();
  const tailRaw = (args.chapterBodyTail ?? "").trim();
  const tail = tailRaw ? takeTailText(tailRaw, MAX_BODY_TAIL_CHARS) : "";
  const settingIdxRaw = (args.settingIndexText ?? "").trim();
  const settingIdx = settingIdxRaw ? clampContextText(settingIdxRaw, MAX_SETTING_INDEX_CHARS) : "";
  const anchor = ws.styleAnchor.trim();
  const chTitle = (args.chapterTitle ?? "").trim();

  const excerpts = (args.referenceStyleExcerpts ?? [])
    .map((e) => clampReferenceRagSnippetForAssembleBody(e))
    .filter((e) => e.length > 0);
  const excerptRawJoined = (args.referenceStyleExcerpts ?? [])
    .map((e) => clampReferenceRagSnippetForAssembleBody(e))
    .filter((e) => e.length > 0)
    .join("\n---\n");
  const excerptBlock = excerpts.length > 0
    ? clampContextText(excerpts.join("\n---\n"), SHENG_HUI_STYLE_EXCERPTS_COMBINED_MAX_CHARS)
    : "";

  const draftClamped = draft ? clampContextText(draft, MAX_DRAFT_PROCESS_CHARS) : "";
  const targetWords = typeof args.targetWordCount === "number" && args.targetWordCount > 0
    ? args.targetWordCount
    : 0;
  const isTwoStepStep2 = (mode === "skeleton" || mode === "dialogue_first") && phase === 2;
  const step2Prefix =
    mode === "skeleton"
      ? `【任务：场景骨架·第二步】请依照下方「情节节拍」，展开为完整的场景正文${targetWords > 0 ? `（目标字数：约 ${targetWords.toLocaleString()} 字，可适当浮动 ±20%）` : ""}。每个节拍须充分展开为叙述、动作与对话，保持节奏连贯。直接输出正文，不要重复节拍标题。`
      : `【任务：对话优先·第二步】请基于下方「对话骨架」，补充动作描写、场景描摹与内心活动，将其扩写为完整的场景正文${targetWords > 0 ? `（目标字数：约 ${targetWords.toLocaleString()} 字，可适当浮动 ±20%）` : ""}。保留对话原文，不要修改台词。`;
  const modePrefixBase = MODE_TASK_PREFIXES[mode];
  const modePrefixLine =
    !isTwoStepStep2 && targetWords > 0 && mode !== "skeleton" && mode !== "dialogue_first"
      ? `${modePrefixBase}（目标字数：约 ${targetWords.toLocaleString()} 字，可适当浮动 ±20%）`
      : modePrefixBase;

  const pushBlock = (
    id: string,
    label: string,
    rawChar: number,
    messageText: string,
  ): ShengHuiContextTokenBlock => ({
    id,
    label,
    charRaw: rawChar,
    charInMessage: messageText.length,
    approxTokens: approxRoughTokenCount(messageText),
    truncated: messageText.includes("…（已截断）") || (id === "body_tail" && tailRaw.length > 0 && tail.length < tailRaw.length),
  });

  const blocks: ShengHuiContextTokenBlock[] = [];

  if (isTwoStepStep2) {
    blocks.push(pushBlock("task_step2", "任务（第二步）", step2Prefix.length, step2Prefix));
  } else {
    blocks.push(pushBlock("task_mode", "任务（模式）", modePrefixLine.length, modePrefixLine));
  }
  const titleLine = `书名：${args.workTitle.trim() || "未命名"}`;
  blocks.push(pushBlock("title", "书名", titleLine.length, titleLine));
  if (chTitle) {
    const line = `章节：${chTitle}`;
    blocks.push(pushBlock("chapter", "章节", line.length, line));
  }
  if (anchor) {
    const line = `文风锚点（尽量贴近其用词/节奏/句法）：\n${anchor}`;
    blocks.push(pushBlock("style_anchor", "文风锚点", anchor.length, line));
  }
  if (settingIdx) {
    blocks.push(pushBlock("setting_index", "设定索引", settingIdxRaw.length, `【设定索引（摘录）】\n${settingIdx}`));
  }
  if (summary) {
    blocks.push(pushBlock("summary", "章节概要", summary.length, `【章节概要】\n${summary}`));
  }
  const sceneState = (args.sceneStateText ?? "").trim();
  if (sceneState) {
    blocks.push(
      pushBlock("scene_state", "场景状态", sceneState.length, `【场景状态（上一段落收尾，请保持衔接连贯）】\n${sceneState}`),
    );
  }
  const voiceLocks = args.characterVoiceLocks ?? [];
  if (voiceLocks.length > 0) {
    const voiceBlock = formatCharacterVoiceLocksForPrompt(voiceLocks);
    const full = `【人物声音锁（写对话时严格遵守各人物口吻与禁忌）】\n${voiceBlock}`;
    blocks.push(pushBlock("voice_locks", "人物声音锁", voiceBlock.length, full));
  }
  if (bible) {
    blocks.push(pushBlock("bible", "本章锦囊", bible.length, `【本章锦囊要点】\n${bible}`));
  }
  if (tail && (mode === "write" || mode === "segment")) {
    const full = `【续接位置：正文末尾节选】\n${tail}`;
    blocks.push(pushBlock("body_tail", "续接·正文末尾", tailRaw.length, full));
  }
  if (excerptBlock) {
    const full = `【文风参考段落（仅学习笔法与风格，勿复制原文情节、人物名或对白）】\n${excerptBlock}`;
    blocks.push(pushBlock("style_excerpts", "文风参考（藏经）", excerptRawJoined.length, full));
  }
  if (outlineClamped) {
    const full = `【大纲与文策（定稿）】\n${outlineClamped}`;
    blocks.push(pushBlock("outline", "大纲与文策", outline.length, full));
  }
  if (mode === "continue" && draftClamped) {
    blocks.push(
      pushBlock("draft_continue", "当前草稿·续写", draft.length, `【当前草稿（请在此末尾续写新内容）】\n${draftClamped}`),
    );
  } else if (mode === "rewrite" && draftClamped) {
    blocks.push(
      pushBlock("draft_rewrite", "当前草稿·重写", draft.length, `【当前草稿（请按以上大纲全新重写）】\n${draftClamped}`),
    );
  } else if (mode === "polish" && draftClamped) {
    blocks.push(
      pushBlock("draft_polish", "当前草稿·精炼", draft.length, `【当前草稿（请润色以下内容，保持情节不变）】\n${draftClamped}`),
    );
  } else if (isTwoStepStep2 && args.intermediateResult?.trim()) {
    const im = clampContextText(args.intermediateResult.trim(), MAX_DRAFT_PROCESS_CHARS);
    const line = `【${mode === "skeleton" ? "情节节拍（第一步输出，请依此展开正文）" : "对话骨架（第一步输出，请补充动作描写）"}】\n${im}`;
    blocks.push(
      pushBlock("intermediate", mode === "skeleton" ? "情节节拍·中间稿" : "对话骨架·中间稿", (args.intermediateResult ?? "").trim().length, line),
    );
  }

  const userTotalApprox = approxRoughTokenCount(messages[1].content);
  const totalApprox = systemApprox + userTotalApprox;
  return { ok: true, systemApprox, blocks, userTotalApprox, totalApprox };
}

/**
 * 场景骨架：仅重生列表中第 N 条节拍（与 {@link buildShengHuiChatMessages} 第一步上下文一致，任务换为单行重写）。
 */
export function buildShengHuiSkeletonRegenerateOneBeatMessages(
  args: Parameters<typeof buildShengHuiChatMessages>[0] & {
    allBeatsText: string;
    beatIndex1Based: number;
  },
): AiChatMessage[] {
  const { allBeatsText, beatIndex1Based, ...rest } = args;
  const n = beatIndex1Based;
  if (n < 1) throw new ShengHuiGenerateError("节拍序号无效。");
  if (!allBeatsText.trim()) throw new ShengHuiGenerateError("当前无情节节拍文本。");

  const base = buildShengHuiChatMessages({
    ...rest,
    generateMode: "skeleton",
    twoStepPhase: 1,
    intermediateResult: undefined,
    draftToProcess: undefined,
  });
  const u0 = base[1].content;
  const head = MODE_TASK_PREFIXES.skeleton;
  const restOfUser = u0.startsWith(head) ? u0.slice(head.length).replace(/^\n+/, "") : u0;
  const prefix =
    `【任务：仅重写第 ${n} 个情节节拍】以下已给出现有完整列表与作品上下文。请**只输出一行**新节拍，格式「${n}. 简短描述（15-40 字）」中文。不要其他说明、不要重复输出整表、不要 Markdown 标题。\n\n【当前完整情节节拍】\n${allBeatsText.trim()}\n\n`;
  return [
    base[0],
    { role: "user", content: prefix + restOfUser },
  ];
}

/**
 * 使用已构造的 messages 流式生成（用于节拍单条重生等不走路由 `buildShengHuiChatMessages`+`generateMode` 组合的路径）。
 */
export async function generateShengHuiProseStreamFromMessages(args: {
  messages: AiChatMessage[];
  settings: AiSettings;
  signal?: AbortSignal;
  onDelta: (d: string) => void;
  workId?: string | null;
  includeChapterSummary: boolean;
  /** 默认「生辉·节拍重生」；段工具、其它旁路可传入以便用量归类。 */
  usageLogTask?: string;
}): Promise<{ text: string }> {
  const settings = args.settings ?? loadAiSettings();
  assertShengHuiPrivacy(settings, {
    includeChapterSummary: args.includeChapterSummary,
    includeBodyContent: false,
  });
  const cfg = getProviderConfig(settings, settings.provider);
  if (requiresClientSavedApiKey(settings.provider) && !cfg.apiKey?.trim()) {
    throw new ShengHuiGenerateError("请先在设置中填写当前模型的 API Key。");
  }
  const r = await generateWithProviderStream({
    provider: settings.provider,
    config: cfg,
    messages: args.messages,
    onDelta: args.onDelta,
    temperature: !isLocalAiProvider(settings.provider) ? settings.geminiTemperature : undefined,
    signal: args.signal,
    usageLog: { task: args.usageLogTask ?? "生辉·节拍重生", workId: args.workId },
  });
  return { text: (r.text ?? "").trim() };
}

/** §G-05：输出长度按「一次章节正文」预留粗估（非计费、非厂商上限）。 */
export const SHENG_HUI_OUTPUT_ESTIMATE_TOKENS = 4000;

export function estimateShengHuiRoughTokens(messages: AiChatMessage[]): {
  inputApprox: number;
  outputEstimateApprox: number;
  totalApprox: number;
} {
  const inputApprox = approxTotalTokensForMessages(messages);
  const outputEstimateApprox = SHENG_HUI_OUTPUT_ESTIMATE_TOKENS;
  return {
    inputApprox,
    outputEstimateApprox,
    totalApprox: inputApprox + outputEstimateApprox,
  };
}

/**
 * 生辉仿写生成（流式）。支持四种模式：按纲仿写 / 续写 / 重写 / 精炼。
 * 可注入藏经 RAG 风格参考段落（学习笔法，非洗稿）。
 */
export async function generateShengHuiProseStream(args: {
  workTitle: string;
  chapterTitle?: string;
  outlineAndStrategy: string;
  chapterSummary?: string;
  chapterBodyTail?: string;
  chapterBibleFormatted?: string;
  settingIndexText?: string;
  workStyle?: WritingWorkStyleSlice;
  tagProfileText?: string;
  referenceStyleExcerpts?: string[];
  generateMode?: ShengHuiGenerateMode;
  draftToProcess?: string;
  targetWordCount?: number;
  sceneStateText?: string;
  characterVoiceLocks?: CharacterVoiceLock[];
  twoStepPhase?: 1 | 2;
  intermediateResult?: string;
  settings?: AiSettings;
  signal?: AbortSignal;
  onDelta: (d: string) => void;
  workId?: string | null;
  /**
   * 显式覆写本模型「写作温度」（如 A/B 低/高档）；传入时本地/云端均尝试下发。
   * 未设时与历史行为一致：云端用 `getProviderTemperature`，本地默认不传。
   */
  temperatureOverride?: number;
  /** 用量记录任务名；默认 `生辉·仿写`。 */
  usageLogTask?: string;
}): Promise<{ text: string }> {
  const settings = args.settings ?? loadAiSettings();
  assertShengHuiPrivacy(settings, {
    includeChapterSummary: Boolean((args.chapterSummary ?? "").trim()),
    includeBodyContent: Boolean((args.chapterBodyTail ?? "").trim() || (args.draftToProcess ?? "").trim()),
  });

  const cfg = getProviderConfig(settings, settings.provider);
  if (requiresClientSavedApiKey(settings.provider) && !cfg.apiKey?.trim()) {
    throw new ShengHuiGenerateError("请先在设置中填写当前模型的 API Key。");
  }

  const messages = buildShengHuiChatMessages(args);
  const baseT = getProviderTemperature(settings, settings.provider);
  let streamTemperature: number | undefined;
  if (args.temperatureOverride !== undefined) {
    streamTemperature = Math.min(2, Math.max(0, args.temperatureOverride));
  } else if (!isLocalAiProvider(settings.provider)) {
    streamTemperature = baseT;
  }

  const r = await generateWithProviderStream({
    provider: settings.provider,
    config: cfg,
    messages,
    onDelta: args.onDelta,
    temperature: streamTemperature,
    signal: args.signal,
    usageLog: { task: args.usageLogTask ?? "生辉·仿写", workId: args.workId },
  });
  return { text: (r.text ?? "").trim() };
}