# VPS 上 Node API（PM2）排障与修复说明书

面向「留白写作」后端：`backend/server.js`（Fastify）、OpenResty/Nginx 反代、`api.域名` 访问。  
读完本文后，遇到 **502、注册发码失败、本机 curl 连不上 8788、PM2 显示 online 但服务不可用** 等问题，可按章节自检。

---

## 1. 正常时应该是什么样


| 检查项    | 正常表现                                                        |
| ------ | ----------------------------------------------------------- |
| VPS 本机 | `curl -s http://127.0.0.1:8788/api/health` 返回 `{"ok":true}` |
| 公网域名   | `https://api.你的域名.com/api/health` 返回 `{"ok":true}`          |
| 网站注册   | 点「发送验证码」能收到邮件（或日志无 `[mail:dev]`）                            |
| PM2    | `pm2 list` 中 `liubaiai-api` 为 **online**，**↺（重启次数）** 不会持续狂涨 |


---

## 2. 症状速查：先判断「病在哪一层」

### 2.1 浏览器里注册 / 接口报错

- **控制台写 502**，或 **NetworkError**，或 **CORS / Access-Control-Allow-Origin 缺失**  
  - **优先怀疑**：反代后面的 **Node 没起来或没监听端口**。  
  - **注意**：502 时网关返回的错误页常常 **不带 CORS 头**，浏览器会同时报 CORS，**根因仍是 502，不是要先改 CORS**。

### 2.2 只有「本机」连不上

- 在 **VPS 的 SSH 里** 执行 `curl http://127.0.0.1:8788/api/health` **失败**  
→ 问题在 **本机 Node / PM2 / 端口**，与 Cloudflare、浏览器缓存无关。

### 2.3 在自己电脑上打开 `http://127.0.0.1:8788`

- **127.0.0.1 永远是你当前这台电脑**，不是 VPS。  
- 要测 VPS 上的服务：必须 **SSH 登录 VPS 再 curl**，或 **SSH 端口转发** 后再用浏览器。

### 2.4 PM2 显示 online，但 curl 拒绝连接

- **可能 A**：进程刚启动，**等 2～3 秒** 再 curl。  
- **可能 B**：进程 **没有执行 `listen()`**（见第 4、5 节），或监听在 **8787** 而你在测 **8788**。

### 2.5 PM2 里 ↺ 很大、out 日志全是 `◇ injecting env`

- 典型含义：**进程反复秒退**，每次启动只打出 dotenv 的一行就结束，**没有** `API listening`。  
- 见 **第 5 节「PM2 重启循环」**。

### 2.6 日志里出现 `[mail:dev]`

- 表示 **没有走真实 SMTP**，只在控制台打印验证码。  
- 常见原因：`**.env` 没被进程读到**（`MAIL_MODE=dev` 或缺少 `SMTP_HOST`）。  
- 见 **第 6 节「环境与邮件」**。

---

## 3. 部署文件清单（避免漏传、误点「跳过」）

后端目录以你服务器为准，示例：`**/root/liubai-backend/backend/`**。


| 文件            | 作用                                                                   |
| ------------- | -------------------------------------------------------------------- |
| `server.js`   | 主程序；需包含 **从 `backend` 目录加载 `.env`**、**PM2 下也会 listen** 的逻辑（见仓库当前版本）。 |
| `load-env.js` | 固定从 **本文件所在目录** 读取 `.env`，避免 PM2 工作目录不对时读不到环境变量。                     |
| `db.js`       | 开头应 `import "./load-env.js"`，再创建数据库连接池。                              |
| `.env`        | 与 `server.js` **同目录**；含 `API_PORT`、`SMTP_`*、`DB_*`、`SUPABASE_*` 等。   |


**面板上传同名文件时，必须选「覆盖」**；若选 **「跳过」**，服务器仍是旧代码，现象会和「修了但没生效」一样。

---

## 4. 推荐 PM2 启动方式（减少坑）

在 VPS 上（路径按实际修改）：

```bash
pm2 delete liubaiai-api
pm2 start /root/liubai-backend/backend/server.js --name liubaiai-api --cwd /root/liubai-backend/backend
pm2 save
```

- `**--cwd**`：保证相对路径、`dotenv` 等与「在 backend 目录里跑」一致。  
- **脚本用绝对路径**：避免 PM2 记录的入口路径含糊。

修改 `.env` 或 `server.js` 后：

```bash
pm2 restart liubaiai-api --update-env
```

---

## 5. PM2「重启循环」与「不监听端口」

### 5.1 原因说明（与本项目相关）

1. `**isDirectRun` 为 false**
  仅当判定「当前是以 `server.js` 为入口直接运行」时，代码才会 `app.listen()`。  
   在部分环境下，`process.argv[1]` 与 `import.meta.url` 解析结果不一致，会导致 **不 listen**。
2. **不 listen 时进程仍可能马上退出**
  使用了 `pg` 连接池但若尚未建立连接，**事件循环可能为空**，Node **正常退出**，PM2 再拉起 → **↺ 狂涨**，日志里反复出现 **一行 `injecting env`**，**没有** `Server listening`。
