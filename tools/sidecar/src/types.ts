export type ChatRole = "user" | "assistant";

export type GenerateRequest = {
  /** 系统提示词，对应 Claude Agent SDK 的 systemPrompt */
  system?: string;
  /** 完整的对话消息（不含 system）；按时间正序 */
  messages: Array<{ role: ChatRole; content: string }>;
  /** 模型别名："sonnet" | "opus" | "haiku"；或完整 ID */
  model?: string;
  /** 最大对话回合（默认 1：纯文本生成不进 agent loop） */
  maxTurns?: number;
};

export type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };
