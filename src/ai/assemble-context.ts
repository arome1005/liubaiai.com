import type { AiChatMessage, AiSettings } from "./types";
import type { WritingRagSources } from "../util/work-rag-runtime";
import { DEFAULT_WRITING_RAG_SOURCES } from "../util/work-rag-runtime";
import { defaultWorkBibleSectionMask, filterWorkBibleMarkdownBySections } from "./work-bible-sections";

/**
 * 总体规划 §11 步 9：上下文装配器 v1 的 **输入草案**（简版 / 占位拼接）。
 * 写作侧栏 **实际请求** 见 {@link buildWritingSidepanelMessages}；合并顺序真源见 `docs/ai-context-merge-order.md`。
 */
export type AssembleContextInputV1 = {
  workMeta?: { id: string; title: string };
  /** 作品标签解析后的内部 profile，仅应由装配器拼接，默认不向用户展开全文 */
  tagProfileText?: string;
  styleCardText?: string;
  bibleExcerpts?: string[];
  neighborChapterSummaries?: string[];
  userPrompt: string;
  chapterExcerpt?: string;
};

/**
 * 占位实现：按字段简单拼接为一条 user 消息；生产写作侧栏用 {@link buildWritingSidepanelMessages}。
 * 可单独编写单测。
 */
export function assembleChatMessagesPlaceholder(input: AssembleContextInputV1): AiChatMessage[] {
  const blocks: string[] = [];
  if (input.workMeta?.title) blocks.push(`【作品】${input.workMeta.title}`);
  if (input.tagProfileText?.trim()) blocks.push(`【写作侧写】\n${input.tagProfileText.trim()}`);
  if (input.styleCardText?.trim()) blocks.push(`【风格卡】\n${input.styleCardText.trim()}`);
  if (input.bibleExcerpts?.length) blocks.push(`【锦囊摘录】\n${input.bibleExcerpts.join("\n---\n")}`);
  if (input.neighborChapterSummaries?.length) {
    blocks.push(`【邻章摘要】\n${input.neighborChapterSummaries.join("\n---\n")}`);
  }
  if (input.chapterExcerpt?.trim()) blocks.push(`【当前正文节选】\n${input.chapterExcerpt.trim()}`);
  if (input.userPrompt.trim()) blocks.push(input.userPrompt.trim());
  const content = blocks.join("\n\n").trim() || "(empty)";
  return [{ role: "user", content }];
}

// --- 写作侧栏：与 AiPanel `run()` / 材料预览共用（步 9 / 15）---

export function clampContextText(s: string, maxChars: number): string {
  if (s.length <= maxChars) return s;
  return s.slice(0, Math.max(0, maxChars - 24)) + "\n\n…（已截断）";
}

export type SidepanelRagHit = {
  refTitle: string;
  snippetBefore: string;
  snippetMatch: string;
  snippetAfter: string;
  ordinal: number;
};

export type WritingWorkStyleSlice = {
  pov: string;
  tone: string;
  bannedPhrases: string;
  styleAnchor: string;
  extraRules: string;
  sentenceRhythm?: string;
  punctuationStyle?: string;
  dialogueDensity?: "low" | "medium" | "high";
  emotionStyle?: "cold" | "neutral" | "warm";
  narrativeDistance?: "omniscient" | "limited" | "deep_pov";
};

export type WritingChapterBibleSlice = {
  goalText: string;
  forbidText: string;
  povText: string;
  sceneStance: string;
  /** §11 步 21：本章末主要人物状态备忘 */
  characterStateText: string;
};

export type ChapterBibleFieldKey = keyof WritingChapterBibleSlice;

/** 本章锦囊各字段在 user 上下文中的勾选；缺省为全选 */
export function defaultChapterBibleInjectMask(): Record<ChapterBibleFieldKey, boolean> {
  return {
    goalText: true,
    forbidText: true,
    povText: true,
    sceneStance: true,
    characterStateText: true,
  };
}

export const CHAPTER_BIBLE_FIELD_LABELS: Record<ChapterBibleFieldKey, string> = {
  goalText: "本章目标",
  forbidText: "禁止",
  povText: "视角/口吻",
  sceneStance: "场景状态",
  characterStateText: "本章人物状态",
};

export function applyChapterBibleInjectMask(
  slice: WritingChapterBibleSlice,
  mask?: Partial<Record<ChapterBibleFieldKey, boolean>>,
): WritingChapterBibleSlice {
  const m = { ...defaultChapterBibleInjectMask(), ...mask };
  return {
    goalText: m.goalText ? slice.goalText : "",
    forbidText: m.forbidText ? slice.forbidText : "",
    povText: m.povText ? slice.povText : "",
    sceneStance: m.sceneStance ? slice.sceneStance : "",
    characterStateText: m.characterStateText ? slice.characterStateText : "",
  };
}

export type WritingContextMode = "full" | "summary" | "selection" | "none";

export type WritingSkillMode = "continue" | "outline" | "summarize" | "rewrite" | "draw";

/** 抽卡：取正文末尾，控制单次注入体量 */
export function takeTailText(s: string, maxChars: number): string {
  const t = s.trim();
  if (t.length <= maxChars) return t;
  return t.slice(t.length - maxChars);
}

