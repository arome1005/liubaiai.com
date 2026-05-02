/**
 * 本章正文流式输出：为「目标汉字/标点量」反推 `max_output_tokens` / `max_tokens` 的粗算。
 * 与 `approx-tokens` 的 CJK 启发式同向，略偏松以防截断。
 */

export const OUTLINE_BODY_MAX_OUTPUT_TOKENS_CAP = 12_000;
export const OUTLINE_BODY_CONTINUATION_MAX_ROUNDS = 4; // 1 次初稿 + 3 次续写
export const OUTLINE_BODY_LENGTH_OK_RATIO = 0.95;

const MIN_TOK = 256;

/**
 * 将期望输出 token 上界限制在 [256, cap]。
 */
export function clampStreamMaxOutputTokens(n: number, cap: number = OUTLINE_BODY_MAX_OUTPUT_TOKENS_CAP): number {
  if (!Number.isFinite(n) || n <= 0) return Math.min(2048, cap);
  return Math.max(MIN_TOK, Math.min(cap, Math.floor(n)));
}

/**
 * 为**一段**生成就绪：为凑够约 `targetChars` 字（含标点，同 `wordCount`）而预留的 max output tokens 粗算。
 */
export function estimateMaxOutputTokensForTargetChineseChars(targetChars: number): number {
  if (targetChars <= 0) return 2048;
  // 中文实际 ~1.3-1.5 token/字；输出侧预算宁可多留，防止 max_tokens 截断把生成切短。
  // 用 / 1.0 的保守系数（1 字 ≥ 1 token），再 +128 给标点 / 标题 / 段落分隔等开销。
  return clampStreamMaxOutputTokens(Math.ceil(targetChars / 1.0) + 128);
}

/**
 * 续写前自检：已生成字数（含标点）是否已接近目标，足够则不必再要一轮。
 */
export function outlineBodyLengthSatisfied(
  currentWordCount: number,
  targetWordCount: number,
  okRatio: number = OUTLINE_BODY_LENGTH_OK_RATIO,
): boolean {
  if (targetWordCount <= 0) return true;
  return currentWordCount >= Math.floor(targetWordCount * okRatio);
}
