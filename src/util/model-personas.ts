import type { AiProviderId } from "../ai/types";

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
      modelId: "gpt-4.1-mini",
      title: "见山·轻",
      subtitle: "快、稳、性价比高",
      description: "适合日常续写/改写与结构梳理；当你更在乎速度与稳定而非极致推理时优先用它。",
      tags: ["推荐", "日常"],
      costStars: 2,
    },
    {
      provider: "openai",
      modelId: "gpt-4o-mini",
      title: "见山·迅",
      subtitle: "更快的日常款",
      description: "适合频繁的小迭代（句段润色、措辞替换、轻量扩写）；对长文的耐心略弱。",
      tags: ["快"],
      costStars: 2,
    },
    {
      provider: "openai",
      modelId: "gpt-4o",
      title: "见山·整篇",
      subtitle: "更强综合能力",
      description: "适合长段改写、复杂指令与更一致的全文风格；若输出太“保守”，可略调高神思。",
      tags: ["更强"],
      costStars: 4,
    },
    {
      provider: "openai",
      modelId: "o3-mini",
      title: "见山·推理",
      subtitle: "更擅长推理/分析",
      description: "适合推演、设定自洽检查与多约束写作；可能更“理工”，需要更明确的文风锚点。",
      tags: ["推理"],
      costStars: 4,
    },
  ],
  anthropic: [
    {
      provider: "anthropic",
      modelId: "claude-3-5-haiku-latest",
      title: "听雨·快",
      subtitle: "短促清爽、响应快",
      description: "适合快速润色、对话节奏打磨、轻量续写。若需要更强一致性与长文耐心，换「听雨·稳」。",
      tags: ["快"],
      costStars: 3,
    },
    {
      provider: "anthropic",
      modelId: "claude-3-5-sonnet-latest",
      title: "听雨·稳",
      subtitle: "写作感强、指令遵从高",
      description: "适合长文续写、风格锚定、设定补全与多轮改写；整体更“文学”。",
      tags: ["推荐", "长文"],
      costStars: 4,
    },
    {
      provider: "anthropic",
      modelId: "claude-sonnet-4-20250514",
      title: "听雨·锋",
      subtitle: "更强的任务型写作",
      description: "适合复杂改写要求、结构化输出与更强压约束；当你需要“把要求执行到位”时优先。",
      tags: ["更强"],
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
      modelId: "doubao-seed-1.6",
      title: "燎原·常用",
      subtitle: "中文写作稳、性价比好",
      description: "适合中文长文写作、结构梳理与多轮改写；模型名以火山控制台为准。",
      tags: ["推荐", "中文"],
      costStars: 3,
    },
    {
      provider: "doubao",
      modelId: "doubao-seed-1.6-250615",
      title: "燎原·新",
      subtitle: "更新版本（以控制台为准）",
      description: "适合你想跟进新版本能力时尝试；若出现不兼容，回退到「燎原·常用」。",
      tags: ["新版本"],
      costStars: 3,
    },
  ],
  zhipu: [
    {
      provider: "zhipu",
      modelId: "glm-4.7-flash",
      title: "智谱·普惠",
      subtitle: "免费普惠、够用",
      description: "适合高频试写、轻量改写与设定补全；当你只想“先跑起来”时选它。",
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
      description: "适合复杂改写要求与更细的约束；更适合“按规则把活做完”。",
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
};

export function listModelPersonas(provider: AiProviderId): ModelPersona[] {
  return PERSONAS[provider] ?? [];
}

