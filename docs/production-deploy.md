# 生产环境部署（登录 / 注册 / 云端写作）

本地 `npm run dev` 时，Vite 会把 `/api` 代理到本机 `8788`，并把 `backend/.env` 里的 `VITE_*` 打进前端包。**线上静态托管没有这两件事**，若未配置，会出现与你截图一致的现象。

---

## 现象与原因对照

| 现象 | 原因 |
|------|------|
| 登录提示 **「未配置 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY」** | 构建生产包时（如 Vercel `npm run build`）**没有**注入这两个变量。Vite 只在**构建时**读取 `VITE_*`，运行时改服务器环境变量无效。 |
| 控制台 **POST …/api/auth/register/request-code → 405** | 浏览器请求的是 **网站同源** 的 `/api/...`（如 `https://www.liubaiai.com/api/...`），但 **CDN/静态服务器上没有 Node 接口**，POST 不被允许 → **405 Method Not Allowed**。本地正常是因为 `vite.config.ts` 里 dev/preview **proxy** 把 `/api` 转到了后端。 |
| 邮件发不出 | 注册验证码依赖 **Node 后端**（`npm run api:dev` 同套逻辑）连数据库并发信；若 `/api` 没到后端，或后端未部署、未配置 `SMTP`/`MAIL_*`，都会失败。 |

---

## 必做：在托管平台配置「构建时」环境变量

在 **Vercel**（或你实际用的 CI）：Project → **Settings → Environment Variables**，对 **Production**（及 Preview 若需要）添加：

| 变量名 | 说明 |
|--------|------|
| `VITE_SUPABASE_URL` | Supabase Project URL，与本地一致 |
| `VITE_SUPABASE_ANON_KEY` | Supabase **anon public** key（勿填 Service Role） |

保存后必须 **Redeploy**（重新触发一次 build），否则线上仍是旧包。

> `vite.config.ts` 使用 `envDir: 'backend'`。若 CI **只**在面板里配变量、仓库里没有 `backend/.env`，只要平台会把变量注入到 build 进程，Vite 仍会读到（变量名以 `VITE_` 开头即可）。

---

## 必做：让浏览器的 `/api` 请求到达 Node 后端

二选一（或组合）。

### 方案 A：前端指向独立 API 域名（改构建变量）

1. 把 Node 后端部署到公网，例如 `https://api.liubaiai.com`（监听路径仍为 `/api/...`）。
2. 在构建环境增加：

   `VITE_API_BASE=https://api.liubaiai.com`

   （**无末尾斜杠**；与 `src/api/base.ts` 一致。）

3. 重新 build & deploy 前端。  
4. 后端需允许跨域：本项目 `backend/server.js` 已注册 CORS（开发为宽松配置），若生产要收紧可再改 `origin`。

### 方案 B：同源反代（Nginx / Caddy / 云负载均衡）

网站域名与静态资源同一主机，由网关把 `/api` 转发到本机 `8788`（或容器内后端），例如 Nginx：

```nginx
location /api/ {
  proxy_pass http://127.0.0.1:8788;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

此方案下 **不要** 设置 `VITE_API_BASE`（留空则前端继续请求**同源** `/api`）。

### 方案 C：Vercel Rewrites（API 在外部固定地址）

若前端在 Vercel、API 在固定 URL，可在 `vercel.json` 增加 `rewrites`，把 `/api/:path*` 转到你的后端（**不要把含密钥的 URL 写进仓库**，可用单独私有配置或文档里手写步骤）。具体语法见 [Vercel Rewrites](https://vercel.com/docs/projects/project-configuration#rewrites)。

---

## 后端（Node）单独部署时要带的配置

与本地 `backend/.env` 同类（在服务器或密钥管理中配置，**勿提交 Git**）：

- `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`
- **Pooler** 数据库：`DB_HOST`、`DB_PORT`、`DB_USER`（`postgres.<project_ref>`）、`DB_PASSWORD`、`DB_NAME`、`DB_SSL=true`
- `OTP_HMAC_SECRET`（生产务必为强随机串）
- 邮件：`MAIL_MODE`、`SMTP_*` 等（与 `backend/.env.example` 一致）

---

## 自检顺序

1. 打开线上站点，开发者工具 → Network：登录请求是否指向 Supabase（无「未配置」提示）。  
2. 点击「发送验证码」：`request-code` 是否 **200** 且请求 URL 为你的 **API 基址**（同源 `/api` 或 `VITE_API_BASE`）。  
3. 后端日志是否收到 `POST /api/auth/register/request-code`。

完成以上三项后，注册与登录应与本地联调行为一致（邮件仍取决于 SMTP 配置）。
