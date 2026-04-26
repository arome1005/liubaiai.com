import { query } from "@anthropic-ai/claude-agent-sdk";
import type { GenerateRequest, StreamEvent } from "./types.js";

/**
 * 一些常见别名映射到具体的 Claude 模型 ID。
 * 如果传入的字符串已经是完整 ID（包含 "-"），原样透传。
 */
const MODEL_ALIASES: Record<string, string> = {
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-7",
  haiku: "claude-haiku-4-5-20251001",
};

function resolveModel(input?: string): string | undefined {
  if (!input) return undefined;
  const lower = input.toLowerCase();
  return MODEL_ALIASES[lower] ?? input;
}

/**
 * 把 chat-style messages 拼成 Agent SDK 需要的 prompt 字符串。
 * - 单轮且只有 user：直接用其 content
 * - 多轮：用 <user>/<assistant> 标签拼接，作为单条 user prompt 传入
 *   （Claude 对这种 transcript-style 输入识别得很好）
 */
function flattenMessagesToPrompt(messages: GenerateRequest["messages"]): string {
  if (messages.length === 0) return "";
  if (messages.length === 1 && messages[0].role === "user") return messages[0].content;
  return messages
    .map((m) => `<${m.role}>\n${m.content}\n</${m.role}>`)
    .join("\n\n");
}

/**
 * 抽出 Anthropic Beta stream 事件里的文本 delta。
 * stream_event 的 .event 形如：
 *  { type: 'message_start', ... }
 *  { type: 'content_block_start', index, content_block: { type: 'text', text: '' } }
 *  { type: 'content_block_delta', index, delta: { type: 'text_delta', text: '...' } }
 *  { type: 'content_block_stop', ... }
 *  { type: 'message_delta', delta: {...}, usage: {...} }
 *  { type: 'message_stop' }
 */
function extractTextDelta(event: unknown): string | null {
  if (!event || typeof event !== "object") return null;
  const e = event as { type?: string; delta?: { type?: string; text?: string } };
  if (e.type === "content_block_delta" && e.delta?.type === "text_delta") {
    return typeof e.delta.text === "string" ? e.delta.text : null;
  }
  return null;
}

/**
 * 主入口：把一次生成请求转换成 SSE 事件流。
 * 关键约束：
 *  - 不传 apiKey、不读 ANTHROPIC_API_KEY → SDK 会落到 Claude Code CLI 的 OAuth 凭据 → 走 Pro 订阅
 *  - allowedTools=[] → 纯文本生成，禁止任何工具调用
 *  - maxTurns=1 → 单轮，不进 agent loop
 *  - includePartialMessages=true → 拿到 stream_event，逐字 delta
 */
export async function* streamGenerate(req: GenerateRequest): AsyncGenerator<StreamEvent> {
  const prompt = flattenMessagesToPrompt(req.messages);
  if (!prompt.trim()) {
    yield { type: "error", message: "empty prompt" };
    return;
  }

  const model = resolveModel(req.model);
  const maxTurns = req.maxTurns ?? 1;

  try {
    const iter = query({
      prompt,
      options: {
        ...(req.system ? { systemPrompt: req.system } : {}),
        ...(model ? { model } : {}),
        maxTurns,
        allowedTools: [],
        includePartialMessages: true,
      },
    });

    for await (const msg of iter) {
      // 流式 delta：stream_event
      if (msg.type === "stream_event") {
        const text = extractTextDelta((msg as { event?: unknown }).event);
        if (text) yield { type: "delta", text };
        continue;
      }
      // 兜底：如果没收到 stream_event（某些场景下 SDK 不发 partial），
      // 用 assistant 完整消息一次性吐出文本
      if (msg.type === "assistant") {
        const m = msg as { message?: { content?: Array<{ type?: string; text?: string }> } };
        const blocks = m.message?.content ?? [];
        // 仅当此前没有任何 stream_event delta 时才 fallback；
        // 这里简单处理：遇到 assistant 就把里面 text 都吐一遍 —— 因为开了
        // includePartialMessages 后，正常情况下 stream_event 已经 yield 过文本，
        // 重复 yield 会让前端拼出两份。所以默认我们 **不** fallback；只在没有 delta 时使用。
        // 实际是否 fallback 由调用方 SSE 协议决定 —— 这里保守不重复发。
        void blocks;
        continue;
      }
      if (msg.type === "result") {
        const r = msg as { subtype?: string; is_error?: boolean; result?: string };
        if (r.is_error) {
          yield { type: "error", message: r.subtype ?? "result_error" };
          return;
        }
        yield { type: "done" };
        return;
      }
    }
    yield { type: "done" };
  } catch (e) {
    yield {
      type: "error",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}
