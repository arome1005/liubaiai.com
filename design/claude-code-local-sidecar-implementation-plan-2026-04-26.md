# Claude Code 本地 Sidecar — 实施方案（owner 专用，绕过 API 计费）

> **生成日期**：2026-04-26
> **执行者**：Cursor 中的 Claude 4.7（plus / max 200 订阅）
> **目标读者**：直接复制本文给 Cursor 让它执行；本人无需逐字读完。
> **前置阅读**：本文档自包含；可直接照做。涉及到读取仓库现状的部分会明确标注「读取后再写」。

---

## 0. TL;DR — 你（Cursor 的 Claude）要做什么

为「留白写作」（[/Users/arome/Desktop/留白写作](.)）添加一个 **owner-only 的本地 Claude Code Sidecar**，让作者本人（`hesongqiang3@gmail.com`）在 `https://yourapp.com` 这种线上页面里写作时，AI 调用走 **本机 sidecar → Claude Agent SDK → Pro 订阅额度**，而所有其他用户继续走原来的 API/中转。

要做的事可以拆成 6 块：

1. `**tools/sidecar/`**：全新的独立 Node 子项目，把 `@anthropic-ai/claude-agent-sdk` 包成 SSE HTTP 服务，监听 `127.0.0.1:7788`。
2. `**src/ai/types.ts`**：在 `AiProviderId` 增加 `"claude-code-local"`，在 `AiSettings` 加对应 config 字段。
3. `**src/ai/providers.ts**`：新增 `generateClaudeCodeLocal` / `generateClaudeCodeLocalStream` 两个函数 + dispatch 分支。
4. `**src/util/owner-mode.ts**`：新建工具模块，判断当前登录账号是否 owner、探测 sidecar 可达、读取/写入 token。
5. **设置 UI**：在 owner 邮箱登录时，在 AI 设置页显示「Claude Code 本地直连」开关与 token 输入框。
6. **路由 hook**：在已有的 AI 调用入口里，owner 模式开启 + sidecar 健康时，自动覆盖 provider 为 `claude-code-local`。

完成后验收：

- 普通账号登录 → 表现完全不变（看不到 owner 选项、走原来的 API）
- owner 账号 + sidecar 已启动 → AI 调用 0 API 计费、Pro 订阅额度被消耗
- owner 账号 + sidecar 没启动 → 自动 fallback 到 owner 自己配置的 API

---

## 1. 架构与边界

### 1.1 拓扑

```
[作者的 Mac]
  ├─ Chrome 打开 https://yourapp.com（Vercel 静态托管）
  │     └─ React 在浏览器里运行
  │           ├─ owner 模式开 + 探测到 sidecar
  │           │     └─ fetch('http://127.0.0.1:7788/v1/stream', { Authorization: Bearer <token> })
  │           │           └─ sidecar 调 Claude Agent SDK
  │           │                 └─ 复用 ~/.claude/ OAuth 凭据 → Pro 订阅
  │           └─ 其它情况 → 走 src/ai/providers.ts 已有的 API 路径
  │
  └─ 独立 node 进程：tools/sidecar/server.ts
        npm run sidecar 启动；不写小说时可 Ctrl+C 关掉
```

### 1.2 不变的部分（重要）

- **Vercel 部署、Supabase、域名、其它用户的 API 流量** —— 全部不动。
- **现有 9 个 provider（openai/anthropic/gemini/ollama/mlx/doubao/zhipu/kimi/xiaomi）** 的代码和分发完全保留。
- **Sidecar 不进 Vercel 包**：sidecar 是 `tools/sidecar/` 独立子项目，不被 `vite build` 触达。

### 1.3 安全边界

- Sidecar **只监听 `127.0.0.1`**（不是 `0.0.0.0`），同 Wi-Fi 的人无法访问。
- Sidecar **强制 `Authorization: Bearer <token>` 校验**：token 在首次启动时随机生成并持久化到 `~/.liubai-sidecar/config.json`，作者一次性粘贴到浏览器 localStorage。
- Sidecar **CORS Origin 白名单**：默认只放行作者自己的域名 + `http://localhost:5173`（Vite dev）。
- **owner 判断纯前端**：以 Supabase 当前登录用户邮箱 `=== hesongqiang3@gmail.com` 为准。即使非 owner 用户尝试切到 owner 模式，他们的浏览器也连不上你的 sidecar，最坏情况是他们看到一个错误。

---

## 2. 前置条件（作者本人做一次）

> 这一节是给作者本人的操作清单，**Cursor 的 Claude 不要在代码里执行这些命令**，但要在 `tools/sidecar/README.md` 里写清楚。

1. **本机已安装 Claude Code CLI 并完成 Pro 登录**：
  ```bash
   npm install -g @anthropic-ai/claude-code  # 如果还没装
   claude  # 启动后用 /login 走 OAuth，登录 hesongqiang3@gmail.com
   /exit
  ```
   登录后会在 `~/.claude/` 留下凭据文件；Agent SDK 会自动复用。
2. **不要设置 `ANTHROPIC_API_KEY` 环境变量**（否则 Agent SDK 会切到 API 计费模式）。如果有，先 `unset ANTHROPIC_API_KEY`，并检查 `~/.zshrc` / `~/.bashrc` 没把它写死。
3. 全部代码完成后，作者本机操作：
  ```bash
   cd tools/sidecar
   npm install
   npm run dev   # 第一次启动，会打印 token，记下来
  ```
   然后浏览器打开线上 App，在 owner 模式设置里粘贴 token、保存。

---

## 3. 实施步骤

### 步骤 1 — 创建 `tools/sidecar/` 子项目

#### 3.1 目录结构

