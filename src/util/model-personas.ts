import type { AiProviderId } from "../ai/types";
import { loadAiSettings } from "../ai/storage";

export type ModelPersona = {
  provider: AiProviderId;
  /** 真实可用的 modelId（不引入虚构 API） */
  modelId: string;
  /** 卡面标题（人设/档位名） */
  title: string;
  /** 一句话定位 */
  subtitle: string;
  /** 适用场景（短段落） */
  description: string;
  /** 标签（用于 UI 徽标） */
  tags?: string[];
  /** 1-5 星：字数/费用体感（仅提示，不代表真实计费） */
  costStars?: 1 | 2 | 3 | 4 | 5;
};

const PERSONAS: Record<AiProviderId, ModelPersona[]> = {
  openai: [
    {
      provider: "openai",
      modelId: "gpt-5.4-mini",
      title: "见山·轻",
      subtitle: "快、稳、性价比高",
      description: "适合日常续写/改写与结构梳理；当你更在乎速度与稳定而非极致推理时优先用它。",
      tags: ["推荐", "日常"],
      costStars: 2,
    },
    {
      provider: "openai",
      modelId: "gpt-5.4-standard",
      title: "见山·迅",
      subtitle: "标准的日常款",
      description: "适合频繁迭代和一般写作任务，平衡了速度与较强的理解能力。",
      tags: ["快"],
      costStars: 3,
    },
    {
      provider: "openai",
      modelId: "gpt-5.4-pro",
      title: "见山·整篇",
      subtitle: "最强综合能力",
      description: "当前旗舰模型，适合长段改写、复杂指令与更一致的全文风格；若输出太「保守」，可略调高神思。",
      tags: ["最新", "更强"],
      costStars: 4,
    },
    {
      provider: "openai",
      modelId: "gpt-5.4-thinking",
      title: "见山·推理",
      subtitle: "更擅长深度思考",
      description: "包含扩展推理过程，适合推演、设定自洽检查与多约束写作；需要更明确的文风锚点。",
      tags: ["推理"],
      costStars: 5,
    },
  ],
  anthropic: [
    {
      provider: "anthropic",
      modelId: "claude-4.7-haiku",
      title: "听雨·快",
      subtitle: "短促清爽、响应快",
      description: "适合快速润色、对话节奏打磨、轻量续写。若需要更强一致性与长文耐心，换「听雨·稳」。",
      tags: ["快"],
      costStars: 3,
    },
    {
      provider: "anthropic",
      modelId: "claude-4.7-sonnet",
      title: "听雨·稳",
      subtitle: "写作感强、指令遵从高",
      description: "适合长文续写、风格锚定、设定补全与大多数的多轮改写任务；整体更「文学」。",
      tags: ["推荐", "长文"],
      costStars: 4,
    },
    {
      provider: "anthropic",
      modelId: "claude-4.7-opus",
      title: "听雨·极",
      subtitle: "最新最强旗舰 (4.7)",
      description: "适合极其复杂的任务、要求高连贯性的全局长文一致性与较高上限的推演；代价更高，建议用于关键段落。",
      tags: ["最新", "更强"],
      costStars: 5,
    },
  ],
  gemini: [
    {
      provider: "gemini",
      modelId: "gemini-3.1-flash-lite-preview",
      title: "观云·初见",
      subtitle: "更轻、更省",
      description: "适合高频试写与短段润色；当你只想快速得到多个可用候选时很好用。",
      tags: ["快"],
      costStars: 2,
    },
    {
      provider: "gemini",
      modelId: "gemini-3-flash-preview",
      title: "观云·入微",
      subtitle: "平衡档位",
      description: "适合大多数写作任务：续写、改写、设定补全、摘要等。作为默认档位最稳妥。",
      tags: ["推荐"],
      costStars: 3,
    },
    {
      provider: "gemini",
      modelId: "gemini-3.1-pro-preview",
      title: "观云·化境",
      subtitle: "更强、更耐心",
      description: "适合长文一致性、更复杂的约束与更高质量的整体打磨；代价更高。",
      tags: ["更强", "长文"],
      costStars: 4,
    },
  ],
  doubao: [
    {
      provider: "doubao",
      modelId: "ep-20260315234645-2h6jf",
      title: "燎原·旗舰 (Seed-2.0-pro)",
      subtitle: "更强更聪明的最新接入点",
      description: "适合中文长文写作、复杂排版与多轮改写；注意：这是你的真实 Endpoint ID，豆包不再使用统一模型名。",
      tags: ["推荐", "中文"],
      costStars: 4,
    },
    {
      provider: "doubao",
      modelId: "ep-填写你的轻量接入点",
      title: "燎原·轻量",
      subtitle: "请在控制台创建轻量级 Endpoint",
      description: "你需要去火山引擎控制台新建接入点，并将形如 ep-xxxx... 的 ID 填入下方的 Model 框进行测试保存。",
      tags: ["快"],
      costStars: 2,
    },
  ],
  zhipu: [
    {
      provider: "zhipu",
      modelId: "glm-4.7-flash",
      title: "智谱·普惠",
      subtitle: "免费普惠、够用",
      description: "适合高频试写、轻量改写与设定补全；当你只想「先跑起来」时选它。",
      tags: ["推荐"],
      costStars: 2,
    },
    {
      provider: "zhipu",
      modelId: "glm-4.7-flashx",
      title: "智谱·写作",
      subtitle: "轻量高速·写作向",
      description: "适合更偏写作的输出质量与一致性（相对普惠更稳）；模型名请以平台文档为准。",
      tags: ["写作"],
      costStars: 3,
    },
    {
      provider: "zhipu",
      modelId: "glm-4.7",
      title: "智谱·高智",
      subtitle: "更强理解与执行",
      description: "适合复杂改写要求与更细的约束；更适合「按规则把活做完」。",
      tags: ["更强"],
      costStars: 4,
    },
    {
      provider: "zhipu",
      modelId: "glm-5",
      title: "智谱·旗舰",
      subtitle: "最新旗舰（以文档为准）",
      description: "适合更强推理、Agent 场景与更复杂任务；代价更高。",
      tags: ["旗舰"],
      costStars: 5,
    },
  ],
  kimi: [
    {
      provider: "kimi",
      modelId: "moonshot-v1-8k",
      title: "Kimi·短篇",
      subtitle: "短上下文更轻",
      description: "适合短章续写与快速改写；当你更强调速度与小成本时优先。",
      tags: ["快"],
      costStars: 2,
    },
    {
      provider: "kimi",
      modelId: "moonshot-v1-32k",
      title: "Kimi·长篇",
      subtitle: "更大上下文",
      description: "适合需要更长上下文的写作任务；仍建议通过设置控制注入范围。",
      tags: ["长文"],
      costStars: 4,
    },
    {
      provider: "kimi",
      modelId: "moonshot-v1-128k",
      title: "Kimi·超长",
      subtitle: "超长上下文（谨慎）",
      description: "适合超长材料一起送入的任务，但可能费用更高；优先用「材料简版」检查注入规模。",
      tags: ["超长"],
      costStars: 5,
    },
    {
      provider: "kimi",
      modelId: "kimi-k2.5-turbo-preview",
      title: "Kimi·Turbo",
      subtitle: "新版本（以控制台为准）",
      description: "适合你想试新能力时使用；若出现兼容问题，可回退到 v1 系列。",
      tags: ["新版本"],
      costStars: 3,
    },
  ],
  xiaomi: [
    {
      provider: "xiaomi",
      modelId: "mimo-v2-flash",
      title: "小米·快",
      subtitle: "写作·偏快",
      description: "适合高频改写与润色；当你在意响应速度时优先。",
      tags: ["快"],
      costStars: 2,
    },
    {
      provider: "xiaomi",
      modelId: "mimo-v2-pro",
      title: "小米·强",
      subtitle: "写作·偏强",
      description: "适合更复杂的改写要求与更稳的长文输出；代价更高。",
      tags: ["推荐", "更强"],
      costStars: 3,
    },
  ],
  ollama: [
    {
      provider: "ollama",
      modelId: "llama3.1:8b",
      title: "潜龙·本机",
      subtitle: "离线、本地优先",
      description: "适合隐私敏感或断网环境；模型名以 `ollama list` 为准，本 App 可在设置里检测并一键填入。",
      tags: ["本地"],
      costStars: 1,
    },
  ],
  mlx: [
    {
      provider: "mlx",
      modelId: "default",
      title: "潜龙·MLX",
      subtitle: "Apple MLX 本机",
      description: "通过 OpenAI 兼容接口连接本机 MLX 服务；Base URL 与模型名以你的部署为准。",
      tags: ["本地", "MLX"],
      costStars: 1,
    },
  ],
  // owner-only：不出现在选择 UI；保留键以满足 Record<AiProviderId> 类型要求
  "claude-code-local": [],
};

