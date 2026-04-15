# 换一台 VPS 从零部署 API（大白话版）

给 **不会写代码** 的人用：按顺序做，尽量说明「这一步在干什么」「成功长什么样」「失败了怎么办」。  
**不要把真实密码、密钥贴进聊天或截图发公开地方。**

---

## 这份说明解决什么问题？

你的 **网站前端**（例如放在 Vercel）和 **用户数据**（Supabase）可以一直在。  
**廉价 VPS** 主要跑一件事：**Node API**（注册验证码邮件、部分接口）。  

若旧 VPS **坏了、被封、想换商家**，你需要在新机器上 **重新装一遍「API 程序」**，并把 **域名指到新机器**。  
本文就是 **重装说明书**。

更细的 **故障排查**（502、PM2 狂重启等）见同目录：**`VPS与PM2排障指南.md`**。

---

## 开始之前，请先准备这些「材料」

不用现在填在本文里，但你要 **自己能找得到**（建议放在密码管理器或加密笔记里）：

| 材料 | 是什么 | 用来干什么 |
|------|--------|------------|
| 新 VPS 的 IP | 一串数字，或厂商给的登录信息 | SSH 连上机器 |
| root 密码或密钥 | 装机或重置时拿到的 | 登录 |
| GitHub 账号（若用 git 拉代码） | 可选 | 从 GitHub 下载项目 |
| **旧机器上 `backend/.env` 的备份** | 纯文本，里面全是密钥 | 复制到新机器 **同路径**（不要发给别人） |
| 域名 | 例如 `liubaiai.com` | DNS、证书、反代里会用到 |
| Supabase 控制台 | 网页能登录 | 核对 URL、密钥是否和 `.env` 一致（一般不用改，除非换了项目） |

**重要：** `.env` **永远不要** 提交到 Git、不要发到公开群。只在你自己电脑和 VPS 上各留一份备份。

---

## 名词用大白话解释（读一遍即可）

| 词 | 什么意思 |
|----|----------|
| **VPS** | 一台在网上的「小电脑」，你远程用它跑程序。 |
| **SSH** | 用一种安全方式 **登录到 VPS 的黑色命令行窗口**。 |
| **root** | 这台机器上的 **最高权限管理员账号**。 |
| **Node.js** | 跑你们 **后端 API** 所需要的运行环境（像装 Java 才能跑某些软件）。 |
| **npm** | Node 自带的 **装小零件** 的工具；项目里的依赖靠它装。 |
| **PM2** | **帮 Node 程序一直在后台跑** 的工具；机器重启后也可自动拉起（要配 `pm2 startup`）。 |
| **`.env`** | **配置文件**，里面是密码、数据库地址、邮件 SMTP 等；**绝不能公开**。 |
| **反代（Nginx / OpenResty）** | 用户访问 `https://api.你的域名` 时，由它 **转发到本机某个端口**（例如 8788）。 |
| **DNS / A 记录** | 告诉全世界：`api.你的域名` **指向哪台机器的 IP**。换 VPS 后要改这里。 |
| **健康检查** | 访问 `/api/health`，若返回 `{"ok":true}`，说明 **API 进程基本正常**。 |

---

## 第一步：有一台新 VPS，并知道怎么登录

1. 在商家（RackNerd、搬瓦工等）买好机器，系统选 **Debian / Ubuntu** 一类即可（和你旧机接近最好）。  
2. 在控制台找到 **公网 IP**。  
3. **安全组 / 防火墙** 先放行：**22**（SSH）、**80**、**443**（网页与证书）。具体界面因商家而异，找「Firewall / Security Group」。

**成功：** 你手里有 **IP + 能登录的密码（或密钥文件）**。  
**失败：** 连 IP 都找不到 → 在订单/实例详情里再找，或问客服。

---

## 第二步：用 SSH 登录到 VPS（在你自己的电脑上操作）

### Mac 或 Linux

1. 打开 **终端**。  
2. 输入（把 `你的IP` 换成真实数字）：

```bash
ssh root@你的IP
```

3. 第一次会问 `yes/no`，输入 `yes` 回车。  
4. 提示输入密码时：**输入密码（屏幕上不会显示，正常）**，回车。

### Windows

可用 **PowerShell** 同样输入 `ssh root@你的IP`，或安装 **PuTTY** 按教程填 IP、端口 22。

**成功：** 最后一行类似 `root@某名字:~#`，说明你 **已经在 VPS 里面了**。  
**失败：** `Connection timed out` → 检查安全组是否放行 22、实例是否开机。`Permission denied` → 密码错或要用密钥。

---

## 第三步：安装 Node.js（20 或更高，建议与旧机一致）