/** §11 步 18：至少需「本章正文」或「章节概要」其一；云端需对应隐私开关能发出至少一种材料 */
export function validateDrawCardRequest(args: {
  chapterContent: string;
  chapterSummary?: string;
  isCloudProvider: boolean;
  privacy: AiSettings["privacy"];
}): { ok: true } | { ok: false; message: string } {
  const prev = args.chapterContent.trim().length > 0;
  const outline = (args.chapterSummary ?? "").trim().length > 0;
  if (!prev && !outline) {
    return { ok: false, message: "抽卡需要本章已有正文或章节概要（至少填一种）。" };
  }
  const cloud = args.isCloudProvider;
  const p = args.privacy;
  const canSendPrev = !cloud || p.allowChapterContent;
  const canSendOutline = !cloud || p.allowRecentSummaries;
  if (!canSendPrev && prev && !outline) {
    return {
      ok: false,
      message: "云端未允许上传章正文，且当前无章节概要。请在「后端模型配置 → 上传范围」允许当前章正文，或填写章节概要后再抽卡。",
    };
  }
  if (!canSendOutline && outline && !prev) {
    return {
      ok: false,
      message: "云端未允许上传章节概要类内容，且当前无正文可上传。请打开「最近章节概要」上传许可（与当前章概要注入共用），或换本机模型。",
    };
  }
  if (cloud && !((canSendPrev && prev) || (canSendOutline && outline))) {
    return {
      ok: false,
      message: "按当前隐私开关，本章正文与概要均无法上传到云端，无法抽卡。请调整上传范围或换本机模型。",
    };
  }
  return { ok: true };
}

export type WritingLinkedExcerptSlice = { refTitle: string; text: string };

/** 装配器用的笔感样本切片（§11 步 43） */
export type WritingStyleSampleSlice = { title: string; body: string };

/** 装配器用的术语表切片（§11 步 44；与锦囊「术语表」同源） */
export type WritingGlossaryTermSlice = {
  term: string;
  category: "name" | "term" | "dead";
  note: string;
};

/** 材料预览块（可解释性 UI，与真实注入同源计算） */
export type WritingMaterialInjectBlock = {
  id: string;
  title: string;
  chars: number;
  content: string;
  note?: string;
};

export type WritingSidepanelAssembleInput = {
  workStyle: WritingWorkStyleSlice;
  /** 作品标签 → 内部 profile（短文本）；无标签系统时留空 */
  tagProfileText?: string;
  workTitle: string;
  chapterTitle: string;
  storyBackground: string;
  characters: string;
  relations: string;
  chapterBible: WritingChapterBibleSlice;
  skillPresetText: string;
  includeLinkedExcerpts: boolean;
  linkedExcerpts: WritingLinkedExcerptSlice[];
  maxContextChars: number;
  isCloudProvider: boolean;
  privacy: AiSettings["privacy"];
  includeBible: boolean;
  /** 运行前已抓取的全书锦囊 Markdown；未加载可为 "" */
  bibleMarkdown: string;
  recentSummaryText: string;
  includeRecentSummaries: boolean;
  ragEnabled: boolean;
  ragQuery: string;
  ragK: number;
  ragHits: SidepanelRagHit[];
  /** 步 24：多源 RAG（参考库 / 本书锦囊分块 / 本书正文分块） */
  ragSources?: WritingRagSources;
  chapterContent: string;
  chapterSummary?: string;
  selectedText: string;
  currentContextMode: WritingContextMode;
  userHint: string;
  mode: WritingSkillMode;
  /** 用于材料预览标题「最近 N 章」 */
  recentN: number;
  /** 邻章概要：在「最近 N 章」窗口内实际纳入的章数（与勾选一致；缺省与旧行为一致） */
  neighborSummaryIncludedCount?: number;
  /** 笔感参考段落；与「文风锚点」同走 user 上下文块 */
  styleSamples: WritingStyleSampleSlice[];
  /** 全书术语表；云端仅当 `privacy.allowMetadata` 时注入（与作品名/章名同档） */
  glossaryTerms: WritingGlossaryTermSlice[];
  /** 本章锦囊字段子集；缺省全注入 */
  chapterBibleInjectMask?: Partial<Record<ChapterBibleFieldKey, boolean>>;
  /** 全书锦囊 Markdown 板块子集；缺省全注入 */
  workBibleSectionMask?: Record<string, boolean>;

  // --- 以下为 AiPanel 报错缺失的字段 ---
  linkedChapterSummaryText?: string;
  linkedChapterFullText?: string;
  linkedChapterSummaryCount?: number;
  linkedChapterFullCount?: number;
  /** 章纲粘贴（outline 模式下的提纲输入） */
  chapterOutlinePaste?: string;
  /** 本章书斋人物卡（学习模式） */
  chapterStudyCharacterCards?: WritingStudyCharacterCardSlice[];
  /** 本章书斋 NPC 备注（学习模式，npc 来源时） */
  chapterStudyNpcNotes?: string;
  /** 书斋术语挑选模式 */
  studyGlossaryMode?: string;
  /** 书斋术语挑选列表 */
  chapterStudyGlossaryTerms?: WritingGlossaryTermSlice[];
};

