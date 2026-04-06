# 存储迁移与远端 DDL（§11 步 51 · Living）

## Dexie（浏览器 IndexedDB）

- **版本真源**：`src/db/types.ts` 中 `SCHEMA_VERSION` 与 `src/db/database.ts` 中 `this.version(n)` 的链式迁移。
- **启动失败**：`src/main.tsx` 在 `getWritingStore().init()` 抛错时**会**渲染全屏错误页，并展示 **错误信息原文**；文案提示「导出备份 / 清空站点数据后重试」。即：**已具备**用户可见的「升级/打开失败」反馈（与清单「与现有 `database.ts` 行为一致时注明已具备」一致）。
- **回退指引**：若迁移脚本中途失败，通常需依赖**备份 zip** 恢复或清空站点数据后重新导入；生产数据以用户本地备份为准。

## Supabase / 远端

- **DDL 真源**：`supabase/schema.sql` + `backend/migrate.js` 应与 `docs/开发交接-2026-04-03.md`（或替代文档）**对照维护**；生产环境执行顺序与密钥以 `docs/生产环境部署.md` 为准。
- **门禁**：远端执行 DDL 建议在「本地规划阶段验收 OK」之后（见 `design/master-checklist.md` §D.3）。

## 用户文档：备份 → 升级 → 合并导入

- 主路径见 **`docs/技术说明.md`** 中「导出 / 备份包」「`importAllDataMerge`」与 README；大版本升级时同步检查 README 与备份恢复段落是否仍可执行。