```
tools/sidecar/
├── package.json
├── tsconfig.json
├── .gitignore
├── README.md
└── src/
    ├── server.ts        # HTTP + SSE 主入口
    ├── claude.ts        # 包装 Claude Agent SDK
    ├── config.ts        # token & 端口持久化
    └── types.ts
```

#### 3.2 `tools/sidecar/package.json`

```json
{
  "name": "@liubai/sidecar",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "start": "tsx src/server.ts",
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.1.0",
    "hono": "^4.6.0",
    "@hono/node-server": "^1.13.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0"
  }
}
```

> **版本注意**：`@anthropic-ai/claude-agent-sdk` 的实际可用版本以执行时 npm 仓库为准。如果 `^0.1.0` 不存在，Cursor 应该 `npm view @anthropic-ai/claude-agent-sdk versions` 取最新，写回 package.json。

#### 3.3 `tools/sidecar/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

#### 3.4 `tools/sidecar/.gitignore`

```
node_modules/
dist/
.env
```

#### 3.5 `tools/sidecar/src/types.ts`

```ts
export type GenerateRequest = {
  /** 系统提示词，对应 Claude Agent SDK 的 systemPrompt */
  system?: string;
  /** 完整的对话消息（不含 system）；按时间正序 */
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  /** 模型别名："sonnet" | "opus" | "haiku"；或完整 ID */
  model?: string;
  /** 温度 0–2；不传交给 SDK 默认 */
  temperature?: number;
  /** 最大输出 tokens；不传则不限 */
  maxTokens?: number;
};

export type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; raw?: unknown }
  | { type: "error"; message: string };
```

#### 3.6 `tools/sidecar/src/config.ts`

```ts
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const CONFIG_DIR = join(homedir(), ".liubai-sidecar");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

type Config = {
  token: string;
  port: number;
  allowedOrigins: string[];
};

const DEFAULTS: Omit<Config, "token"> = {
  port: 7788,
  allowedOrigins: [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    // 作者请把生产域名加这里，例如 "https://liubai.example.com"
  ],
};

export function loadOrInitConfig(): Config {
  mkdirSync(CONFIG_DIR, { recursive: true });
  if (existsSync(CONFIG_PATH)) {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    return { ...DEFAULTS, ...raw };
  }
  const cfg: Config = {
    token: randomBytes(24).toString("hex"),
    ...DEFAULTS,
  };
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  return cfg;
}
```

#### 3.7 `tools/sidecar/src/claude.ts`

> **关键**：调用 `query()` 时 **不传 `apiKey`、不传 `ANTHROPIC_API_KEY` 环境**，SDK 会自动落到 Claude Code 的本地 OAuth 凭据 → 走订阅额度。

```ts
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { GenerateRequest, StreamEvent } from "./types.js";

const MODEL_ALIASES: Record<string, string> = {
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-7",
  haiku: "claude-haiku-4-5-20251001",
};

function resolveModel(input?: string): string | undefined {
  if (!input) return undefined;
  return MODEL_ALIASES[input] ?? input;
}

/**
 * 把 chat-style messages 拼成 Agent SDK 期望的 prompt 字符串。
 * 写作场景默认 maxTurns=1（不进 agent loop），allowedTools=[]（纯文本生成）。
 */
function flattenMessagesToPrompt(messages: GenerateRequest["messages"]): string {
  // 单轮场景下取最后一条 user 即可；多轮场景按 role 标签拼接
  if (messages.length === 1 && messages[0].role === "user") return messages[0].content;
  return messages
    .map((m) => `<${m.role}>\n${m.content}\n</${m.role}>`)
    .join("\n\n");
}

export async function* streamGenerate(req: GenerateRequest): AsyncGenerator<StreamEvent> {
  const prompt = flattenMessagesToPrompt(req.messages);
  const model = resolveModel(req.model);

  try {
    const iter = query({
      prompt,
      options: {
        ...(req.system ? { systemPrompt: req.system } : {}),
        ...(model ? { model } : {}),
        maxTurns: 1,
        allowedTools: [],
      },
    });

    for await (const msg of iter) {
      // SDKMessage 类型主要有 system | assistant | user | result
      // 我们只把 assistant 的 text 块作为 delta 发出去
      if (msg.type === "assistant" && Array.isArray(msg.message?.content)) {
        for (const block of msg.message.content) {
          if (block.type === "text" && typeof block.text === "string") {
            yield { type: "delta", text: block.text };
          }
        }
      }
      if (msg.type === "result") {
        yield { type: "done", raw: msg };
        return;
      }
    }
    yield { type: "done" };
  } catch (e) {
    yield { type: "error", message: e instanceof Error ? e.message : String(e) };
  }
}
```

> **执行注意**：上面对 SDK 返回 message 形状的解构是按目前公开文档写的；如果 Cursor 跑起来发现 `assistant` 消息结构不一致，让它先在 sidecar 里 `console.log(JSON.stringify(msg))` 一次抓出真实形状再调整。**不要因为跑不通就改成 API 模式**——验证 Pro 订阅生效是核心目标。

#### 3.8 `tools/sidecar/src/server.ts`

```ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { stream } from "hono/streaming";
import { serve } from "@hono/node-server";
import { loadOrInitConfig } from "./config.js";
import { streamGenerate } from "./claude.js";
import type { GenerateRequest } from "./types.js";

const cfg = loadOrInitConfig();
const app = new Hono();

app.use(
  "*",
  cors({
    origin: (origin) => (cfg.allowedOrigins.includes(origin) ? origin : ""),
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    credentials: false,
  })
);

// 健康检查 — 不需要 token，前端用它来探测 sidecar 是否在线
app.get("/health", (c) =>
  c.json({ ok: true, service: "liubai-sidecar", version: "0.1.0" })
);

// 之后所有路由强制校验 token
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

  return stream(c, async (s) => {
    s.onAbort(() => {
      // 客户端断开时不需要做特殊清理，迭代器会自然结束
    });
    for await (const ev of streamGenerate(body)) {
      await s.write(`data: ${JSON.stringify(ev)}\n\n`);
      if (ev.type === "done" || ev.type === "error") break;
    }
    await s.write(`data: [DONE]\n\n`);
  });
});

serve(
  { fetch: app.fetch, port: cfg.port, hostname: "127.0.0.1" },
  (info) => {
    console.log("");
    console.log("===== 留白写作 · 本地 Sidecar =====");
    console.log(`监听: http://127.0.0.1:${info.port}`);
    console.log(`Token: ${cfg.token}`);
    console.log(`允许的 Origin: ${cfg.allowedOrigins.join(", ")}`);
    console.log(`Token / 端口持久化在: ~/.liubai-sidecar/config.json`);
    console.log("=====================================");
    console.log("");
  }
);
```

#### 3.9 `tools/sidecar/README.md`

```markdown
# 留白写作 · 本地 Sidecar

只供作者本人（owner）用：把本机的 Claude Code Pro 订阅，包成 SSE HTTP 服务，
让线上部署的留白写作在 owner 登录时，绕过 API 计费走订阅额度。

## 启动

\`\`\`bash
# 一次性
npm install

# 日常
npm run dev
\`\`\`

启动后控制台会打印 Token，复制下来。

## 第一次接入

1. 浏览器打开线上 App，用 owner 邮箱登录
2. 进入「设置 → AI → Claude Code 本地直连」
3. 粘贴上面的 Token，点保存
4. 「测试连接」按钮变绿即生效

## 关闭

`Ctrl+C` 即可。前端会自动 fallback 到 owner 配置的常规 API。

## 配置文件

`~/.liubai-sidecar/config.json` —— Token、端口、允许的 Origin。
**首次部署后请把生产域名加进 `allowedOrigins`。**

## 安全注意

- 只监听 `127.0.0.1`，同 Wi-Fi 不可达
- Token 校验是 Bearer Auth；不要把 token 提交到 git 或聊天里
- **不要把这个文件夹打进 Vercel 部署**（已经在仓库根 `.vercelignore` 排除）
```

#### 3.10 仓库根 `.vercelignore`（追加）

> **读取后再写**：先 `cat .vercelignore`（如果存在），把下面追加；不存在就创建。

```
tools/sidecar
```

#### 3.11 仓库根 `package.json` 增加快捷脚本

> **读取后再写**：保留原 scripts，**只追加** 这两条：

```json
{
  "scripts": {
    "sidecar": "npm --prefix tools/sidecar run dev",
    "sidecar:start": "npm --prefix tools/sidecar run start"
  }
}
```

---

### 步骤 2 — 类型层：注册新 provider

#### 3.12 修改 [src/ai/types.ts](src/ai/types.ts)

**改动 1**：`AiProviderId` 联合类型增加一项

```ts
export type AiProviderId =
  | "openai"
  | "anthropic"
  | "gemini"
  | "ollama"
  | "mlx"
  | "doubao"
  | "zhipu"
  | "kimi"
  | "xiaomi"
  /** 仅 owner 本机：通过本机 sidecar 调 Claude Code 订阅，绕过 API 计费 */
  | "claude-code-local";
```

**改动 2**：`AiSettings` 增加 config 字段

```ts
export type AiSettings = {
  provider: AiProviderId;
  openai: AiProviderConfig;
  anthropic: AiProviderConfig;
  // ... 其它保持不变
  xiaomi: AiProviderConfig;
  /** owner-only：claude-code-local provider 的配置 */
  claudeCodeLocal: AiProviderConfig;
  privacy: { /* ... */ };
  // ... 后面字段不动
};
```

> **注意**：所有读取 `AiSettings` 的位置（默认值、迁移、UI 选择器）都要补上 `claudeCodeLocal`。让 Cursor `grep -rn "anthropic: " src/` 找出所有 `AiSettings` 默认值并加 `claudeCodeLocal` 默认值。`baseUrl` 默认 `http://127.0.0.1:7788`，`model` 默认 `"sonnet"`，`apiKey` 留空（这里用来塞 sidecar token，UI 上要标注清楚）。

---

### 步骤 3 — Provider 实现：调 sidecar 的 SSE

#### 3.13 修改 [src/ai/providers.ts](src/ai/providers.ts)

**新增两个函数**（放在文件后半部分，紧邻 `generateAnthropicStream`）：

