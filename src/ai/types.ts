export type AiProviderId =
  | "openai"
  | "anthropic"
  | "gemini"
  /** Vertex：经自建后端代理到 GCP（Bearer + Supabase；请求体与 Gemini 相同） */
  | "vertex"
  | "ollama"
  /** Apple MLX 本地服务（OpenAI 兼容 /chat/completions，Base URL 以实际部署为准） */
  | "mlx"
  | "doubao"
  /** 智谱 GLM（OpenAI 兼容） */
  | "zhipu"
  /** Kimi / Moonshot（OpenAI 兼容） */
  | "kimi"
  /** 小米 MiMo 等（OpenAI 兼容；Base URL 以官方文档为准） */
  | "xiaomi"
  /**
   * Owner-only：通过本机 sidecar（Claude Agent SDK）调 Claude Code 订阅，
   * 绕过 API 计费。仅当登录账号是 owner、并启用 Owner 模式 + 探测到 sidecar 时才会被激活。
   * 不在用户可见的 provider 列表中。
   */
  | "claude-code-local";

export type AiProviderConfig = {
  id: AiProviderId;
  /** 展示名（UI） */
  label: string;
  /**
   * OpenRouter 等“路由型”网关：可用 OpenAI 兼容协议；部分提供方也可切回原生协议（若配置了 baseUrlNative）。
   * 未设置时由 `providers.ts` 按 baseUrl 推断。
   */
  transport?: "router" | "native";
  /** 原生协议 Base URL（例如 Anthropic Messages / Gemini generateContent），仅在 transport=native 时使用 */
  baseUrlNative?: string;
  /** baseUrl 可覆盖；留空走默认 */
  baseUrl?: string;
  /** model 名称（如 gpt-4.1-mini / claude-3-5-sonnet-latest / gemini-2.0-flash / llama3.1:8b） */
  model: string;
  /** 豆包等：仅 UI 展示用别名；实际请求仍用 `model`（如 ep-… endpoint id） */
  modelDisplayName?: string;
  /** embedding model（用于"调性提示"等向量距离；留空表示不启用 embedding 方案） */
  embeddingModel?: string;
  /** API key（本机 localStorage；桌面版可换更安全存储） */
  apiKey?: string;
  /** Vertex：GCP 项目与区域（与后端 .env 一致，仅作本地备忘/说明；实际路由由服务器决定） */
  vertexProject?: string;
  vertexLocation?: string;
};

