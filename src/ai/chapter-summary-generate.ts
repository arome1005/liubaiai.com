import { generateWithProvider } from "./client";
import { isLocalAiProvider, requiresClientSavedApiKey } from "./local-provider";
import { getProviderConfig, loadAiSettings } from "./storage";
import type { AiChatMessage, AiSettings } from "./types";

/** 送入模型的正文最大字符数（取章末，偏记忆向） */
const MAX_BODY_CHARS = 16000;

const SYSTEM_PROMPT =
  "你是小说写作助手。请根据给出的章节正文节选，用简洁的要点列出：已发生的事实、人物关系或立场变化、关键伏笔与未解决线。不要编造正文中没有的内容。输出使用中文，可用「- 」开头的列表，不要寒暄。";

export class ChapterSummaryGenerationError extends Error {
  override readonly name = "ChapterSummaryGenerationError";
  constructor(message: string) {
    super(message);
  }
}

function assertCanSendChapterSummary(settings: AiSettings): void {
  const cloud = !isLocalAiProvider(settings.provider);
  if (!cloud) return;
  if (!settings.privacy.consentAccepted || !settings.privacy.allowCloudProviders) {
    throw new ChapterSummaryGenerationError("请先在设置中同意云端 AI 并允许调用。");
  }
  if (!settings.privacy.allowMetadata) {
    throw new ChapterSummaryGenerationError("生成概要需上传书名与章节名，请在隐私设置中允许作品元数据。");
  }
  if (!settings.privacy.allowChapterContent) {
    throw new ChapterSummaryGenerationError("生成概要需上传本章正文节选，请在隐私设置中允许章节正文。");
  }
}

async function generateChapterSummaryOnce(args: {
  workTitle: string;
  chapterTitle: string;
  chapterContent: string;
  settings: AiSettings;
  signal?: AbortSignal;
}): Promise<string> {
  assertCanSendChapterSummary(args.settings);
  const cfg = getProviderConfig(args.settings, args.settings.provider);
  if (requiresClientSavedApiKey(args.settings.provider) && !cfg.apiKey?.trim()) {
    throw new ChapterSummaryGenerationError("请先在设置中填写当前模型的 API Key。");
  }
  const body = args.chapterContent.trim();
  if (!body) {
    throw new ChapterSummaryGenerationError("本章暂无正文，请先撰写内容后再生成概要。");
  }
  const excerpt =
    body.length <= MAX_BODY_CHARS ? body : body.slice(-MAX_BODY_CHARS);
  const user = `书名：${args.workTitle}\n章节：${args.chapterTitle}\n\n下列为正文节选（章末优先）：\n\n${excerpt}`;
  const messages: AiChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: user },
  ];
  const r = await generateWithProvider({
    provider: args.settings.provider,
    config: cfg,
    messages,
    temperature: 0.4,
    signal: args.signal,
  });
  const text = (r.text ?? "").trim();
  if (!text) {
    throw new ChapterSummaryGenerationError("模型返回为空，请重试或更换模型。");
  }
  return text;
}

/**
 * §11 步 20：章节概要 AI 生成（手动触发路径），带简单退避重试。
 */
export async function generateChapterSummaryWithRetry(args: {
  workTitle: string;
  chapterTitle: string;
  chapterContent: string;
  settings?: AiSettings;
  signal?: AbortSignal;
  maxAttempts?: number;
  baseDelayMs?: number;
}): Promise<string> {
  const settings = args.settings ?? loadAiSettings();
  const maxAttempts = Math.max(1, args.maxAttempts ?? 3);
  const baseDelayMs = args.baseDelayMs ?? 900;
  let lastErr: unknown;
  for (let i = 0; i < maxAttempts; i++) {
    if (args.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    try {
      return await generateChapterSummaryOnce({
        workTitle: args.workTitle,
        chapterTitle: args.chapterTitle,
        chapterContent: args.chapterContent,
        settings,
        signal: args.signal,
      });
    } catch (e) {
      lastErr = e;
      if (e instanceof DOMException && e.name === "AbortError") throw e;
      // 门控/业务类错误不重试
      if (e instanceof ChapterSummaryGenerationError) throw e;
      if (i < maxAttempts - 1) {
        const d = baseDelayMs * (i + 1);
        await new Promise<void>((r) => setTimeout(r, d));
      }
    }
  }
  if (lastErr instanceof Error) {
    throw new ChapterSummaryGenerationError(lastErr.message || "生成失败");
  }
  throw new ChapterSummaryGenerationError("生成失败");
}