```ts
/* ============================================================
 * Claude Code 本地 sidecar（owner-only）
 * 通过 http://127.0.0.1:7788 SSE，把 Pro/Max 订阅当后端用。
 * ========================================================== */

function resolveSidecarBaseUrl(cfg: AiProviderConfig): string {
  const t = (cfg.baseUrl ?? "").trim();
  return (t || "http://127.0.0.1:7788").replace(/\/+$/, "");
}

function buildClaudeCodeLocalBody(messages: AiChatMessage[], temperature: number | undefined, model: string) {
  const system = messages.find((m) => m.role === "system")?.content;
  const turns = messages.filter((m) => m.role !== "system") as Array<{ role: "user" | "assistant"; content: string }>;
  return {
    system,
    messages: turns,
    model,
    ...(temperature !== undefined ? { temperature } : {}),
  };
}

async function generateClaudeCodeLocal(
  cfg: AiProviderConfig,
  messages: AiChatMessage[],
  temperature: number | undefined,
  signal?: AbortSignal,
): Promise<AiGenerateResult> {
  let acc = "";
  await generateClaudeCodeLocalStream(cfg, messages, (delta) => { acc += delta; }, temperature, signal);
  return { text: acc };
}

async function generateClaudeCodeLocalStream(
  cfg: AiProviderConfig,
  messages: AiChatMessage[],
  onDelta: (textDelta: string) => void,
  temperature: number | undefined,
  signal?: AbortSignal,
): Promise<AiGenerateResult> {
  const token = (cfg.apiKey ?? "").trim();
  if (!token) {
    throw new Error("Claude Code 本地直连：请先在「设置 → Owner 模式」填入 sidecar token");
  }
  const url = `${resolveSidecarBaseUrl(cfg)}/v1/stream`;
  const body = buildClaudeCodeLocalBody(messages, temperature, cfg.model || "sonnet");

  const resp = await fetch(url, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok || !resp.body) {
    const t = await resp.text().catch(() => "");
    throw new Error(`Claude Code 本地 sidecar 返回 ${resp.status}: ${t || resp.statusText}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let acc = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    // SSE 协议按 \n\n 分隔 event
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const line = chunk.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return { text: acc };
      try {
        const ev = JSON.parse(data) as { type: string; text?: string; message?: string };
        if (ev.type === "delta" && typeof ev.text === "string") {
          acc += ev.text;
          onDelta(ev.text);
        } else if (ev.type === "error") {
          throw new Error(`Claude Code 本地 sidecar 错误：${ev.message ?? "unknown"}`);
        } else if (ev.type === "done") {
          return { text: acc };
        }
      } catch (e) {
        // JSON 解析失败时忽略该行；其它错误冒泡
        if (e instanceof Error && e.message.startsWith("Claude Code 本地 sidecar 错误")) throw e;
      }
    }
  }
  return { text: acc };
}
```

**新增 dispatch 分支**：

在 `generateWithProvider` 里 `if (provider === "anthropic")` 之前：

```ts
if (provider === "claude-code-local") return generateClaudeCodeLocal(config, messages, args.temperature, args.signal);
```

在 `generateWithProviderStream` 里同样位置：

```ts
if (provider === "claude-code-local") return generateClaudeCodeLocalStream(config, messages, args.onDelta, args.temperature, args.signal);
```

> `embedWithProvider` 不支持 `claude-code-local`：保留默认 throw 即可（Claude 不做 embedding）。

---

### 步骤 4 — Owner 模式判断 + sidecar 探测

#### 3.14 新建 `src/util/owner-mode.ts`

```ts
const OWNER_EMAIL = "hesongqiang3@gmail.com";
const SIDECAR_PROBE_TIMEOUT_MS = 800;
const SIDECAR_PROBE_CACHE_MS = 30_000;

const LS_OWNER_ENABLE_KEY = "liubai.ownerMode.enabled";
const LS_OWNER_TOKEN_KEY = "liubai.ownerMode.sidecarToken";
const LS_OWNER_BASEURL_KEY = "liubai.ownerMode.sidecarBaseUrl";

let probeCache: { at: number; ok: boolean } | null = null;

export function isOwnerEmail(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === OWNER_EMAIL;
}

export function getOwnerModeEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(LS_OWNER_ENABLE_KEY) === "1";
}

export function setOwnerModeEnabled(v: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_OWNER_ENABLE_KEY, v ? "1" : "0");
}

export function getOwnerSidecarToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(LS_OWNER_TOKEN_KEY) ?? "";
}

export function setOwnerSidecarToken(token: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_OWNER_TOKEN_KEY, token.trim());
}

export function getOwnerSidecarBaseUrl(): string {
  if (typeof window === "undefined") return "http://127.0.0.1:7788";
  return localStorage.getItem(LS_OWNER_BASEURL_KEY) || "http://127.0.0.1:7788";
}

export async function probeSidecar(force = false): Promise<boolean> {
  if (!force && probeCache && Date.now() - probeCache.at < SIDECAR_PROBE_CACHE_MS) {
    return probeCache.ok;
  }
  const url = `${getOwnerSidecarBaseUrl().replace(/\/+$/, "")}/health`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), SIDECAR_PROBE_TIMEOUT_MS);
    const r = await fetch(url, { signal: ctrl.signal, mode: "cors" });
    clearTimeout(t);
    const ok = r.ok;
    probeCache = { at: Date.now(), ok };
    return ok;
  } catch {
    probeCache = { at: Date.now(), ok: false };
    return false;
  }
}

/** 当前是否应该走 owner 直连：邮箱匹配 + 开关开 + sidecar 健康。
 *  调用方：在 AI 调用入口处把 provider 覆盖为 "claude-code-local"。 */
export async function shouldUseOwnerSidecar(email: string | null | undefined): Promise<boolean> {
  if (!isOwnerEmail(email)) return false;
  if (!getOwnerModeEnabled()) return false;
  if (!getOwnerSidecarToken()) return false;
  return probeSidecar();
}
```

---

### 步骤 5 — 设置 UI（owner-only 可见）

#### 3.15 找到现有 AI 设置面板

> **读取后再写**：让 Cursor 先 `grep -rn "AiSettings\|AI 设置" src/components src/pages` 定位到现有 AI 设置页面（很可能在 [src/components/EditorWritingSettingsSheet.tsx](src/components/EditorWritingSettingsSheet.tsx) 或 [src/components/RightRailPanels.tsx](src/components/RightRailPanels.tsx) 周边）。

#### 3.16 在该面板里增加一段 owner-only 区块

伪代码（让 Cursor 按现有面板样式套）：

```tsx
import {
  isOwnerEmail,
  getOwnerModeEnabled, setOwnerModeEnabled,
  getOwnerSidecarToken, setOwnerSidecarToken,
  probeSidecar,
} from "@/util/owner-mode";