export type AiSettings = {
  provider: AiProviderId;
  openai: AiProviderConfig;
  anthropic: AiProviderConfig;
  gemini: AiProviderConfig;
  vertex: AiProviderConfig;
  ollama: AiProviderConfig;
  mlx: AiProviderConfig;
  doubao: AiProviderConfig;
  zhipu: AiProviderConfig;
  kimi: AiProviderConfig;
  xiaomi: AiProviderConfig;
  /** Owner 模式专用：本机 sidecar 配置；apiKey 字段用于存放 sidecar Bearer Token */
  claudeCodeLocal: AiProviderConfig;
  /**
   * AI 隐私与上传范围（仅对"非本机模型"生效）。
   * 注意：本项目为纯前端直连；只要发起请求，就会把本次 prompt 发往对应提供方。
   */
  privacy: {
    /** 是否已阅读并同意 AI 联网/上传提示词的说明 */
    consentAccepted: boolean;
    /** 同意时间（ms），仅用于展示 */
    consentAcceptedAt?: number;
    /**
     * 是否允许对"非本机模型"发起请求。
     * 关掉时：OpenAI/Claude/Gemini 一律禁止调用；Ollama 不受影响。
     */
    allowCloudProviders: boolean;
    /** 允许上传：作品名、章节名等元数据 */
    allowMetadata: boolean;
    /** 允许上传：当前章全文（或截断后的正文） */
    allowChapterContent: boolean;
    /** 允许上传：当前选区 */
    allowSelection: boolean;
    /** 允许上传：最近章节概要 */
    allowRecentSummaries: boolean;
    /** 允许上传：本书锦囊（导出 Markdown） */
    allowBible: boolean;
    /** 允许上传：本章关联摘录（藏经） */
    allowLinkedExcerpts: boolean;
    /** 允许上传：藏经检索片段（RAG） */
    allowRagSnippets: boolean;
  };
  /** 将本书锦囊导出注入提示词（可能很长） */
  includeBible: boolean;
  /** 最多注入多少字符（用于锦囊导出/摘录合并截断） */
  maxContextChars: number;
  /** 云端写作温度 0.1–2.0（各云端 API 的 temperature；观云弹窗内称「神思」） */
  geminiTemperature: number;
  /**
   * 各云端提供方独立温度（0.1–2.0）。
   * 兼容：旧版本仅保存 `geminiTemperature`；加载时会回填到各云端 key。
   */
  temperatureByProvider?: Partial<Record<AiProviderId, number>>;
  /**
   * 侧栏预计注入粗估 token 超过该值时可要求确认（0=不按阈值触发「超量」确认）。
   * 与 `injectConfirmOnOversizeTokens` 联用；见 `resolveInjectionConfirmPrompt`。
   */
  injectApproxTokenThreshold: number;
  /** 粗估 tokens 超过阈值时，调用前是否 `window.confirm` */
  injectConfirmOnOversizeTokens: boolean;
  /** 向云端发送本书锦囊（全文导出）前是否始终确认（高危） */
  injectConfirmCloudBible: boolean;
  /** §11 步 47：侧栏草稿与风格卡比对后展示轻量提示（禁用套话命中、句长对比） */
  toneDriftHintEnabled: boolean;
  /** §11 步 48：高危操作（整卷/多章/批量）始终确认清单 */
  highRiskAlwaysConfirm: boolean;
  /**
   * 超阈值验证级别（替代 highRiskAlwaysConfirm 的三档控制）：
   * "off" = 不验证；"warn" = 仅提示（不阻断）；"confirm" = 强制清单确认。
   * 未设置时回退到 highRiskAlwaysConfirm。
   */
  highRiskConfirmMode?: "off" | "warn" | "confirm";
  /** 进阶防误触：超阈值时要求输入屏幕显示的数字验证码 */
  numericConfirm: boolean;
  /** 进阶防误触：同一高危操作冷却间隔至少 5 秒 */
  operationCooldown: boolean;
  /**
   * §11 步 48：本会话（当前标签页）侧栏累计粗估 tokens 上限；0=不限制。
   * 计入单次请求的 messages 与当次模型输出（粗估，非计费凭证）。
   */
  aiSessionApproxTokenBudget: number;
  /**
   * P1-04：日预算 tokens 上限；0=不限制。
   * 超过后发送前弹出确认弹窗（可强行继续，非硬性拦截）。
   */
  dailyTokenBudget: number;
  /**
   * P1-04：单次调用预警阈值（tokens）；0=不预警。
   * 与 `injectConfirmOnOversizeTokens` + `injectApproxTokenThreshold` 相比，
   * 这里使用新弹窗而不是 window.prompt。
   */
  singleCallWarnTokens: number;
};

export type AiChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/**
 * 单次调用的 token 统计。
 * - `source: "api"`：来自各厂商响应对应的 `usage` 字段（与计费口径一致，以各 API 实际返回为准）
 * - `source: "approx"`：本机对 prompt/正文的 `approxRoughTokenCount` 粗估，仅作参考
 */
export type AiTokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  source: "api" | "approx";
  /**
   * 思考/推理 token（仅厂商 API 单独披露时有值）。用于解释 `totalTokens > inputTokens + outputTokens`
   * 的差额，让用户看见思考模型的隐藏费用。粗估口径下永远 undefined。
   */
  reasoningTokens?: number;
};

export type AiGenerateResult = {
  text: string;
  raw?: unknown;
  /** 优先使用，用于侧栏/日累计/展示 */
  tokenUsage?: AiTokenUsage;
  /**
   * OpenAI 兼容等接口的 total_tokens 汇总（兼容旧代码）。
   * 若存在 `tokenUsage` 可忽略；否则调用方可仍用本字段作 fallback。
   */
  usageTotalTokens?: number;
};

