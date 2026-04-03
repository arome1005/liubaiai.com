# 开发交接日志（Supabase 写作上云 + Hybrid 存储）

> **用途**：明天新开 Cursor 窗口时，把本文件丢给 AI 作为上下文。  
> **记录范围**：以 **2026-04-03 前后** 完成的「前端写作数据 → Supabase」「参考库仍 IndexedDB」「合并导入拆云/本地」为主；认证与后端 OTP 若在 `main` 上已存在，此处只列入口，不重复实现细节。

---

## 1. 总览：哪些算「已完成」

### 1.1 已落地（代码在仓库里，且 `npm run build` 已通过）

| 模块 | 说明 |
|------|------|
| **Supabase DDL** | `supabase/schema.sql`：`work` / `volume` / `chapter` / `chapter_snapshot` / `work_style_card` / 全部 `bible_*` / `chapter_bible` / `email_otp_challenge` / `test_content`；**不含** `reference_*`（藏经仅浏览器）。含 RLS；`email_otp_challenge` 无 policy，依赖 service_role。 |
| **合并导入共用 remap** | `src/storage/backup-merge-remap.ts`：`remapImportMergePayload()`，IndexedDB 全量合并与 Hybrid「云写作 + 本地参考库」共用同一套 id 映射。 |
| **导入归一化** | `src/storage/import-normalize.ts`：`normalizeImportRows` / `normalizeWorkRow`（从 `writing-store-indexeddb` 抽出）。 |
| **行映射** | `src/storage/supabase-writing-rows.ts`：snake_case ↔ 业务类型；`mergeWritingRowsToInserts(uid, mergeResult)` 供合并导入批量插入。 |
| **纯云存储实现** | `src/storage/writing-store-supabase.ts`：实现 `WritingStore` 中除参考库外的能力；参考库相关方法会 **抛错**（设计上只应通过 Hybrid 用远程）。 |
| **Hybrid** | `src/storage/writing-store-hybrid.ts`：写作/圣经/风格卡 → Supabase；参考库 → IndexedDB；`deleteWork`/`deleteChapter` 后清本机 `referenceExcerpts` 的 `linkedWorkId`/`linkedChapterId`；`exportAllData` / `importAllData` / `importAllDataMerge` 按设计拆分。 |
| **存储入口** | `src/storage/instance.ts`：同时存在 `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` 时用 `WritingStoreHybrid`，否则 **纯** `WritingStoreIndexedDB`。 |
| **IndexedDB 增补** | `src/storage/writing-store-indexeddb.ts`：`importReferenceOnlyReplace`（全量导入时只替换参考库表）、`applyRemappedMergeReferenceOnly`（合并导入只追加参考库）；`importAllDataMerge` 改为 `remap` + `bulkAddFullMergeRemap`。 |

### 1.2 很可能已在更早提交里完成（本机请 `git log` 核对）

以下在 **当前 `git status` 里未显示为本次改动**，但产品依赖它们；若缺失需补：

- 前端：`@supabase/supabase-js`、`src/lib/supabase.ts`、`src/api/auth.ts`（含 `authRegisterComplete` → 后端建号后再 `signInWithPassword`）。
- 后端：`backend/server.js` 注册 OTP、`supabase-admin` + **Service Role** 建用户；受保护 API 的 `Authorization: Bearer`。
- `vite.config.ts` 里 `/api` 代理、`.env.example` 中的 `VITE_SUPABASE_*` 说明。

---

## 2. 未完成 / 待你或下一位做的事

以下为 **建议清单**，不是代码里 TODO 注释的精确计数；可按优先级做 **约 5～8 步** 闭环验证与收尾。

