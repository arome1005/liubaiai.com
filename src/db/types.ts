/**
 * 写作进度游标（持久化字段，AI / RAG 检索上界，防「剧透」未写稿）。
 * - **当前**：存「已写到」的章节 id（`Chapter.id`）。
 * - **预留**：后续可改为复合结构（如章内 offset、卷 id）而不改字段名——届时用 JSON 序列化进同一列或拆表迁移。
 */
export type ProgressCursor = string | null;

export type WorkStatus = "serializing" | "completed" | "archived" | "deleted";

/** 作品 */
export type Work = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  /** @see ProgressCursor */
  progressCursor: ProgressCursor;
  /** 作品简介（留白页与推演选择器展示用；可为空） */
  description?: string;
  /** 作品状态：用于留白页筛选（连载/完结/归档） */
  status?: WorkStatus;
  /** 书架封面：data URL（建议小于约 400KB）；未设置时用占位 §11 步 29 */
  coverImage?: string | null;
  /** 留白标签（§3.5）：短词列表，供 AI 上下文侧写；与参考库摘录标签无关 */
  tags?: string[];
  /** 目标总字数（可选；作品库进度条用，未设置时进度按 0% 展示） */
  targetWordCount?: number;
  /**
   * 书号：同一用户下唯一递增编号，用于短路径 `/work/{bookNo}/…`；内部主键仍是 `id`（UUID）。
   * 老数据可能在回填前缺失；UI 不单独展示，仅作为链接友好片段。
   */
  bookNo?: number;
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
  /** 句节奏描述（如：多用短句，节奏急促；长句收尾） */
  sentenceRhythm?: string;
  /** 标点偏好（如：善用破折号表停顿，少用感叹号） */
  punctuationStyle?: string;
  /** 对话密度 */
  dialogueDensity?: "low" | "medium" | "high";
  /** 情绪温度（叙述风格冷暖） */
  emotionStyle?: "cold" | "neutral" | "warm";
  /** 叙述距离 */
  narrativeDistance?: "omniscient" | "limited" | "deep_pov";
  updatedAt: number;
};

/** 卷 / 篇（作品下分组，章节归属某卷） */
export type Volume = {
  id: string;
  workId: string;
  title: string;
  order: number;
  createdAt: number;
  /** 卷级概要（规划 §11 步 19；可空） */
  summary?: string;
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
  /** 概要正文最后写入时间（毫秒）；步 19/22，与 `summary` 编辑/生成流水线对齐 */
  summaryUpdatedAt?: number;
  /**
   * 概要覆盖范围（流水线元数据，步 22）。
   * - 约定为章节序号（`Chapter.order`）的闭区间 [from, to]
   * - 单章概要：from=to=当前章 order
   * - 预留给"每 N 章合并摘要"等流水线
   */
  summaryScopeFromOrder?: number;
  summaryScopeToOrder?: number;
  order: number;
  updatedAt: number;
  /** 与 `wordCount(正文)` 同步，大目录全书统计时可避免重复扫描正文 */
  wordCountCache?: number;
  /** 推演细纲快照文本（从推演页推送后写入；推送后只读；null/undefined 表示未关联推演） */
  outlineDraft?: string;
  /** 推演树节点 id（关联来源；删除推演节点时不级联清空） */
  outlineNodeId?: string;
  /** 推送时间戳（毫秒）；非 null/undefined 表示已推送，推送后禁止再次推送（409） */
  outlinePushedAt?: number;
  /** 章节轻量笔记（从 localStorage 迁移到 IndexedDB） */
  chapterNote?: string;
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
  /** 第一条命中的前后文摘要（兼容旧代码） */
  preview: string;
  /** 最多 3 条命中上下文片段（各含前后 60 字），undefined 时降级用 preview */
  contexts?: string[];
  /** 第一条命中在原文中的字符偏移量（供编辑器滚动定位） */
  firstMatchOffset?: number;
};

/** 全书搜索范围：全书 / 仅进度游标之前的章节（不含游标章） */
export type BookSearchScope = "full" | "beforeProgress";

export const DB_NAME = "liubai-writing";
export const SCHEMA_VERSION = 33;