function OwnerModeSection({ currentEmail }: { currentEmail: string | null }) {
  if (!isOwnerEmail(currentEmail)) return null;

  const [enabled, setEnabled] = React.useState(getOwnerModeEnabled());
  const [token, setToken] = React.useState(getOwnerSidecarToken());
  const [status, setStatus] = React.useState<"idle" | "ok" | "fail">("idle");

  return (
    <section className="space-y-3 rounded-xl border p-4">
      <header className="flex items-center justify-between">
        <h3 className="font-medium">Owner 模式 · Claude Code 本地直连</h3>
        <Switch
          checked={enabled}
          onCheckedChange={(v) => { setEnabled(v); setOwnerModeEnabled(v); }}
        />
      </header>
      <p className="text-xs text-muted-foreground">
        启用后，AI 调用走本机 sidecar → Pro 订阅，不消耗 API 额度。
        sidecar 未启动时自动 fallback 到下面配置的常规 provider。
      </p>
      <Input
        placeholder="Sidecar Token（启动 npm run sidecar 后从控制台复制）"
        value={token}
        onChange={(e) => { setToken(e.target.value); setOwnerSidecarToken(e.target.value); }}
      />
      <div className="flex items-center gap-2">
        <Button onClick={async () => setStatus((await probeSidecar(true)) ? "ok" : "fail")}>
          测试连接
        </Button>
        {status === "ok" && <span className="text-emerald-600 text-sm">已连通</span>}
        {status === "fail" && <span className="text-rose-600 text-sm">连不上 sidecar，先 npm run sidecar</span>}
      </div>
    </section>
  );
}
```

> **email 来源**：用现有 supabase 登录态 hook（`grep -rn "supabase.auth.getUser\|useAuth\|currentUser" src/`），把 `user.email` 传进 `currentEmail`。

---

### 步骤 6 — 调用入口处覆盖 provider

#### 3.17 在 AI 调用入口拦一下

> **读取后再写**：现有调用链是
> `任意业务（如 [src/ai/sheng-hui-generate.ts](src/ai/sheng-hui-generate.ts)、[src/ai/inspiration-expand.ts](src/ai/inspiration-expand.ts) 等）`
> → `[src/ai/client.ts](src/ai/client.ts)` 的 `generateWithProvider / generateWithProviderStream`
> → `[src/ai/providers.ts](src/ai/providers.ts)` dispatch
>
> 最干净的 hook 点是 `**src/ai/client.ts`**：在每个导出函数最前面加 owner override。

修改 [src/ai/client.ts](src/ai/client.ts)：

```ts
import { shouldUseOwnerSidecar, getOwnerSidecarToken, getOwnerSidecarBaseUrl } from "@/util/owner-mode";
import { getCurrentUserEmail } from "@/auth/get-current-user-email"; // 见下文

async function maybeOverrideToOwnerSidecar(args: {
  provider: AiProviderId;
  config: AiProviderConfig;
}): Promise<{ provider: AiProviderId; config: AiProviderConfig }> {
  const email = await getCurrentUserEmail();
  if (!(await shouldUseOwnerSidecar(email))) return args;
  return {
    provider: "claude-code-local",
    config: {
      ...args.config,
      id: "claude-code-local",
      label: "Claude Code（订阅）",
      baseUrl: getOwnerSidecarBaseUrl(),
      apiKey: getOwnerSidecarToken(), // 复用 apiKey 字段塞 token
      model: args.config.model && /sonnet|opus|haiku/i.test(args.config.model)
        ? args.config.model
        : "sonnet",
    },
  };
}

export async function generateWithProvider(args: {
  provider: AiProviderId;
  config: AiProviderConfig;
  messages: AiChatMessage[];
  temperature?: number;
  signal?: AbortSignal;
}): Promise<AiGenerateResult> {
  const ok = await requestFirstAiUseGate();
  if (!ok) throw new FirstAiGateCancelledError();
  const overridden = await maybeOverrideToOwnerSidecar({ provider: args.provider, config: args.config });
  return generateWithProviderImpl({ ...args, ...overridden });
}

// generateWithProviderStream 同样改造
// embedWithProvider 不需要改（owner 模式不接管 embedding）
```

`src/auth/get-current-user-email.ts`（如果不存在则新建；存在则复用）：

```ts
import { getSupabaseClient } from "@/storage/supabase-client"; // 按现有工程实际路径

export async function getCurrentUserEmail(): Promise<string | null> {
  try {
    const sb = getSupabaseClient();
    const { data } = await sb.auth.getUser();
    return data.user?.email ?? null;
  } catch {
    return null;
  }
}
```

> **如果项目已经有"获取当前用户 email"的 hook/util，直接复用，不要新建。** 让 Cursor `grep -rn "getUser()\\.then\|auth.getUser\|currentUser" src/` 找一下。

---

### 步骤 7 — 一个右下角小指示器（强烈建议）

为了避免你（作者）以为在用订阅、其实在烧 API 钱（最容易出的事故），在编辑器右下加一个小徽章：

#### 3.18 新建 `src/components/OwnerSidecarBadge.tsx`

```tsx
import * as React from "react";
import {
  isOwnerEmail, getOwnerModeEnabled, probeSidecar,
} from "@/util/owner-mode";
import { getCurrentUserEmail } from "@/auth/get-current-user-email";

