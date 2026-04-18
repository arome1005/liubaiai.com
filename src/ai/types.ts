export type AiProviderId =
  | "openai"
  | "anthropic"
  | "gemini"
  | "ollama"
  /** Apple MLX 本地服务（OpenAI 兼容 /chat/completions，Base URL 以实际部署为准） */
  | "mlx"
  | "doubao"
  /** 智谱 GLM（OpenAI 兼容） */
  | "zhipu"
  /** Kimi / Moonshot（OpenAI 兼容） */
  | "kimi"
  /** 小米 MiMo 等（OpenAI 兼容；Base URL 以官方文档为准） */
  | "xiaomi";

export type AiProviderConfig = {
  id: AiProviderId;
  /** 展示名（UI） */
  label: string;
  /** baseUrl 可覆盖；留空走默认 */
  baseUrl?: string;
  /** model 名称（如 gpt-4.1-mini / claude-3-5-sonnet-latest / gemini-2.0-flash / llama3.1:8b） */
  model: string;
  /** embedding model（用于"调性提示"等向量距离；留空表示不启用 embedding 方案） */
  embeddingModel?: string;
  /** API key（本机 localStorage；桌面版可换更安全存储） */
  apiKey?: string;
};

export type AiSettings = {
  provider: AiProviderId;
  openai: AiProviderConfig;
  anthropic: AiProviderConfig;
  gemini: AiProviderConfig;
  ollama: AiProviderConfig;
  mlx: AiProviderConfig;
  doubao: AiProviderConfig;
  zhipu: AiProviderConfig;
  kimi: AiProviderConfig;
  xiaomi: AiProviderConfig;
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
    /** 允许上传：本章关联摘录（参考库） */
    allowLinkedExcerpts: boolean;
    /** 允许上传：参考库检索片段（RAG） */
    allowRagSnippets: boolean;
  };
  /** 将本书锦囊导出注入提示词（可能很长） */
  includeBible: boolean;
  /** 最多注入多少字符（用于锦囊导出/摘录合并截断） */
  maxContextChars: number;
  /** 云端写作温度 0.1–2.0（各云端 API 的 temperature；观云弹窗内称「神思」） */
  geminiTemperature: number;
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

export type AiGenerateResult = {
  text: string;
  raw?: unknown;
};

