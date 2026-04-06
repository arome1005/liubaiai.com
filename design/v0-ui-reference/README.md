# UI 设计参考工程（v0 导出 · v2.0）

> **定位**：与主仓库 `src/`（Vite + React）分离的 **Next.js + Tailwind v4 + shadcn/ui** 子工程，默认仅作 **视觉、布局与交互稿**；**业务真源在 `src/` + `repo`**。

## 版本与来源


| 项        | 说明                                                               |
| -------- | ---------------------------------------------------------------- |
| **规范版本** | v2.0（见 `docs/ui-design-specification.md`）                        |
| **覆盖说明** | 已用桌面目录 `留白写作UI设计参考v-2.0` **整包替换** 原 `design/v0-ui-reference`（v1） |
| **维护**   | 后续若设计侧再导出新版，可再次覆盖本目录；主应用 **渐进迁移** 到 `src/`，不要求与本目录同栈             |


## 本地运行

```bash
cd design/v0-ui-reference
npm install
npm run dev
```

默认 `app/page.tsx` 为 **单页切换七模块** 演示；**不等同** 主应用路由结构。

## 目录与主应用对照（迁移时查阅）

> **同步**：与主应用路由/能力对照随版本更新；`design/master-checklist.md` **§E.4** 发版前可再扫一眼本表与备注。


| 参考组件                                     | 主应用落点（现状）                                         | 备注                                                                 |
| ---------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------ |
| `components/app-shell.tsx`               | `AppShell.tsx`、`GlobalCommandPalette`             | §E.2.1：顶栏层级/毛玻璃与命令面板「标题 + 搜索行」布局已与参考对齐（现网路由与收纳逻辑不变）                |
| `components/modules/liubai-module.tsx`   | `LibraryPage` / `HomePage`                        | 作品库卡片、筛选等                                                          |
| `components/modules/cangjing-module.tsx` | `ReferenceLibraryPage`                            | 藏经                                                                 |
| `components/modules/luobi-module.tsx`    | `BiblePage` + 写作相关                                | 落笔 / 圣经                                                            |
| `components/modules/tuiyan-module.tsx`   | `LogicPage` `/logic`                              | 主应用已接规则扫描、三分支、时间轴/世界观极简；与参考 **结构** 对照即可                            |
| `components/modules/liuguang-module.tsx` | `InspirationPage` `/inspiration`                  | 主应用已接碎片、速记、五段扩容、转入章节                                               |
| `components/modules/wence-module.tsx`    | `ChatPage` `/chat`                                | 主应用已接多轮问策 MVP                                                      |
| `components/modules/shenghui-module.tsx` | `ShengHuiPage` `/sheng-hui`                       | 主应用已接按纲仿写 MVP（`sheng-hui-generate.ts`）；**整页** v0 级 §E **E.2.8** 仍待 |
| `components/modules/settings-module.tsx` | `SettingsPage`                                    | 可参考信息架构与分区                                                         |
| `components/immersive-editor.tsx`        | `EditorPage` + `EditorShell`                      | 沉浸编辑、双栏等 **仅参考**                                                   |
| `components/ai-model-selector.tsx`       | `AiPanel` / 设置模型选择                                | 人设化模型卡等为产品设计参考                                                     |
| `components/ui/*`                        | `src/components/ui/*`（Button/Card/Input/Dialog 等） | 主应用已接 Tailwind v4 + Radix primitive；参考工程仅作对照                       |


## 迁移原则（给实现侧）

1. **按模块、按 PR** 迁入，每步保证主应用 `npm run build` 通过。
2. **先 token 与壳层**，再单页 deep link，避免整树替换。
3. **不** 在主工程直接 `import` 本目录源码；复制结构或抽取样式后接 `repo` / 路由。
4. 详细交互、色板、模块说明以 `docs/ui-design-specification.md` 为准。

---

## 怎么把「已实现功能」和参考稿对齐？（推荐顺序）

**最省事、长期最好维护的做法，是反着接**：不要指望把 Dexie / `WritingStore` / 路由 **搬进** 这个 Next 子工程；而是 **以主应用为唯一真源**，从本目录 **按需抄 UI**，一页一页替换 `src/pages/*` 的外观与结构。

### 做法 A（推荐）：真功能留在 Vite，只迁入视觉

对每个已上线模块，按同一套流水线做即可：

1. **定范围**
  在本文「目录与主应用对照」表里锁定一对文件，例如：`liubai-module.tsx` ↔ `LibraryPage.tsx`。
2. **双开对照**
  左边参考（布局、间距、组件层级），右边 `src/`（`listWorks`、`updateWork` 等数据流 **不动**，先只改 JSX 结构与 class。
3. **先结构后皮肤**
  - 第一步：区块划分一致（工具栏 / 网格 / 卡片 / 弹层 DOM 顺序）。  
  - 第二步：把 Tailwind 类 **映射** 到主工程：要么抄成等价 `index.css` 里的 BEM/工具类，要么（团队接受后）再在主工程加 Tailwind。  
  - 第三步：交互（hover、展开）用主工程已有 state 或小幅补 state。
4. **验收**
  该页 `npm run build`、手工点一遍 **原有** 流程（新建、导入、删除等）仍正常。
5. **下一模块**
  藏经 → 设置 → … 按业务优先级排队，**不要**并行改七个模块，避免冲突。

这样「已经实现的功能」不是「加进 Next」，而是 **Next 里的稿子被主应用吸收**；功能一行不少，只是变好看。

### 做法 B：坚持在 Next 里也要「点得动真数据」

主应用数据在 **浏览器 IndexedDB / Hybrid**，没有给 Next 子工程单独暴露一套 HTTP API，因此：

- **直接 `import` 上层 `src/db/repo`** 不可行：SSR、打包路径、Dexie 初始化都会打架。  
- 真要统一，需要 **大工程**：例如抽 `@liubai/core` 包、或给写作数据做 **本地 API 层**，成本远高于做法 A。

若仅为 **演示截图**，可在 Next 里保留 mock，但让 **mock 的字段名** 与 `src/db/types.ts` 对齐，减少以后迁主应用时的理解成本。

### 小结


| 目标        | 建议                                      |
| --------- | --------------------------------------- |
| 产品可发布、少踩坑 | **做法 A**：`src/` 接 `repo`，参考目录只当「图样」。    |
| 设计稿里可点真库  | 中长期再评估 **共享包或 API**；短期用 **对齐类型的 mock**。 |


