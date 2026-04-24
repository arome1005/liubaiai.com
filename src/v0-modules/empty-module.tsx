
import { useState } from "react"
import {
  Library,
  GitBranch,
  Lightbulb,
  MessageSquare,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Clock,
  Zap,
  BookOpen,
  PenTool,
  Brain,
  Target,
  Layers,
  Network,
  MessageCircle,
  FileText,
  Wand2,
} from "lucide-react"
import { cn } from "../lib/utils"
import { Button } from "../components/ui/button"
import { Badge } from "../components/ui/badge"
import { Progress } from "../components/ui/progress"

interface EmptyModuleProps {
  moduleId: string
}

const moduleConfig: Record<
  string,
  {
    icon: typeof Library
    title: string
    description: string
    subtitle: string
    gradient: string
    features: {
      icon: typeof Library
      title: string
      description: string
      status: "done" | "progress" | "planned"
    }[]
    stats?: { label: string; value: string }[]
    relatedModules?: string[]
  }
> = {
  liubai: {
    icon: Library,
    title: "留白",
    subtitle: "作品门户",
    description: "管理你的所有作品、卷与章节，追踪写作进度与数据统计",
    gradient: "from-blue-500/20 via-primary/10 to-transparent",
    features: [
      {
        icon: BookOpen,
        title: "作品卡片展示",
        description: "直观的卡片式作品库，一目了然查看所有创作",
        status: "progress",
      },
      {
        icon: Target,
        title: "进度追踪",
        description: "可视化写作进度，设定目标并追踪完成情况",
        status: "progress",
      },
      {
        icon: Layers,
        title: "多级结构",
        description: "支持作品 → 卷 → 章的层级管理",
        status: "planned",
      },
      {
        icon: FileText,
        title: "快速导入",
        description: "支持 TXT / MD / DOCX 格式一键导入",
        status: "planned",
      },
    ],
    stats: [
      { label: "规划功能", value: "12" },
      { label: "开发中", value: "4" },
      { label: "已完成", value: "0" },
    ],
    relatedModules: ["推演", "落笔"],
  },
  tuiyan: {
    icon: GitBranch,
    title: "推演",
    subtitle: "大纲与逻辑",
    description: "从构思到定稿的完整推演流程，建立故事的骨架与脉络",
    gradient: "from-emerald-500/20 via-primary/10 to-transparent",
    features: [
      {
        icon: Network,
        title: "层级大纲",
        description: "大纲 → 卷纲 → 细纲，逐层细化故事结构",
        status: "progress",
      },
      {
        icon: PenTool,
        title: "文策制定",
        description: "制定写作策略与时间序文策日志",
        status: "progress",
      },
      {
        icon: Brain,
        title: "思维导图",
        description: "可视化编辑故事线与人物关系",
        status: "planned",
      },
      {
        icon: BookOpen,
        title: "藏经关联",
        description: "从参考书中提炼灵感，非洗稿的合规借鉴",
        status: "planned",
      },
    ],
    stats: [
      { label: "规划功能", value: "15" },
      { label: "开发中", value: "5" },
      { label: "已完成", value: "0" },
    ],
    relatedModules: ["藏经", "落笔"],
  },
  liuguang: {
    icon: Lightbulb,
    title: "流光",
    subtitle: "灵感碎片",
    description: "捕捉转瞬即逝的创作灵感，让每一个闪念都有归宿",
    gradient: "from-amber-500/20 via-primary/10 to-transparent",
    features: [
      {
        icon: Zap,
        title: "快捷记录",
        description: "全局快捷键随时唤起，3 秒内记录灵感",
        status: "planned",
      },
      {
        icon: Wand2,
        title: "AI 扩容",
        description: "AI 辅助扩展灵感，生成多种候选方案",
        status: "planned",
      },
      {
        icon: Layers,
        title: "拖拽入章",
        description: "灵感卡片可直接拖入章节编辑器",
        status: "planned",
      },
      {
        icon: Target,
        title: "智能分类",
        description: "自动标签与分类，按主题整理灵感",
        status: "planned",
      },
    ],
    stats: [
      { label: "规划功能", value: "8" },
      { label: "开发中", value: "0" },
      { label: "已完成", value: "0" },
    ],
    relatedModules: ["落笔", "生辉"],
  },
  wence: {
    icon: MessageSquare,
    title: "问策",
    subtitle: "策略对话",
    description: "开放式 AI 对话辅助创作决策，重塑分析与情节咨询",
    gradient: "from-purple-500/20 via-primary/10 to-transparent",
    features: [
      {
        icon: BookOpen,
        title: "重塑分析",
        description: "AI 辅助分析参考书籍的写作技法",
        status: "planned",
      },
      {
        icon: MessageCircle,
        title: "情节咨询",
        description: "讨论情节走向，获取多种可能性建议",
        status: "planned",
      },
      {
        icon: Brain,
        title: "人物塑造",
        description: "深入分析人物动机与性格弧光",
        status: "planned",
      },
      {
        icon: Target,
        title: "边界清晰",
        description: "与推演模块职责分明，各司其职",
        status: "planned",
      },
    ],
    stats: [
      { label: "规划功能", value: "10" },
      { label: "开发中", value: "0" },
      { label: "已完成", value: "0" },
    ],
    relatedModules: ["推演", "生辉"],
  },
}

