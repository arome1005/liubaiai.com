import { clampContextText, formatWorkStyleAndTagProfileBlock, type WritingWorkStyleSlice } from "./assemble-context";
import {
  formatCharacterVoiceLocksForPrompt,
  ShengHuiGenerateError,
  SHENG_HUI_SYSTEM_BASE,
  type CharacterVoiceLock,
} from "./sheng-hui-generate";
import type { AiChatMessage } from "./types";

const MAX_OUTLINE_SNIPPET = 8_000;
const MAX_MANUSCRIPT_CONTEXT = 12_000;

export type ShengHuiParagraphToolbarAction = "rewrite" | "expand" | "tighten" | "style_scan";

const ACTION_INSTRUCTION: Record<ShengHuiParagraphToolbarAction, string> = {
  rewrite:
    "【任务：段落重写】请只重写下面「待处理段落」：情节与信息保持一致，语言可重新组织，并与全文语境自然衔接。只输出该段正文，不要加引号、序号或题头。",
  expand:
    "【任务：段落扩展】请扩展下面「待处理段落」：充实细节与画面、保持人称与节奏，篇幅约为原段的 1.3–1.8 倍。只输出扩展后的该段正文。",
  tighten:
    "【任务：段落收紧】请压缩下面「待处理段落」：删繁就简、加快节奏，保留关键信息与情绪，篇幅约为原段的 55%–75%。只输出压缩后的该段正文。",
  style_scan:
    "【任务：风格扫描】请只针对「待处理段落」写简要点评：用 3–5 条短句分述语气、节奏、意象与可改进点。不要输出改写后的正文。",
};

const emptyStyleSlice = (): WritingWorkStyleSlice => ({
  pov: "",
  tone: "",
  bannedPhrases: "",
  styleAnchor: "",
  extraRules: "",
});

export function buildShengHuiParagraphToolbarMessages(args: {
  action: ShengHuiParagraphToolbarAction;
  workTitle: string;
  chapterTitle?: string;
  outlineAndStrategy: string;
  fullManuscript: string;
  paragraphText: string;
  workStyle?: WritingWorkStyleSlice;
  tagProfileText?: string;
  characterVoiceLocks?: CharacterVoiceLock[];
  includeChapterSummaryInRequest: boolean;
  chapterSummary?: string;
}): AiChatMessage[] {
  const p = (args.paragraphText ?? "").trim();
  if (!p) {
    throw new ShengHuiGenerateError("待处理段落为空。");
  }
  const m = (args.fullManuscript ?? "").trim();
  if (!m) {
    throw new ShengHuiGenerateError("主稿为空。");
  }
  const ws = args.workStyle ?? emptyStyleSlice();
  const constraintBlock = formatWorkStyleAndTagProfileBlock(ws, args.tagProfileText);
  let systemContent = SHENG_HUI_SYSTEM_BASE;
  if (constraintBlock.trim()) {
    systemContent +=
      "\n\n【写作约束（与主生成装配同源；请一并遵守）】\n" + constraintBlock.trim();
  }
  if (args.action !== "style_scan") {
    systemContent +=
      "\n\n【段工具专则】你只需输出**一段**可嵌入章节的连续正文，不要任何解释、列表标题或代码围栏。";
  } else {
    systemContent += "\n\n【段工具专则】本任务为点评型输出，不产出小说段落正文。";
  }

  const title = (args.workTitle || "未命名作品").trim();
  const ch = (args.chapterTitle ?? "").trim();
  const outline = args.outlineAndStrategy.trim()
    ? clampContextText(args.outlineAndStrategy.trim(), MAX_OUTLINE_SNIPPET)
    : "";
  const ctx = clampContextText(m, MAX_MANUSCRIPT_CONTEXT);
  const sum = (args.chapterSummary ?? "").trim();
  const locks = formatCharacterVoiceLocksForPrompt(args.characterVoiceLocks ?? []);

  const parts: string[] = [
    `作品名：《${title}》`,
    ch ? `章节：${ch}` : null,
    outline ? `【大纲与文策（摘录）】\n${outline}` : null,
    args.includeChapterSummaryInRequest && sum ? `【章节概要】\n${sum}` : null,
    `【全文语境（当前主稿；用于衔接）】\n${ctx}`,
    locks ? `【人物声音锁】\n${locks}` : null,
    `【待处理段落】\n${p}`,
    ACTION_INSTRUCTION[args.action],
  ].filter(Boolean) as string[];

  return [
    { role: "system", content: systemContent },
    { role: "user", content: parts.join("\n\n") },
  ];
}