3. **仓库中的修复思路**
  - 用 `**path.resolve` 比较入口路径** 判断是否直接运行。  
  - **补充**：检测到 **PM2 注入的 `pm_id`** 时，**强制视为需要 listen**（避免上述退出循环）。

若你使用 **已包含上述逻辑的 `server.js`**，PM2 下应能稳定监听。

### 5.2 自检命令

```bash
# 是否有人在听 8788（或 8787）
ss -tlnp | grep -E '8787|8788'

# 看最近日志是否出现 listening
tail -30 /root/.pm2/logs/liubaiai-api-out.log
```

### 5.3 前台运行（锁定错误）

```bash
pm2 stop liubaiai-api
cd /root/liubai-backend/backend
node server.js
```

- **若出现** `API listening on http://127.0.0.1:8788`：说明代码与 `.env` 基本正常，问题多在 **PM2 启动方式或旧文件未覆盖**。  
- **若红字报错**：根据最后一屏 **Error** 处理（缺依赖则在该目录 `npm install`，缺环境变量则检查 `.env`）。

---

## 6. 环境与邮件（`[mail:dev]`）

### 6.1 期望配置（摘录）

`.env` 与 `server.js` 同目录，且包含例如：

- `MAIL_MODE=smtp`（不要长期 `dev`）  
- `SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS`、`MAIL_FROM`  
- `API_PORT=8788`（若与 OpenResty 配置一致）

### 6.2 为何必须用 `load-env.js`

默认 `import "dotenv/config"` 往往从 `**process.cwd()`** 找 `.env`。  
PM2 的 **cwd** 若不是 `backend/`，就会 **读不到**，导致没有 `SMTP_HOST` → 行为等同开发模式 → `**[mail:dev]`**。

### 6.3 验证

发一次验证码后：

```bash
pm2 logs liubaiai-api --lines 30 --nostream
```

- **不应**再出现 `[mail:dev]`（真实发信时可能仍有 SMTP 报错，那是另一回事）。

---

## 7. 端口：8787 与 8788

代码里若未读到 `API_PORT`，可能默认 **8787**。  
若 OpenResty 仍反代到 **8788**，会 **502**。

**应对**：`.env` 写明 `API_PORT=8788`，重启 PM2；或把反代改成实际监听端口。

自检：

```bash
curl -s http://127.0.0.1:8788/api/health
curl -s http://127.0.0.1:8787/api/health
```

---

## 8. OpenResty / Nginx 与 502

本机 `curl 127.0.0.1:8788` **正常**，但 `https://api.域名` **502**：

- 检查站点配置里 `**proxy_pass`** 是否指向 `**http://127.0.0.1:8788**`（或你实际端口）。  
- 检查 `**api` 子域名** 是否绑的是这份配置，而不是默认站点。

---

## 9. 按顺序执行的「急救流程」（建议收藏）

在 **VPS SSH** 中执行：

```bash
# 1) 本机 API 是否通
curl -sv http://127.0.0.1:8788/api/health 2>&1 | tail -12

# 2) PM2 状态
pm2 list

# 3) 谁在监听端口
ss -tlnp | grep -E '8787|8788|node'

# 4) 最近输出日志
tail -40 /root/.pm2/logs/liubaiai-api-out.log
```

**若 health 不通且 PM2 online 但无监听：**

```bash
pm2 delete liubaiai-api
pm2 start /root/liubai-backend/backend/server.js --name liubaiai-api --cwd /root/liubai-backend/backend
pm2 save
sleep 3
curl -s http://127.0.0.1:8788/api/health
```

**若仍失败：** 做 **第 5.3 节前台 `node server.js`**，把完整报错复制下来再查。

---

## 10. 与 Supabase / 头像存储的关系

- `**supabase/avatars-storage.sql**` 只影响 **Storage 头像桶**，**不会**改注册接口或业务表。  
- 注册发码走 **自建 API** + **SMTP**；与是否执行头像 SQL **无直接关系**。  
- 若注册失败且控制台是 **502**，仍按本文 **API / PM2** 排查。

---

## 11. 版本与维护建议

- 重大变更后：**合并到实际部署分支**（如 `main`），让 **Vercel / 前端** 与 **VPS 后端** 都更新到对应提交。  
- 用面板上传时：**同名文件务必覆盖**。  
- 备一份 `**.env` 备份**（勿提交到 Git），改坏可回滚。

---

## 12. 相关仓库路径（便于对照代码）


| 说明             | 路径                             |
| -------------- | ------------------------------ |
| 主服务            | `backend/server.js`            |
| 环境加载           | `backend/load-env.js`          |
| 数据库池           | `backend/db.js`                |
| 邮件模式           | `backend/mail.js`              |
| 头像 Storage SQL | `supabase/avatars-storage.sql` |


---

*文档随部署实践更新；若你升级 Node / PM2 / 更换目录结构，请把本文中的路径与进程名改成自己的。*