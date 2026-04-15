"use client"

import { useState } from "react"
import { X, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"

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
}

// 预定义的AI模型列表
export const AI_MODELS: AIModel[] = [
  {
    id: "jianshan",
    name: "见山",
    subtitle: "逻辑之宗·纲举目张",
    icon: (
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900/30 dark:to-blue-800/30">
        <svg className="h-5 w-5 text-blue-600 dark:text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      </div>
    ),
    quote: "一览众山小，逻辑清晰如登高望远。",
    description: "以清晰的逻辑见长，擅长梳理复杂的故事结构和人物关系。在大纲规划、情节推演方面表现出色，帮助你建立稳固的叙事框架。",
    ratings: { literary: 3, instruction: 5, tokenCost: 3 },
    notes: "适合大纲规划、逻辑梳理、情节推演等需要清晰思路的创作任务。",
    provider: "Claude",
  },
  {
    id: "tingyu",
    name: "听雨",
    subtitle: "辞藻丰盈·情感细腻",
    icon: (
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-100 to-cyan-200 dark:from-cyan-900/30 dark:to-cyan-800/30">
        <span className="text-lg">🌧️</span>
      </div>
    ),
    quote: "润物细无声，文字如春雨般滋养心田。",
    description: "文采斐然，擅长细腻的情感描写和优美的文字表达。在言情、文艺向作品中表现尤为出色，能够捕捉微妙的情感波动。",
    ratings: { literary: 5, instruction: 4, tokenCost: 3 },
    notes: "适合情感描写、文艺向创作、需要细腻文笔的场景。",
    provider: "GPT-4",
  },
  {
    id: "guanyun",
    name: "观云",
    subtitle: "创意如云·变幻万千",
    icon: (
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-100 to-purple-200 dark:from-purple-900/30 dark:to-purple-800/30">
        <span className="text-lg">☁️</span>
      </div>
    ),
    quote: "云卷云舒，创意无限。",
    description: "创意天马行空，擅长打破常规思维，提供新奇的点子和意想不到的情节转折。适合需要突破瓶颈、寻找灵感的创作阶段。",
    ratings: { literary: 4, instruction: 3, tokenCost: 4 },
    notes: "适合头脑风暴、灵感激发、打破创作瓶颈。指令遵从度稍低，可能有惊喜也可能跑题。",
    provider: "Claude",
  },
  {
    id: "liaoyuan",
    name: "燎原",
    subtitle: "墨落星火·势成燎原",
    icon: (
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-orange-100 to-orange-200 dark:from-orange-900/30 dark:to-orange-800/30">
        <span className="text-lg">🔥</span>
      </div>
    ),
    quote: "星星之火，可以燎原。",
    description: "热血澎湃，擅长爽文、升级流、战斗场景等需要强烈节奏感的内容。文风直接有力，适合男频爽文创作。",
    ratings: { literary: 3, instruction: 4, tokenCost: 2 },
    notes: "适合热血战斗、升级打怪、爽文节奏的创作。字数消耗较低，性价比高。",
    provider: "DeepSeek",
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
  },
  {
    id: "qianlong",
    name: "潜龙",
    subtitle: "根植本地·私密纯粹",
    icon: (
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800/50 dark:to-slate-700/50">
        <svg className="h-5 w-5 text-slate-600 dark:text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
          <path d="m4.93 4.93 2.83 2.83m8.48 8.48 2.83 2.83m-2.83-14.14 2.83 2.83M4.93 19.07l2.83-2.83" />
        </svg>
      </div>
    ),
    quote: "藏龙于渊，不假外求，深藏不露的底气。",
    description: "根植本地，稳如泰山。不依赖云端，私密且纯粹。虽然平时深潜不出，但在处理基础创作任务时，有着龙跃于渊般的稳健爆发力。",
    ratings: { literary: 3, instruction: 4, tokenCost: 1 },
    costLabel: "极低消耗",
    notes: "本地运行受限于设备性能，适合快速草拟或在离线环境下作为创作基座。",
    isLocal: true,
    provider: "本地模型",
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
}

export function AIModelSelector({
  open,
  onOpenChange,
  selectedModelId,
  onSelectModel,
  title = "选择模型",
}: AIModelSelectorProps) {
  const [previewModelId, setPreviewModelId] = useState(selectedModelId)
  
  const previewModel = AI_MODELS.find(m => m.id === previewModelId) || AI_MODELS[0]
  const currentModel = AI_MODELS.find(m => m.id === selectedModelId)

  const handleConfirm = () => {
    onSelectModel(previewModelId)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl gap-0 p-0">
        <DialogHeader className="border-b border-border/40 px-6 py-4">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">选择 AI 模型和配置参数</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-[480px]">
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
          <div className="flex flex-1 flex-col p-6">
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

            {/* 注意事项 */}
            <div className="mb-6">
              <h4 className="mb-2 text-sm font-medium text-foreground">注意事项</h4>
              <p className="text-sm text-muted-foreground">{previewModel.notes}</p>
            </div>

            {/* 底部操作 */}
            <div className="mt-auto flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                {previewModel.isLocal ? (
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-green-500" />
                    本地模型 · 离线可用
                  </span>
                ) : (
                  <span>服务商: {previewModel.provider}</span>
                )}
              </div>
              <Button onClick={handleConfirm} className="min-w-[80px]">
                {previewModelId === selectedModelId ? (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    已选用
                  </>
                ) : (
                  "使用"
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// 便捷的模型选择按钮组件
interface ModelSelectButtonProps {
  modelId: string
  onModelChange: (modelId: string) => void
  className?: string
  compact?: boolean
}

export function ModelSelectButton({
  modelId,
  onModelChange,
  className,
  compact = false,
}: ModelSelectButtonProps) {
  const [open, setOpen] = useState(false)
  const model = AI_MODELS.find(m => m.id === modelId) || AI_MODELS[0]

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "flex items-center gap-2 rounded-lg border border-border/50 bg-card/50 px-3 py-2 text-left transition-colors hover:bg-muted/50",
          className
        )}
      >
        {model.icon}
        {!compact && (
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{model.name}</p>
            <p className="truncate text-xs text-muted-foreground">{model.subtitle}</p>
          </div>
        )}
      </button>

      <AIModelSelector
        open={open}
        onOpenChange={setOpen}
        selectedModelId={modelId}
        onSelectModel={onModelChange}
      />
    </>
  )
}
