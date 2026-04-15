import { generateWithProvider } from "./client";
import { isLocalAiProvider } from "./local-provider";
import { getProviderConfig, loadAiSettings } from "./storage";
import type { AiChatMessage, AiSettings } from "./types";
import { approxTotalTokensForMessages } from "../util/ai-injection-confirm";

const MAX_FRAGMENT_CHARS = 8000;

const SYSTEM_PROMPT = `你是小说创作助手。用户会给出一条简短的「灵感碎片」，请你从**五个不同角度**分别扩写、延展或改写，便于作者挑选保存。
要求：
- 五段应彼此区分明显（视角、体裁感、冲突点、时间线或情绪至少一处不同），不要简单同义复述。
- 每段 2～8 句中文，自成一体，不要编号列表套娃。
- 输出**必须**严格使用下列分隔格式，不要开场白、不要 Markdown 标题：
<<<1>>>
（第一段扩写正文）
<<<2>>>
（第二段）
<<<3>>>
<<<4>>>
<<<5>>>
`;

export class InspirationExpandError extends Error {
  override readonly name = "InspirationExpandError";
  constructor(message: string) {
    super(message);
  }
}

function assertCanSendInspirationExpand(settings: AiSettings): void {
  const cloud = !isLocalAiProvider(settings.provider);
  if (!cloud) return;
  if (!settings.privacy.consentAccepted || !settings.privacy.allowCloudProviders) {
    throw new InspirationExpandError("请先在设置中同意云端 AI 并允许调用。");
  }
  if (!settings.privacy.allowChapterContent) {
    throw new InspirationExpandError(
      "流光 AI 扩容需将碎片正文上传至模型，请在隐私设置中允许章节正文（创作内容上云）。",
    );
  }
}

/**
 * 与 {@link generateInspirationFiveExpansions} 实际发送内容一致（用于粗估与确认门控）。
 */
export function buildInspirationExpandChatMessages(args: {
  fragmentBody: string;
  tags?: string[];
  workTitle?: string;
  userHint?: string;
  settings?: AiSettings;
}): AiChatMessage[] {
  const settings = args.settings ?? loadAiSettings();
  assertCanSendInspirationExpand(settings);
  const body = args.fragmentBody.trim();
  if (!body) {
    throw new InspirationExpandError("碎片正文为空，无法扩容。");
  }
  const excerpt = body.length <= MAX_FRAGMENT_CHARS ? body : body.slice(0, MAX_FRAGMENT_CHARS);
  const metaOk = settings.privacy.allowMetadata;
  const workLine =
    metaOk && args.workTitle?.trim() ? `所属作品：${args.workTitle.trim()}\n\n` : "";
  const tagLine =
    args.tags && args.tags.length > 0 ? `标签：${args.tags.join("、")}\n\n` : "";
  const hint = (args.userHint ?? "").trim();
  const user =
    workLine +
    tagLine +
    `下列为灵感碎片，请生成五段扩写：\n\n${excerpt}` +
    (hint ? `\n\n作者补充说明（可忽略若与扩写无关）：${hint}` : "");
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: user },
  ];
}

/** 五段扩写输出体量粗估（非计费；略保守以便阈值门控）。 */
export const INSPIRATION_EXPAND_OUTPUT_ESTIMATE_TOKENS = 2400;

export type InspirationExpandRoughEstimate = {
  inputApprox: number;
  outputEstimateApprox: number;
  totalApprox: number;
};

/** §11 步 37 后续：与生辉 {@link estimateShengHuiRoughTokens} 同口径（输入 messages + 输出预留）。 */
export function estimateInspirationExpandRoughTokens(
  messages: AiChatMessage[],
): InspirationExpandRoughEstimate {
  const inputApprox = approxTotalTokensForMessages(messages);
  return {
    inputApprox,
    outputEstimateApprox: INSPIRATION_EXPAND_OUTPUT_ESTIMATE_TOKENS,
    totalApprox: inputApprox + INSPIRATION_EXPAND_OUTPUT_ESTIMATE_TOKENS,
  };
}

function parseFiveSegments(raw: string): string[] {
  const text = raw.trim();
  const out: string[] = [];
  for (let n = 1; n <= 5; n++) {
    const re = new RegExp(`<<<${n}>>>\\s*([\\s\\S]*?)(?=<<<[1-5]>>>|$)`, "m");
    const m = text.match(re);
    if (m) out.push(m[1]!.trim());
  }
  if (out.length === 5) return out;

  const alt: string[] = [];
  for (const ch of ["一", "二", "三", "四", "五"] as const) {
    const re = new RegExp(`【候选${ch}】\\s*([\\s\\S]*?)(?=【候选|$)`, "m");
    const m = text.match(re);
    if (m) alt.push(m[1]!.trim());
  }
  return out.length >= alt.length ? out : alt;
}

function fallbackFive(raw: string): string[] {
  const clip = raw.length > 8000 ? `${raw.slice(0, 8000)}\n…（已截断）` : raw;
  return [
    clip.trim() || "（模型无输出）",
    "模型未按约定返回 <<<1>>>…<<<5>>> 或【候选一】…【候选五】。可将上一段拆成多条碎片手动保存。",
    "建议：更换模型、缩短原文，或在设置中略调高温度后重试。",
    "说明：扩容会消耗 token；关闭面板后原碎片不受影响。",
    "期望格式见系统提示中的分隔符模板。",
  ];
}

/**
 * §11 步 37：单条碎片生成五段扩写候选，供用户逐条存为新碎片。
 */
export async function generateInspirationFiveExpansions(args: {
  fragmentBody: string;
  tags?: string[];
  workTitle?: string;
  userHint?: string;
  settings?: AiSettings;
  signal?: AbortSignal;
}): Promise<{ segments: string[]; rawText: string }> {
  const settings = args.settings ?? loadAiSettings();
  const messages = buildInspirationExpandChatMessages({
    fragmentBody: args.fragmentBody,
    tags: args.tags,
    workTitle: args.workTitle,
    userHint: args.userHint,
    settings,
  });
  const cfg = getProviderConfig(settings, settings.provider);
  if (!isLocalAiProvider(settings.provider) && !cfg.apiKey?.trim()) {
    throw new InspirationExpandError("请先在设置中填写当前模型的 API Key。");
  }
  const r = await generateWithProvider({
    provider: settings.provider,
    config: cfg,
    messages,
    temperature: Math.min(1.2, Math.max(0.4, settings.geminiTemperature)),
    signal: args.signal,
  });
  const rawText = (r.text ?? "").trim();
  if (!rawText) {
    throw new InspirationExpandError("模型返回为空，请重试或更换模型。");
  }
  let segments = parseFiveSegments(rawText);
  if (segments.length < 5) {
    segments = fallbackFive(rawText);
  }
  return { segments: segments.slice(0, 5), rawText };
}
