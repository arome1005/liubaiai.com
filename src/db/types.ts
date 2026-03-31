/**
 * 写作进度游标（持久化字段，AI / RAG 检索上界，防「剧透」未写稿）。
 * - **当前**：存「已写到」的章节 id（`Chapter.id`）。
 * - **预留**：后续可改为复合结构（如章内 offset、卷 id）而不改字段名——届时用 JSON 序列化进同一列或拆表迁移。
 */
export type ProgressCursor = string | null;

/** 作品 */
export type Work = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  /** @see ProgressCursor */
  progressCursor: ProgressCursor;
};

/** 全书级风格卡 / 调性锁（5.3），每部作品一份 */
export type WorkStyleCard = {
  /** 主键 = workId（一书一份） */
  id: string;
  workId: string;
  /** 人称 / 叙述视角，如：第一人称 / 第三人称有限 */
  pov: string;
  /** 调性描述（严肃/轻松/冷幽默…） */
  tone: string;
  /** 禁用套话/禁用词（换行分隔） */
  bannedPhrases: string;
  /** 文风锚点（短样例，用来锁风格） */
  styleAnchor: string;
  /** 其他硬约束（可选） */
  extraRules: string;
  updatedAt: number;
};

/** 卷 / 篇（作品下分组，章节归属某卷） */
export type Volume = {
  id: string;
  workId: string;
  title: string;
  order: number;
  createdAt: number;
};

/** 章节 */
export type Chapter = {
  id: string;
  workId: string;
  /** 所属卷 id（迁移后必有；旧备份无则导入时补默认卷） */
  volumeId: string;
  title: string;
  content: string;
  /** 章节概要（供 AI 上下文与导航总览；可为空） */
  summary?: string;
  order: number;
  updatedAt: number;
  /** 与 `wordCount(正文)` 同步，大目录全书统计时可避免重复扫描正文 */
  wordCountCache?: number;
};

/** 章节正文历史快照（2.10），每章最多保留 N 条，由存储层裁剪 */
export type ChapterSnapshot = {
  id: string;
  chapterId: string;
  content: string;
  createdAt: number;
};

/** 每章最多保留的快照条数（与 7 天策略一起在存储层裁剪） */
export const SNAPSHOT_CAP_PER_CHAPTER = 50;
/** 超过此时长的快照会被清理（毫秒） */
export const SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** 参考库：一部导入的原著（元数据，正文在 referenceChunks） */
export type ReferenceLibraryEntry = {
  id: string;
  title: string;
  /** 原始文件名 */
  sourceName?: string;
  /** 分类 / 标签（如「科幻设定」「历史资料」），便于筛选 */
  category?: string;
  /** 总字符数（近似） */
  totalChars: number;
  chunkCount: number;
  /** 检测到的章节标题行数（与 `storage/chapter-detector` 正则一致） */
  chapterHeadCount: number;
  createdAt: number;
  updatedAt: number;
};

/** 参考库正文分块（单块不宜过大，避免单条 IndexedDB 记录过大） */
export type ReferenceChunk = {
  id: string;
  /** {@link ReferenceLibraryEntry.id} */
  refWorkId: string;
  /** 从 0 递增 */
  ordinal: number;
  content: string;
  /** 预留：向量等 JSON 字符串，未计算时为 null */
  embeddings: string | null;
  /** 本块内是否至少有一处章节标题行 */
  isChapterHead: boolean;
  /** 本块内第一处章节标题（若有） */
  chapterTitle?: string;
};

/** 参考库章节标题索引（一书多行，便于侧栏章节导航与倒排 `__REF_CHAPTER_HEAD__` 关联 chunkId） */
export type ReferenceChapterHead = {
  id: string;
  refWorkId: string;
  chunkId: string;
  ordinal: number;
  /** 全书 UTF-16 偏移（标题行起点） */
  startOffset: number;
  title: string;
};

/** 单块目标字符数（约 64KB UTF-16 单元，百万字级按块写入） */
export const REFERENCE_CHUNK_CHAR_TARGET = 65536;

