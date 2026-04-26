# 推演功能页面详细优化实施步骤

## Phase 1｜P0 纯 UI 改动（无需后端，1-2天）

### 步骤 1：scene → 细纲 文案与图标替换

文件：`tuiyan-module.tsx`

改动清单（3处）：

1. **类型定义 第109行**：

```typescript
// 改前
type: "volume" | "chapter" | "scene"
// 改后（key 不变，仅加注释标注显示名为"细纲"）
type: "volume" | "chapter" | "scene" // scene 显示为「细纲」
```

1. **图标 第472-474行**：

```typescript
scene: { icon: AlignLeft, color: "text-muted-foreground/70" },
// AlignLeft 已在 lucide 导入列表，换掉 Layers
```

1. **统计区文案 第1163行**：

```typescript
{ label: "细纲", value: countNodes(outline, "scene"), ... }
```

1. **节点类型 Badge 第1220行**：

```typescript
{selectedNode.type === "scene" && "细纲"}
```

*左侧 mock 数据里 type: "scene" 的子项 title 前缀从「场景N」改为「细纲N」（mock 文字调整）*

### 步骤 2：左侧面板顶部加「作品构思」折叠区

文件：`tuiyan-module.tsx`

在左侧面板搜索框（第1148行）之上插入新区块：

```tsx
// 新增 state
const [conceptExpanded, setConceptExpanded] = useState(true)
const [conceptText, setConceptText] = useState("")

// 在搜索框 <div> 上方插入：
<div className="border-b border-border/40">
  {/* 折叠头 */}
  <button
    className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium hover:bg-muted/30"
    onClick={() => setConceptExpanded(!conceptExpanded)}
  >
    <span className="flex items-center gap-2">
      <Lightbulb className="h-4 w-4 text-amber-400" />
      作品构思
    </span>
    {conceptExpanded
      ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
  </button>

  {/* 折叠内容 */}
  {conceptExpanded && (
    <div className="px-3 pb-3 space-y-2">
      <Textarea
        value={conceptText}
        onChange={(e) => setConceptText(e.target.value)}
        placeholder="类型、核心矛盾、世界规则、主角动机..."
        className="min-h-[80px] resize-none text-sm"
      />
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs">
          <Wand2 className="h-3.5 w-3.5" />
          AI 扩写构思
        </Button>
        <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs">
          <Sparkles className="h-3.5 w-3.5" />
          从落笔导入
        </Button>
      </div>
    </div>
  )}
</div>
```

*Lightbulb 已在 imports 里，Wand2 也已导入——零额外依赖。*

---

## Phase 2｜P1 数据库迁移（后端，1天）

文件：`migrate.js`

在现有 `-- ========= tuiyan =========` 段之后追加以下 DDL：

### 步骤 3：新建 work_concept 表

```sql
-- 推演构思层：每部作品一条，可多次修改
create table if not exists work_concept (
  id          uuid primary key default gen_random_uuid(),
  work_id     uuid not null references work(id) on delete cascade,
  user_id     uuid not null,
  genre       text[] not null default '{}',       -- 类型标签
  core_conflict text not null default '',          -- 核心矛盾
  world_rules text not null default '',            -- 世界规则
  protagonist_motivation text not null default '', -- 主角动机
  raw_text    text not null default '',            -- 自由文本（手输/AI生成）
  imported_card_ids uuid[] not null default '{}', -- 落笔卡片 id
  stage       text not null default 'draft'        -- draft | finalized
    check (stage in ('draft','finalized')),
  created_at  bigint not null,
  updated_at  bigint not null,
  unique(work_id)
);
create index if not exists idx_work_concept_work on work_concept(work_id);
```

### 步骤 4：新建 tuiyan_prompt_template 表

推演专用提示词库，与 `writing_prompt_template` 物理隔离：

```sql
-- 推演专用提示词模板（独立于落笔/写作模板）
create table if not exists tuiyan_prompt_template (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  stage       text not null
    check (stage in ('concept','volume','chapter','detail_outline')),
  title       text not null default '',
  body        text not null default '',
  is_default  boolean not null default false,
  sort_order  integer not null default 0,
  created_at  bigint not null,
  updated_at  bigint not null
);
create index if not exists idx_tuiyan_pt_user_stage on tuiyan_prompt_template(user_id, stage);
```

### 步骤 5：chapter 表新增两列（章纲关联）

