# 生辉仿写工作台 — 专业升级计划

> 创建：2026-04-18  
> 目标：把「生辉」从「有功能的 AI 生成页」升级为「专业仿写工作流」  
> 执行顺序按 ROI 排列：先做影响质量最大、改动量最小的。

---

## 进度总览


| #   | 功能                                  | 状态              | 文件                                      |
| --- | ----------------------------------- | --------------- | --------------------------------------- |
| 1   | 场景状态卡 (Scene State Card)            | ✅ 完成 2026-04-18 | ShengHuiPage.tsx, sheng-hui-generate.ts |
| 2   | 滑动段落窗口（正文末尾 N 段选择）                  | ⬜ 待做            | ShengHuiPage.tsx, sheng-hui-generate.ts |
| 3   | RAG 风格解构器（先提炼笔法再注入）                 | ⬜ 待做            | ShengHuiPage.tsx, sheng-hui-generate.ts |
| 4   | 人物声音锁（对话场景动态注入人物语气卡）                | ⬜ 待做            | ShengHuiPage.tsx, sheng-hui-generate.ts |
| 5   | 风格指纹扩展（句节奏/标点/对话密度等6维）              | ⬜ 待做            | db/types.ts, WorkStyleCardForm          |
| 6   | 生成模式扩展（场景骨架/对话优先/分段接龙）              | ⬜ 待做            | sheng-hui-generate.ts, ShengHuiPage.tsx |
| 7   | 快照删除改用应用内 Dialog（替换 window.confirm） | ⬜ 待做            | ShengHuiPage.tsx                        |
| 8   | 情绪温度 slider（控制形容词密度/语气热度）           | ⬜ 待做            | sheng-hui-generate.ts, ShengHuiPage.tsx |


---

## 详细设计

---

### 1 · 场景状态卡 (Scene State Card) ✅

**目标**：让每次生成「知道自己在哪里，刚刚发生了什么」。  
比直接贴正文末尾节省 80% token，同时续写衔接质量大幅提升。

**字段**：

```ts
type SceneStateCard = {
  location: string;    // 当前场所（如：苏州城外废庙、马车内）
  timeOfDay: string;   // 时间（如：傍晚、三更、晨曦）
  charState: string;   // 收尾人物状态（如：顾长安受伤昏迷，苏九月守在旁边）
  tension: string;     // 悬而未决的张力/悬念（如：追兵未退，信物下落不明）
}
```

**存储**：`sessionStorage` key = `liubai:shengHuiSceneState:v1:{workId}:{chapterId}`

**注入位置**：`buildShengHuiChatMessages` 中独立 block，在「章节概要」之后

**UI**：左侧栏，章节选择器下方，可折叠 section + 4 个 input +「AI 提取」按钮（读最新快照）

**Prompt 语句**：

```
【场景状态（上一段落收尾）】
场所：xxx
时间：xxx
人物状态：xxx
张力/悬念：xxx
```

---

### 2 · 滑动段落窗口（正文末尾 N 段）

**目标**：替换「正文末尾（续接）」的全量开关，改为「续接最近 N 段」selector。

**UI**：左侧上下文注入区，「正文末尾」改为：

```
[✓] 续接正文末尾  [最近 1段 ▾]
                   最近 1段
                   最近 3段
                   最近 5段
                   全部末尾
```

**实现**：

- `tailParagraphCount: 1 | 3 | 5 | "all"` 状态
- 在 `buildShengHuiChatMessages` 中按段落数而非字符数截取
- `"all"` 时保持现有的 `takeTailText(raw, MAX_BODY_TAIL_CHARS)` 逻辑

---

### 3 · RAG 风格解构器

**目标**：选中参考段落后，不直接注入原文，而是先 AI 提炼「这段的笔法特征」再注入。

**好处**：

1. 避免「洗稿」风险（原文不进 prompt）
2. AI 更容易理解并运用抽象的风格描述
3. Token 消耗更可控

**UI**：在 RAG 搜索结果每条下方加「提炼笔法」按钮，提炼后显示简短的笔法摘要（2-3句），用该摘要代替原文注入。

