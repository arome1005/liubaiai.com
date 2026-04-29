import { generateWithProviderStream } from "./client";
import { getProviderConfig } from "./storage";
import type { AiSettings } from "./types";

/** 与《升级计划》第 3 节一致的提炼上文字符上限。 */
export const SHENG_HUI_STYLE_EXTRACT_MAX_SOURCE_CHARS = 1500;

/**
 *  user 消息：从参考书段落提炼笔法，不引用原文，用于代替 RAG 原文块注入。
 *  文案对齐 docs/sheng-hui-improve-plan.md。
 */
export function buildShengHuiStyleExtractUserPrompt(sourceText: string): string {
  const body = sourceText.slice(0, SHENG_HUI_STYLE_EXTRACT_MAX_SOURCE_CHARS);
  return `请从以下中文小说段落中，提炼其笔法特征，包括：
句子节奏（长短句分布）、遣词风格（古典/白话/现代）、感官偏好（视/听/触）、情绪处理方式（外化/内化）。
输出3-4句简洁的风格描述，不要引用原文。

【段落】
${body}`;
}

export async function runShengHuiStyleFeatureExtract(options: {
  settings: AiSettings;
  workId: string | null;
  sourceText: string;
  signal?: AbortSignal;
}): Promise<string> {
  const { settings, workId, sourceText, signal } = options;
  const cfg = getProviderConfig(settings, settings.provider);
  const prompt = buildShengHuiStyleExtractUserPrompt(sourceText);
  let result = "";
  await generateWithProviderStream({
    provider: settings.provider,
    config: cfg,
    messages: [{ role: "user", content: prompt }],
    onDelta: (d) => {
      result += d;
    },
    signal,
    usageLog: { task: "生辉·笔法提炼", workId: workId ?? undefined },
  });
  return result.trim();
}