```sql
-- 章纲 row：推演推送后写入（只读快照）
alter table chapter
  add column if not exists outline_draft text null,        -- 推演细纲快照内容
  add column if not exists outline_node_id uuid null,      -- 对应 tuiyan_state.scenes 中的 node id
  add column if not exists outline_pushed_at bigint null;  -- 推送时间戳（null 表示未推送）
```

---

## Phase 3｜P1 后端 API（Fastify，2天）

文件：`server.js`

在现有路由（OTP/auth 段）之后按模块添加：

### 步骤 6：work_concept CRUD

```javascript
// GET  /api/works/:workId/concept
// PUT  /api/works/:workId/concept   （upsert）
// POST /api/works/:workId/concept/finalize
```

- GET：查 `work_concept` where `work_id = :workId`
- PUT：upsert，校验 `req.user.id === concept.user_id`
- POST /finalize：`stage` 改 `finalized`，加 `updated_at`

### 步骤 7：tuiyan_prompt_template CRUD

```javascript
// GET    /api/tuiyan/prompts?stage=chapter
// POST   /api/tuiyan/prompts
// PUT    /api/tuiyan/prompts/:id
// DELETE /api/tuiyan/prompts/:id
```

GET 支持 `?stage=` 筛选，返回该用户所有同 stage 模板 + 系统内置默认模板（`user_id IS NULL`）。

### 步骤 8：推送细纲到写作页

```javascript
// POST /api/tuiyan/push-outline
// body: { chapterId, outlineDraft, outlineNodeId }
```

逻辑：

1. `requireAuth` 校验
2. 确认 chapter 属于该用户
3. 写入 `chapter.outline_draft`, `chapter.outline_node_id`, `chapter.outline_pushed_at = now()`
4. 返回更新后的 chapter 行

> **产品规则写入注释**：`// 推演是草稿来源；推送后以 chapter.content 为真，outline_draft 只读`

---

## Phase 4｜P1 前端 UI 核心功能（2-3天）

文件：`tuiyan-module.tsx`

### 步骤 9：右侧面板新增「提示词」Tab

在右侧面板的 `rightPanelTab` state 里加第四个值 `"prompts"`：

```tsx
// 改前
const [rightPanelTab, setRightPanelTab] = useState<"detail" | "chat" | "reference">("detail")
// 改后
const [rightPanelTab, setRightPanelTab] = useState<"detail" | "chat" | "reference" | "prompts">("detail")
```

Tab 栏新增按钮（第1591行之后）：

```tsx
<button onClick={() => setRightPanelTab("prompts")} ...>
  提示词
</button>
```

提示词面板内容（按当前选中节点的 type 自动高亮对应阶段）：

```tsx
{rightPanelTab === "prompts" && (
  <ScrollArea className="flex-1">
    <div className="p-4 space-y-4">
      {/* 当前阶段标识 */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">当前节点层级：</span>
        <Badge variant="outline">
          {selectedNode?.type === "volume" && "卷纲"}
          {selectedNode?.type === "chapter" && "章"}
          {selectedNode?.type === "scene" && "细纲"}
          {!selectedNode && "构思"}
        </Badge>
      </div>

      {/* 四个阶段的提示词选择区 */}
      {["concept","volume","chapter","detail_outline"].map((stage) => {
        const stageLabel = { concept:"构思", volume:"卷纲", chapter:"章", detail_outline:"细纲" }
        const isActive = (
          (stage === "concept" && !selectedNode) ||
          (stage === "volume" && selectedNode?.type === "volume") ||
          (stage === "chapter" && selectedNode?.type === "chapter") ||
          (stage === "detail_outline" && selectedNode?.type === "scene")
        )
        return (
          <div key={stage}
            className={cn("rounded-xl border p-3 space-y-2",
              isActive ? "border-primary/40 bg-primary/5" : "border-border/40")}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{stageLabel[stage]}提示词</span>
              {isActive && <Badge className="h-4 text-[10px] bg-primary/20 text-primary">当前阶段</Badge>}
            </div>
            {/* 模板选择下拉（数据来自 /api/tuiyan/prompts?stage=xxx） */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="w-full justify-between">
                  <span className="text-muted-foreground">未选择模板</span>
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-64">
                <DropdownMenuItem>默认模板</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <Plus className="mr-2 h-4 w-4" />新建模板
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {/* 自定义补充文本 */}
            <Textarea placeholder="追加要求（可留空）..." className="min-h-[60px] resize-none text-xs" />
          </div>
        )
      })}

      <Button variant="ghost" size="sm" className="w-full gap-2 text-xs">
        <Settings className="h-3.5 w-3.5" />管理推演提示词库
      </Button>
    </div>
  </ScrollArea>
)}
```