export type InspirationLink = {
  id: string;
  type: "character" | "plot";
  name: string;
  createdAt: number;
};

/** 第 4 组：人物卡（4.1） */
export type BibleCharacter = {
  id: string;
  workId: string;
  name: string;
  motivation: string;
  relationships: string;
  voiceNotes: string;
  taboos: string;
  /** 性别：IndexedDB 兼容旧数据（undefined = 未知） */
  gender?: "male" | "female" | "unknown" | "none";
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

/**
 * 推演地图：地点节点（步 34 后续）。
 * - 独立于世界观条目；用于"地点-事件"表与地图视图。
 * - x/y 为 0~100 的百分比坐标（便于 SVG 画布自适应）。
 */
export type LogicPlaceNode = {
  id: string;
  workId: string;
  name: string;
  note: string;
  x: number;
  y: number;
  createdAt: number;
  updatedAt: number;
};

/** 推演地图：地点-事件（可选关联章节） */
export type LogicPlaceEvent = {
  id: string;
  workId: string;
  placeId: string;
  label: string;
  note: string;
  chapterId: string | null;
  createdAt: number;
  updatedAt: number;
};

// ─── 全局提示词库 ─────────────────────────────────────────────────────────────

/** 提示词审核状态（Sprint 2）
 * draft      → submitted（用户提交）
 * submitted  → approved（管理员通过，全端可见）
 * submitted  → rejected（管理员驳回，附 reviewNote）
 * rejected   → submitted（用户重新提交）
 * approved   → archived（管理员下架，可选）
 */
export const PROMPT_STATUSES = ["draft", "submitted", "approved", "rejected"] as const;
export type PromptStatus = (typeof PROMPT_STATUSES)[number];
export const PROMPT_STATUS_LABELS: Record<PromptStatus, string> = {
  draft:     "草稿",
  submitted: "审核中",
  approved:  "已发布",
  rejected:  "已驳回",
};

/** 标准提示词类型（随功能扩展） */
export const PROMPT_TYPES = [
  "continue",       // 续写
  "outline",        // 大纲
  "volume",         // 卷纲
  "scene",          // 细纲
  "style",          // 写作风格
  "opening",        // 黄金开篇
  "character",      // 人设
  "worldbuilding",  // 世界观
  "book_split",     // 重塑
  "universal_entry", // 万能词条（书斋词条 / 非人设定用语等）
  "article_summary", // 文章概括（章节概要 / 省 token 向压缩）
] as const;

export type PromptType = (typeof PROMPT_TYPES)[number];

export const PROMPT_TYPE_LABELS: Record<PromptType, string> = {
  continue:       "续写",
  outline:        "大纲",
  volume:         "卷纲",
  scene:          "细纲",
  style:          "写作风格",
  opening:        "黄金开篇",
  character:      "人设",
  worldbuilding:  "世界观",
  book_split:     "重塑",
  universal_entry: "万能词条",
  article_summary: "文章概括",
};

/**
 * 提示词适用槽位（§藏经-规格 §3.2 step 4）
 * 槽位决定该模板在哪个功能入口可被选用。
 */
export const PROMPT_SLOTS = [
  // 写作侧栏
  "writer_continue",   // 续写
  "writer_rewrite",    // 改写
  "writer_opening",    // 黄金开篇
  // 推演
  "tuiyan_master",     // 总纲生成
  "tuiyan_outline",    // 大纲生成
  "tuiyan_volume",     // 卷纲扩展
  "tuiyan_scene",      // 细纲拆场
  "tuiyan_detail",     // 详细细纲
  // 落笔
  "luobi_master_brief", // 构思母本
  "luobi_to_outline",   // 构思→大纲
] as const;

export type PromptSlot = (typeof PROMPT_SLOTS)[number];

export const PROMPT_SLOT_LABELS: Record<PromptSlot, string> = {
  writer_continue:    "写作·续写",
  writer_rewrite:     "写作·改写",
  writer_opening:     "写作·黄金开篇",
  tuiyan_master:      "推演·总纲生成",
  tuiyan_outline:     "推演·大纲生成",
  tuiyan_volume:      "推演·卷纲扩展",
  tuiyan_scene:       "推演·细纲拆场",
  tuiyan_detail:      "推演·详细细纲",
  luobi_master_brief: "落笔·构思母本",
  luobi_to_outline:   "落笔·构思→大纲",
};

/** 按适用范围分组的槽位（供 UI 联动过滤） */
export const PROMPT_SCOPE_SLOTS: Record<string, PromptSlot[]> = {
  writer: ["writer_continue", "writer_rewrite", "writer_opening"],
  tuiyan: ["tuiyan_master", "tuiyan_outline", "tuiyan_volume", "tuiyan_scene", "tuiyan_detail"],
  luobi:  ["luobi_master_brief", "luobi_to_outline"],
};

export const PROMPT_SCOPE_LABELS: Record<string, string> = {
  writer: "写作",
  tuiyan: "推演",
  luobi:  "落笔",
};

/**
 * 全局（跨作品）提示词模板——存 IndexedDB `globalPromptTemplates` 或
 * Supabase `prompt_template`（与 per-work `WritingPromptTemplate` 并存）。
 * 状态：draft（仅草稿）/ approved（已发布，全库与精选可见）/ submitted·rejected 为历史兼容。
 */
export type GlobalPromptTemplate = {
  id: string;
  title: string;
  type: PromptType;
  /** 用户自定义标签（可多个） */
  tags: string[];
  body: string;
  status: PromptStatus;
  /** 管理员驳回时写入的原因；approved/draft 为空 */
  reviewNote?: string;
  /**
   * 模板所属用户 ID（Supabase user_id）。
   * IndexedDB 本地行不填此字段（undefined）。
   * 用于 UI 区分「我的」vs「他人已发布」。
   */
  userId?: string;
  /** 适用槽位（§藏经-规格 §3.2 step 4）；未指定则不限 */
  slots?: PromptSlot[];
  /** 来源类型（§藏经-规格 §5.1/§6）：手动创建 / 摘录提炼 / 整书提炼 / 藏经聊天提炼 */
  source_kind?: "manual" | "reference_excerpt" | "reference_book" | "reference_chat";
  /** 来源参考书 id（藏经 referenceLibrary.id） */
  source_ref_work_id?: string | null;
  /** 来源摘录 id 列表（V1 多摘录时启用） */
  source_excerpt_ids?: string[] | null;
  /** 来源备注（如提炼类型/参数） */
  source_note?: string | null;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
};

// ─────────────────────────────────────────────────────────────────────────────

/** 写作侧栏「额外要求」可复用片段（§11 步 42） */
export type WritingPromptTemplate = {
  id: string;
  workId: string;
  /** 自由分类，如：扩写、润色、对话 */
  category: string;
  title: string;
  body: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
};

/** 笔感样本：粘贴/摘抄的参考段落，注入写作侧栏 user 上下文（§11 步 43） */
export type WritingStyleSample = {
  id: string;
  workId: string;
  title: string;
  body: string;
  sortOrder: number;
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
  /** §11 步 21：本章末主要人物状态备忘（注入装配器 user 上下文） */
  characterStateText: string;
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

/** §G-07：流光集合（文件夹）；用户级，与作品无强制绑定 */
export type InspirationCollection = {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
};

/** 流光碎片（§11 步 35）：正文 + 标签 + 时间；可选归属某部作品 */
export type InspirationFragment = {
  id: string;
  /** 未归属全书时为 null */
  workId: string | null;
  /** §G-07：所属集合；未入集合时为 null */
  collectionId: string | null;
  /** 可选标题（UI 列表/详情展示；不再通过 body 前缀 hack） */
  title?: string;
  /** 来源：自由文本（如"微信读书""随手记"） */
  sourceName?: string;
  /** 来源 URL：书签/引用等 */
  sourceUrl?: string;
  /** URL 预览元信息（抓取后落库并云同步） */
  urlTitle?: string;
  urlSite?: string;
  urlDescription?: string;
  urlFetchedAt?: number;
  /** 人物/情节等关联（终态：可扩展为联动推演/锦囊的实体 id） */
  links?: InspirationLink[];
  body: string;
  tags: string[];
  /** 云同步字段：收藏（替代本地 favoriteIds） */
  isFavorite?: boolean;
  /** 云同步字段：私密（RLS 足够，不做加密） */
  isPrivate?: boolean;
  /** 云同步字段：归档（默认隐藏） */
  archived?: boolean;
  createdAt: number;
  updatedAt: number;
};

export type TuiyanPlanningLevel = "master_outline" | "outline" | "volume" | "chapter_outline" | "chapter_detail";

export type TuiyanPlanningNode = {
  id: string;
  /** 首层节点为 null；其余层引用父节点 id */
  parentId: string | null;
  level: TuiyanPlanningLevel;
  title: string;
  summary: string;
  order: number;
  /** 章级节点可绑定现有 Chapter.id，便于推送章纲 */
  chapterId?: string | null;
};

export type TuiyanPlanningMeta = {
  generatedAt: number;
  mode: "model" | "template";
  promptSlot: PromptSlot;
  provider?: string;
  modelId?: string;
  templateId?: string | null;
};

/** 五层规划：每个节点的结构化元数据（不同层级展示不同字段集，AI 生成后用户可修改） */
export type PlanningNodeStructuredMeta = {
  // 总纲 (master_outline)
  logline?: string;
  worldSetting?: string;
  /** 世界观中的核心设定词条（chip 联动书斋词条库） */
  worldSettingTerms?: string;
  mainConflict?: string;
  coreCharacters?: string;
  storyStages?: string;
  // 一级大纲 (outline)
  stageGoal?: string;
  characterAllocation?: string;
  mainFactions?: string;
  characterArcs?: string;
  // 卷纲 (volume)
  mainCharacters?: string;
  coreFactions?: string;
  keyLocations?: string;
  keyItems?: string;
  volumeHook?: string;
  // 章细纲 (chapter_outline) + 详细细纲 (chapter_detail)
  conflictPoints?: string;
  appearedCharacters?: string;
  locations?: string;
  keyBeats?: string;
  requiredInfo?: string;
  tags?: string;
};

/** 推演页推送给写作编辑页「章纲」栏的单个节点（按扁平节点 + parentId 组织五层树）。 */
export type TuiyanPushedOutlineEntry = {
  id: string;
  /** 本层父节点 id；根节点为 null（通常为 master_outline 根） */
  parentId: string | null;
  level: TuiyanPlanningLevel;
  /** 同一 parent 下的兄弟顺序 */
  order: number;
  /** 节点标题（左侧章纲树显示这个） */
  title: string;
  /** 节点内容：非详细细纲为 summary；详细细纲为规划正文 */
  content: string;
  /** 批次时间戳 */
  pushedAt: number;
  /** 推送时携带的结构化元数据（AI 生成后用户确认过的版本；可选，旧快照无此字段） */
  structuredMeta?: PlanningNodeStructuredMeta;
};

/** 推演：与作品绑定的推演工作台状态（对话/文策/定稿标记等），用于刷新不丢与云同步 */
export type TuiyanState = {
  /** 主键（= workId） */
  id: string;
  workId: string;
  updatedAt: number;
  /** 对话历史（页面层结构序列化后存储；timestamp 用毫秒数） */
  chatHistory: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: number;
    relatedOutlineId?: string;
  }>;
  /** 文策条目（timestamp 用毫秒数） */
  wenCe: Array<{
    id: string;
    timestamp: number;
    type: "decision" | "revision" | "ai_suggestion" | "user_note" | "milestone";
    title: string;
    content: string;
    relatedOutlineId?: string;
    isPinned?: boolean;
    tags?: string[];
  }>;
  /** 显式定稿标记：nodeId 列表（章/卷/节点） */
  finalizedNodeIds: string[];
  /** 节点状态覆盖：nodeId -> status（用于卷/章/scene 等不落在 core 表字段的状态） */
  statusByNodeId?: Record<string, "draft" | "refining" | "locked">;
  /** 关联的藏经书目（ReferenceLibraryEntry.id） */
  linkedRefWorkIds?: string[];
  /** 可编辑导图（reactflow）：节点/连线/视口 */
  mindmap?: {
    nodes: unknown[];
    edges: unknown[];
    viewport?: { x: number; y: number; zoom: number };
  };
  /** 场景实体（独立于卷/章树） */
  scenes?: Array<{
    id: string;
    title: string;
    summary?: string;
    /** 归属/引用：该场景关联到哪些章节（弱关系；章节被删时不会自动删除场景） */
    linkedChapterIds: string[];
    createdAt: number;
    updatedAt: number;
  }>;
  /**
   * Sprint 3：推演页当前选中的全局提示词模板 id（GlobalPromptTemplate.id）。
   * 生成时自动前置到 userHint；未选则行为与之前完全一致。
   */
  selectedPromptTemplateId?: string | null;
  /**
   * 五层规划：作品构思输入（总纲生成源文本）
   */
  planningIdea?: string;
  /**
   * 五层规划：扁平节点集合（通过 parentId 组织层级）
   */
  planningTree?: TuiyanPlanningNode[];
  /**
   * 五层规划：节点草稿正文（通常用于详细细纲）
   */
  planningDraftsByNodeId?: Record<string, string>;
  /**
   * 五层规划：节点生成来源（模型、模板、时间戳）
   */
  planningMetaByNodeId?: Record<string, TuiyanPlanningMeta>;
  /**
   * 五层规划：当前选中的规划节点（UI 恢复）
   */
  planningSelectedNodeId?: string | null;
  /**
   * 五层规划：节点结构化元数据（按层级不同字段集；AI 生成后用户可修改）
   */
  planningStructuredMetaByNodeId?: Record<string, PlanningNodeStructuredMeta>;
  /** 推演页推送给写作编辑页「章纲」栏的只读快照；不创建正文章节。 */
  planningPushedOutlines?: TuiyanPushedOutlineEntry[];
  /**
   * 推送时可选生成的知识批次快照（人物 + 词条）。
   * 用于回溯来源、去重与统计；实际落库数据在 BibleCharacter / BibleWorldEntry 里。
   */
  planningKnowledgeBatches?: TuiyanKnowledgeBatch[];
};

// ─── 推演知识库抽取类型 ────────────────────────────────────────────────────────

/** AI 从规划节点内容中抽取的人物条目（待落入 BibleCharacter） */
export type TuiyanExtractedCharacter = {
  name: string;
  motivation: string;
  relationships: string;
  voiceNotes: string;
  taboos: string;
  /** 来源层级 */
  sourceLevel: TuiyanPlanningLevel;
  /** 来源节点 id */
  sourceNodeId: string;
};

/** AI 从规划节点内容中抽取的世界观词条（待落入 BibleWorldEntry） */
export type TuiyanExtractedTerm = {
  entryKind: string;
  title: string;
  body: string;
  /** 来源层级 */
  sourceLevel: TuiyanPlanningLevel;
  /** 来源节点 id */
  sourceNodeId: string;
};

/** 一次推送生成的知识批次快照 */
export type TuiyanKnowledgeBatch = {
  id: string;
  createdAt: number;
  /** 来源节点 id 集合 */
  sourceNodeIds: string[];
  /** 本批次抽取的人物（归一化后用于 upsert） */
  characters: TuiyanExtractedCharacter[];
  /** 本批次抽取的词条（归一化后用于 upsert） */
  terms: TuiyanExtractedTerm[];
  /** upsert 结果统计 */
  stats: {
    charactersAdded: number;
    charactersUpdated: number;
    termsAdded: number;
    termsUpdated: number;
  };
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

/** 提炼要点类型 */
export type ReferenceExtractType =
  | "characters"
  | "worldbuilding"
  | "plot_beats"
  | "craft"
  | "key_cards";

/**
 * 提炼要点条目 —— AI 对参考书目的结构化摘取（P1-03）。
 * 本地专用，存 IndexedDB，不上云。
 */
export type ReferenceExtract = {
  id: string;
  /** 来源书目 id（ReferenceLibraryEntry.id） */
  refWorkId: string;
  /** 提炼类型 */
  type: ReferenceExtractType;
  /** 提炼内容（Markdown 格式） */
  body: string;
  createdAt: number;
  /** 导入锦囊后记录目标 id（可选） */
  importedBibleId?: string | null;
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
