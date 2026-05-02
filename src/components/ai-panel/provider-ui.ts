import type { AiProviderId } from "../../ai/types";

export function providerLogoImgSrc(p: AiProviderId): string | null {
  switch (p) {
    case "openai":
      return "/logos/openai.png";
    case "anthropic":
      return "/logos/claude.png";
    case "gemini":
    case "vertex":
      return "/logos/gemini.png";
    case "ollama":
    case "mlx":
      return "/logos/ollama.png";
    case "doubao":
      return "/logos/doubao.png";
    case "zhipu":
      return "/logos/zhipu.png";
    case "kimi":
      return "/logos/kimi.png";
    case "xiaomi":
      return "/logos/xiaomi.png";
    default:
      return null;
  }
}

export function providerLogoFallbackText(p: AiProviderId): string {
  switch (p) {
    case "openai":
      return "";
    case "anthropic":
      return "雨";
    case "gemini":
    case "vertex":
      return "云";
    case "doubao":
      return "豆";
    case "zhipu":
      return "谱";
    case "kimi":
      return "月";
    case "xiaomi":
      return "米";
    case "ollama":
    case "mlx":
      return "龙";
    default:
      return "·";
  }
}

export interface ProviderUiCard {
  label: string;
  subtitle: string;
  tip: string;
  quote: string;
  core: string;
  meters: { prose: number; follow: number; cost: number; costText?: string };
  note: string;
}

