import type { WritingContextMode } from "../ai/assemble-context";

/**
 * 侧栏失败降级（§11 步 27）：是否像「上下文/长度/体积」类错误，可尝试缩短注入后重试。
 * 不含纯鉴权/限流（应由用户改 Key 或等待），但部分 API 文案会混在一起，宁可多给一次精简机会。
 */
export function errorSuggestsContextDegrade(message: string): boolean {
  const m = message;
  if (/context length|maximum context|max context|token limit|too many tokens|maximum.*tokens/i.test(m)) return true;
  if (/prompt is too long|input too long|请求过长|上下文过长|超出.*长度|内容过长/i.test(m)) return true;
  if (/\b413\b|request entity too large|payload too large/i.test(m)) return true;
  if (/exceeds the context|context window|length limit/i.test(m)) return true;
  return false;
}

/** 单次 run 可覆盖的注入开关（仅写作侧栏内部使用） */
export type AiRunContextOverrides = {
  maxContextChars?: number;
  includeBible?: boolean;
  ragEnabled?: boolean;
  currentContextMode?: WritingContextMode;
  includeRecentSummaries?: boolean;
  includeLinkedExcerpts?: boolean;
};

/**
 * 构建一轮「精简重试」覆盖：减半字数上限（下限 8000）、关全书圣经/RAG/邻章概要/关联摘录；
 * 若当前为全文注入且本章有概要，则改为概要注入。
 */
export function buildContextDegradeOverrides(args: {
  maxContextChars: number;
  currentContextMode: WritingContextMode;
  hasChapterSummary: boolean;
}): AiRunContextOverrides {
  const half = Math.max(8000, Math.floor(args.maxContextChars / 2));
  const out: AiRunContextOverrides = {
    maxContextChars: half,
    includeBible: false,
    ragEnabled: false,
    includeRecentSummaries: false,
    includeLinkedExcerpts: false,
  };
  if (args.currentContextMode === "full" && args.hasChapterSummary) {
    out.currentContextMode = "summary";
  }
  return out;
}
