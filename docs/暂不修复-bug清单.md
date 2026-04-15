# 暂时未能修复 / 待统一处理的清单

> 由代码审查与 lint 修复会话整理。处理完某项后请勾选或删除对应条目。

---

## 1. ESLint 警告（0 error，当前仍有 8 个 warning）

修复可能影响 hook 触发时机或重渲染，需结合行为确认后再改。


| 文件                           | 规则                            | 说明                                                                              |
| ---------------------------- | ----------------------------- | ------------------------------------------------------------------------------- |
| `src/components/AiPanel.tsx` | `react-hooks/exhaustive-deps` | `useMemo`：`busy` 被标为多余依赖；`props.chapter.summary/title` 被标为多余；`PROVIDER_UI` 缺失依赖 |
| `src/components/AiPanel.tsx` | `react-hooks/exhaustive-deps` | 两处 `useEffect`：`props` 整体缺失依赖（eslint 建议解构具体字段）                                  |
| `src/pages/EditorPage.tsx`   | `react-hooks/exhaustive-deps` | `useEffect`：导出/快照/全书搜索等 handler 未列入依赖数组                                         |
| `src/pages/SettingsPage.tsx` | `react-hooks/exhaustive-deps` | 两处 `useMemo`：`sidepanelUsageTick` 被标为多余依赖                                       |


可选：若 CI 要求零警告，在 `eslint` 配置或脚本中确认是否需 `--max-warnings 0`。

---

## 2. 模块级审查（未做完整交互/代码审计）

以下按此前审查清单列出，**尚未逐项核对**，可能存在未发现的问题。

- **模块 1 — AI 调用链**：各入口 loading、错误处理、流式取消、token 超限提示、超时/限流/网络区分提示、装配器注入是否为空、失败后 UI 解锁。
- **模块 2 — 数据读写**：IndexedDB/Dexie/Supabase 写入失败、空态、同步冲突、切换作品/章节状态清理、长列表分页。
- **模块 3 — 编辑器与侧栏**：CodeMirror 与侧栏焦点、快捷键冲突、侧栏开关布局抖动、diff 合并后内容、沉浸模式状态一致、章节切换无残留。
- **模块 4 — 路由与页面状态**：各路由 loading/错误态、深层直链、登录过期与回跳、卸载清理定时器/订阅/监听、前进后退。
- **模块 5 — 表单与用户输入**：必填校验、提交中防重复、弹窗关闭重置、长文本长度与超限提示、特殊字符显示。
- **模块 6 — 关联逻辑**：本书锦囊更新后侧栏下次调用是否最新、新建章节列表同步、删除作品级联清理、推演转正文稿状态、token 累计、搜索/索引更新时机。

---

## 3. 端到端手测（未执行）

建议在本地用真实/测试账号走通并记录结果。

1. 新建作品 → 本书锦囊 → 编辑器 → 侧栏 AI 生成 → 接受 → 保存 → 退出再进，内容是否保留。
2. 推演页 → 三条分支 → 选定 → 转入正稿 → 编辑器正文是否正确。
3. 藏经上传 → RAG → 侧栏 AI 是否召回藏经内容。
4. 错误 API Key → 是否有明确错误提示且 UI 不再卡在 loading。

---

## 4. 构建期提示（非 ESLint）

- Vite：`INEFFECTIVE_DYNAMIC_IMPORT`（`mammoth` 同时被动态与静态引用）。
- Vite：主 chunk 体积超过 500 kB 的提示（可按需做 code splitting）。

---

## 更新记录


| 日期         | 说明                                         |
| ---------- | ------------------------------------------ |
| 2026-04-07 | 初版：lint warnings、模块 2–6 未审项、四条手测路径、Vite 提示 |
