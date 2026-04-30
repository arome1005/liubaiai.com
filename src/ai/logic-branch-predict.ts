import type { TuiyanImitationMode } from "../db/types";
import { logTuiyanReferenceTouchpoint } from "../util/tuiyan-reference-dev-log";
import { formatWorkStyleAndTagProfileBlock, type WritingWorkStyleSlice } from "./assemble-context";
import { mergeTuiyanPlanningSystemWithReferenceHardRules } from "./tuiyan-reference-planning-system";
import { generateWithProvider } from "./client";
import { isLocalAiProvider, requiresClientSavedApiKey } from "./local-provider";
import { getProviderConfig, loadAiSettings } from "./storage";
import type { AiChatMessage, AiSettings } from "./types";

const MAX_BODY_CHARS = 12000;

const SYSTEM_PROMPT = `你是小说情节推演助手。根据用户给出的章节语境，构思**三种不同、可继续写下去的剧情走向**。
要求：
- 三种走向应有明显差异（节奏、冲突点或人物反应至少一处不同），但不要与已有正文事实矛盾。
- 输出**必须**严格使用下列分隔格式，不要开场白、不要 Markdown 标题符号：
<<<1>>>
标题：（单行，不超过 24 字）
走向：（2～5 句中文）
<<<2>>>
标题：
走向：
<<<3>>>
标题：
走向：
`;

export class LogicBranchPredictError extends Error {
  override readonly name = "LogicBranchPredictError";
  constructor(message: string) {
    super(message);
  }
}

function assertCanSendLogicBranch(settings: AiSettings): void {
  const cloud = !isLocalAiProvider(settings.provider);
  if (!cloud) return;
  if (!settings.privacy.consentAccepted || !settings.privacy.allowCloudProviders) {
    throw new LogicBranchPredictError("请先在设置中同意云端 AI 并允许调用。");
  }
  if (!settings.privacy.allowMetadata) {
    throw new LogicBranchPredictError("推演需上传书名与章节名，请在隐私设置中允许作品元数据。");
  }
  if (!settings.privacy.allowChapterContent) {
    throw new LogicBranchPredictError("三分支预测需上传本章正文节选，请在隐私设置中允许章节正文。");
  }
}

function parseThreeBranches(raw: string): { title: string; summary: string }[] {
  const text = raw.trim();
  const out: { title: string; summary: string }[] = [];
  for (const n of [1, 2, 3] as const) {
    const re = new RegExp(
      `<<<${n}>>>\\s*标题：\\s*([^\\n]+)\\s*走向：\\s*([\\s\\S]*?)(?=<<<[123]>>>|$)`,
      "m",
    );
    const m = text.match(re);
    if (m) {
      out.push({ title: m[1]!.trim(), summary: m[2]!.trim() });
    }
  }
  if (out.length === 3) return out;

  const alt: { title: string; summary: string }[] = [];
  for (const marker of ["一", "二", "三"] as const) {
    const re = new RegExp(
      `【分支${marker}】\\s*标题：\\s*([^\\n]+)\\s*走向：\\s*([\\s\\S]*?)(?=【分支|$)`,
      "m",
    );
    const m = text.match(re);
    if (m) alt.push({ title: m[1]!.trim(), summary: m[2]!.trim() });
  }
  if (alt.length === 3) return alt;
  return out.length >= alt.length ? out : alt;
}

/**
 * §11 步 33：三分支预测（模板 + LLM），结果可粘贴到写作侧栏草稿（由用户自行复制）。
 */
export async function generateLogicThreeBranches(args: {
  workTitle: string;
  chapterTitle: string;
  chapterSummary: string;
  chapterContent: string;
  userHint: string;
  /** 与写作侧栏同源：全书风格卡（步 10 / 装配器） */
  workStyle?: WritingWorkStyleSlice;
  /** 与写作侧栏同源：留白标签 → 侧写（可选） */
  tagProfileText?: string;
  /** 与参考 Tab 全局 `imitationMode` 一致；`userHint` 含参考策略时追加分模式 system 段 */
  imitationMode?: TuiyanImitationMode;
  settings?: AiSettings;
  signal?: AbortSignal;
}): Promise<{ branches: { title: string; summary: string }[]; rawText: string }> {
  const settings = args.settings ?? loadAiSettings();
  assertCanSendLogicBranch(settings);
  const cfg = getProviderConfig(settings, settings.provider);
  if (requiresClientSavedApiKey(settings.provider) && !cfg.apiKey?.trim()) {
    throw new LogicBranchPredictError("请先在设置中填写当前模型的 API Key。");
  }
  const body = args.chapterContent.trim();
  if (!body) {
    throw new LogicBranchPredictError("本章暂无正文，可先写一段再接续推演。");
  }
  const excerpt = body.length <= MAX_BODY_CHARS ? body : body.slice(-MAX_BODY_CHARS);
  const hint = (args.userHint ?? "").trim();
  logTuiyanReferenceTouchpoint("logic_three_branch:userHint", hint, {
    chapterChars: body.length,
  });
  const emptyStyle: WritingWorkStyleSlice = {
    pov: "",
    tone: "",
    bannedPhrases: "",
    styleAnchor: "",
    extraRules: "",
  };
  const ws = args.workStyle ?? emptyStyle;
  const constraintBlock = formatWorkStyleAndTagProfileBlock(ws, args.tagProfileText);
  let systemContent = SYSTEM_PROMPT;
  if (constraintBlock.trim()) {
    systemContent =
      SYSTEM_PROMPT +
      "\n\n【写作约束（与写作侧栏装配器同源；请与下列正文一并遵守）】\n" +
      constraintBlock.trim();
  }
  systemContent = mergeTuiyanPlanningSystemWithReferenceHardRules(systemContent, hint, {
    imitationMode: args.imitationMode,
  });
  const anchor = ws.styleAnchor.trim();
  const user =
    `书名：${args.workTitle}\n章节：${args.chapterTitle}\n` +
    (args.chapterSummary.trim() ? `章节概要：${args.chapterSummary.trim()}\n\n` : "\n") +
    (anchor ? `文风锚点（尽量贴近其用词/节奏/句法）：\n${anchor}\n\n` : "") +
    (hint ? `作者倾向（可空）：${hint}\n\n` : "") +
    `下列为正文节选（章末优先）：\n\n${excerpt}`;
  const messages: AiChatMessage[] = [
    { role: "system", content: systemContent },
    { role: "user", content: user },
  ];
  const r = await generateWithProvider({
    provider: settings.provider,
    config: cfg,
    messages,
    temperature: Math.min(1.2, Math.max(0.3, settings.geminiTemperature)),
    signal: args.signal,
  });
  const rawText = (r.text ?? "").trim();
  if (!rawText) {
    throw new LogicBranchPredictError("模型返回为空，请重试或更换模型。");
  }
  let branches = parseThreeBranches(rawText);
  if (branches.length < 3) {
    const clip = rawText.length > 12000 ? rawText.slice(0, 12000) + "\n…（已截断）" : rawText;
    branches = [
      {
        title: "（格式未识别）",
        summary: `模型未按约定返回 <<<1>>>/<<<2>>>/<<<3>>> 或【分支一】…【分支三】。以下为原文节选，可复制到写作侧栏草稿使用。\n\n${clip}`,
      },
      { title: "建议", summary: "可更换模型、缩短正文后重试，或在设置中调高温度略增发散性。" },
      { title: "期望格式", summary: "见系统提示中的分隔符与「标题：」「走向：」模板。" },
    ];
  }
  return { branches: branches.slice(0, 3), rawText };
}