在 **已经 SSH 登录的窗口** 里，**整段复制**执行（Debian/Ubuntu 常见写法；若你用的 **1Panel / 宝塔** 有一键安装 Node，用面板装到 **20+** 也可以，跳过下面命令）：

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get update
apt-get install -y nodejs
```

装完检查：

```bash
node -v
```

**成功：** 显示 `v20.x.x` 或更高。  
**失败：** 报错复制保存；若你用 **面板** 已装好 Node，只要 `node -v` 有版本即可。

---

## 第四步：把项目代码放到 VPS 上

你需要机器上有一个文件夹，里面有 **`backend/server.js`**、**`package.json`** 等。  
两种方式 **二选一**。

### 方式 A：用 Git（推荐，以后更新方便）

1. 若没装 git：`apt-get install -y git`  
2. 假设仓库是公开的或你已配好密钥（私有库需要额外配置，可让会 Git 的人帮你一次）：

```bash
cd /root
git clone https://github.com/你的用户名/你的仓库名.git liubai-backend
cd liubai-backend
```

**成功：** `ls` 能看到 `backend`、`package.json` 等。  
**失败：** 提示权限 → 私有库要在 GitHub 建 **Personal Access Token** 或用 SSH 密钥，此处不展开，可改用方式 B。

### 方式 B：在你电脑上打包上传（不会 Git 时）

1. 在你电脑上把项目打成 **zip**（含 `backend` 文件夹和根目录 `package.json`）。  
2. 用 **SFTP、宝塔、1Panel 文件管理** 等上传到 VPS，例如 `/root/`，解压成 `/root/liubai-backend/`。  
3. SSH 里执行：

```bash
cd /root/liubai-backend
ls
```

**成功：** 能看到 `backend` 目录。  
**失败：** 路径不对 → 用 `find /root -name "server.js" 2>/dev/null | head` 找 `backend/server.js` 在哪。

---

## 第五步：安装项目依赖（只需懂「执行命令」）

在 **项目根目录**（有 `package.json` 的那一层），执行：

```bash
cd /root/liubai-backend
npm install
```

可能要等几分钟。

**成功：** 最后没有大片红色 `ERR!`，且出现 `node_modules` 文件夹（可 `ls` 看一下）。  
**失败：** 红色报错 → 把 **最后 20 行** 复制下来找人看；常见是网络问题，可多试一次。

---

## 第六步：写好 `backend/.env`（最关键）

1. 进入 backend：

```bash
cd /root/liubai-backend/backend
ls
```

2. 若 **没有** `.env`：  
   - 把你在 **旧 VPS 或自己电脑里备份好的 `.env`** 用面板/SFTP **上传到这一目录**，文件名必须是 **`.env`**。  
   - 或复制仓库里的 **`.env.example`** 另存为 `.env`，再 **对照旧备份** 把每一项填齐（不要照抄网上的示例值）。

3. 用面板编辑或 `nano .env`，**至少确认**有这些内容（名字要对，值用你自己的）：

   - `API_PORT=8788`（或与你反代一致）  
   - `API_HOST=127.0.0.1`  
   - `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`  
   - `DB_HOST`、`DB_PORT`、`DB_USER`、`DB_PASSWORD`、`DB_NAME`、`DB_SSL`  
   - `OTP_HMAC_SECRET`  
   - 发信：`MAIL_MODE=smtp` 以及 `SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS`、`MAIL_FROM`  

**成功：** 文件路径是 **`/root/liubai-backend/backend/.env`**（若你的项目根不叫 `liubai-backend`，改成你的路径，但 **`.env` 必须和 `server.js` 在同一层 `backend` 里**）。  
**失败：** 发验证码日志里出现 `[mail:dev]` → 多半是 **没读到 `.env` 或没配 SMTP**；见排障文档。

---

## 第七步：安装 PM2 并启动 API

```bash
npm install -g pm2
```

启动（路径按你实际项目改，**建议整段复制**）：

```bash
pm2 delete liubaiai-api
pm2 start /root/liubai-backend/backend/server.js --name liubaiai-api --cwd /root/liubai-backend/backend
pm2 save
```

开机自启（执行后它可能提示你再运行一条以 `sudo` 开头的命令，**按它显示的复制执行一次**）：

```bash
pm2 startup
```

**等 3 秒**，自检：

```bash
curl -s http://127.0.0.1:8788/api/health
```

**成功：** 屏幕显示 `{"ok":true}`；`pm2 list` 里 **status 是 online**，**↺ 不会一直涨**。  
**失败：**  
- `Connection refused` → 看 **`tail -40 /root/.pm2/logs/liubaiai-api-out.log`** 有没有 `API listening`；没有则对照 **`VPS与PM2排障指南.md`**。  
- 确认 **`server.js` 已是最新版**（含 PM2 检测、`load-env.js` 等），面板上传时要点 **覆盖**。

---

## 第八步：网站服务器（OpenResty / Nginx）把 API 域名指到本机 8788

这一步 **因面板而异**，大意是：

1. 给 **`api.你的域名`** 建一个站点（或改原有站点）。  
2. **反向代理** 目标填：`http://127.0.0.1:8788`（若你 `.env` 里端口不是 8788，这里要一致）。  
3. **SSL 证书**：用 Let's Encrypt 一键申请（面板里常有）。

