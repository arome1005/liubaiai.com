export type AiProviderId = "openai" | "anthropic" | "gemini" | "ollama" | "doubao";

export type AiProviderConfig = {
  id: AiProviderId;
  /** 展示名（UI） */
  label: string;
  /** baseUrl 可覆盖；留空走默认 */
  baseUrl?: string;
  /** model 名称（如 gpt-4.1-mini / claude-3-5-sonnet-latest / gemini-2.0-flash / llama3.1:8b） */
  model: string;
  /** API key（本机 localStorage；桌面版可换更安全存储） */
  apiKey?: string;
};

export type AiSettings = {
  provider: AiProviderId;
  openai: AiProviderConfig;
  anthropic: AiProviderConfig;
  gemini: AiProviderConfig;
  ollama: AiProviderConfig;
  doubao: AiProviderConfig;
  /**
   * AI 隐私与上传范围（仅对“非本机模型”生效）。
   * 注意：本项目为纯前端直连；只要发起请求，就会把本次 prompt 发往对应提供方。
   */
  privacy: {
    /** 是否已阅读并同意 AI 联网/上传提示词的说明 */
    consentAccepted: boolean;
    /** 同意时间（ms），仅用于展示 */
    consentAcceptedAt?: number;
    /**
     * 是否允许对“非本机模型”发起请求。
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
    /** 允许上传：创作圣经（导出 Markdown） */
    allowBible: boolean;
    /** 允许上传：本章关联摘录（参考库） */
    allowLinkedExcerpts: boolean;
    /** 允许上传：参考库检索片段（RAG） */
    allowRagSnippets: boolean;
  };
  /** 将圣经导出注入提示词（可能很长） */
  includeBible: boolean;
  /** 最多注入多少字符（用于圣经/摘录合并截断） */
  maxContextChars: number;
};

export type AiChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AiGenerateResult = {
  text: string;
  raw?: unknown;
};

