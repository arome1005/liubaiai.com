# 写作编辑页「本章细纲/剧情构思」生成弹窗改造方案（交付 Claude 执行）

## 1. 目标与范围

### 1.1 背景问题

- 当前在写作编辑页右下角「本章细纲 / 剧情构思」点「生成」后，用户看不到明显过程与结果，体感接近“无响应”。
- 实际上生成结果进入了 `AiPanel` 内部草稿态，但未自动打开草稿弹窗，导致可见性差。

### 1.2 本次改造目标

- 为“细纲生成正文”建立可见闭环：`点击生成 -> 可见过程 -> 可见结果 -> 确认插入 -> 中部正文更新`。
- 生成完成后用户无需理解内部状态，直接点“插入正文”即可把结果推送到中间正文编辑区。
- 若左侧在“章纲”页签，插入时自动切到“章节正文”以保证反馈一致。

### 1.3 非目标（本期不做）

- 不重写 AI 调用链路（继续复用 `AiPanel` 现有 `run()` 与流式回调）。
- 不新增后端接口。
- 不调整模型配置体系、RAG 策略、注入策略。

---

## 2. 现状结构与可复用能力

### 2.1 关键文件

- `src/components/AiPanel.tsx`
  - 已有：
    - 细纲输入框 `chapterOutlinePaste`
    - 生成入口 `run()`
    - 流式输出落地 `onDelta -> setDraft`
    - 草稿弹窗 `draftDialogOpen`
    - 插入/追加/替换能力（通过 `insertAtCursor` / `appendToEnd` / `replaceSelection`）
- `src/pages/EditorPage.tsx`
  - 已有：
    - 正文写入桥接：`insertAtCursor`、`appendToEnd`、`replaceSelection`
    - 左侧 `sidebarTab` 的 `章纲` / `章节正文` 切换
    - `AiPanel` 挂载与 props 透传

### 2.2 结论

- 业务能力已齐全，核心缺口是“生成态可见性 + 插入动作路径清晰化 + 视图切换一致性”。
- 最小改动路径应优先“增强现有草稿弹窗”，而非新起一套并行弹窗。

---

## 3. 目标交互（UI/UX）

### 3.1 生成入口

- 用户在「本章细纲 / 剧情构思」填写内容（来源可为“从章纲拉取”或手动粘贴）。
- 点击「生成」后：
  - 立即打开“生成弹窗”（复用现有 AI 草稿弹窗）。
  - 顶部状态切换为 `准备中` -> `生成中` -> `已完成` / `失败`。
  - 流式文本实时展示在正文结果区。

### 3.2 弹窗结构建议

- 标题：`本章正文生成`
- 副信息（小字）：
  - 细纲来源：`章纲拉取` / `手动粘贴` / `混合`
  - 本次输入字数
  - 当前模型标签（沿用已有 provider 信息）
- 主体：
  - 结果文本区（可编辑）
  - 生成过程状态区（简版，不做复杂日志）
- 底部按钮（从左到右）：
  - `取消生成`（仅生成中可点）
  - `重试`（失败或完成后可点）
  - `插入正文`（主按钮，完成且有内容后可点）
  - `追加章尾`（次按钮）

### 3.3 插入行为

- 点击 `插入正文`：
  1. 若当前不在“章节正文”页签，先切换到“章节正文”；
  2. 将草稿插入中部正文编辑区（默认光标处）；
  3. 关闭弹窗；
  4. toast 成功提示（可选）。

---

## 4. 状态机设计（建议 Claude 严格按此实现）

### 4.1 枚举

- `idle`：未运行
- `preparing`：开始组装上下文到真正发起请求前
- `streaming`：流式输出中
- `done`：完成
- `error`：失败
- `aborted`：用户取消

### 4.2 转换

- `idle -> preparing`：点击生成
- `preparing -> streaming`：`generateWithProviderStream` 开始产生 delta
- `streaming -> done`：请求正常结束
- `preparing/streaming -> error`：异常且非 abort
- `preparing/streaming -> aborted`：AbortError
- `error/aborted/done -> preparing`：重试

### 4.3 按钮可用性

- `取消生成`：仅 `preparing/streaming`
- `重试`：`done/error/aborted` 且存在 lastReq
- `插入正文`：`done` 且 draft 非空
- `追加章尾`：`done` 且 draft 非空

---

## 5. 代码改造点（文件级）

## 5.1 `src/components/AiPanel.tsx`

### 5.1.1 新增状态

- `const [generateDialogOpen, setGenerateDialogOpen] = useState(false);`
  - 可直接替换/复用 `draftDialogOpen`，避免双弹窗并存。
- `const [genPhase, setGenPhase] = useState<...>("idle");`
- `const [outlineInputMeta, setOutlineInputMeta] = useState<{ source: "outline_pull" | "manual_paste" | "mixed" | "unknown"; chars: number }>(...)`

### 5.1.2 生成启动逻辑

- 在 `run()` 开头（校验 chapter 通过后）：
  - `setGenerateDialogOpen(true)`
  - `setGenPhase("preparing")`
  - 清空旧错误与旧草稿（保持现在逻辑）

### 5.1.3 流式阶段标记

