/**
 * 参考库段落检索失败时，给用户看的短句（不暴露堆栈；满足 §5 规则 4「显式降级+轻提示」）。
 */
export function formatTuiyanReferenceRagErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const m = err.message?.trim() ?? ""
    if (m && m.length < 180) {
      return `参考检索失败：${m}。当前无法展示命中片段，规划生成仍按构思优先；可稍后重试。`
    }
  }
  return "参考检索失败：本地索引或存储暂不可用，已不展示命中片段（规划与对话仍按普通模式、以你的构思为主）。请稍后重试或到藏经页检查书目索引。"
}
