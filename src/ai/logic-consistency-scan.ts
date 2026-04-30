import { generateWithProvider } from "./client";
import { isLocalAiProvider, requiresClientSavedApiKey } from "./local-provider";
import { getProviderConfig, loadAiSettings } from "./storage";
import type { AiChatMessage, AiSettings } from "./types";

const MAX_CHAPTERS = 12;
const MAX_EXCERPT_CHARS_PER_CHAPTER = 2200;

export type LogicConsistencyScanFinding = {
  severity: "warn" | "info";
  kind: "contradiction" | "timeline" | "character" | "setting" | "style" | "unknown";
  title: string;
  description: string;
  /** 受影响章节（章节 id 列表）；至少 1 个 */
  chapterIds: string[];
  /** 证据片段（可空） */
  evidence?: string;
  /** 建议（可空） */
  suggestion?: string;
};

export class LogicConsistencyScanError extends Error {
  override readonly name = "LogicConsistencyScanError";
  constructor(message: string) {
    super(message);
  }
}

function assertCanSendLogicScan(settings: AiSettings): void {
  const cloud = !isLocalAiProvider(settings.provider);
  if (!cloud) return;
  if (!settings.privacy.consentAccepted || !settings.privacy.allowCloudProviders) {
    throw new LogicConsistencyScanError("请先在设置中同意云端 AI 并允许调用。");
  }
  if (!settings.privacy.allowMetadata) {
    throw new LogicConsistencyScanError("推演扫描需上传书名与章节名，请在隐私设置中允许作品元数据。");
  }
  if (!settings.privacy.allowChapterContent) {
    throw new LogicConsistencyScanError("推演扫描需上传章节正文节选，请在隐私设置中允许章节正文。");
  }
}

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function asString(x: unknown): string {
  return typeof x === "string" ? x : "";
}

function clampText(s: string, n: number): string {
  const t = s.trim();
  if (t.length <= n) return t;
  return t.slice(0, n) + "…";
}

function normalizeFindings(raw: unknown, chapterIdSet: Set<string>): LogicConsistencyScanFinding[] {
  if (!Array.isArray(raw)) return [];
  const out: LogicConsistencyScanFinding[] = [];
  for (const it of raw) {
    if (typeof it !== "object" || it == null) continue;
    const o = it as Record<string, unknown>;
    const severity = o.severity === "warn" || o.severity === "info" ? o.severity : "warn";
    const kind =
      o.kind === "contradiction" ||
      o.kind === "timeline" ||
      o.kind === "character" ||
      o.kind === "setting" ||
      o.kind === "style" ||
      o.kind === "unknown"
        ? o.kind
        : "unknown";
    const title = clampText(asString(o.title) || "（未命名）", 60);
    const description = clampText(asString(o.description) || "", 600);
    const evidence = clampText(asString(o.evidence) || "", 500);
    const suggestion = clampText(asString(o.suggestion) || "", 500);
    const chapterIdsRaw = o.chapterIds;
    const chapterIds =
      Array.isArray(chapterIdsRaw)
        ? chapterIdsRaw.filter((x): x is string => typeof x === "string" && chapterIdSet.has(x))
        : [];
    if (!description.trim()) continue;
    out.push({
      severity,
      kind,
      title,
      description,
      chapterIds: chapterIds.length ? chapterIds : [],
      ...(evidence.trim() ? { evidence } : {}),
      ...(suggestion.trim() ? { suggestion } : {}),
    });
  }
  // 兜底：至少绑定 1 个章，便于 UI 定位
  return out.map((f) => (f.chapterIds.length ? f : { ...f, chapterIds: [] }));
}