/** 装配器用的书斋人物卡切片 */
export type WritingStudyCharacterCardSlice = {
  name: string;
  motivation: string;
  relationships: string;
  voiceNotes: string;
  taboos: string;
};

function writingSidepanelTask(mode: WritingSkillMode, selectedText: string): { task: string; appendSelectedForRewrite: boolean } {
  const task =
    mode === "draw"
      ? "【抽卡 · 无用户提示词】请仅依据上文提供的「章节概要」和/或「前文末尾」，写出一段可直接接在当前叙事后的续写正文（约 200～500 字），有画面感与情节推进。禁止输出提纲、解说、列表或引号外的元话语；只输出正文段落。"
      : mode === "continue"
        ? "请续写本章下一段（约 300～800 字），保持语气一致，承接当前正文末尾。"
        : mode === "outline"
          ? "请给出本章后续 6～10 个要点的场景推进大纲（每条一句）。"
          : mode === "summarize"
            ? "请用 6～10 条要点总结本章已写正文的事实信息（只列事实，不要推测）。"
            : selectedText.trim()
              ? "请在不改变事实与设定的前提下重写所选文本，使其更紧凑更有画面感。输出只给重写后的文本。"
              : "请从正文末尾开始重写最近一段，使其更紧凑更有画面感。输出只给重写后的文本。";
  const appendSelectedForRewrite = mode === "rewrite" && selectedText.trim().length > 0;
  return { task, appendSelectedForRewrite };
}

/** 风格卡 + 标签 profile 行（不含写作助手身份基线），供写作侧栏与问策等复用 */
function appendWorkStyleAndTagProfileLines(
  parts: string[],
  workStyle: WritingWorkStyleSlice,
  tagProfileText?: string,
): void {
  if (workStyle.pov.trim()) parts.push(`叙述视角/人称：${workStyle.pov.trim()}`);
  if (workStyle.tone.trim()) parts.push(`整体调性：${workStyle.tone.trim()}`);
  if (workStyle.sentenceRhythm?.trim()) parts.push(`句节奏：${workStyle.sentenceRhythm.trim()}`);
  if (workStyle.punctuationStyle?.trim()) parts.push(`标点偏好：${workStyle.punctuationStyle.trim()}`);
  if (workStyle.dialogueDensity) {
    const label = workStyle.dialogueDensity === "low" ? "低（以叙述/动作为主）" : workStyle.dialogueDensity === "high" ? "高（对话推动情节）" : "中等";
    parts.push(`对话密度：${label}`);
  }
  if (workStyle.emotionStyle) {
    const label = workStyle.emotionStyle === "cold" ? "冷峻克制（情绪内化，少用形容词）" : workStyle.emotionStyle === "warm" ? "热烈（意象丰富，可适当抒情）" : "适中";
    parts.push(`情绪温度：${label}`);
  }
  if (workStyle.narrativeDistance) {
    const label = workStyle.narrativeDistance === "omniscient" ? "全知叙述" : workStyle.narrativeDistance === "deep_pov" ? "深度视角（紧贴视角人物意识流）" : "第三人称有限视角";
    parts.push(`叙述距离：${label}`);
  }
  if (workStyle.bannedPhrases.trim()) {
    parts.push("禁用词/禁用套话（必须避免）：\n" + workStyle.bannedPhrases.trim());
  }
  if (workStyle.extraRules.trim()) parts.push("额外硬约束：\n" + workStyle.extraRules.trim());
  if (tagProfileText?.trim()) {
    parts.push(
      "作品标签侧写与题材约束（含防串台；若与上文风格卡或本书锦囊冲突，以本书锦囊与风格卡为准）：\n" + tagProfileText.trim(),
    );
  }
}

/**
 * 风格卡 + 标签侧写纯文本块（与写作侧栏 system 中「约束」段同源，不含助手身份基线）。
 * 供推演三分支等 Hub 模块拼入独立任务 system。
 */
export function formatWorkStyleAndTagProfileBlock(
  workStyle: WritingWorkStyleSlice,
  tagProfileText?: string,
): string {
  const parts: string[] = [];
  appendWorkStyleAndTagProfileLines(parts, workStyle, tagProfileText);
  return parts.join("\n");
}

/** system：助手基线 + 风格卡 + 可选标签 profile（§3.5.3：显式风格卡优先，profile 补充） */
export function buildWritingSidepanelSystemContent(input: Pick<WritingSidepanelAssembleInput, "workStyle" | "tagProfileText">): string {
  const sysParts: string[] = [
    "你是一个严谨的中文小说写作助手。你必须遵守用户提供的约束与设定，不要编造设定外事实。",
    "输出要求：中文；尽量具体可执行；不要输出与任务无关的解释。",
    "世界观一致性（底层）：续写、扩写、抽卡须与上文及本书已确立的时代/世界一致。若无正文、锦囊或用户本轮明示，禁止将玄幻/古代/异世界背景擅自写成现代都市日常（或相反）；禁止无铺垫切换主舞台类型。若已选留白标签，须优先满足标签对应的题材与世界观约束。",
  ];
  appendWorkStyleAndTagProfileLines(sysParts, input.workStyle, input.tagProfileText);
  return sysParts.join("\n");
}

