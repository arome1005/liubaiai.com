/**
 * 推演规划顾问 AI：基于规划节点继承链上下文，提供多轮对话式建议。
 * 与 logic-branch-predict 的区别：不依赖章节正文，面向结构规划阶段。
 */
import type { TuiyanImitationMode } from "../db/types";
import { logTuiyanReferenceTouchpoint } from "../util/tuiyan-reference-dev-log";
import { generateWithProvider } from "./client";
import { mergeAdvisorSystemWithReferenceHardRules } from "./tuiyan-reference-planning-system";
import { isLocalAiProvider } from "./local-provider";
import { getProviderConfig, loadAiSettings } from "./storage";
import type { AiChatMessage, AiSettings } from "./types";

const SYSTEM_PROMPT = `你是专业的网文规划顾问。你的职责是帮助作者在**规划阶段**完善小说结构。

规则：
- 基于作者提供的节点继承链（总纲 / 阶段 / 卷 / 章纲 / 细纲）进行分析与建议
- 聚焦规划本身：结构、节奏、冲突点、人物弧光、伏笔、卷线等
- **不要**直接生成正文段落；建议应当是可落地的规划指导
- 保持与继承链已有约束（世界观、人物设定、已定走向）一致
- 回答简洁有力，避免泛泛而谈；优先给出具体的改动建议或补充方向`;

export class TuiyanPlanningChatError extends Error {
  override readonly name = "TuiyanPlanningChatError";
  constructor(message: string) {
    super(message);
  }
}

function assertCanSend(settings: AiSettings): void {
  if (isLocalAiProvider(settings.provider)) return;
  if (!settings.privacy.consentAccepted || !settings.privacy.allowCloudProviders) {
    throw new TuiyanPlanningChatError("请先在设置中同意云端 AI 并允许调用。");
  }
  if (!settings.privacy.allowMetadata) {
    throw new TuiyanPlanningChatError("推演对话需上传作品与节点信息，请在隐私设置中允许作品元数据。");
  }
}

/**
 * 规划顾问单次对话轮次。
 * @param planningContext 由 makePlanningContext() 生成的节点继承链序列化文本
 * @param userHint 本轮用户输入
 * @param history 本次对话之前的历史（role + content），最多保留最近 12 轮以控制 token
 * @param settings 可选，默认读取本地配置
 * @param signal AbortSignal
 */
export async function generatePlanningAdvisorReply(args: {
  planningContext: string;
  userHint: string;
  history: { role: "user" | "assistant"; content: string }[];
  /** 与参考 Tab 全局 `imitationMode` 一致；上下文中含参考策略时追加分模式 system 段 */
  imitationMode?: TuiyanImitationMode;
  settings?: AiSettings;
  signal?: AbortSignal;
}): Promise<string> {
  const settings = args.settings ?? loadAiSettings();
  assertCanSend(settings);
  const cfg = getProviderConfig(settings, settings.provider);
  if (!isLocalAiProvider(settings.provider) && !cfg.apiKey?.trim()) {
    throw new TuiyanPlanningChatError("请先在设置中填写当前模型的 API Key。");
  }

  const ctx = args.planningContext.trim();
  const hint = args.userHint.trim();
  if (!hint) {
    throw new TuiyanPlanningChatError("请输入问题或想法后再发送。");
  }

  logTuiyanReferenceTouchpoint("planning_advisor_chat:context", ctx, { hintLen: hint.length });

  // 系统消息：规划顾问提示词 + 当前节点上下文（含参考策略时追加 system 级硬约束）
  const systemContent = mergeAdvisorSystemWithReferenceHardRules(
    ctx ? `${SYSTEM_PROMPT}\n\n---\n【当前节点上下文】\n${ctx}` : SYSTEM_PROMPT,
    { imitationMode: args.imitationMode },
  );

  // 保留最近 12 轮历史（6 来回）防止超长上下文
  const recentHistory = args.history.slice(-12);

  const messages: AiChatMessage[] = [
    { role: "system", content: systemContent },
    ...recentHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: hint },
  ];

  const r = await generateWithProvider({
    provider: settings.provider,
    config: cfg,
    messages,
    temperature: Math.min(1.0, Math.max(0.3, settings.geminiTemperature)),
    signal: args.signal,
  });

  const text = (r.text ?? "").trim();
  if (!text) {
    throw new TuiyanPlanningChatError("模型返回为空，请重试或更换模型。");
  }
  return text;
}
