import { Hono } from "hono";
import { cors } from "hono/cors";
import { stream } from "hono/streaming";
import { serve } from "@hono/node-server";
import { loadOrInitConfig, configPath } from "./config.js";
import { streamGenerate } from "./claude.js";
import type { GenerateRequest } from "./types.js";

if (process.env.ANTHROPIC_API_KEY) {
  console.warn("");
  console.warn("⚠️  检测到 ANTHROPIC_API_KEY 环境变量。");
  console.warn("   Claude Agent SDK 会优先使用 API Key（按 token 计费），");
  console.warn("   而不是你的 Pro 订阅。这违背 sidecar 的初衷。");
  console.warn("   建议：unset ANTHROPIC_API_KEY 后重启 sidecar。");
  console.warn("");
}

const cfg = loadOrInitConfig();
const app = new Hono();

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return "";
      return cfg.allowedOrigins.includes(origin) ? origin : "";
    },
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    credentials: false,
    maxAge: 600,
  }),
);

app.get("/health", (c) =>
  c.json({ ok: true, service: "liubai-sidecar", version: "0.1.0" }),
);

app.use("*", async (c, next) => {
  if (c.req.path === "/health") return next();
  const auth = c.req.header("Authorization") ?? "";
  if (auth !== `Bearer ${cfg.token}`) {
    return c.json({ error: "unauthorized" }, 401);
  }
  return next();
});

app.post("/v1/stream", async (c) => {
  let body: GenerateRequest;
  try {
    body = (await c.req.json()) as GenerateRequest;
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return c.json({ error: "messages_required" }, 400);
  }

  c.header("Content-Type", "text/event-stream");
  c.header("Cache-Control", "no-cache, no-transform");
  c.header("Connection", "keep-alive");
  c.header("X-Accel-Buffering", "no");

  return stream(c, async (s) => {
    try {
      for await (const ev of streamGenerate(body)) {
        await s.write(`data: ${JSON.stringify(ev)}\n\n`);
        if (ev.type === "done" || ev.type === "error") break;
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await s.write(`data: ${JSON.stringify({ type: "error", message })}\n\n`);
    } finally {
      await s.write(`data: [DONE]\n\n`);
    }
  });
});

const masked = (t: string) => (t.length <= 8 ? "*".repeat(t.length) : `${t.slice(0, 4)}…${t.slice(-4)}`);

serve(
  { fetch: app.fetch, port: cfg.port, hostname: "127.0.0.1" },
  (info) => {
    const url = `http://127.0.0.1:${info.port}`;
    console.log("");
    console.log("===== 留白写作 · 本地 Sidecar =====");
    console.log(`监听:           ${url}`);
    console.log(`Token (打码):   ${masked(cfg.token)}`);
    console.log(`Token (完整):   ${cfg.token}`);
    console.log(`允许的 Origin:  ${cfg.allowedOrigins.join(", ")}`);
    console.log(`配置文件:       ${configPath()}`);
    console.log("");
    console.log("Tip: 把 Token 粘贴到「设置 → Owner 模式 → Sidecar Token」");
    console.log("=====================================");
    console.log("");
  },
);