type ModelVerdict = "ok" | "err";
type ModelHealth = Record<string, { verdict: ModelVerdict; testedAt: number }>;

const HEALTH_KEY_PREFIX = "liubai:modelHealth:";
const GEMINI_HEALTH_KEY = "liubai:geminiModelHealth";

function readModelHealth(provider: AiProviderId): ModelHealth {
  try {
    const raw = localStorage.getItem(`${HEALTH_KEY_PREFIX}${provider}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as ModelHealth) : {};
  } catch {
    return {};
  }
}

function readGeminiHealth(): ModelHealth {
  try {
    const raw = localStorage.getItem(GEMINI_HEALTH_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as ModelHealth) : {};
  } catch {
    return {};
  }
}

function uniqKeepOrder(xs: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of xs) {
    const v = (x ?? "").trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/**
 * 单一数据源策略：
 * - 优先：设置里的当前 model（用户实际在用）
 * - 其次：高级后端配置里“本 App 可用版本（测试结果）”里判定 ok 的 modelId
 */
function listProviderModelIdsFromSettings(provider: AiProviderId): string[] {
  const s = loadAiSettings();
  const current = (() => {
    try {
      // AiProviderId 与 settings 字段同名
      const cfg = (s as unknown as Record<string, any>)[provider];
      const m = (cfg?.model ?? "").trim();
      return m ? [m] : [];
    } catch {
      return [];
    }
  })();

  const health = provider === "gemini" ? readGeminiHealth() : readModelHealth(provider);
  const ok = Object.entries(health)
    .filter(([, v]) => v?.verdict === "ok")
    .sort((a, b) => (b[1]?.testedAt ?? 0) - (a[1]?.testedAt ?? 0))
    .map(([k]) => k);

  // 严格模式：不回退内置 PERSONAS。设置是唯一权威来源。
  // 为避免列表过长，仅保留最近的若干个（当前 + 最近 ok）。
  return uniqKeepOrder([...current, ...ok]).slice(0, 8);
}

export function listModelPersonas(provider: AiProviderId): ModelPersona[] {
  const base = PERSONAS[provider] ?? [];
  const modelIds = listProviderModelIdsFromSettings(provider);

  // 本地模型不做推荐档位（与现有 UI 逻辑保持一致）
  if (provider === "ollama" || provider === "mlx") return base;

  // 必须按 modelId 匹配人设：禁止用下标与「当前设置里的 model 顺序」拉链，否则会出现
  // 「当前选中 pro 却显示 初见 卡面」的错配。
  return modelIds.map((modelId, i) => {
    const b = base.find((p) => p.modelId === modelId);
    if (b) return { ...b, modelId };
    return {
      provider,
      modelId,
      title: `版本·${i + 1}`,
      subtitle: "来自高级后端配置",
      description: "此列表来自你在「设置 → 高级后端配置」中测试通过并保存的模型版本。",
      tags: i === 0 ? ["推荐"] : undefined,
      costStars: 3,
    } satisfies ModelPersona;
  });
}

/**
 * 按 `PERSONAS` 表内顺序，筛选出在 `catalogModelIds` 中声明的预置卡（用于高级后端配置「推荐模型」等，
 * 与当前选中的 default model 无关，避免顺序/数量随设置变化）。
 */
export function listCatalogPersonas(provider: AiProviderId, catalogModelIds: readonly string[]): ModelPersona[] {
  const allow = new Set(catalogModelIds);
  const base = PERSONAS[provider] ?? [];
  return base.filter((p) => allow.has(p.modelId));
}