/** user 消息里「上下文：」之前的结构化行（不含前缀） */
export function buildWritingSidepanelCtxParts(input: WritingSidepanelAssembleInput): string[] {
  const ctxParts: string[] = [];
  const { isCloudProvider, privacy } = input;
  const chapterBible = applyChapterBibleInjectMask(input.chapterBible, input.chapterBibleInjectMask);
  if (!isCloudProvider || privacy.allowMetadata) {
    ctxParts.push(`作品：${input.workTitle}`);
    ctxParts.push(`章节：${input.chapterTitle}`);
  }
  if (input.workStyle.styleAnchor.trim()) {
    ctxParts.push("文风锚点（尽量贴近其用词/节奏/句法）：\n" + input.workStyle.styleAnchor.trim());
  }
  const sampleBodies = input.styleSamples.filter((s) => (s.body ?? "").trim());
  if (sampleBodies.length > 0) {
    const joined = sampleBodies
      .map((s, i) => {
        const lab = (s.title ?? "").trim() || `样本${i + 1}`;
        return `【${lab}】\n${(s.body ?? "").trim()}`;
      })
      .join("\n\n---\n\n");
    ctxParts.push(
      "笔感样本（仅模仿语气、节奏与句法；勿将样本中的陈述当作本书事实）：\n\n" + joined,
    );
  }
  if (input.storyBackground.trim()) ctxParts.push(`故事背景：\n${input.storyBackground.trim()}`);
  if (input.characters.trim()) ctxParts.push(`角色清单：\n${input.characters.trim()}`);
  if (input.relations.trim()) ctxParts.push(`角色关系：\n${input.relations.trim()}`);
  if (chapterBible.goalText.trim()) ctxParts.push(`本章目标：\n${chapterBible.goalText.trim()}`);
  if (chapterBible.forbidText.trim()) ctxParts.push(`禁止：\n${chapterBible.forbidText.trim()}`);
  if (chapterBible.povText.trim()) ctxParts.push(`视角/口吻：\n${chapterBible.povText.trim()}`);
  if (chapterBible.sceneStance.trim()) ctxParts.push(`场景状态：\n${chapterBible.sceneStance.trim()}`);
  if (chapterBible.characterStateText.trim()) {
    ctxParts.push(`本章人物状态（备忘，可与全书人物卡对照）：\n${chapterBible.characterStateText.trim()}`);
  }
  if (input.skillPresetText) ctxParts.push(input.skillPresetText);

  const canSendGlossary = !isCloudProvider || privacy.allowMetadata;
  if (canSendGlossary) {
    const gloss = [...input.glossaryTerms]
      .filter((g) => (g.term ?? "").trim())
      .sort((a, b) => b.term.length - a.term.length);
    if (gloss.length > 0) {
      const catLab = (c: WritingGlossaryTermSlice["category"]) =>
        c === "name" ? "人名" : c === "dead" ? "已死" : "术语";
      const body = gloss
        .map((g) => {
          const t = g.term.trim();
          const lab = catLab(g.category);
          const n = (g.note ?? "").trim();
          return n ? `- **${t}**（${lab}）\n  备注：${n}` : `- **${t}**（${lab}）`;
        })
        .join("\n");
      ctxParts.push("本书术语表（请与下列写法一致；备注为设定说明）：\n" + body);
    }
  }

  if (
    input.includeLinkedExcerpts &&
    input.linkedExcerpts.length > 0 &&
    (!isCloudProvider || privacy.allowLinkedExcerpts)
  ) {
    const ex = input.linkedExcerpts
      .slice(0, 8)
      .map((e, i) => `【摘录${i + 1}｜${e.refTitle}】\n${e.text}`)
      .join("\n\n");
    ctxParts.push(`参考摘录（与本章关联）：\n${ex}`);
  }
  return ctxParts;
}

