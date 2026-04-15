/**
 * AI 调用错误分类（供侧栏 / Hub 页与步 3「错误体」对齐；启发式，非厂商枚举真源）。
 * 注意：不要匹配用户主动取消（AbortError 在调用处过滤，通常不 setError）。
 */
export type AiClientErrorKind =
  | "auth"
  | "rate_limit"
  | "network"
  | "config_hint"
  | "server_unavailable"
  | "unknown";

/**
 * 对 **错误 message 字符串** 做粗分类（与 `providers` 抛出的 `Error.message` 对齐）。
 */
export function classifyAiClientError(message: string): AiClientErrorKind {
  const m = message;
  if (/请先在[「"]设置|请在设置中|隐私设置|高级后端配置|API Key|Base URL|填写.*Key|未配置.*Key/i.test(m)) {
    return "config_hint";
  }
  if (/\b401\b|\b403\b/i.test(m)) return "auth";
  if (/unauthorized|invalid.*api.*key|incorrect api key|密钥无效|鉴权失败/i.test(m)) return "auth";
  if (/\b429\b/i.test(m)) return "rate_limit";
  if (/rate\s*limit|限流|too many requests|请求过于频繁/i.test(m)) return "rate_limit";
  if (/\b502\b|\b503\b|\b504\b|bad gateway|网关错误|服务不可用|service unavailable/i.test(m)) {
    return "server_unavailable";
  }
  if (
    /failed to fetch|load failed|networkerror|网络请求失败|econnrefused|enotfound|混合内容|econnreset|connection reset|连接被重置|socket|ssl|tls|证书|cors|跨域/i.test(
      m,
    )
  ) {
    return "network";
  }
  if (/timeout|超时|timed out|etimedout/i.test(m)) return "network";
  return "unknown";
}

/** 侧栏 / Hub 错误是否应附「打开设置」链（Key、网络、限流、网关等）。 */
export function shouldOfferSettingsLinkForAiError(message: string): boolean {
  const k = classifyAiClientError(message);
  return k === "auth" || k === "rate_limit" || k === "network" || k === "config_hint" || k === "server_unavailable";
}