**存储**：`Map<chunkId, styleFeatureText>` 存 sessionStorage，一次提炼多次复用。

**提炼 Prompt**：

```
请从以下中文小说段落中，提炼其笔法特征，包括：
句子节奏（长短句分布）、遣词风格（古典/白话/现代）、感官偏好（视/听/触）、情绪处理方式（外化/内化）。
输出3-4句简洁的风格描述，不要引用原文。

【段落】
{text}
```

---

### 4 · 人物声音锁

**目标**：当大纲中提到某个人物名时，动态匹配锦囊人物卡并注入该角色的语气描述。

**实现**：

- 解析大纲文本，提取出现的人物名（与 `listBibleCharacters` 结果交叉匹配）
- 对匹配到的人物注入：`{名字}语气特征：{taboos 或 body 摘要}`
- 放入 `【人物语气约束】` block，在系统 prompt 末尾

**UI**：左侧新增「人物声音锁」section，自动检测到的人物以 badge 形式展示，可手动勾选/取消。

---

### 5 · 风格指纹扩展

**目标**：扩展 `WorkStyleCard` 的维度，让风格约束更精准。

**新增字段**（加到 db/types.ts `WorkStyleCard`）：

```ts
sentenceRhythm?: string;   // 句节奏描述（如：多用短句，节奏急促；长句收尾）
punctuationStyle?: string; // 标点偏好（如：善用破折号表停顿，少用感叹号）
dialogueDensity?: "low" | "medium" | "high"; // 对话密度
emotionStyle?: "cold" | "neutral" | "warm";  // 情绪温度（叙述风格冷暖）
narrativeDistance?: "omniscient" | "limited" | "deep_pov"; // 叙述距离
```

**UI**：写作页笔感卡表单中添加对应字段（折叠在「高级风格」下，默认收起）

---

### 6 · 生成模式扩展

**新增模式**：


| 模式 ID            | 显示名  | 说明                       |
| ---------------- | ---- | ------------------------ |
| `skeleton`       | 场景骨架 | 生成 5-8 个情节节拍（一行一个），确认后展开 |
| `dialogue_first` | 对话优先 | 先骨架对话，再补动作描写（两步生成）       |
| `segment`        | 分段接龙 | 每次生成一个场景段落，自动携带上段末尾      |


**注意**：`skeleton` 和 `dialogue_first` 是两步流程，需要在 UI 上体现「第一步/第二步」状态。

---

### 7 · 快照删除改用应用内 Dialog

**当前**：`window.confirm("确定删除该条生成快照？不可恢复。")`  
**目标**：使用应用内 AlertDialog（已有 `@radix-ui/react-alert-dialog`）

**实现**：在 `removeSelectedSnapshot` 前弹出确认 Dialog，样式与其他危险操作一致。

---

### 8 · 情绪温度 Slider

**目标**：让用户控制生成文字的「热度」——克制/平淡/热烈。

**UI**：参数栏中，目标字数右侧新增：

```
情绪温度  [克制 ○──●── 热烈]
           1    3    5
```

**实现**：`emotionTemperature: 1 | 2 | 3 | 4 | 5`  
注入 Prompt 末尾：

- 1-2：「叙述克制，情绪内化，少用形容词，多用行为描写表达情感」
- 3：「情绪适中，自然表达」
- 4-5：「情绪饱满，意象丰富，可适当抒情，感官描写密集」

---

## 实现约定

- **不新建文件**：尽量扩展现有文件
- **存储**：用户输入的场景状态等 → `sessionStorage`；快照 → 已有 `localStorage` 方案
- **Token 消耗**：每新增注入 block 都要有 `clampContextText` 上限，避免超出模型 context
- **隐私**：场景状态卡的内容属于创作内容，需遵守 `allowChapterContent` 隐私开关

---

## 当前已完成（本 session 之外）

- 版本快照 + Diff 对比 ✅
- 写回侧栏草稿 ✅
- RAG 藏经风格参考（基础版）✅
- 四种生成模式（写/续/重写/精炼）✅
- `window.alert` → toast 替换 ✅