/** 拼装发往模型的 user 消息正文（含「任务：」与重写所选附录） */
export function buildWritingSidepanelUserContent(input: WritingSidepanelAssembleInput): string {
  const max = input.maxContextChars;
  const userParts: string[] = [];
  const ctxParts = buildWritingSidepanelCtxParts(input);
  userParts.push("上下文：\n" + clampContextText(ctxParts.join("\n\n"), Math.floor(max * 0.25)));

  const cloud = input.isCloudProvider;
  const p = input.privacy;

  if (input.recentSummaryText.trim() && (!cloud || p.allowRecentSummaries)) {
    userParts.push(
      "最近章节概要（仅供回忆事实）：\n" + clampContextText(input.recentSummaryText, Math.floor(max * 0.2)),
    );
  }

  const bibleRaw = input.bibleMarkdown.trim();
  const bible =
    bibleRaw && input.workBibleSectionMask
      ? filterWorkBibleMarkdownBySections(bibleRaw, input.workBibleSectionMask)
      : bibleRaw;
  if (input.includeBible && bible && (!cloud || p.allowBible)) {
    userParts.push("本书锦囊（如与正文冲突，以锦囊为准）：\n" + clampContextText(bible, Math.floor(max * 0.45)));
  }

  if (input.ragEnabled && input.ragQuery.trim() && (!cloud || p.allowRagSnippets)) {
    const picked = input.ragHits.slice(0, Math.max(0, Math.min(20, input.ragK)));
    if (picked.length > 0) {
      const rs = input.ragSources ?? DEFAULT_WRITING_RAG_SOURCES;
      const srcLbl = [
        rs.referenceLibrary && "参考库",
        rs.workBibleExport && "本书锦囊",
        rs.workManuscript && "本书正文",
      ]
        .filter(Boolean)
        .join("·");
      const s = [
        `（来源：${srcLbl || "参考库"} · query=${input.ragQuery.trim()} · top-k=${picked.length}）`,
        ...picked.map((h, i) => {
          const snippet = `${h.snippetBefore}${h.snippetMatch}${h.snippetAfter}`.trim();
          return `【命中${i + 1}｜${h.refTitle}｜段${h.ordinal + 1}】\n${snippet}`;
        }),
      ].join("\n\n");
      userParts.push(
        "检索片段（参考库 / 本书；仅供引用，不要编造）：\n" + clampContextText(s, Math.floor(max * 0.25)),
      );
    }
  }

  const content = input.chapterContent ?? "";
  if (input.mode === "draw") {
    const summary = (input.chapterSummary ?? "").trim();
    const body = content.trim();
    if (summary && (!cloud || p.allowRecentSummaries)) {
      userParts.push(
        "章节概要（作大纲参考）：\n" + clampContextText(summary, Math.floor(max * 0.22)),
      );
    }
    if (body && (!cloud || p.allowChapterContent)) {
      const tail = takeTailText(body, 50_000);
      userParts.push(
        "本章已写前文（末尾部分，用于承接）：\n" + clampContextText(tail, Math.floor(max * 0.38)),
      );
    }
  } else if (input.currentContextMode === "full" && content.trim() && (!cloud || p.allowChapterContent)) {
    userParts.push("当前正文：\n" + clampContextText(content, Math.floor(max * 0.45)));
  } else if (
    input.currentContextMode === "summary" &&
    (input.chapterSummary ?? "").trim() &&
    (!cloud || p.allowRecentSummaries)
  ) {
    userParts.push(
      "当前章节概要（仅供回忆事实）：\n" +
        clampContextText((input.chapterSummary ?? "").trim(), Math.floor(max * 0.2)),
    );
  } else if (
    input.currentContextMode === "selection" &&
    input.selectedText.trim() &&
    (!cloud || p.allowSelection)
  ) {
    userParts.push("当前选区：\n" + clampContextText(input.selectedText.trim(), Math.floor(max * 0.25)));
  }

  const hint = input.userHint.trim();
  if (hint && input.mode !== "draw") userParts.push("额外要求：\n" + hint);

  const { task, appendSelectedForRewrite } = writingSidepanelTask(input.mode, input.selectedText);
  let out = userParts.join("\n\n") + "\n\n任务：\n" + task;
  if (appendSelectedForRewrite) {
    out += `\n\n所选文本：\n${input.selectedText}`;
  }
  return out;
}

export function buildWritingSidepanelMessages(input: WritingSidepanelAssembleInput): AiChatMessage[] {
  return [
    { role: "system", content: buildWritingSidepanelSystemContent(input) },
    { role: "user", content: buildWritingSidepanelUserContent(input) },
  ];
}

/**
 * 与 {@link buildWritingSidepanelUserContent} 同步的材料块列表（用于侧栏折叠预览字数/内容）。
 * `bibleRawLength`：未截断的锦囊导出长度，用于 note；`bibleMarkdown` 为当前预览文本（可与运行前抓取结果一致）。
 */
