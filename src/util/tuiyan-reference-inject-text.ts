import type { ReferenceSearchHit, TuiyanReferenceBinding, TuiyanReferenceRangeMode } from "../db/types"
import { approxRoughTokenCount } from "../ai/approx-tokens"

/** 与 `useTuiyanReferenceActions.handleInjectToChat` 中拼接的参考块一致，用于粗估。 */
export const TUIYAN_REF_CHAT_INJECT_LABEL = "【参考段落】"

export const TUIYAN_REF_INJECT_TOKEN_SOFT = 400
export const TUIYAN_REF_INJECT_TOKEN_HEAVY = 1200

/**
 * 推演参考 Tab 注入正文的**字符**上限（UTF-16 代码单元，与 `String#length` 一致；不在 UI 展示具体数字）。
 * 与 `rangeMode` 对齐：摘要优先更严，节选/指定章更宽。
 */
export const TUIYAN_REF_INJECT_MAX_CHARS: Record<"summary_only" | "excerpt" | "absolute" | "fallback", number> = {
  summary_only: 6_000,
  excerpt: 12_000,
  /** 任意路径入对话前的**硬**上限（防单块 64K 分块或异常长串撑爆） */
  absolute: 20_000,
  /** 未找到 binding 时与「摘要+节选」同档，避免无配置时误用严档 */
  fallback: 12_000,
}

/**
 * 写作侧栏 RAG 每条命中在 `assemble-context` 拼进用户消息前：与推演参考「摘要+节选」档**单条**同宽（第十二批同预算）。
 */
export const WRITING_RAG_PER_HIT_MAX_CHARS = TUIYAN_REF_INJECT_MAX_CHARS.excerpt

/** 无 `【参考段落】` 包装，仅按字符上限截断，供写作侧 RAG 命中条（与 `TUIYAN_REF_INJECT_MAX_CHARS.excerpt` 数值一致） */
export function clampReferenceRagSnippetForAssembleBody(
  raw: string,
  maxChars: number = WRITING_RAG_PER_HIT_MAX_CHARS,
): string {
  const t = raw.trim()
  if (t.length <= maxChars) return t
  return `${t.slice(0, Math.max(0, maxChars - 1))}…`
}

const TRUNCATE_SUFFIX = "\n（已截断）"

export function maxCharsForTuiyanReferenceRangeMode(mode: TuiyanReferenceRangeMode | undefined): number {
  if (mode === "summary_only") return TUIYAN_REF_INJECT_MAX_CHARS.summary_only
  return TUIYAN_REF_INJECT_MAX_CHARS.excerpt
}

/** 按书目 binding 解算「全量/摘要注入」共用的正文字符上限。 */
export function injectMaxCharsForTuiyanRefBook(
  refWorkId: string,
  referenceBindings: TuiyanReferenceBinding[] | undefined,
): number {
  if (!referenceBindings?.length) return TUIYAN_REF_INJECT_MAX_CHARS.fallback
  const b = referenceBindings.find((x) => x.refWorkId === refWorkId)
  return maxCharsForTuiyanReferenceRangeMode(b?.rangeMode)
}

/**
 * 将注入正文压到 `maxChars` 以内；超长时截断并追加短后缀（会进入对话，不算独立 UI 控件）。
 */
export function clampTuiyanReferenceInjectBody(
  text: string,
  maxChars: number,
): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false }
  const maxBody = maxChars - TRUNCATE_SUFFIX.length
  if (maxBody < 1) {
    return { text: text.slice(0, maxChars), truncated: true }
  }
  return { text: text.slice(0, maxBody) + TRUNCATE_SUFFIX, truncated: true }
}

/** 与参考面板 RAG 卡片「全量注入」取同一字符串，避免与 UI 行为漂移。 */
export function getReferenceRagHitFullText(hit: ReferenceSearchHit): string {
  if (hit.preview && hit.preview.trim()) return hit.preview
  return [hit.snippetBefore, hit.snippetMatch, hit.snippetAfter].join("")
}

/** 粗估「本次在输入框**新增**的」token（仅参考块，不含用户原有输入；与 `approxRoughTokenCount(参考段落\\n+body)` 一致）。 */
export function approxReferenceInjectDeltaTokens(injectBody: string): number {
  return approxRoughTokenCount(`${TUIYAN_REF_CHAT_INJECT_LABEL}\n${injectBody}`)
}

export type ApproxReferenceInjectDeltaResult =
  | { ok: true; tokens: number }
  | { ok: false; message: string }

/**
 * 与 `approxReferenceInjectDeltaTokens` 同义，但捕获异常，供参考 Tab 展示「粗估失败」而不断裂 UI。
 */
export function safeApproxReferenceInjectDeltaTokens(injectBody: string): ApproxReferenceInjectDeltaResult {
  try {
    return { ok: true, tokens: approxReferenceInjectDeltaTokens(injectBody) }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * 将长片段压成 `【参考摘要】` + 2～4 条短句要点，作为「摘要注入」时写入 `【参考段落】` **之后**的内容。
 * （`handleInjectRefToChat` 外层会再包一层 `【参考段落】\n` + 本段。）
 * `maxOutputChars` 防止摘要在极端输入下仍过长（默认与全量 cap 同档安全值）。
 */
export function buildReferenceSummaryInjectBody(
  raw: string,
  maxOutputChars: number = TUIYAN_REF_INJECT_MAX_CHARS.fallback,
): string {
  const flat = raw.replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim()
  if (flat.length <= 200) {
    const one = `【参考摘要】\n- ${flat}`
    return clampTuiyanReferenceInjectBody(one, maxOutputChars).text
  }
  const sents = flat
    .split(/(?<=[。！？…])/u)
    .map((s) => s.trim())
    .filter(Boolean)
  const take = (sents.length > 0 ? sents : [flat]).slice(0, 4)
  const lines = take
    .map((s) => {
      const t = s.length > 160 ? `${s.slice(0, 160)}…` : s
      return `- ${t}`
    })
    .join("\n")
  const body = `【参考摘要】\n${lines}`
  return clampTuiyanReferenceInjectBody(body, maxOutputChars).text
}

export function tokenBandClass(tokens: number): "normal" | "warning" | "danger" {
  if (tokens <= TUIYAN_REF_INJECT_TOKEN_SOFT) return "normal"
  if (tokens <= TUIYAN_REF_INJECT_TOKEN_HEAVY) return "warning"
  return "danger"
}
