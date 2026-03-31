export type AiProviderId = "openai" | "anthropic" | "gemini" | "ollama";

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