export function OwnerSidecarBadge() {
  const [state, setState] = React.useState<"hidden" | "live" | "down">("hidden");

  React.useEffect(() => {
    let alive = true;
    const tick = async () => {
      const email = await getCurrentUserEmail();
      if (!isOwnerEmail(email) || !getOwnerModeEnabled()) {
        if (alive) setState("hidden");
        return;
      }
      const ok = await probeSidecar(true);
      if (alive) setState(ok ? "live" : "down");
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (state === "hidden") return null;
  return (
    <div className="fixed bottom-3 right-3 z-50 rounded-full px-3 py-1 text-xs shadow-md"
         style={{ background: state === "live" ? "#10b98122" : "#f43f5e22",
                  color: state === "live" ? "#047857" : "#9f1239" }}>
      {state === "live" ? "● Claude 订阅直连" : "● Sidecar 离线，已 fallback"}
    </div>
  );
}
```

挂到 [src/App.tsx](src/App.tsx) 顶层（在 Routes 外面）：

```tsx
import { OwnerSidecarBadge } from "@/components/OwnerSidecarBadge";
// ...
<>
  <RouterProvider ... />
  <OwnerSidecarBadge />
</>
```

---

## 4. 验收清单

### 4.1 sidecar 自身

- `cd tools/sidecar && npm install` 无报错
- `npm run dev` 后控制台打印出端口和 token
- `curl http://127.0.0.1:7788/health` 返回 `{"ok":true,...}`
- `curl http://127.0.0.1:7788/v1/stream`（无 Authorization）返回 `401`
- 带 token 的 `curl -N -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"messages":[{"role":"user","content":"用一句话介绍你自己"}]}' http://127.0.0.1:7788/v1/stream` 能流式拿到 `data: {"type":"delta",...}` 行

### 4.2 类型与编译

- `npm run typecheck` 通过
- `npm run lint` 通过
- `npm run build` 通过（说明 sidecar 子项目没被 vite 误打包）

### 4.3 前端行为

- **非 owner 邮箱登录**：设置页**看不到** Owner 区块；右下角徽章不显示；AI 调用走原有 provider
- **owner 登录但 owner 模式关**：设置页能看到 Owner 区块；徽章不显示；AI 调用走原有 provider
- **owner 登录 + 模式开 + sidecar 启动 + token 已粘贴**：徽章显示绿色"Claude 订阅直连"；触发任意 AI 调用，sidecar 终端能看到请求；浏览器 Network 能看到 `127.0.0.1:7788` 的 SSE 流
- **owner 模式开但 sidecar 没启动**：徽章显示红色"已 fallback"；AI 调用走原有 provider，不报错
- **owner 模式开 + sidecar 在 + token 错**：sidecar 收到请求返回 401；前端 toast 报"sidecar token 无效"

### 4.4 计费验证（最关键）

- 在 [https://claude.ai/settings/usage](https://claude.ai/settings/usage) 看 Plan usage limits
- **从 App 触发一次 AI 生成前后**，刷新该页面：**Pro 的 "Current session" 进度条应该上涨**；Anthropic API console 的 usage **应该没有增长**
- 不要把这一步只看一次就当成功，连续触发 3 次以上确认每次都进 Pro 额度

---

## 5. 安全检查清单

执行完以上后逐项 ✅：

- sidecar 监听是 `127.0.0.1` 而不是 `0.0.0.0`（`netstat -an | grep 7788` 看 LISTEN 行只在 127.0.0.1）
- `tools/sidecar/` 在 `.vercelignore` 里
- `tools/sidecar/.gitignore` 排除了 `node_modules`、`dist`、`.env`
- `~/.liubai-sidecar/config.json` 没被 commit
- localStorage token 不进 Supabase / 不进任何 telemetry
- **没有任何代码路径把 sidecar 暴露给非 owner 用户**：搜 `claude-code-local` 不出现在任何用户可达的 provider 选择 UI（只在 owner 区块里隐式启用）
- 没有任何环境变量、Vercel env、commit message、CI log 里出现 token

---

## 6. 故障排查


| 现象                                                 | 排查                                                                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `npm run dev` 报 `command not found: tsx`           | `npm install` 没装好；进 `tools/sidecar/` 重跑                                                                       |
| sidecar 启动报 `ANTHROPIC_API_KEY is set` 之类          | `unset ANTHROPIC_API_KEY` 后再启动；检查 zshrc/launchctl                                                             |
| 调用返回 `401 invalid api key` 风格                      | Agent SDK 没拿到 OAuth 凭据。重新跑 `claude /login`，确保 `~/.claude/` 有内容                                                |
| 调用成功但烧 API 额度（Pro 没动）                              | 99% 是环境里仍有 `ANTHROPIC_API_KEY`，或 SDK 版本太老不读 OAuth。先 `env                                                      |
| 浏览器报 CORS                                          | sidecar 的 `allowedOrigins` 没加你的域名。改 `~/.liubai-sidecar/config.json` 后重启 sidecar                               |
| 浏览器 fetch [http://127.0.0.1](http://127.0.0.1) 被拦截 | 现代浏览器把 localhost 当 secure context，不应该被拦。如果真被拦，用 `http://127.0.0.1` 而不是 `http://localhost`，并确认页面不是 file:// 打开的 |
| 探测一直 fail 但 curl OK                                | 多半 Origin 不在白名单；F12 Network 看 OPTIONS 预检的 Access-Control-Allow-Origin 头                                       |
| Vercel 构建炸了                                        | 大概率 vite 误把 sidecar 拉进来了。检查 `vite.config.ts` 没把 `tools/` 加 alias，`.vercelignore` 已生效                          |


---

## 7. 不要做的事

- ❌ **不要**把 sidecar 部署到 Vercel/任何远程服务器。订阅认证是本机 OAuth，远程跑 = 封号。
- ❌ **不要**在 sidecar 里加 `ANTHROPIC_API_KEY` 兜底。会无声地把订阅消费切到 API 计费。
- ❌ **不要**把 sidecar 的 `0.0.0.0` 当成"方便手机访问"的快捷方式。手机要用走 Tailscale，不是开公网。
- ❌ **不要**给非 owner 用户开 owner 模式入口（哪怕只是个隐藏按钮）。Anthropic 反滥用看到多 IP 来源会判定账号被盗。
- ❌ **不要**把 sidecar token 写进环境变量提交。每台机器一个、本地持久化。
- ❌ **不要**为了"让所有 provider 都能走 owner sidecar"而扩展 override 逻辑去覆盖 `gemini` / `openai` 等。owner 直连**只**接管 Claude 系列模型；其它 provider（豆包、Gemini）保持原状。

---

## 8. 完成后给作者的交付清单

执行完后，请在最终回复里包含：

1. 新增/修改的文件列表（按目录）
2. `npm run typecheck` 通过的截图/输出
3. sidecar `npm run dev` 启动后控制台输出（**token 部分打码**）
4. 一行话提示：「请运行一次 `cd tools/sidecar && npm install && npm run dev`，把控制台 token 复制到设置 → Owner 模式」
5. 提示作者把 **生产域名** 加进 `~/.liubai-sidecar/config.json` 的 `allowedOrigins`，并把 `tools/sidecar/src/config.ts` 的 `DEFAULTS.allowedOrigins` 也加上（这样新机器初始化时默认就有）

---

## 9. 一些可选的改进（本次不做，后续再说）

- launchd plist 让 sidecar 开机自启
- iPad/手机访问：通过 Tailscale 把 sidecar 暴露到 tailnet，前端 baseUrl 配成 `http://your-mac.tailnet:7788`
- sidecar 增加 prompt caching 透传（写小说世界观/前文极适合）
- sidecar 上加 metrics：每次调用记录到本地 sqlite，月底自查"省了多少 API 钱"
- 多 owner 支持（合作者也想用各自的 Pro）：把 OWNER_EMAIL 改成 array

---

## 10. 一句话总结

**Sidecar 是本机独立进程，前端是浏览器里跑的 JS，浏览器到 sidecar 完全在你这台 Mac 内部走环回，跟 Vercel/Supabase/任何线上设施零交集。安全、合规、白嫖订阅。**

---

## 附录 A — 已核实的精确路径（Cursor 直接用，不必再 grep）

> 本节路径在生成本方案前已经在仓库里 `grep` 验证过，可直接用。如果跑不通再回去搜。

### A.1 当前用户 email 的获取

仓库里**已经有**统一入口，**不要新建** `src/auth/get-current-user-email.ts`，直接用：

```ts
// src/api/auth.ts 已导出
import { authMe } from "@/api/auth";
// 或相对路径： import { authMe } from "../api/auth";

const { user } = await authMe();
const email = user?.email ?? null;
```

`AuthUser` 形状：`{ id: string; email: string; avatarUrl?: string | null }`。

把方案 §3.17 里 `getCurrentUserEmail` 的实现改成上面这一行包装即可：

```ts
// src/util/owner-mode.ts 内部加一个 helper（避免到处重写）
import { authMe } from "@/api/auth";

export async function getCurrentUserEmailForOwner(): Promise<string | null> {
  try {
    const { user } = await authMe();
    return user?.email ?? null;
  } catch {
    return null;
  }
}
```

`src/ai/client.ts` 里直接 `import { getCurrentUserEmailForOwner } from "@/util/owner-mode";` 即可。

### A.2 React 组件里订阅登录态

现有 hook：

```ts
// src/hooks/useAuthUserState.ts
import { useAuthUserState } from "@/hooks/useAuthUserState";

function MyComponent() {
  const authUser = useAuthUserState(); // AuthUser | null | undefined
  const email = (authUser && typeof authUser === "object" && "email" in authUser)
    ? (authUser as { email: string }).email
    : null;
  // ...
}
```

§3.16 OwnerModeSection 里的 `currentEmail` 直接用这个 hook 拿。

### A.3 Supabase client

```ts
import { getSupabase } from "@/lib/supabase";
```

> 在 owner-mode 这一波里**不需要直接调 supabase**——`authMe()` 已经包好了。

### A.4 App.tsx 里 Badge 的插入点

§3.18 `OwnerSidecarBadge` 挂在 [src/App.tsx](src/App.tsx) 最外层 `<>` 里，紧挨着 `<Toaster />` 和 `<FirstAiGateHost />` 这一类全局浮层。从仓库现状看，最稳的做法是放在 `RegisterDemoPackEffect` 后面、`Toaster` 旁边——具体位置 Cursor 看现有顺序自行决定，原则是**不进任何 Route 子树**（保证全站可见但不重渲染）。

### A.5 `.vercelignore`

仓库根目前**没有** `.vercelignore`，**新建**一个，内容：

```
tools/sidecar
```

Vercel 部署时会跳过这个目录，永远不会把 sidecar 代码或依赖打进 Edge / Serverless function。

---

## 附录 B — 与现有"AI 闸门 / 预算"系统的边界

仓库已有几个全局机制，owner 模式必须对它们做出明确决策：

### B.1 `requestFirstAiUseGate`（首次使用 AI 弹窗）

- **决策**：**保留，不绕过**。owner 模式仍然把内容发往 Anthropic（只是用订阅而不是 API），用户首次确认的语义没变。
- **不需要改动** [src/ai/first-ai-gate.ts](src/ai/first-ai-gate.ts) 和 [src/ai/client.ts](src/ai/client.ts) 中的 gate 调用顺序。`maybeOverrideToOwnerSidecar` 在 gate 通过之后再做 override 即可（按 §3.17 写法已经是这个顺序）。

### B.2 隐私开关 `privacy.allowCloudProviders` 等

- **决策**：owner 模式**仍受隐私开关约束**——逻辑上 sidecar 也是云服务，只是计费方式不同。隐私设置关掉时 owner 模式照样不能调用。
- **不需要改动**：现有 `assemble-context` 与 `providers.ts` 的隐私过滤在 `claude-code-local` 路径上自动生效（因为消息是同一个 messages 数组）。

### B.3 `dailyTokenBudget` / `singleCallWarnTokens` / `aiSessionApproxTokenBudget`

- **决策**：owner 模式下**这些 token 预算不计**——它们设计用途是控制 API 美元开销，订阅是 session 配额，metering 维度不同。
- **实现**：在调用预算检查的位置加一个早返回。让 Cursor `grep -rn "dailyTokenBudget\|singleCallWarnTokens\|aiSessionApproxTokenBudget" src/` 找到检查点，在每个检查点最前面加：
  ```ts
  // owner 模式下走订阅，不计入 API token 预算
  const { isOwnerEmail, getOwnerModeEnabled } = await import("@/util/owner-mode");
  const { authMe } = await import("@/api/auth");
  const me = await authMe();
  if (isOwnerEmail(me.user?.email) && getOwnerModeEnabled()) {
    return; // 或 return { ok: true } 等，按各检查点签名
  }
  ```
  > 这里用 dynamic import 是为了避免在非 owner 用户的代码路径上多加一层启动开销。如果各检查点本身已经是 async 调用，就改成静态 import 更干净。

### B.4 `last-used-provider` 记录

- **决策**：owner 模式开启期间**不要**把 `claude-code-local` 写进 `lastUsedProvider`，否则 owner 模式关闭后会留一个用户选不到的"幽灵 provider"。
- **实现**：让 Cursor 检查 [src/ai/last-used-provider.ts](src/ai/last-used-provider.ts) 的写入位置，在写入前过滤：
  ```ts
  if (provider === "claude-code-local") return; // 不持久化 owner-only provider
  ```

### B.5 Provider 选择器 UI

- **决策**：`AiProviderId` 多了一个 `"claude-code-local"`，但**所有面向用户的 provider 选择 UI 必须把它从选项列表里排除**。owner 模式只能通过 §3.16 的 owner 开关启用，不能在普通 provider 列表里选。
- **实现**：让 Cursor `grep -rn "AiProviderId\[\]\|ALL_PROVIDERS\|providers: \[" src/` 找出 provider 列表常量，在那里手动 filter 掉 `"claude-code-local"`。

---

## 附录 C — 端到端自测脚本

把这段保存成 `tools/sidecar/test-e2e.sh`，sidecar 启动后跑一次：

```bash
#!/usr/bin/env bash
set -euo pipefail

CONFIG="$HOME/.liubai-sidecar/config.json"
TOKEN=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$CONFIG','utf8')).token)")
PORT=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$CONFIG','utf8')).port)")
BASE="http://127.0.0.1:$PORT"

echo "→ /health"
curl -s "$BASE/health" | jq .

echo ""
echo "→ /v1/stream 不带 token（应 401）"
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST "$BASE/v1/stream"

echo ""
echo "→ /v1/stream 带 token（应流式返回）"
curl -sN -X POST "$BASE/v1/stream" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"用一句话写一个开场，主角是一个雨夜里的咖啡师。"}],"model":"sonnet"}'
echo ""
echo "→ 完成。请去 https://claude.ai/settings/usage 看 Pro 用量是否上涨。"
```

`chmod +x tools/sidecar/test-e2e.sh` 后 `./tools/sidecar/test-e2e.sh` 即可。

---

## 附录 D — 给作者本人的 60 秒 Quick Start

> 这一节是给**人**看的，不是给 Cursor 看的。Cursor 执行完后，告诉作者照下面 5 步走。

1. **一次性配置（仅首次）**
  ```bash
   # 确认无 API key 干扰
   env | grep -i ANTHROPIC_API_KEY  # 应该没有输出

   # 登录 Claude Code（已登录可跳过）
   claude
   # 在 claude 里 /login，浏览器走 OAuth，登录 hesongqiang3@gmail.com
   /exit

   # 安装 sidecar 依赖
   cd /Users/arome/Desktop/留白写作/tools/sidecar
   npm install
  ```
2. **每次开写之前**
  ```bash
   cd /Users/arome/Desktop/留白写作
   npm run sidecar
   # 看到 "===== 留白写作 · 本地 Sidecar =====" 表示就绪
   # 第一次启动复制控制台里的 Token
  ```
3. **浏览器配置（仅首次）**
  - 打开线上 App，用 owner 邮箱登录
  - 设置 → AI → Owner 模式
  - 粘贴 Token、打开开关、点"测试连接"看到绿色"已连通"
4. **开写**
  - 右下角看到绿色徽章"● Claude 订阅直连"= 在烧订阅
  - 红色"● Sidecar 离线，已 fallback" = 在烧 API（按 Ctrl+C 关掉 sidecar 后是这个状态）
  - 要切回 API 计费临时禁用 owner 模式，去设置里关 owner 开关
5. **生产域名首次接入**
  - 编辑 `~/.liubai-sidecar/config.json`，在 `allowedOrigins` 数组里加你的生产域名（含 https://）
  - 重启 sidecar（Ctrl+C 后 `npm run sidecar`）

---

## 附录 E — Cursor 执行优先级

如果中间被打断/限速，按以下顺序保证至少前 4 项落地（这样核心链路就跑通了）：

1. **必做**：步骤 1（sidecar 项目）+ 步骤 2（types）+ 步骤 3（providers）+ 步骤 4（owner-mode util）
2. **必做**：附录 A.1/A.2/A.5（精确路径修正）
3. **强烈建议**：步骤 6（client.ts override hook）—— 不做这步整个链路无法触发
4. **强烈建议**：步骤 5 的 OwnerModeSection（设置 UI）—— 不做的话作者得手动 `localStorage.setItem`
5. **建议**：步骤 7（badge）+ 附录 B（预算/last-used 边界）
6. **可选**：附录 C（自测脚本）、附录 D（用户 readme 内容）

每完成一项 commit 一次，commit message 用：

- `feat(sidecar): scaffold local Claude Code sidecar service`
- `feat(ai): add claude-code-local provider type & dispatch`
- `feat(owner): add owner-mode util & sidecar probe`
- `feat(ai): override provider in client when owner sidecar live`
- `feat(ui): add owner mode settings section & status badge`
- `chore: vercel/git ignore tools/sidecar`