- `onDelta` 第一次回调时把 `genPhase` 切到 `streaming`（可加 `hasReceivedDeltaRef`）。
- 请求成功后设为 `done`。
- catch 里：
  - abort -> `aborted`
  - 其他 -> `error`

### 5.1.4 弹窗文案与按钮调整

- 现有 `AI 草稿` 改造为“生成结果弹窗”，至少改：
  - 标题文字
  - 状态徽标（phase）
  - 主按钮文案：`插入正文`
- 保留当前草稿编辑能力（用户可以手调后再插）。

### 5.1.5 插入动作增强

- 对“插入到光标”按钮改名 `插入正文`。
- 插入前先调用父级透传的新回调 `ensureChapterViewBeforeInsert?.()`
- 再调用 `props.insertAtCursor(...)`。

### 5.1.6 兼容“草稿”按钮

- 可以保留侧栏上的“草稿”按钮，但其行为改为打开新生成弹窗（同一个 state）。

---

## 5.2 `src/pages/EditorPage.tsx`

### 5.2.1 新增回调并传给 AiPanel

- 新增：
  - `const ensureChapterViewBeforeInsert = useCallback(() => setSidebarTab("chapter"), []);`
- 在 `AiPanel` props 增加：
  - `ensureChapterViewBeforeInsert={ensureChapterViewBeforeInsert}`

### 5.2.2 AiPanel 类型定义同步

- 在 `AiPanel` props 类型里新增可选函数：
  - `ensureChapterViewBeforeInsert?: () => void;`

---

## 6. 细纲来源判定策略（轻量可用）

- 当用户点击“从章纲拉取”确认时，`EditorPage` 已写入 `chapter-outline-paste-storage` 并派发事件；
- 在 `AiPanel` 中维护一个“最后来源”标记：
  - 用户 textarea 输入变更 -> `manual_paste`
  - 收到 `CHAPTER_OUTLINE_PASTE_UPDATED_EVENT` 且内容变化 -> `outline_pull`
  - 若两者都发生过且当前内容非空 -> `mixed`
- 弹窗仅展示为提示信息，不影响生成逻辑。

---

## 7. 验收标准（必须逐条通过）

### 7.1 主路径

- 在编辑页输入/拉取细纲，点“生成”后，2 秒内看到弹窗与状态变化。
- 生成中能看到实时文本增长（流式）。
- 生成完成后“插入正文”可点击，点击后正文区立即可见插入结果。

### 7.2 视图一致性

- 左侧若在“章纲”页签，点“插入正文”后自动切到“章节正文”页签。
- 中部编辑区可立即看到插入文本。

### 7.3 异常与中断

- 手动取消后状态为 `已取消`（或等价文案），且可重试。
- 失败后有错误提示，且“重试”可再次触发流程。
- 切换章节不会把上一章草稿误插到当前章（沿用现有每章草稿隔离能力）。

### 7.4 回归

- 原有“重试”“替换选区”“追加章尾”等能力不回归。
- 不影响 `PullOutlineDialog` 拉取逻辑、不影响 `saveChapterOutlinePaste`。

---

## 8. 实施步骤（给 Claude）

1. 改 `AiPanel` props，增加 `ensureChapterViewBeforeInsert`。
2. 改 `EditorPage`，实现并透传该回调。
3. 在 `AiPanel` 增加 `genPhase` 状态与 phase 文案映射。
4. 在 `run()` 生命周期节点补 phase 状态流转。
5. 将生成入口与弹窗联动：点击生成自动打开弹窗。
6. 改弹窗标题/按钮文案，主按钮统一为“插入正文”。
7. 在主按钮点击前调用 `ensureChapterViewBeforeInsert`。
8. 本地手测主路径 + 异常路径。
9. 使用 `ReadLints` 检查修改文件并修复新增告警。

---

## 9. 建议的提交拆分（可选）

- Commit A：`editor: wire chapter-view ensure callback for ai insert`
- Commit B：`editor: add generation phase states and auto-open dialog`
- Commit C：`editor: polish outline generation dialog copy and actions`

---

## 10. 可直接给 Claude 的执行提示词

请在当前仓库实现以下改造，尽量最小改动复用现有 `AiPanel` 草稿弹窗，不要新增后端接口：

1. 在 `src/components/AiPanel.tsx`：

- 为“本章细纲/剧情构思”的生成流程增加可见状态机：`idle/preparing/streaming/done/error/aborted`；
- 点击“生成”后自动打开结果弹窗；
- 弹窗标题改为“本章正文生成”，展示当前状态与结果文本；
- 保留可编辑草稿；
- 主按钮为“插入正文”，仅在 done 且有文本时可点；
- 插入前调用新 props：`ensureChapterViewBeforeInsert?.()`，再执行 `insertAtCursor`；
- 保留“追加章尾”“重试”“取消生成”。

1. 在 `src/pages/EditorPage.tsx`：

- 新增 `ensureChapterViewBeforeInsert` 回调，将左侧切到“章节正文”；
- 透传给 `AiPanel`。

1. 完成后：

- 自测主路径、取消、失败、重试；
- 跑 `ReadLints` 并修复新增问题；
- 给出修改文件清单与行为说明。