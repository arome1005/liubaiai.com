import { clampContextText, formatWorkStyleAndTagProfileBlock, takeTailText, type WritingWorkStyleSlice } from "./assemble-context";
import { generateWithProviderStream } from "./client";
import { getProviderConfig, loadAiSettings } from "./storage";
import type { AiChatMessage, AiSettings } from "./types";

const MAX_OUTLINE_CHARS = 48000;
const MAX_BODY_TAIL_CHARS = 12000;
const MAX_SETTING_INDEX_CHARS = 8000;

const SYSTEM_BASE = `你是严谨的中文小说写作助手。用户的任务是「按已定稿的大纲与文策」写出**可发表的章节正文**（叙述与对话为主）。
要求：
- 严格服从用户给出的纲、文策与本书约束；不要引入与设定矛盾的情节。
- 若提供「续接正文」或「文风锚点」，需自然衔接、风格一致。
- 不要复述纲要条目；应展开为场景、对话与描写。
- 直接输出正文；不要开场白、不要对写作过程的说明、不要 Markdown 标题。`;

export class ShengHuiGenerateError extends Error {
  override readonly name = "ShengHuiGenerateError";
  constructor(message: string) {
    super(message);
  }
}

export function assertShengHuiPrivacy(
  settings: AiSettings,
  opts: { includeChapterSummary: boolean },
): void {
  const cloud = settings.provider !== "ollama";
  if (!cloud) return;
  if (!settings.privacy.consentAccepted || !settings.privacy.allowCloudProviders) {
    throw new ShengHuiGenerateError("请先在设置中同意云端 AI 并允许调用。");
  }
  if (!settings.privacy.allowMetadata) {
    throw new ShengHuiGenerateError("生辉需上传书名与章节名，请在隐私设置中允许作品元数据。");
  }
  if (!settings.privacy.allowChapterContent) {
    throw new ShengHuiGenerateError("生辉需上传大纲与文策正文，请在隐私设置中允许章节正文（创作内容上云）。");
  }
  if (opts.includeChapterSummary && !settings.privacy.allowRecentSummaries) {
    throw new ShengHuiGenerateError("已勾选「章节概要」：请在隐私设置中允许云端上传章节概要。");
  }
}

/**
 * §11 步 10：生辉按纲仿写（流式）；system 注入与写作侧栏同源 **风格卡 + 标签侧写**，user 段含 **文风锚点**（与推演三分支一致）。
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
  settings?: AiSettings;
  signal?: AbortSignal;
  onDelta: (d: string) => void;
}): Promise<{ text: string }> {
  const outline = args.outlineAndStrategy.trim();
  if (!outline) {
    throw new ShengHuiGenerateError("请先填写「大纲与文策」（可从推演定稿粘贴）。");
  }

  const settings = args.settings ?? loadAiSettings();
  assertShengHuiPrivacy(settings, {
    includeChapterSummary: Boolean((args.chapterSummary ?? "").trim()),
  });

  const cfg = getProviderConfig(settings, settings.provider);
  if (settings.provider !== "ollama" && !cfg.apiKey?.trim()) {
    throw new ShengHuiGenerateError("请先在设置中填写当前模型的 API Key。");
  }

  const emptyStyle: WritingWorkStyleSlice = {
    pov: "",
    tone: "",
    bannedPhrases: "",
    styleAnchor: "",
    extraRules: "",
  };
  const ws = args.workStyle ?? emptyStyle;
  const constraintBlock = formatWorkStyleAndTagProfileBlock(ws, args.tagProfileText);
  let systemContent = SYSTEM_BASE;
  if (constraintBlock.trim()) {
    systemContent =
      SYSTEM_BASE +
      "\n\n【写作约束（与写作侧栏装配器同源；请与下列材料一并遵守）】\n" +
      constraintBlock.trim();
  }

  const outlineClamped = clampContextText(outline, MAX_OUTLINE_CHARS);
  const summary = (args.chapterSummary ?? "").trim();
  const bible = (args.chapterBibleFormatted ?? "").trim();
  const tailRaw = (args.chapterBodyTail ?? "").trim();
  const tail = tailRaw ? takeTailText(tailRaw, MAX_BODY_TAIL_CHARS) : "";
  const settingIdx = (args.settingIndexText ?? "").trim()
    ? clampContextText((args.settingIndexText ?? "").trim(), MAX_SETTING_INDEX_CHARS)
    : "";

  const anchor = ws.styleAnchor.trim();
  const chTitle = (args.chapterTitle ?? "").trim();

  const userParts: string[] = [];
  userParts.push(`书名：${args.workTitle.trim() || "未命名"}`);
  if (chTitle) userParts.push(`章节：${chTitle}`);
  if (anchor) userParts.push(`文风锚点（尽量贴近其用词/节奏/句法）：\n${anchor}`);
  if (settingIdx) userParts.push(`【设定索引（摘录）】\n${settingIdx}`);
  if (summary) userParts.push(`【章节概要】\n${summary}`);
  if (bible) userParts.push(`【本章圣经要点】\n${bible}`);
  if (tail) userParts.push(`【续接位置：正文末尾节选】\n${tail}`);
  userParts.push(`【大纲与文策（定稿）】\n${outlineClamped}`);

  const userContent = userParts.join("\n\n");
  const messages: AiChatMessage[] = [
    { role: "system", content: systemContent },
    { role: "user", content: userContent },
  ];

  const r = await generateWithProviderStream({
    provider: settings.provider,
    config: cfg,
    messages,
    onDelta: args.onDelta,
    temperature: settings.provider !== "ollama" ? settings.geminiTemperature : undefined,
    signal: args.signal,
  });
  return { text: (r.text ?? "").trim() };
}
