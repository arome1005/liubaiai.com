# 技术选型（留白写作）

| 项 | 选择 |
|----|------|
| 框架 | React 19 + TypeScript |
| 构建 | Vite 8 |
| 路由 | react-router-dom |
| **数据存哪（当前 Web）** | **浏览器 IndexedDB**（经 Dexie），**不是**用户磁盘上的独立文件路径 |
| 正文格式 | Markdown（纯文本 `textarea`，后续可换编辑器） |
| 打包备份 | JSZip（导出 zip） |
| 单作品导入 | `.txt` / `.md` / `.docx`（`mammoth` 转 Markdown 后分章），见 `src/storage/import-work.ts` |
| 章节快照（2.10） | 表 `chapterSnapshots`；**每章最多 50 条、超过 7 天自动删** |
| 参考库（3.1～3.8） | 见下：**v10** 起增加章节标题检测（`chapter-detector` 正则）、`referenceChunks.isChapterHead` / `chapterTitle`、`referenceLibrary.chapterHeadCount`、`referenceChapterHeads` 表；倒排含保留 token `__REF_CHAPTER_HEAD__`；书目侧栏 **章节列表**（折叠）；仍保留固定长度 **存储段** 与按需加载（3.7） |
| 圣经护栏（4.1～4.8） | Dexie **schema v9**：`bibleCharacters`、`bibleWorldEntries`、`bibleForeshadowing`、`bibleTimelineEvents`、`bibleChapterTemplates`、`chapterBible`（单章约束）、`bibleGlossaryTerms`；路由 **`/work/:workId/bible`**；`exportBibleMarkdown`；整库备份 zip 含上述表；编辑器侧栏 **本章约束** + **术语命中**（字面包含） |
| 库结构 | 含 `volumes`、章 `volumeId` / `wordCountCache` 等，见 `src/db/database.ts` |
| 卷 / 篇 | 表 `volumes`，章归属 `volumeId` |

### Dexie / IndexedDB Schema v10（核对用）

与 `src/db/types.ts` 中 **`SCHEMA_VERSION = 10`**、`src/db/database.ts` 中 **`this.version(10)`** 一致；首次 `initDB()` 会在表 **`meta`** 写入 `schemaVersion`。

| 表名（Dexie） | 主用途 | 索引（`stores` 声明） |
|---------------|--------|------------------------|
| `works` | 作品 | `id, updatedAt` |
| `volumes` | 卷 / 篇 | `id, workId, order` |
| `chapters` | 章节正文 | `id, workId, order, volumeId` |
| `meta` | 键值（如 schema 版本） | `key` |
| `chapterSnapshots` | 章节历史快照 | `id, chapterId, createdAt` |
| `referenceLibrary` | 参考原著元数据 | `id, updatedAt, category` |
| `referenceChunks` | 参考正文分块 | `id, refWorkId, ordinal, [refWorkId+ordinal]` |
| `referenceTokenPostings` | 参考库 **token → 块** 倒排索引 | `id, token, refWorkId, chunkId, [token+refWorkId]` |
| `referenceExcerpts` | 参考摘录与备注、可选关联创作章 | `id, refWorkId, chunkId, createdAt, linkedChapterId, linkedWorkId` |
| `referenceTags` | 摘录标签（全局） | `id, name, createdAt` |
| `referenceExcerptTags` | 摘录—标签多对多 | `id, excerptId, tagId, [excerptId+tagId]` |
| `referenceChapterHeads` | 参考库检测到的章节标题行（全书偏移 + 所属存储段） | `id, refWorkId, chunkId, ordinal, startOffset, [refWorkId+ordinal]` |
| `bibleCharacters` | 人物卡（动机/关系/口吻/禁忌） | `id, workId, sortOrder` |
| `bibleWorldEntries` | 世界观条目 | `id, workId, sortOrder` |
| `bibleForeshadowing` | 伏笔 | `id, workId, chapterId, sortOrder` |
| `bibleTimelineEvents` | 时间线事件 | `id, workId, chapterId, sortOrder` |
| `bibleChapterTemplates` | 章头/章尾模板 | `id, workId` |
| `chapterBible` | 单章创作约束（目标/禁止/视角/场景） | `id, chapterId, workId` |
| `bibleGlossaryTerms` | 术语 / 人名 / 已死标记 | `id, workId` |