| # | 项 | 要做什么 |
|---|----|----------|
| 1 | **在 Supabase 执行 DDL** | 在 SQL Editor **首次**执行 `supabase/schema.sql`。若曾执行过一半，注意 `CREATE POLICY` 重名需手动 `DROP POLICY` 或只对新表补语句。 |
| 2 | **环境变量** | 前端：`.env` / `.env.local` 配 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`（勿提交真实 Key）。后端：Service Role、项目 URL 等与 OTP/建号一致。 |
| 3 | **端到端：注册 → 登录 → 写作** | 邮箱验证码 → `register/complete` → 前端 `signInWithPassword` → 打开作品列表/编辑，确认请求带 session，RLS 下能读写 `work` 等表。 |
| 4 | **忘记密码 / 重置页** | Supabase 控制台：SMTP、Redirect URLs、`/reset-password` 与 `authForgotPassword` 的 `redirectTo` 一致。 |
| 5 | **备份导入压测** | 大 ZIP：`importAllData` / `importAllDataMerge` 在 Hybrid 下是否超时（Supabase 单次 insert 行数限制已用分块，极大备份仍可能需 RPC/边车）。 |
| 6 | **旧数据迁移（产品级，未做）** | 仅 IndexedDB 里已有作品、未配云或新用户：**没有**一键「把本地作品推到云端」向导；需要可另做导出再导入或专用迁移脚本。 |
| 7 | **双轨 DDL** | 若仍维护 `backend/migrate.js`（VPS Postgres），与 `supabase/schema.sql` 长期两套易分叉；需决定：仅 Supabase，或文档标明「仅本地/legacy」。 |
| 8 | **纯 Supabase 模式下的坑** | 不要单独 `new WritingStoreSupabase()` 给 UI 用参考库功能；必须用 Hybrid 或继续纯 IndexedDB。 |

**结论**：核心开发闭环在代码侧已接上；**未完成**主要是 **你方环境配置 + 真机联调 + 可选迁移与运维决策**。

**仓库内已补的文档/校验（减轻 #4、#7 的认知负担）**

- **#7 双轨 DDL**：`backend/migrate.js` 与 `supabase/schema.sql` 顶部互相说明用途（Supabase 托管 vs 自建 legacy）。
- **#4 忘记密码**：根目录 `.env.example` 与 `backend/.env.example` 写明 Supabase Redirect URLs 须包含 `/reset-password`；`ResetPasswordPage` 同时要求 `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`（与 `authMe` 等一致）。

---

## 3. 今天（本次会话）具体改了什么

### 3.1 Git 视角（截至写档时的 `git status`）

**已修改（tracked）**

- `src/storage/instance.ts` — 有 Supabase 环境变量时默认 `WritingStoreHybrid`。
- `src/storage/writing-store-indexeddb.ts` — 抽出 normalize/merge；新增参考库专用导入方法；合并导入走共用 `remap`。

**新增（untracked，需 `git add` 才会进版本库）**

- `src/storage/backup-merge-remap.ts`
- `src/storage/import-normalize.ts`
- `src/storage/supabase-writing-rows.ts`
- `src/storage/writing-store-hybrid.ts`
- `src/storage/writing-store-supabase.ts`
- `supabase/schema.sql`（整目录未跟踪）

### 3.2 行为变化（对用户/数据）

- 配齐 `VITE_SUPABASE_*` 且已登录：**作品/章节/圣经/风格卡** 走 Postgres；**参考库（藏经）** 仍在 IndexedDB。
- 未配或登出：行为与以前 **纯 IndexedDB** 一致（`instance` 仍用 `WritingStoreIndexedDB`）。
- 全量备份恢复：云端写作由 `WritingStoreSupabase.importAllData` 替换当前用户云数据；本地参考库由 `importReferenceOnlyReplace` 替换。
- 合并导入：同一 `remap` 结果，写作批量插入 Supabase，参考库批量插入 IndexedDB。

### 3.3 与旧文档的关系

- `docs/dev-log-2026-04-02.md` 里写的「`WritingStoreCloud` 调 `/api/works`」路线已被 **Supabase 客户端 + RLS + Hybrid** 替代；仍以该旧日志查 UI/路由/后端端口问题可以，但 **数据层以本文件为准**。

---

## 4. 如何恢复 / 回滚

### 4.1 放弃本次「存储层」改动（未 commit 时）

在项目根目录：

```bash
# 丢弃对已跟踪文件的修改
git restore src/storage/instance.ts src/storage/writing-store-indexeddb.ts

# 删除本次新增未跟踪文件（慎用：确认不需要再删）
rm -f src/storage/backup-merge-remap.ts \
      src/storage/import-normalize.ts \
      src/storage/supabase-writing-rows.ts \
      src/storage/writing-store-hybrid.ts \
      src/storage/writing-store-supabase.ts
rm -rf supabase/
```

若已 `git add` 但未 commit：`git restore --staged <paths>` 再按上处理。

### 4.2 已 commit 后想撤销

```bash
git revert <commit_sha>   # 或 git reset（按团队规范）
```

### 4.3 「暂时不用云，只想要本地」

不必改代码：去掉或清空前端 `.env` 里 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`（或只留空），重启 `npm run dev`，`getWritingStore()` 会回到 **纯 IndexedDB**。

### 4.4 Supabase 里误删数据

依赖你项目是否开 PITR/备份；应用层 `importAllData` 会 `delete` 当前用户 `work` 行（级联删子表），**全量恢复前务必备份**。

---

## 5. 给下一位 AI 的检索入口

- 存储接口：`src/storage/writing-store.ts`
- 解析与路由：`src/storage/instance.ts`
- 业务访问：`src/db/repo.ts`（应继续只通过 `getWritingStore()`）
- 合并导入数据流：`src/storage/backup.ts` → `repo.importAllData` / `importAllDataMerge`
- Supabase 客户端：`src/lib/supabase.ts`
- 注册登录 API：`src/api/auth.ts`

---

## 6. 安全提醒（务必保留在交接里）

- **不要**把 Anon Key / Service Role Key / 用户密码写进仓库或公开聊天。
- `email_otp_challenge` 仅后端用 Service Role；前端只用 anon + 用户 JWT。
- 若曾把真实 Key 贴进对话，建议在 Supabase 控制台 **轮换密钥**。

---

## 7. 一句话摘要

**已完成**：写作相关持久化在配好环境时可上 Supabase（RLS），参考库仍在 IndexedDB，备份导入/合并导入已按此拆分；构建通过。  
**未完成**：你在 Supabase 与 `.env` 的落地、全流程联调、大备份与迁移产品化、以及是否与 `backend/migrate.js` 双轨统一。  
**恢复**：`git restore` + 删除未跟踪文件，或去掉 `VITE_SUPABASE_*` 即回退纯本地存储行为。