export function buildWritingSidepanelInjectBlocks(
  input: WritingSidepanelAssembleInput,
  options?: { bibleRawLength?: number },
): WritingMaterialInjectBlock[] {
  const blocks: WritingMaterialInjectBlock[] = [];
  const max = input.maxContextChars;
  const cloud = input.isCloudProvider;
  const p = input.privacy;

  const ctxParts = buildWritingSidepanelCtxParts(input);
  const ctx = "上下文：\n" + clampContextText(ctxParts.join("\n\n"), Math.floor(max * 0.25));
  blocks.push({ id: "ctx", title: "上下文（作品/章节/变量/本章约束/摘录）", chars: ctx.length, content: ctx });

  if (input.includeRecentSummaries && input.recentSummaryText.trim() && (!cloud || p.allowRecentSummaries)) {
    const s =
      "最近章节概要（仅供回忆事实）：\n" +
      clampContextText(input.recentSummaryText, Math.floor(max * 0.2));
    blocks.push({
      id: "recent",
      title: `最近章节概要（N=${Math.max(0, Math.min(12, input.recentN))}）`,
      chars: s.length,
      content: s,
    });
  }

  if (input.includeBible) {
    const raw = input.bibleMarkdown.trim();
    const filtered =
      raw && input.workBibleSectionMask ? filterWorkBibleMarkdownBySections(raw, input.workBibleSectionMask) : raw;
    const shown = filtered
      ? "本书锦囊（如与正文冲突，以锦囊为准）：\n" + clampContextText(filtered, Math.floor(max * 0.45))
      : raw
        ? "本书锦囊（如与正文冲突，以锦囊为准）：\n（当前板块勾选下无内容；请勾选板块或刷新预览）"
        : "本书锦囊（如与正文冲突，以锦囊为准）：\n（预览未加载；运行时会抓取并按上限截断）";
    const rawLen = options?.bibleRawLength ?? (raw ? raw.length : 0);
    blocks.push({
      id: "bible",
      title: "本书锦囊（导出 Markdown）",
      chars: shown.length,
      content: shown,
      note: raw ? `预览已加载：${rawLen.toLocaleString()} 字` : undefined,
    });
  }

  if (input.ragEnabled) {
    if (cloud && !p.allowRagSnippets) {
      blocks.push({
        id: "rag",
        title: "RAG：检索片段注入",
        chars: 0,
        content: "（云端未允许上传检索片段）",
      });
    } else {
      const key = input.ragQuery.trim();
      const picked = input.ragHits.slice(0, Math.max(0, Math.min(20, input.ragK)));
      const rs = input.ragSources ?? DEFAULT_WRITING_RAG_SOURCES;
      const srcLbl = [rs.referenceLibrary && "参考库", rs.workBibleExport && "本书锦囊", rs.workManuscript && "本书正文"]
        .filter(Boolean)
        .join("·");
      const s = key
        ? picked.length > 0
          ? [
              `（来源：${srcLbl || "参考库"} · top-k=${picked.length} · query=${key}）`,
              ...picked.map((h, i) => {
                const snippet = `${h.snippetBefore}${h.snippetMatch}${h.snippetAfter}`.trim();
                return `【命中${i + 1}｜${h.refTitle}｜段${h.ordinal + 1}】\n${snippet}`;
              }),
            ].join("\n\n")
          : `检索（query=${key}）：（暂无命中）`
        : "检索：（未设置 query）";
      blocks.push({ id: "rag", title: "RAG：检索片段（参考库 / 本书）", chars: s.length, content: s });
    }
  }

  const content = input.chapterContent ?? "";
  if (input.mode === "draw") {
    const summary = (input.chapterSummary ?? "").trim();
    const body = content.trim();
    let any = false;
    if (summary && (!cloud || p.allowRecentSummaries)) {
      const s = "抽卡 · 章节概要（大纲参考）：\n" + clampContextText(summary, Math.floor(max * 0.22));
      blocks.push({ id: "draw-out", title: "抽卡：章节概要", chars: s.length, content: s });
      any = true;
    }
    if (body && (!cloud || p.allowChapterContent)) {
      const tail = takeTailText(body, 50_000);
      const s = "抽卡 · 前文末尾：\n" + clampContextText(tail, Math.floor(max * 0.38));
      blocks.push({ id: "draw-prev", title: "抽卡：前文末尾", chars: s.length, content: s });
      any = true;
    }
    if (!any) {
      blocks.push({ id: "cur", title: "抽卡", chars: 0, content: "（无可用概要或前文）" });
    }
  } else if (input.currentContextMode === "full" && content.trim() && (!cloud || p.allowChapterContent)) {
    const s = "当前正文：\n" + clampContextText(content, Math.floor(max * 0.45));
    blocks.push({ id: "cur", title: "当前章注入：全文", chars: s.length, content: s });
  } else if (
    input.currentContextMode === "summary" &&
    (input.chapterSummary ?? "").trim() &&
    (!cloud || p.allowRecentSummaries)
  ) {
    const s =
      "当前章节概要（仅供回忆事实）：\n" +
      clampContextText((input.chapterSummary ?? "").trim(), Math.floor(max * 0.2));
    blocks.push({ id: "cur", title: "当前章注入：概要", chars: s.length, content: s });
  } else if (
    input.currentContextMode === "selection" &&
    input.selectedText.trim() &&
    (!cloud || p.allowSelection)
  ) {
    const s = "当前选区：\n" + clampContextText(input.selectedText.trim(), Math.floor(max * 0.25));
    blocks.push({ id: "cur", title: "当前章注入：选区", chars: s.length, content: s });
  } else if (input.currentContextMode === "none") {
    blocks.push({ id: "cur", title: "当前章注入：不注入", chars: 0, content: "（不注入当前章内容）" });
  } else {
    blocks.push({ id: "cur", title: "当前章注入：空", chars: 0, content: "（当前选择的注入来源为空）" });
  }

  const hint = input.userHint.trim();
  if (hint && input.mode !== "draw") {
    const s = "额外要求：\n" + hint;
    blocks.push({ id: "hint", title: "额外要求", chars: s.length, content: s });
  }

  return blocks;
}