- **参考库行类型**：`ReferenceLibraryEntry`（含 **`chapterHeadCount`**）；`ReferenceChunk`（含 **`isChapterHead`**、**`chapterTitle?`**、**`embeddings`**）；`ReferenceChapterHead`；`ReferenceTokenPosting`；`ReferenceExcerpt`；`ReferenceTag`；`ReferenceExcerptTag`。
- **圣经行类型**：`BibleCharacter`、`BibleWorldEntry`、`BibleForeshadow`、`BibleTimelineEvent`、`BibleChapterTemplate`、`ChapterBible`、`BibleGlossaryTerm`（见 `src/db/types.ts`）。
- **分块与索引**：`REFERENCE_CHUNK_CHAR_TARGET`（65536）；导入分块后写入 `referenceTokenPostings`（`src/storage/reference-search-index.ts`）。若库中 **有 chunks 无 postings**（如从旧备份恢复），`WritingStoreIndexedDB.init()` 会 **全量重建** 倒排索引。
- **版本历史（摘要）**：v5 快照裁剪；v6 倒排与摘录；v7 `referenceLibrary.category`；**v8** 标签表、摘录关联创作、chunks 复合索引、摘录扩展字段；**v9** 圣经护栏七表；**v10** 参考库章节检测与 `referenceChapterHeads`。

## 路线图 1.3「文件 API」与当前实现的对应（B-1.3-1）

早期路线图曾用 `readFile` / `writeFile` 等**字面** API 描述存储；当前第一期采用 **实体 id + 表**，由 `WritingStore` 封装，语义对例如下：

| 草案表述 | 当前方法（`WritingStore` / `repo`） |
|----------|--------------------------------------|
| 打开库 / 迁移 | `init()` → Dexie `initDB()` |
| 枚举作品、读作品 | `listWorks()`、`getWork(id)` |
| 卷、章 CRUD | `listVolumes`、`createVolume`、`listChapters`、`createChapter`、`updateChapter`、`reorderChapters` … |
| 写正文 | `updateChapter`（自动维护 `wordCountCache`） |
| 导出 / 备份包 | `exportAllData()` + `buildBackupZip`；恢复 `importAllData` 或 **合并** `importAllDataMerge` |
| 单文件导入作品 | `src/storage/import-work.ts`（不经 zip） |

桌面二期若使用「用户目录 + 文件」，可在适配层把路径映射为上述 id 与表行，而不必让页面直接依赖 `readFile`。

## 存储抽象（便于桌面 SQLite）

- **契约**：`WritingStore`（`src/storage/writing-store.ts`）定义全部读写接口。
- **Web 实现**：`WritingStoreIndexedDB`（`src/storage/writing-store-indexeddb.ts`）内部使用 Dexie。
- **入口**：`getWritingStore()` / `setWritingStore()`（`src/storage/instance.ts`）。启动时 `getWritingStore().init()`。
- **业务层**：`src/db/repo.ts` 只委托 `getWritingStore()`，页面与其它模块**不要**直接 `import` Dexie 或 `getDB()`。
- **桌面二期**：实现 `WritingStore` 的 SQLite 类（例如 `tauri-plugin-sql`），在 `main` 里 `setWritingStore(new WritingStoreSqlite(...))` 后再 `init()`，即可复用同一套 UI 与 `repo`。

### 作品级 `progressCursor`（防剧透 / AI 边界）

- `Work.progressCursor`（类型 `ProgressCursor`，见 `src/db/types.ts`）为**正式持久化字段**。
- **当前语义**：指向「已写到」的章节 id；检索 / RAG 只应索引游标**之前**的正文（与 ROADMAP 一致）。
- **预留**：后续可改为章内 offset 等复合结构，迁移时保持字段名或序列化策略在 `types` 中约定即可。

## 运行

```bash
npm install
npm run dev
```

需 Node 18+（建议 20 LTS）。

## 环境变量

- 暂无。后续接 AI API 时使用 `VITE_*` 前缀，见 `.env.example`（待添加）。

## 日志与性能文档

- `docs/logging.md` — 默认不落正文、诊断模式说明。
- `docs/perf.md` — 大目录与搜索的预期与实现要点。

## 与路线图 0.1～2.9 的逐字对齐

0.1～2.9 backlog 已在实现中补齐；详见 `docs/ROADMAP.md` 中已勾选项。
