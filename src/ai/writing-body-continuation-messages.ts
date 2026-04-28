import type { AiChatMessage } from "./types";

/**
 * 在已有 `[system, user, …, assistant(上一段), …]` 的上下文中，给出「续接」的 user 文本。
 * 上一段模型输出已在 messages 的 assistant 条中，此处不再重复贴全文，仅重申细纲与目标字数带。
 */
export function buildOutlineContinuationUserContent(args: {
  /** 与首轮细纲/提纲一致 */
  outlineText: string;
  targetWordCount: number;
  /** 当前合稿约字数（`wordCount`，与正文统计同口径：含中文标点、去空白） */
  currentWordCount: number;
}): string {
  const outline = args.outlineText.trim() || "（与首轮中已给出的细纲/提纲相同。）";
  const lo = Math.max(1, Math.floor(args.targetWordCount * 0.9));
  const hi = Math.ceil(args.targetWordCount * 1.1);
  return [
    "【续写 / 接龙】",
    "你在上一条**助手**消息中已写出的内容具有约束力：请**直接承接其末句/末段**继续叙写。",
    "**不得**重复、改写、概述或重述上一条已出现的句子。",
    "",
    "细纲/提纲（续写时仍须落实尚未充分展开的要点，勿偏离本章设定）：",
    outline,
    "",
    `合稿至上一段止约 ${args.currentWordCount.toLocaleString()} 字；全章合稿目标约 ${args.targetWordCount.toLocaleString()} 字（约 ${lo}–${hi} 字可浮动，含中文标点），若仍明显不足，请**仅输出新增**正文。`,
    "保持人物、时序、语体与上款「任务 / 额外要求 / 文风」一致；不要小标题、不要以说明语起笔或收尾。",
  ].join("\n");
}

/**
 * 在**当前**完整 `messages` 之后，追加本段 `assistant` 输出与下一条 `user(续写)`，形成下一轮请求体。
 * `base` 可为 `[system, user]` 或已含多轮对话的完整数组。
 */
export function extendMessagesWithContinuationRound(
  base: AiChatMessage[],
  args: { segment: string; outlineText: string; targetWordCount: number; currentWordCountAfterSegment: number },
): AiChatMessage[] {
  if (base.length < 1) return base;
  const u2 = buildOutlineContinuationUserContent({
    outlineText: args.outlineText,
    targetWordCount: args.targetWordCount,
    currentWordCount: args.currentWordCountAfterSegment,
  });
  return [...base, { role: "assistant", content: args.segment }, { role: "user", content: u2 }];
}