/** 各 provider 的卡片文案 / 评分 / 提示。纯静态数据，与运行时无关。 */
export const PROVIDER_UI: Record<AiProviderId, ProviderUiCard> = {
  openai: {
    label: "见山",
    subtitle: "逻辑之宗 · 纲举目张",
    tip: "见山（OpenAI）",
    quote: '"初看是山，看久了还是那座稳健的大山。"',
    core:
      "逻辑之宗，纲举目张。指令遵循极强，如利刃破竹，最擅长梳理宏大的世界观设定与严密的剧情逻辑。",
    meters: { prose: 5, follow: 5, cost: 2 },
    note: "适合\"一览众山小\"的逻辑架构，若追求极致的辞藻修饰，建议配合\"听雨\"使用。",
  },
  anthropic: {
    label: "听雨",
    subtitle: "辞藻丰盈 · 情感细腻",
    tip: "听雨（Claude）",
    quote: '"如檐下听雨，文字绵密入骨，最懂人心。"',
    core:
      "辞藻丰盈，情感细腻。像一位共情力极强的老友，成文质感极佳，自带一种天然的去\"AI味\"滤镜，是描写人物内心与凄美画面的首选。",
    meters: { prose: 5, follow: 4, cost: 3 },
    note: "如遇敏感剧情可能像雨天一样\"多愁善感\"而断更，建议微调措辞或跳过该段落。",
  },
  gemini: {
    label: "观云",
    subtitle: "创意如云 · 变幻万千",
    tip: "观云（Gemini）",
    quote: '"坐看云起，奇思妙想如漫天流云，不可捉摸。"',
    core:
      "创意如云，变幻万千。拥有惊人的上下文联想能力，最擅长在陷入瓶颈时为你提供打破常规的\"神来之笔\"，让剧情走向峰回路转。",
    meters: { prose: 4, follow: 3, cost: 2 },
    note: "云海辽阔，长文推理可能需要稍作等待，建议在开启\"高思考预算\"时保持耐心。",
  },
  vertex: {
    label: "云谷",
    subtitle: "Vertex · 后端代管",
    tip: "Vertex AI（GCP 赠金）",
    quote: '"金石在炉，不假外铄。"',
    core:
      "经本站后端代理到 Google Cloud Vertex 上的 Gemini 系模型（默认 2.5 Pro），密钥留在服务器；适合使用 GCP 赠金与项目配额。",
    meters: { prose: 5, follow: 3, cost: 3, costText: "GCP" },
    note: "需登录；默认推荐 gemini-2.5-pro。Project/区域须与部署一致。与「观云（直连）」可并存。",
  },
  ollama: {
    label: "潜龙",
    subtitle: "本地 · Ollama",
    tip: "潜龙（Ollama）",
    quote: '"藏龙于渊，不假外求，深藏不露的底气。"',
    core:
      "根植本地，稳如泰山。不依赖云端，私密且纯粹。虽然平时深潜不出，但在处理基础创作任务时，有着龙跃于渊般的稳健爆发力。",
    meters: { prose: 3, follow: 3, cost: 1, costText: "极低消耗" },
    note: "本地运行受限于设备性能，适合快速草拟或在离线环境下作为创作基座。",
  },
  mlx: {
    label: "潜龙",
    subtitle: "本地 · MLX",
    tip: "潜龙（Apple MLX）",
    quote: '"藏龙于渊，不假外求，深藏不露的底气。"',
    core:
      "根植本地，稳如泰山。通过 Apple MLX 在本机推理，私密且纯粹；请确保已启动兼容 OpenAI 接口的本地服务并正确填写 Base URL。",
    meters: { prose: 3, follow: 3, cost: 1, costText: "极低消耗" },
    note: "MLX 的模型名与端口以你的部署为准；浏览器若遇 CORS 请用 dev 代理或桌面端。",
  },
  doubao: {
    label: "燎原",
    subtitle: "墨落星火 · 势成燎原",
    tip: "燎原（豆包）",
    quote: '"墨落星火，势成燎原。"',
    core:
      "它是扎根于东方文脉的智慧火种，不只是精准解析你的一字一句，更深谙汉语背后的山河底蕴与人文温度。于方寸屏幕间，赋你一支生花妙笔；借燎原之势，让你的文思，跨越山海，写尽天下。",
    meters: { prose: 3, follow: 5, cost: 2, costText: "极低" },
    note: "若遇到调用失败，多半是 Base URL 或 Model 命名不一致；请以你控制台/通用接口参数为准。",
  },
  zhipu: {
    label: "智谱",
    subtitle: "墨竹清劲 · 文理兼备",
    tip: "智谱 GLM",
    quote: '"竹影扫阶尘不动，月穿潭底水无痕。"',
    core:
      "GLM-5 / GLM-4.7 系列在中文理解与指令遵循上扎实，适合长文写作中的结构梳理、设定补全与多轮改写；模型 ID 请以开放平台文档（如 glm-5、glm-4.7、glm-4.7-flash）为准。",
    meters: { prose: 4, follow: 4, cost: 2 },
    note: "使用 OpenAI 兼容接口（/chat/completions）；若报错请核对 Base URL、Key 与模型 ID。",
  },
  kimi: {
    label: "Kimi",
    subtitle: "长卷如月 · 徐徐展开",
    tip: "Kimi（Moonshot）",
    quote: '"月色入户，清辉满纸。"',
    core:
      "Kimi 擅长在长上下文里保持线索不断裂，适合需要\"带着前文记忆\"续写与扩写的场景；流式输出与本 App 的生成体验契合。",
    meters: { prose: 4, follow: 4, cost: 3 },
    note: "默认 Base URL 为 Moonshot 文档中的 v1 根路径；模型名以控制台为准。",
  },
  xiaomi: {
    label: "小米",
    subtitle: "锋刃内敛 · 务实为文",
    tip: "小米 MiMo",
    quote: '"工欲善其事，必先利其器。"',
    core:
      "小米 MiMo 提供 OpenAI 兼容接口；写作推荐 mimo-v2.5-pro（最新旗舰·最强）/ mimo-v2.5（性价比平衡）/ mimo-v2-pro（上代旗舰），在高级后端配置中可一键选择。",
    meters: { prose: 4, follow: 4, cost: 3 },
    note: "Base URL：未购 Token Plan 用 api.mimo-v2.com/v1；已购可用专属域名 token-plan-cn.xiaomimimo.com/v1（中国集群）/ token-plan-sgp / token-plan-ams 集群。本地开发已走同源代理，避免浏览器跨域；静态部署或遇 Failed to fetch 时需后端转发。",
  },
  // owner-only：不出现在选择器（picker 数组里被排除），保留键以满足 Record 类型
  "claude-code-local": {
    label: "Claude Code（订阅）",
    subtitle: "Owner · 本机 sidecar",
    tip: "Claude Code 本地直连",
    quote: '"我自用我的订阅。"',
    core: "通过本机 sidecar（127.0.0.1:7788）调 Claude Pro/Max 订阅，不计入 API 计费。仅作者本人可见。",
    meters: { prose: 5, follow: 4, cost: 1, costText: "订阅" },
    note: "需在终端 npm run sidecar 启动本机 sidecar，并在「Owner 模式」粘贴 Token。",
  },
};