export async function generateLogicConsistencyFindings(args: {
  workTitle: string;
  /** 扫描的章节（按 order 升序）；会在内部截断到 MAX_CHAPTERS */
  chapters: { id: string; title: string; order: number; summary?: string; content: string }[];
  /** 可选：全书风格卡禁用套话等约束（不必全量） */
  styleBannedPhrases?: string;
  settings?: AiSettings;
  signal?: AbortSignal;
}): Promise<{ findings: LogicConsistencyScanFinding[]; rawText: string }> {
  const settings = args.settings ?? loadAiSettings();
  assertCanSendLogicScan(settings);
  const cfg = getProviderConfig(settings, settings.provider);
  if (requiresClientSavedApiKey(settings.provider) && !cfg.apiKey?.trim()) {
    throw new LogicConsistencyScanError("请先在设置中填写当前模型的 API Key。");
  }

  const chapters = [...args.chapters].sort((a, b) => a.order - b.order).slice(0, MAX_CHAPTERS);
  if (chapters.length === 0) {
    throw new LogicConsistencyScanError("未选择任何章节，无法扫描。");
  }
  const chapterIdSet = new Set(chapters.map((c) => c.id));
  const packed = chapters.map((c) => {
    const body = (c.content ?? "").trim();
    const excerpt = body.length <= MAX_EXCERPT_CHARS_PER_CHAPTER ? body : body.slice(-MAX_EXCERPT_CHARS_PER_CHAPTER);
    return {
      id: c.id,
      order: c.order,
      title: c.title,
      summary: (c.summary ?? "").trim(),
      excerpt,
    };
  });
  if (!packed.some((c) => c.excerpt.trim())) {
    throw new LogicConsistencyScanError("所选章节均无正文，无法扫描。");
  }

  const constraint = (args.styleBannedPhrases ?? "").trim();
  const system = [
    "你是小说编辑与一致性审校员。你的任务是：在给出的多章正文节选与概要中，找出「语义矛盾 / 设定冲突 / 时间线不一致 / 人物关系前后不一致 / 风格约束违背」等问题。",
    "要求：",
    "- 只基于提供内容，不要编造未出现的事实。",
    "- 输出必须是 JSON 数组，数组元素为对象，字段：severity(kind: 'warn'|'info'), kind, title, description, chapterIds, evidence, suggestion。",
    "- chapterIds 必须是所给章节 id 的子集；尽量指出涉及的 1~3 个章节。",
    "- evidence 用原文片段或简短转述（不超过 2~3 句）。",
    "- 不要输出 Markdown，不要输出代码块围栏。",
  ].join("\n");

  const userLines: string[] = [];
  userLines.push(`书名：${args.workTitle || "未命名"}`);
  if (constraint) {
    userLines.push("");
    userLines.push("【风格卡·禁用套话（若出现请提示）】");
    userLines.push(clampText(constraint, 1200));
  }
  userLines.push("");
  userLines.push("【章节数据】");
  for (const c of packed) {
    userLines.push("");
    userLines.push(`- id: ${c.id}`);
    userLines.push(`  order: ${c.order}`);
    userLines.push(`  title: ${c.title}`);
    if (c.summary) userLines.push(`  summary: ${clampText(c.summary, 240)}`);
    userLines.push("  excerpt:");
    userLines.push(clampText(c.excerpt, MAX_EXCERPT_CHARS_PER_CHAPTER));
  }

  const messages: AiChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: userLines.join("\n") },
  ];

  const r = await generateWithProvider({
    provider: settings.provider,
    config: cfg,
    messages,
    temperature: 0.2,
    signal: args.signal,
  });
  const rawText = (r.text ?? "").trim();
  if (!rawText) throw new LogicConsistencyScanError("模型返回为空，请重试或更换模型。");

  const json = safeJsonParse(rawText);
  const findings = normalizeFindings(json, chapterIdSet);
  if (findings.length === 0) {
    // 允许模型返回"空数组"，但如果不是合法 JSON，给可读错误
    if (json == null) {
      const clip = rawText.length > 6000 ? rawText.slice(0, 6000) + "\n…（已截断）" : rawText;
      throw new LogicConsistencyScanError(`扫描结果未能解析为 JSON 数组。请重试或更换模型。\n\n原文：\n${clip}`);
    }
  }
  return { findings, rawText };
}