### 步骤 10：「推送到写作页」按钮与弹窗

在中心面板 detail 视图 Quick Actions 区域（第1406行），将现有「进入生辉」按钮替换为「推送到写作页」：

```tsx
// 新增 state
const [showPushModal, setShowPushModal] = useState(false)

// 按钮：仅 scene（细纲）层节点 && status === "finalized" 时主色高亮
<Button
  variant={selectedNode?.type === "scene" && selectedNode?.status === "finalized"
    ? "default" : "outline"}
  size="sm"
  className="gap-2"
  onClick={() => setShowPushModal(true)}
  disabled={selectedNode?.type !== "scene"}
>
  <ArrowRight className="h-4 w-4" />
  推送到写作页
</Button>

// Dialog 弹窗
<Dialog open={showPushModal} onOpenChange={setShowPushModal}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>推送细纲到写作页</DialogTitle>
      <DialogDescription>
        确认后，此细纲将作为章纲快照写入对应章节，推演侧变为只读。
        后续可在写作页用细纲一键生成正文。
      </DialogDescription>
    </DialogHeader>

    <div className="space-y-3">
      {/* 选择关联章节 */}
      <div className="space-y-1.5">
        <label className="text-sm text-muted-foreground">关联到章节</label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full justify-between">
              <span>选择已有章节 / 新建章节</span>
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>第一章：落魄少年</DropdownMenuItem>
            <DropdownMenuItem>第二章：踏入修途</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem><Plus className="mr-2 h-4 w-4" />新建章节</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* 预览细纲内容 */}
      <div className="rounded-lg bg-muted/30 p-3 text-sm text-muted-foreground">
        {selectedNode?.summary || "（无摘要）"}
      </div>
    </div>

    <DialogFooter>
      <Button variant="outline" onClick={() => setShowPushModal(false)}>取消</Button>
      <Button onClick={() => {
        // 调用 POST /api/tuiyan/push-outline
        setShowPushModal(false)
        // 更新节点状态为 locked
      }}>
        确认推送
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

## Phase 5｜P2 分阶段向导（1天）

文件：`tuiyan-module.tsx`

### 步骤 11：顶部工具栏替换为五步骤进度条

在顶部工具栏右侧区域（第1102行），将现有「定稿进度」条替换：

```tsx
// 新增 state
const [currentStage, setCurrentStage] = useState<
  "concept" | "volume" | "chapter" | "detail_outline" | "push"
>("concept")

const stages = [
  { key: "concept", label: "构思" },
  { key: "volume",  label: "卷纲" },
  { key: "chapter", label: "章"   },
  { key: "detail_outline", label: "细纲" },
  { key: "push",    label: "推送" },
]

// 替换进度条区域
<div className="flex items-center gap-1 rounded-lg bg-muted/30 px-3 py-1.5">
  {stages.map((s, i) => (
    <Fragment key={s.key}>
      <button
        className={cn(
          "text-xs px-2 py-0.5 rounded transition-colors",
          s.key === currentStage
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        )}
        onClick={() => setCurrentStage(s.key as typeof currentStage)}
      >
        {s.label}
      </button>
      {i < stages.length - 1 && (
        <ChevronRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />
      )}
    </Fragment>
  ))}
</div>
```

### 步骤 12：阶段感知的「AI 生成」按钮

顶部右侧「AI 生成」按钮（第1135行）的文案和行为随 `currentStage` 变化：

```tsx
const stageActionLabel = {
  concept: "AI 扩写构思",
  volume:  "AI 生成卷纲",
  chapter: "AI 生成章节",
  detail_outline: "AI 生成细纲",
  push: "确认推送",
}

<Button size="sm" className="h-8 gap-2">
  <Sparkles className="h-4 w-4" />
  {stageActionLabel[currentStage]}