export type WritingMaterialsSummaryParams = {
  workTitle: string;
  chapterTitle: string;
  providerLabel: string;
  modelId: string;
  workStyle: WritingWorkStyleSlice;
  chapterBible: WritingChapterBibleSlice;
  includeBible: boolean;
  isCloudProvider: boolean;
  privacy: AiSettings["privacy"];
  includeLinkedExcerpts: boolean;
  linkedExcerptCount: number;
  includeRecentSummaries: boolean;
  recentN: number;
  currentContextMode: WritingContextMode;
  skillMode: WritingSkillMode;
  ragEnabled: boolean;
  ragQuery: string;
  ragK: number;
  ragSources?: WritingRagSources;
  tagProfileText?: string;
  /** 规范化后的留白标签个数；与 `tagProfileText` 同源，供简版列表展示 */
  tagCount?: number;
  /** 非空正文的笔感样本条数 */
  styleSampleCount?: number;
  /** 非空词条数（锦囊术语表） */
  glossaryTermCount?: number;
  /** 「最近 N 章」窗口内有概要的章数 */
  neighborSummaryPoolCount?: number;
  /** 本请求实际纳入的邻章概要数（勾选子集） */
  neighborSummaryIncludedCount?: number;
  /** 本章锦囊字段勾选（与装配器一致） */
  chapterBibleInjectMask?: Partial<Record<ChapterBibleFieldKey, boolean>>;
  /** 全书锦囊板块勾选 */
  workBibleSectionMask?: Record<string, boolean>;
  approxInjectChars: number;
  approxInjectTokens: number;
  /** 书斋人物卡数量 */
  studyCharacterCardCount?: number;
  /** 书斋人物来源 */
  studyCharacterSource?: string;
  /** 书斋 NPC 备注字符数 */
  studyNpcNoteChars?: number;
  /** 书斋术语挑选模式 */
  studyGlossaryMode?: string;
  /** 书斋术语挑选数量 */
  studyGlossaryPickCount?: number;
};

export function buildWritingSidepanelMaterialsSummaryLines(p: WritingMaterialsSummaryParams): string[] {
  const lines: string[] = [];
  lines.push(`作品《${p.workTitle}》· 章节「${p.chapterTitle}」`);
  lines.push(`提供方 ${p.providerLabel} · 模型 ${p.modelId.trim() || "（未填模型 ID）"}`);

  const ws = p.workStyle;
  const styleFilled = [ws.pov, ws.tone, ws.bannedPhrases, ws.styleAnchor, ws.extraRules].filter((x) => (x ?? "").trim()).length;
  lines.push(`风格卡：已填 ${styleFilled}/5 项（经 system 注入）`);
  const sc = p.styleSampleCount ?? 0;
  lines.push(`笔感样本：${sc > 0 ? `${sc} 条（user 上下文，与文风锚点相邻）` : "无"}`);

  const cloud = p.isCloudProvider;
  const pr = p.privacy;

  const gc = p.glossaryTermCount ?? 0;
  if (gc <= 0) {
    lines.push("术语表：无");
  } else if (cloud && !pr.allowMetadata) {
    lines.push(`术语表：${gc} 条（云端已关「元数据」，请求中不注入）`);
  } else {
    lines.push(`术语表：${gc} 条（user 上下文，本章约束之后）`);
  }

  const cbFilled = [
    p.chapterBible.goalText,
    p.chapterBible.forbidText,
    p.chapterBible.povText,
    p.chapterBible.sceneStance,
    p.chapterBible.characterStateText,
  ].filter((x) => (x ?? "").trim()).length;
  const mcb = { ...defaultChapterBibleInjectMask(), ...p.chapterBibleInjectMask };
  const cbInject = (
    [
      ["goalText", p.chapterBible.goalText],
      ["forbidText", p.chapterBible.forbidText],
      ["povText", p.chapterBible.povText],
      ["sceneStance", p.chapterBible.sceneStance],
      ["characterStateText", p.chapterBible.characterStateText],
    ] as const
  ).filter(([k, v]) => mcb[k] && (v ?? "").trim()).length;
  lines.push(`本章锦囊块：已填 ${cbFilled}/5；本请求注入其中 ${cbInject} 项（含人物状态备忘）`);
  const bibleOn = p.includeBible;
  const wMask = p.workBibleSectionMask;
  const wTotal = Object.keys(defaultWorkBibleSectionMask()).length;
  const wOn =
    wMask && bibleOn
      ? Object.values({ ...defaultWorkBibleSectionMask(), ...wMask }).filter(Boolean).length
      : bibleOn
        ? wTotal
        : 0;
  lines.push(
    `全书锦囊：${bibleOn ? `注入 · 板块 ${wOn}/${wTotal}` : "不注入"}` +
      (cloud && bibleOn ? `（云端${pr.allowBible ? "允许" : "禁止"}）` : ""),
  );
  lines.push(
    `关联摘录：${p.includeLinkedExcerpts ? `注入 · 本章关联 ${p.linkedExcerptCount} 条` : "不注入"}` +
      (cloud && p.includeLinkedExcerpts ? `（云端${pr.allowLinkedExcerpts ? "允许" : "禁止"}）` : ""),
  );
  const nMax = Math.max(0, Math.min(12, p.recentN));
  const pool = p.neighborSummaryPoolCount;
  const inc = p.neighborSummaryIncludedCount;
  const neighborLab =
    p.includeRecentSummaries && pool != null && inc != null
      ? `注入 · 窗口 ${nMax} 章 · 本请求含 ${inc}/${pool} 章概要`
      : p.includeRecentSummaries
        ? `注入 · 最近 ${nMax} 章`
        : "不注入";
  lines.push(
    `最近章节概要：${neighborLab}` +
      (cloud && p.includeRecentSummaries ? `（云端${pr.allowRecentSummaries ? "允许" : "禁止"}）` : ""),
  );

  if (p.skillMode === "draw") {
    lines.push("技能：**抽卡**（无额外提示词；注入章节概要 +/或 前文末尾，与「当前章注入」下拉独立）");
    lines.push("当前章内容：抽卡专用块（概要/前文尾，至少一种可上传时生效）");
  } else {
    const modeLab =
      p.currentContextMode === "full"
        ? "全文"
        : p.currentContextMode === "summary"
          ? "概要"
          : p.currentContextMode === "selection"
            ? "选区"
            : "不注入";
    lines.push(`当前章内容：${modeLab}` + (cloud && p.currentContextMode !== "none" ? `（云端正文/选区依隐私开关）` : ""));
  }

  if (p.ragEnabled) {
    const q = p.ragQuery.trim();
    const shortQ = q.length > 28 ? q.slice(0, 28) + "..." : q || "（空 query）";
    const ragKClamped = Math.max(0, Math.min(20, p.ragK));
    const rs = p.ragSources ?? DEFAULT_WRITING_RAG_SOURCES;
    const srcLbl = [rs.referenceLibrary && "参考库", rs.workBibleExport && "本书锦囊", rs.workManuscript && "本书正文"]
      .filter(Boolean)
      .join("·");
    lines.push(
      `检索 RAG：开 · ${srcLbl || "参考库"} · ${shortQ} · top-k ${ragKClamped}` +
        (cloud ? `（云端${pr.allowRagSnippets ? "允许" : "禁止"}）` : ""),
    );
  } else {
    lines.push("检索 RAG：关");
  }

  if (cloud) {
    lines.push(
      `云端上传摘要：元数据 ${pr.allowMetadata ? "开" : "关"} · 章正文 ${pr.allowChapterContent ? "开" : "关"} · 选区 ${pr.allowSelection ? "开" : "关"}`,
    );
  }

  const tag = (p.tagProfileText ?? "").trim();
  const tagN = typeof p.tagCount === "number" ? p.tagCount : tag ? tag.split("\n").length : 0;
  lines.push(
    tag
      ? `留白标签：${tagN} 个 → 装配器已注入侧写（${tag.length.toLocaleString()} 字；简版不展开，与 system「作品标签侧写」一致）`
      : "留白标签：暂无 → 装配器无标签侧写",
  );

  lines.push(`粗估规模：约 ${p.approxInjectChars.toLocaleString()} 字 / ≈ ${p.approxInjectTokens.toLocaleString()} tokens`);
  return lines;
}

