import { useEffect, useMemo, useState } from "react"
import { Check } from "lucide-react"
import { doubaoModelDisplayLabel } from "../util/doubao-ui"
import { cn } from "../lib/utils"
import { modelLogoSrc, ModelPersonaLogo } from "./ai-model-logos"
import type { AiProviderId, AiSettings } from "../ai/types"
import { getProviderTemperature, loadAiSettings, patchProviderTemperature, saveAiSettings } from "../ai/storage"
import { listModelPersonas } from "../util/model-personas"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog"
import { Button } from "./ui/button"
import { ScrollArea } from "./ui/scroll-area"

// AI模型定义
export interface AIModel {
  id: string
  name: string
  subtitle: string
  icon: React.ReactNode
  quote: string
  description: string
  ratings: {
    literary: number // 文采水平 1-5
    instruction: number // 指令遵从 1-5
    tokenCost: number // 字数消耗 1-5 (越低越省)
  }
  costLabel?: string // 消耗标签，如"极低消耗"
  notes: string // 注意事项
  isLocal?: boolean // 是否本地模型
  provider?: string // 服务商
  providerId?: AiProviderId // 用于读取真实设置/推荐档位
}

/** `public/logos/*.png` — 与人设映射：见山↔OpenAI、听雨↔Claude、观云↔Gemini、燎原↔豆包、潜龙↔Ollama */
const LOGO = {
  openai: modelLogoSrc("logos/openai.png"),
  claude: modelLogoSrc("logos/claude.png"),
  gemini: modelLogoSrc("logos/gemini.png"),
  doubao: modelLogoSrc("logos/doubao.png"),
  ollama: modelLogoSrc("logos/ollama.png"),
} as const

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function tempBand(t: number): "沉稳" | "意兴渐起" | "灵感喷发" {
  if (t <= 0.7) return "沉稳"
  if (t <= 1.2) return "意兴渐起"
  return "灵感喷发"
}

function tempCenterLabel(t: number) {
  return `${tempBand(t)}（${t.toFixed(1)}）`
}

function getProviderModelId(settings: AiSettings, providerId: AiProviderId): string {
  switch (providerId) {
    case "openai":
      return settings.openai.model
    case "anthropic":
      return settings.anthropic.model
    case "gemini":
      return settings.gemini.model
    case "doubao":
      return settings.doubao.model
    case "zhipu":
      return settings.zhipu.model
    case "kimi":
      return settings.kimi.model
    case "xiaomi":
      return settings.xiaomi.model
    case "ollama":
      return settings.ollama.model
    case "mlx":
      return settings.mlx.model
  }
}

function patchProviderModel(settings: AiSettings, providerId: AiProviderId, modelId: string): AiSettings {
  switch (providerId) {
    case "openai":
      return { ...settings, openai: { ...settings.openai, model: modelId } }
    case "anthropic":
      return { ...settings, anthropic: { ...settings.anthropic, model: modelId } }
    case "gemini":
      return { ...settings, gemini: { ...settings.gemini, model: modelId } }
    case "doubao":
      return { ...settings, doubao: { ...settings.doubao, model: modelId } }
    case "zhipu":
      return { ...settings, zhipu: { ...settings.zhipu, model: modelId } }
    case "kimi":
      return { ...settings, kimi: { ...settings.kimi, model: modelId } }
    case "xiaomi":
      return { ...settings, xiaomi: { ...settings.xiaomi, model: modelId } }
    case "ollama":
      return { ...settings, ollama: { ...settings.ollama, model: modelId } }
    case "mlx":
      return { ...settings, mlx: { ...settings.mlx, model: modelId } }
  }
}