**配置片段参考**（给懂配置的人看；你用面板可以不用手抄）：

```nginx
location / {
  proxy_pass http://127.0.0.1:8788;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

**成功：** 浏览器打开 `https://api.你的域名/api/health` 显示 `{"ok":true}`。  
**失败：** **502** → 多半是 **Node 没监听** 或 **反代端口写错**；先保证本机 `curl 127.0.0.1:8788` 通。

---

## 第九步：改 DNS，让域名指向新 VPS

1. 登录你买域名的地方（或 Cloudflare）。  
2. 找到 **`api` 子域名** 的 **A 记录**，把 IP **改成新 VPS 的公网 IP**。  
3. 等待生效（几分钟到几小时不等）。

**成功：** 全国不同网络下访问 `https://api.你的域名/api/health`  eventually 都是 `{"ok":true}`。  
**失败：** 一直指向旧 IP → 检查是否改错记录、是否开了 CDN 缓存（可短暂关代理橙云测试）。

---

## 第十步：前端（如 Vercel）是否要改？

- 若你一直用 **独立 API 域名**（例如 `VITE_API_BASE=https://api.xxx.com`），且 **子域名没变**，一般 **不用改**，只要 DNS 指到新机器。  
- 若 **换了 API 域名**，要在 Vercel **环境变量** 里改 `VITE_API_BASE`，并 **重新 Deploy**。  

详情见 **`生产环境部署.md`**。

---

## 第十一步：自己测一遍「注册发码」

1. 打开正式网站，用 **小号邮箱** 试注册。  
2. 收验证码（含垃圾箱）。  
3. 完成注册、登录。

**成功：** 全流程无 502、无 NetworkError。  
**失败：** 浏览器 F12 → Network 看失败请求的网址和状态码，再结合排障文档。

---

## 头像上传（若你用 Supabase Storage）

若站内 **换头像** 依赖 Storage，在新环境 **一般不用重做**，因为桶在 Supabase 云端。  
若你 **换了 Supabase 项目** 才需要在 **新项目** 里再执行一次 **`supabase/avatars-storage.sql`**。

---

## 「换机检查表」——打印或复制到备忘录逐项打勾

- [ ] 新 VPS 能 SSH 登录  
- [ ] `node -v` 为 20+  
- [ ] 项目已在机器上，`backend/server.js` 存在  
- [ ] 已在项目根执行 `npm install`  
- [ ] `backend/.env` 已放好且内容完整（从旧备份复制）  
- [ ] `pm2 start` 使用 **绝对路径 + --cwd**  
- [ ] `curl 127.0.0.1:8788/api/health` → `{"ok":true}`  
- [ ] `pm2 save`，并已执行 `pm2 startup` 提示里的命令  
- [ ] 反代 / SSL 已配置，`https://api.域名/api/health` 正常  
- [ ] DNS A 记录指向新 IP  
- [ ] （按需）Vercel 环境变量与 Redeploy  
- [ ] 注册验证码实测通过  
- [ ] **旧 `.env` 备份** 仍在安全位置  

---

## 常见情况：我卡住了，先看哪？

| 现象 | 最可能原因 | 你先做 |
|------|------------|--------|
| SSH 连不上 | 安全组、IP、密码 | 查厂商防火墙、重置密码 |
| `npm install` 失败 | 网络、权限 | 重试；不要用 `sudo npm` 除非你知道后果 |
| 本机 curl 不通 | PM2 没起来、端口错、旧代码 | 第五节、排障文档 |
| 域名 health 502 | 反代、DNS 未指向新机、Node 未监听 | 本机 curl → 反代配置 → DNS |
| 能 health 但不能注册 | SMTP、`.env`、前端 `VITE_API_BASE` | 排障文档 + `生产环境部署.md` |
| 上传文件后没变化 | 点了「跳过」未覆盖 | 重新上传并选 **覆盖** |

---

## 平时怎么减少「换机时哭」？

1. **定期**把 `backend/.env` **加密备份**到只有你有的地方（不要只存在 VPS 上）。  
2. **域名**放在靠谱 DNS，换机只改 **A 记录**。  
3. **代码**始终在 GitHub 有最新提交，换机可 `git pull`。  
4. 装一个 **免费 uptime 监控**，监控 `https://api.你的域名/api/health`，挂了会邮件提醒你。

---

## 相关文档（同一 `docs/` 目录）

| 文档 | 内容 |
|------|------|
| `VPS与PM2排障指南.md` | PM2、端口、502、`[mail:dev]`、重启循环等 **排障** |
| `生产环境部署.md` | 前端 Vercel、`VITE_API_BASE`、同源反代等 |
| `backend/.env.example` | 后端需要哪些环境变量 **名称**（无真实密钥） |

---

*若你完全不想碰命令行，也可以把本文交给会运维的人，由他在新机上执行；你负责保管 `.env` 备份与域名 DNS 即可。*
