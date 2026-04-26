# 留白写作 · 本地 Sidecar

只供作者本人（owner）使用：把本机的 Claude Code Pro 订阅，包成本地 SSE HTTP 服务，
让线上部署的留白写作在 owner 登录时绕过 API 计费、走订阅额度。

## 启动

```bash
# 一次性
npm install

# 日常
npm run dev
```

启动后控制台会打印 Token，复制下来。

## 第一次接入

1. 浏览器打开线上 App，用 owner 邮箱登录
2. 进入「设置 → AI → Owner 模式」
3. 粘贴上面的 Token，打开开关，点「测试连接」看到绿色「已连通」即生效

## 关闭

`Ctrl+C` 即可。前端会自动 fallback 到 owner 自己配置的常规 API。

## 配置文件

`~/.liubai-sidecar/config.json`：Token、端口、允许的 Origin。
**首次部署到生产时，请把生产域名加进 `allowedOrigins`，然后重启 sidecar。**

## 安全

- 只监听 `127.0.0.1:7788`，同 Wi-Fi 不可达
- Token 校验是 Bearer Auth；不要把 token 提交到 git 或聊天里
- 绝对不要把这个文件夹打进 Vercel 部署（仓库根 `.vercelignore` 已排除）

## 关键约束

- **不要设置 `ANTHROPIC_API_KEY`**：会让 SDK 走 API 计费而不是订阅。
- 必须先在终端 `claude` 登录一次（`/login`），sidecar 复用 `~/.claude/` 凭据。