// 预定义的AI模型列表
export const AI_MODELS: AIModel[] = [
  {
    id: "jianshan",
    name: "见山",
    subtitle: "逻辑之宗·纲举目张",
    icon: (
      <ModelPersonaLogo
        src={LOGO.openai}
        ringClassName="bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900/40 dark:to-blue-800/40"
      />
    ),
    quote: "一览众山小，逻辑清晰如登高望远。",
    description: "以清晰的逻辑见长，擅长梳理复杂的故事结构和人物关系。在大纲规划、情节推演方面表现出色，帮助你建立稳固的叙事框架。",
    ratings: { literary: 3, instruction: 5, tokenCost: 3 },
    notes: "适合大纲规划、逻辑梳理、情节推演等需要清晰思路的创作任务。",
    provider: "OpenAI",
    providerId: "openai",
  },
  {
    id: "tingyu",
    name: "听雨",
    subtitle: "辞藻丰盈·情感细腻",
    icon: (
      <ModelPersonaLogo
        src={LOGO.claude}
        ringClassName="bg-gradient-to-br from-cyan-100 to-cyan-200 dark:from-cyan-900/40 dark:to-cyan-800/40"
      />
    ),
    quote: "润物细无声，文字如春雨般滋养心田。",
    description: "文采斐然，擅长细腻的情感描写和优美的文字表达。在言情、文艺向作品中表现尤为出色，能够捕捉微妙的情感波动。",
    ratings: { literary: 5, instruction: 4, tokenCost: 3 },
    notes: "适合情感描写、文艺向创作、需要细腻文笔的场景。",
    provider: "Anthropic",
    providerId: "anthropic",
  },
  {
    id: "guanyun",
    name: "观云",
    subtitle: "创意如云·变幻万千",
    icon: (
      <ModelPersonaLogo
        src={LOGO.gemini}
        ringClassName="bg-gradient-to-br from-purple-100 to-purple-200 dark:from-purple-900/40 dark:to-purple-800/40"
      />
    ),
    quote: "云卷云舒，创意无限。",
    description: "创意天马行空，擅长打破常规思维，提供新奇的点子和意想不到的情节转折。适合需要突破瓶颈、寻找灵感的创作阶段。",
    ratings: { literary: 4, instruction: 3, tokenCost: 4 },
    notes: "适合头脑风暴、灵感激发、打破创作瓶颈。指令遵从度稍低，可能有惊喜也可能跑题。",
    provider: "Gemini",
    providerId: "gemini",
  },
  {
    id: "liaoyuan",
    name: "燎原",
    subtitle: "墨落星火·势成燎原",
    icon: (
      <ModelPersonaLogo
        src={LOGO.doubao}
        ringClassName="bg-gradient-to-br from-orange-100 to-orange-200 dark:from-orange-900/40 dark:to-orange-800/40"
      />
    ),
    quote: "星星之火，可以燎原。",
    description: "热血澎湃，擅长爽文、升级流、战斗场景等需要强烈节奏感的内容。文风直接有力，适合男频爽文创作。",
    ratings: { literary: 3, instruction: 4, tokenCost: 2 },
    notes: "适合热血战斗、升级打怪、爽文节奏的创作。字数消耗较低，性价比高。",
    provider: "豆包",
    providerId: "doubao",
  },
  {
    id: "zhipu",
    name: "智谱",
    subtitle: "墨竹清劲·文理兼备",
    icon: (
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-100 to-emerald-200 dark:from-emerald-900/30 dark:to-emerald-800/30">
        <span className="font-serif text-lg font-bold text-emerald-700 dark:text-emerald-400">谱</span>
      </div>
    ),
    quote: "虚心有节，文理兼修。",
    description: "均衡全面的模型，在各方面都有不错的表现。特别适合需要兼顾逻辑与文采的综合性创作任务。",
    ratings: { literary: 4, instruction: 4, tokenCost: 2 },
    notes: "国产模型，响应速度快，性价比高。适合日常创作的通用选择。",
    provider: "智谱AI",
    providerId: "zhipu",
  },
  {
    id: "kimi",
    name: "Kimi",
    subtitle: "长卷如月·徐徐展开",
    icon: (
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-100 to-indigo-200 dark:from-indigo-900/30 dark:to-indigo-800/30">
        <span className="font-serif text-lg font-bold text-indigo-700 dark:text-indigo-400">月</span>
      </div>
    ),
    quote: "明月几时有，长文不知倦。",
    description: "超长上下文支持，适合处理长篇连载、需要大量前文参考的创作。能够保持前后一致性，不易遗忘设定。",
    ratings: { literary: 4, instruction: 4, tokenCost: 3 },
    notes: "支持超长上下文（200K+），适合长篇小说创作和需要大量背景资料的任务。",
    provider: "Moonshot",
    providerId: "kimi",
  },
  {
    id: "xiaomi",
    name: "小米",
    subtitle: "锋刃内敛·务实为文",
    icon: (
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-900/30 dark:to-amber-800/30">
        <span className="font-sans text-lg font-bold text-amber-700 dark:text-amber-400">米</span>
      </div>
    ),
    quote: "大道至简，务实为本。",
    description: "务实稳健的模型，指令遵从度高，输出稳定可控。适合需要精确控制输出格式和内容的场景。",
    ratings: { literary: 3, instruction: 5, tokenCost: 2 },
    notes: "性价比极高，适合大批量生成、格式化输出等任务。",
    provider: "小米",
    providerId: "xiaomi",
  },
  {
    id: "qianlong",
    name: "潜龙",
    subtitle: "根植本地·私密纯粹",
    icon: (
      <ModelPersonaLogo
        src={LOGO.ollama}
        ringClassName="bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800/60 dark:to-slate-700/50"
      />
    ),
    quote: "藏龙于渊，不假外求，深藏不露的底气。",
    description: "根植本地，稳如泰山。不依赖云端，私密且纯粹。虽然平时深潜不出，但在处理基础创作任务时，有着龙跃于渊般的稳健爆发力。",
    ratings: { literary: 3, instruction: 4, tokenCost: 1 },
    costLabel: "极低消耗",
    notes: "本地运行受限于设备性能，适合快速草拟或在离线环境下作为创作基座。",
    isLocal: true,
    provider: "本地模型",
    providerId: "ollama",
  },
  {
    id: "qianlong_mlx",
    name: "潜龙",
    subtitle: "本地·MLX",
    icon: (
      <ModelPersonaLogo
        src={LOGO.ollama}
        ringClassName="bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800/60 dark:to-slate-700/50"
      />
    ),
    quote: "藏龙于渊，不假外求，深藏不露的底气。",
    description:
      "根植本地，稳如泰山。通过 Apple MLX 在本机推理，不依赖云端；请确保已启动兼容 OpenAI 接口的本地服务并正确填写 Base URL 与模型名。",
    ratings: { literary: 3, instruction: 4, tokenCost: 1 },
    costLabel: "极低消耗",
    notes:
      "MLX 的模型名与端口以你的部署为准；浏览器若遇 CORS 请用 dev 代理或桌面端。",
    isLocal: true,
    provider: "本地模型",
    providerId: "mlx",
  },
]