const statusConfig = {
  done: { label: "已完成", color: "text-[oklch(0.7_0.15_145)]", bg: "bg-[oklch(0.7_0.15_145)]/10" },
  progress: { label: "开发中", color: "text-amber-400", bg: "bg-amber-500/10" },
  planned: { label: "规划中", color: "text-muted-foreground", bg: "bg-muted/30" },
}

export function EmptyModule({ moduleId }: EmptyModuleProps) {
  const config = moduleConfig[moduleId]
  const [hoveredFeature, setHoveredFeature] = useState<number | null>(null)

  if (!config) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
        <p className="text-muted-foreground">模块开发中...</p>
      </div>
    )
  }

  const Icon = config.icon
  const progressFeatures = config.features.filter((f) => f.status === "progress").length
  const doneFeatures = config.features.filter((f) => f.status === "done").length
  const totalFeatures = config.features.length
  const progressPercent = ((progressFeatures + doneFeatures) / totalFeatures) * 100

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col overflow-auto">
      {/* Hero Section */}
      <div className={cn("relative overflow-hidden px-6 py-16", `bg-gradient-to-br ${config.gradient}`)}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(159,192,255,0.08),transparent_50%)]" />
        <div className="relative mx-auto max-w-3xl text-center">
          {/* Icon */}
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
            <Icon className="h-10 w-10 text-primary" />
          </div>

          {/* Title */}
          <h1 className="text-3xl font-bold text-foreground">{config.title}</h1>
          <p className="mt-2 text-lg text-primary">{config.subtitle}</p>
          <p className="mt-4 text-muted-foreground">{config.description}</p>

          {/* Progress */}
          <div className="mx-auto mt-8 max-w-sm">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">开发进度</span>
              <span className="font-medium text-foreground">{progressPercent.toFixed(0)}%</span>
            </div>
            <Progress value={progressPercent} className="mt-2 h-2" />
          </div>

          {/* Coming Soon Badge */}
          <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">即将推出</span>
          </div>
        </div>
      </div>

      {/* Features Grid */}
      <div className="flex-1 px-6 py-12">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-6 text-center text-lg font-semibold text-foreground">规划功能</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {config.features.map((feature, index) => {
              const FeatureIcon = feature.icon
              const status = statusConfig[feature.status]
              return (
                <div
                  key={index}
                  className={cn(
                    "group relative overflow-hidden rounded-xl border border-border/40 bg-card/30 p-5 transition-all",
                    hoveredFeature === index && "border-primary/30 bg-card/50"
                  )}
                  onMouseEnter={() => setHoveredFeature(index)}
                  onMouseLeave={() => setHoveredFeature(null)}
                >
                  <div className="flex items-start gap-4">
                    <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", status.bg)}>
                      <FeatureIcon className={cn("h-5 w-5", status.color)} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium text-foreground">{feature.title}</h3>
                        <Badge
                          variant="secondary"
                          className={cn("h-5 text-[10px]", status.bg, status.color)}
                        >
                          {status.label}
                        </Badge>
                      </div>
                      <p className="mt-1.5 text-sm text-muted-foreground">{feature.description}</p>
                    </div>
                  </div>
                  {/* Hover Effect */}
                  <div
                    className={cn(
                      "absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-0 transition-opacity",
                      hoveredFeature === index && "opacity-100"
                    )}
                  />
                </div>
              )
            })}
          </div>

          {/* Stats & Related */}
          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            {/* Stats */}
            {config.stats && (
              <div className="rounded-xl border border-border/40 bg-card/30 p-5">
                <h3 className="mb-4 text-sm font-medium text-foreground">开发状态</h3>
                <div className="grid grid-cols-3 gap-4">
                  {config.stats.map((stat, index) => (
                    <div key={index} className="text-center">
                      <p className="text-2xl font-semibold text-foreground">{stat.value}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{stat.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Related Modules */}
            {config.relatedModules && (
              <div className="rounded-xl border border-border/40 bg-card/30 p-5">
                <h3 className="mb-4 text-sm font-medium text-foreground">关联模块</h3>
                <div className="flex flex-wrap gap-2">
                  {config.relatedModules.map((module) => (
                    <Button
                      key={module}
                      variant="outline"
                      size="sm"
                      className="gap-2"
                    >
                      {module}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  这些模块将与「{config.title}」协同工作，形成完整的写作流程
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