// --- §11 步 46：问策（开放式策略/重塑咨询；定纲改纲在「推演」）---

const WENCE_CHAT_ROLE_BASE = [
  "你是留白写作的「问策」助手，面向中文长篇与同人创作的策略咨询、重塑式讨论与创作方法建议。",
  "模块分工：若用户要迭代全书/卷纲、细纲定稿与文策流水，应到「推演」模块；本对话不替代推演内的改纲流程。你可讨论节奏、钩子、人设弧光、矛盾设计、结构拆解与平台向技巧等。",
  "虚构创作边界：不协助侵权或洗稿；不使用可识别真人作家的营销式仿名话术。",
  "回复用中文，条理清晰，必要时给出可执行的要点或小练习。",
].join("\n");

/** 关联作品时注入 system 的切片（书名、风格卡、标签侧写、可选设定索引） */
export type WenceChatWorkAttach = {
  workTitle: string;
  workStyle: WritingWorkStyleSlice;
  tagProfileText?: string;
  /** 人物/世界观/术语名录等短文本；非正文 */
  settingIndexText?: string;
};

/**
 * 问策页多轮请求的 system 内容。未关联作品时仅为角色与分工说明；关联作品时追加风格卡、标签侧写与书名。
 */
export function buildWenceChatSystemContent(attached: WenceChatWorkAttach | null): string {
  const parts: string[] = [WENCE_CHAT_ROLE_BASE];
  if (!attached) return parts.join("\n\n");
  appendWorkStyleAndTagProfileLines(parts, attached.workStyle, attached.tagProfileText);
  parts.push(`当前关联作品：${attached.workTitle}`);
  if (attached.settingIndexText?.trim()) {
    parts.push(
      "设定索引（仅名录与短说明，非正文；请勿将索引当作已写剧情事实）：\n" +
        clampContextText(attached.settingIndexText.trim(), 12_000),
    );
  }
  return parts.join("\n\n");
}

/** 组装发往模型的消息列表（单条 system + 用户与助手交替） */
export function buildWenceChatApiMessages(systemContent: string, turns: AiChatMessage[]): AiChatMessage[] {
  return [{ role: "system", content: systemContent }, ...turns];
}
