/**
 * 流式/请求在 AbortController 或系统取消时的错误形态。
 * 在 `catch` 中集中用此判断，避免散落 `e.name === "AbortError"`、漏判 DOMException 或文案变体。
 *
 * 与 `isFirstAiGateCancelledError`（显式点「仍发送」的取消）分工不同，二者可同时判断。
 */
export function isAbortError(err: unknown): boolean {
  if (err == null) return false;
  if (typeof err === "object" && "name" in err && (err as { name: unknown }).name === "AbortError") {
    return true;
  }
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (err instanceof Error) {
    if (err.name === "AbortError") return true;
    if (/abort/i.test(err.message)) return true;
  }
  return false;
}