/** 超过此体积（约 5MB）的 .txt 导入时展示详细索引进度条 */
export const REFERENCE_IMPORT_HEAVY_BYTES = 5 * 1024 * 1024;

/** 全书搜索结果（2.7） */
export type BookSearchHit = {
  chapterId: string;
  chapterTitle: string;
  matchCount: number;
  preview: string;
};

/** 全书搜索范围：全书 / 仅进度游标之前的章节（不含游标章） */
export type BookSearchScope = "full" | "beforeProgress";

export const DB_NAME = "liubai-writing";
export const SCHEMA_VERSION = 12;

/** 第 4 组：人物卡（4.1） */
export type BibleCharacter = {
  id: string;
  workId: string;
  name: string;
  motivation: string;
  relationships: string;
  voiceNotes: string;
  taboos: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
};

/** 世界观条目（4.2） */
export type BibleWorldEntry = {
  id: string;
  workId: string;
  /** 如：势力、规则、地理、力量体系 */
  entryKind: string;
  title: string;
  body: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
};

export type BibleForeshadowStatus = "pending" | "resolved" | "abandoned";

/** 伏笔（4.3） */
export type BibleForeshadow = {
  id: string;
  workId: string;
  title: string;
  plantedWhere: string;
  plannedResolve: string;
  status: BibleForeshadowStatus;
  note: string;
  chapterId: string | null;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
};

/** 时间线事件（4.4） */
export type BibleTimelineEvent = {
  id: string;
  workId: string;
  label: string;
  sortOrder: number;
  note: string;
  chapterId: string | null;
  createdAt: number;
  updatedAt: number;
};

/** 章头/章尾模板（4.5） */
export type BibleChapterTemplate = {
  id: string;
  workId: string;
  name: string;
  goalText: string;
  forbidText: string;
  povText: string;
  createdAt: number;
  updatedAt: number;
};

/** 单章创作约束 + 场景状态（4.5 + 4.7） */
export type ChapterBible = {
  id: string;
  chapterId: string;
  workId: string;
  goalText: string;
  forbidText: string;
  povText: string;
  /** 站位 / 持物 / 出口等，自由文本 */
  sceneStance: string;
  updatedAt: number;
};

/** 术语 / 人名 / 已死角色标记（4.6） */
export type BibleGlossaryTerm = {
  id: string;
  workId: string;
  term: string;
  category: "name" | "term" | "dead";
  note: string;
  createdAt: number;
  updatedAt: number;
};

/** 参考库倒排索引：按 token 命中块，offsetsJson 为 UTF-16 偏移 JSON 数组 */
export type ReferenceTokenPosting = {
  id: string;
  token: string;
  refWorkId: string;
  chunkId: string;
  ordinal: number;
  offsetsJson: string;
};

/** 参考库全文检索结果（阅读器跳转与高亮） */
export type ReferenceSearchHit = {
  refWorkId: string;
  refTitle: string;
  chunkId: string;
  ordinal: number;
  matchCount: number;
  /** 单行摘要（兼容） */
  preview: string;
  /** 关键词前（语境预览，搜索引擎式） */
  snippetBefore: string;
  /** 命中的关键词片段 */
  snippetMatch: string;
  /** 关键词后 */
  snippetAfter: string;
  highlightStart: number;
  highlightEnd: number;
};

/** 参考摘录标签（3.5）：全局可复用名称 */
export type ReferenceTag = {
  id: string;
  name: string;
  createdAt: number;
};

/** 摘录—标签多对多 */
export type ReferenceExcerptTag = {
  id: string;
  excerptId: string;
  tagId: string;
};

/** 参考摘录（3.4）：链回某块内选区；3.6 可选关联创作侧章节（弱链接，供进度过滤） */
export type ReferenceExcerpt = {
  id: string;
  refWorkId: string;
  chunkId: string;
  ordinal: number;
  startOffset: number;
  endOffset: number;
  text: string;
  note: string;
  createdAt: number;
  /** 3.6：关联的原创作品 id（与 linkedChapterId 成对使用） */
  linkedWorkId?: string | null;
  /** 3.6：关联的章节 id（删除章时由存储层清空） */
  linkedChapterId?: string | null;
};