// 评级点组件
function RatingDots({
  value,
  max = 5,
  activeColor = "bg-amber-400",
  inactiveColor = "bg-slate-200 dark:bg-slate-700"
}: {
  value: number
  max?: number
  activeColor?: string
  inactiveColor?: string
}) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: max }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "h-2 w-2 rounded-full transition-colors",
            i < value ? activeColor : inactiveColor
          )}
        />
      ))}
    </div>
  )
}

// 模型选择器属性
interface AIModelSelectorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedModelId: string
  onSelectModel: (modelId: string) => void
  title?: string
  overlayClassName?: string
  contentClassName?: string
}

export function AIModelSelector({
  open,
  onOpenChange,
  selectedModelId,
  onSelectModel,
  title = "选择模型",
  overlayClassName,
  contentClassName,
}: AIModelSelectorProps) {
  const [previewModelId, setPreviewModelId] = useState(selectedModelId)
  const [settings, setSettings] = useState<AiSettings>(() => loadAiSettings())
  const [shensiOpen, setShensiOpen] = useState(false)

  useEffect(() => {
    if (!open) {
      setShensiOpen(false)
      return
    }
    const s = loadAiSettings()
    setSettings(s)
    setPreviewModelId(selectedModelId)
  }, [open, selectedModelId])

  const previewModel = AI_MODELS.find(m => m.id === previewModelId) || AI_MODELS[0]
  const providerId = previewModel.providerId

  const recommendedPersonas = useMemo(() => {
    if (!providerId) return []
    if (providerId === "ollama" || providerId === "mlx") return []
    return listModelPersonas(providerId)
  }, [providerId])

  const activeProviderModelId = useMemo(() => {
    if (!providerId) return null
    return getProviderModelId(settings, providerId)
  }, [providerId, settings])

  const handleConfirm = () => {
    onSelectModel(previewModelId)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName={overlayClassName}
        className={cn(
          "max-w-3xl gap-0 p-0 overflow-hidden h-[min(80vh,720px)]",
          contentClassName
        )}
      >
        <DialogHeader className="border-b border-border/40 px-6 py-4">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">选择 AI 模型和配置参数</DialogDescription>
        </DialogHeader>

        <div className="flex h-[calc(min(80vh,720px)-64px)]">
          {/* 左侧模型列表 */}
          <ScrollArea className="w-64 shrink-0 border-r border-border/40">
            <div className="p-2">
              {AI_MODELS.map((model) => (
                <button
                  key={model.id}
                  onClick={() => setPreviewModelId(model.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors",
                    previewModelId === model.id
                      ? "bg-primary/10 border border-primary/30"
                      : "hover:bg-muted/50 border border-transparent"
                  )}
                >
                  {model.icon}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{model.name}</span>
                      {selectedModelId === model.id && (
                        <span className="text-xs text-muted-foreground">当前</span>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {model.subtitle}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>

          {/* 右侧详情面板 */}
          <div className="flex flex-1 flex-col">
            <ScrollArea className="flex-1">
              <div className="p-6">
                {/* 模型标题 */}
                <div className="mb-4 flex items-center gap-3">
                  {previewModel.icon}
                  <div>
                    <h3 className="text-xl font-semibold text-foreground">{previewModel.name}</h3>
                    <p className="text-sm text-muted-foreground">{previewModel.subtitle}</p>
                  </div>
                </div>

                {/* 引言 */}
                <div className="mb-4 rounded-lg bg-muted/30 px-4 py-3">
                  <p className="text-sm italic text-muted-foreground">
                    &ldquo;{previewModel.quote}&rdquo;
                  </p>
                </div>

                {/* 描述 */}
                <p className="mb-6 text-sm leading-relaxed text-foreground">
                  {previewModel.description}
                </p>

                {/* 评级指标 */}
                <div className="mb-6 grid grid-cols-3 gap-4 border-y border-border/40 py-4">
                  <div>
                    <p className="mb-2 text-sm text-muted-foreground">文采水平</p>
                    <RatingDots value={previewModel.ratings.literary} />
                  </div>
                  <div>
                    <p className="mb-2 text-sm text-muted-foreground">指令遵从</p>
                    <RatingDots value={previewModel.ratings.instruction} />
                  </div>
                  <div>
                    <p className="mb-2 text-sm text-muted-foreground">字数消耗</p>
                    <div className="flex items-center gap-2">
                      <RatingDots value={previewModel.ratings.tokenCost} />
                      {previewModel.costLabel && (
                        <span className="text-xs text-muted-foreground">
                          ({previewModel.costLabel})
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 推荐档位（与全局设置同步） */}
                {providerId && recommendedPersonas.length > 0 && (
                  <div className="mb-6">
                    {providerId === "doubao" ? (
                      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
                        当前展示：<span className="font-medium text-foreground">{doubaoModelDisplayLabel(settings.doubao)}</span>
                        {(settings.doubao.modelDisplayName ?? "").trim() ? (
                          <>
                            <br />
                            实际 endpoint：<code className="text-[0.8rem]">{settings.doubao.model}</code>
                          </>
                        ) : null}
                      </p>
                    ) : null}
                    <h4 className="mb-2 text-sm font-medium text-foreground">推荐模型</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {recommendedPersonas.map((p) => {
                        const isActive = activeProviderModelId === p.modelId
                        return (
                          <button
                            key={`${p.provider}:${p.modelId}`}
                            type="button"
                            className={cn(
                              "rounded-lg border px-3 py-2 text-left transition-colors",
                              isActive
                                ? "border-primary/40 bg-primary/5"
                                : "border-border/50 hover:bg-muted/40"
                            )}
                            onClick={() => {
                              const cur = loadAiSettings()
                              const next = patchProviderModel(cur, p.provider, p.modelId)
                              saveAiSettings(next)
                              setSettings(next)
                            }}
                            title={p.modelId}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="truncate text-sm font-medium text-foreground">{p.title}</span>
                                  {p.tags?.includes("推荐") ? (
                                    <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-700 dark:text-amber-300">
                                      推荐
                                    </span>
                                  ) : null}
                                </div>
                                <p className="truncate text-xs text-muted-foreground">{p.subtitle}</p>
                              </div>
                              <div className="shrink-0 text-xs text-muted-foreground">
                                {isActive ? "当前" : ""}
                              </div>
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                              {p.description}
                            </p>
                            <div className="mt-2 text-[10px] text-muted-foreground/80">
                              {p.modelId}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* 神思说明（本地模型时显示提示） */}
                {providerId && (providerId === "ollama" || providerId === "mlx") && (
                  <div className="mb-4 rounded-md border border-border/40 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    本地模型不支持「神思」（temperature）。如需调节，请切到云端提供方。
                  </div>
                )}

                {/* 注意事项 */}
                <div className="mb-2">
                  <h4 className="mb-2 text-sm font-medium text-foreground">注意事项</h4>
                  <p className="text-sm text-muted-foreground">{previewModel.notes}</p>
                </div>
              </div>
            </ScrollArea>

            {/* 底部操作（固定） */}
            <div className="model-picker-tune model-picker-tune--dock">
              <div className="model-picker-tune-dock" role="toolbar" aria-label="模型操作">
                {/* 神思按钮（云端模型才显示） */}
                {providerId && providerId !== "ollama" && providerId !== "mlx" && (
                  <div className="model-picker-dock-anchor">
                    {shensiOpen && (
                      <div className="model-picker-mini-pop model-picker-mini-pop--shensi" role="dialog" aria-label="深思">
                        {(() => {
                          const t = providerId ? getProviderTemperature(settings, providerId) : 0.7
                          const pct = Math.max(0, Math.min(100, ((t - 0.1) / 1.9) * 100))
                          const invPct = 100 - pct
                          return (
                            <div className="model-picker-shensi-pop">
                              <div className="model-picker-shensi-col">
                                <div className="temp-wrap model-picker-shensi-body temp-pop-thermo">
                                  <div className="temp-float temp-float--mini muted small" style={{ top: `${invPct}%` }}>
                                    {tempCenterLabel(t)}
                                  </div>
                                  <div className="temp-vert temp-vert--mini" aria-label="Temperature">
                                    <div
                                      className="temp-tube temp-tube--fill"
                                      aria-hidden="true"
                                      style={{ ["--fill" as never]: `${pct}%` }}
                                    />
                                    <input
                                      className="temp-slider temp-slider--vert"
                                      type="range"
                                      min={0.1}
                                      max={2.0}
                                      step={0.1}
                                      value={t}
                                      onChange={(e) => {
                                        const v = clamp(Number(e.target.value) || 0.7, 0.1, 2.0)
                                        const cur = loadAiSettings()
                                        const next = providerId ? patchProviderTemperature(cur, providerId, v) : { ...cur, geminiTemperature: v }
                                        saveAiSettings(next)
                                        setSettings(next)
                                      }}
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          )
                        })()}
                        <div className="model-picker-mini-pop-caret" aria-hidden />
                      </div>
                    )}
                    <button
                      type="button"
                      className={"model-picker-dock-btn" + (shensiOpen ? " is-active" : "")}
                      aria-pressed={shensiOpen}
                      aria-expanded={shensiOpen}
                      onClick={() => setShensiOpen((v) => !v)}
                    >
                      神思
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  className="btn primary model-picker-dock-use"
                  onClick={handleConfirm}
                >
                  {previewModelId === selectedModelId ? (
                    <><Check className="mr-1.5 h-3.5 w-3.5" />已选用</>
                  ) : "使用"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