</Button>
```

### 步骤 13：软向导提示（跨阶段时的 toast 提示）

当用户在「卷纲未完成」时直接点「AI 生成细纲」，不阻断，但触发一个 toast：

*“建议先完成卷纲再生成细纲，这样细纲会更贴合故事结构。”*
`[仍然继续]  [先完成卷纲]`

具体实现：在每个 AI 生成操作的 handler 里加前置检查，`concept.stage !== "finalized"` 时显示软提示，用户可忽略直接继续。

---

## Phase 6｜P2 落笔抽卡联动（1-2天）

### 步骤 14：落笔页面新增「导入到推演」入口

文件：`luobi-module.tsx`

在每张灵感卡片的操作菜单里（现有的 DropdownMenu）新增：

```tsx
<DropdownMenuItem onClick={() => handleSendToTuiyan(card.id)}>
  <GitBranch className="mr-2 h-4 w-4" />
  导入到推演构思
</DropdownMenuItem>
```

`handleSendToTuiyan` 逻辑：将选中的 `inspiration_fragment.id` 写入推演页的 `work_concept.imported_card_ids`（调用 `PUT /api/works/:workId/concept`），然后切换到推演 Tab。

### 步骤 15：推演页「从落笔导入」卡片选择器

Phase 1 步骤 2 里已经放了「从落笔导入」按钮，这里实现其弹窗：

```tsx
// 新增 state
const [showCardPicker, setShowCardPicker] = useState(false)

// Dialog：展示 inspiration_fragment 列表，支持多选
<Dialog open={showCardPicker} onOpenChange={setShowCardPicker}>
  <DialogContent className="max-w-2xl">
    <DialogHeader>
      <DialogTitle>从落笔导入构思碎片</DialogTitle>
    </DialogHeader>
    {/* 卡片列表，支持多选 */}
    {/* 搜索 + 标签筛选 */}
    {/* 确认 → 汇总写入 conceptText */}
    <DialogFooter>
      <Button onClick={() => {
        // 将选中卡片内容合并追加到 conceptText
        setShowCardPicker(false)
      }}>
        导入选中（N）张
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

## 完整实施顺序总览


| Phase  | 步骤  | 内容                         | 文件                  | 估时   | 依赖     |
| ------ | --- | -------------------------- | ------------------- | ---- | ------ |
| **P0** | 1   | scene→细纲 文案图标              | `tuiyan-module.tsx` | 0.5h | 无      |
| **P0** | 2   | 左侧构思折叠区 UI                 | `tuiyan-module.tsx` | 2h   | 无      |
| **P1** | 3   | work_concept 表             | `migrate.js`        | 0.5h | 无      |
| **P1** | 4   | tuiyan_prompt_template 表   | `migrate.js`        | 0.5h | 无      |
| **P1** | 5   | chapter 增加两列               | `migrate.js`        | 0.5h | 无      |
| **P1** | 6   | work_concept API           | `server.js`         | 2h   | 步骤3    |
| **P1** | 7   | tuiyan_prompt_template API | `server.js`         | 1h   | 步骤4    |
| **P1** | 8   | push-outline API           | `server.js`         | 1h   | 步骤5    |
| **P1** | 9   | 右侧「提示词」Tab                 | `tuiyan-module.tsx` | 3h   | 步骤7    |
| **P1** | 10  | 推送弹窗 + 联调                  | `tuiyan-module.tsx` | 3h   | 步骤8    |
| **P2** | 11  | 五步骤进度条                     | `tuiyan-module.tsx` | 2h   | 步骤9,10 |
| **P2** | 12  | 阶段感知 AI 按钮                 | `tuiyan-module.tsx` | 1h   | 步骤11   |
| **P2** | 13  | 软向导 toast                  | `tuiyan-module.tsx` | 1h   | 步骤11   |
| **P2** | 14  | 落笔「导入到推演」入口                | `luobi-module.tsx`  | 1h   | 步骤6    |
| **P2** | 15  | 推演卡片选择器弹窗                  | `tuiyan-module.tsx` | 2h   | 步骤14   |


---

## 🛑 两条必须先钉死的产品规则（写进代码注释）

1. **推演快照只读规则**：写入 `chapter.outline_draft` 后，该字段不可再被推演侧覆盖，只能在写作编辑页手动清除。需在 push-outline API 里加检查：`outline_pushed_at IS NOT NULL` → 返回 409 Conflict，前端提示「此章节已有推演快照，如需重新推送请先在写作页清除原章纲」。
2. **提示词隔离规则**：`tuiyan_prompt_template` 的 CRUD API 与 `writing_prompt_template` 完全独立，路径前缀不同（`/api/tuiyan/prompts` vs `/api/works/:id/prompt-templates`），前端 UI 里设置入口也分开，永远不合并。

