"use client"

import { useState } from "react"
import {
  Settings,
  User,
  CreditCard,
  Bell,
  Shield,
  Palette,
  Keyboard,
  Database,
  Cloud,
  HelpCircle,
  ChevronRight,
  Check,
  X,
  Moon,
  Sun,
  Monitor,
  Zap,
  Brain,
  Sparkles,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  AlertCircle,
  Info,
  Download,
  Upload,
  Trash2,
  RefreshCw,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Globe,
  Clock,
  Calendar,
  BarChart3,
  PieChart,
  Activity,
  Wallet,
  Receipt,
  Gift,
  Crown,
  Star,
  Plus,
  Minus,
  Sliders,
  ToggleLeft,
  ToggleRight,
  Volume2,
  VolumeX,
  Type,
  Maximize2,
  Minimize2,
  Layout,
  Columns,
  FileText,
  BookOpen,
  PenTool,
  MessageSquare,
  Lightbulb,
  Target,
  Layers,
  Save,
  RotateCcw,
  ExternalLink,
  Copy,
  Link2,
  Mail,
  Smartphone,
  LogOut,
  UserPlus,
  Users,
  Building,
  CircleDollarSign,
  Gauge,
  Timer,
  Flame,
  Snowflake,
  Cpu,
  Server,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { AIModelSelector, AI_MODELS, ModelSelectButton } from "@/components/ai-model-selector"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

// 类型定义
interface UsageRecord {
  id: string
  date: Date
  module: string
  action: string
  tokens: number
  cost: number
}

interface BudgetAlert {
  id: string
  type: "warning" | "critical"
  message: string
  threshold: number
  currentUsage: number
}

interface AIModel {
  id: string
  name: string
  provider: string
  description: string
  costPer1kTokens: number
  speed: "fast" | "medium" | "slow"
  quality: "standard" | "high" | "premium"
  capabilities: string[]
}

// 设置分类
const settingsCategories = [
  { id: "account", label: "账户", icon: User, description: "个人信息与安全" },
  { id: "billing", label: "费用与额度", icon: CreditCard, description: "用量统计与预算" },
  { id: "ai", label: "AI 设置", icon: Brain, description: "模型选择与参数" },
  { id: "editor", label: "编辑器", icon: PenTool, description: "写作界面偏好" },
  { id: "appearance", label: "外观", icon: Palette, description: "主题与显示" },
  { id: "shortcuts", label: "快捷键", icon: Keyboard, description: "自定义快捷操作" },
  { id: "notifications", label: "通知", icon: Bell, description: "提醒与消息" },
  { id: "data", label: "数据管理", icon: Database, description: "备份与导出" },
  { id: "privacy", label: "隐私安全", icon: Shield, description: "数据保护设置" },
]

// AI 模型配置
const aiModels: AIModel[] = [
  {
    id: "gpt-4-turbo",
    name: "GPT-4 Turbo",
    provider: "OpenAI",
    description: "最强大的模型，适合复杂创作和深度分析",
    costPer1kTokens: 0.01,
    speed: "medium",
    quality: "premium",
    capabilities: ["长文本", "复杂推理", "创意写作", "角色扮演"],
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "OpenAI",
    description: "平衡性能与成本，日常创作首选",
    costPer1kTokens: 0.005,
    speed: "fast",
    quality: "high",
    capabilities: ["快速响应", "多轮对话", "写作辅助"],
  },
  {
    id: "claude-3-opus",
    name: "Claude 3 Opus",
    provider: "Anthropic",
    description: "擅长长文本创作和角色一致性",
    costPer1kTokens: 0.015,
    speed: "medium",
    quality: "premium",
    capabilities: ["长文本", "角色一致", "细腻描写", "逻辑严谨"],
  },
  {
    id: "claude-3-sonnet",
    name: "Claude 3 Sonnet",
    provider: "Anthropic",
    description: "创作质量与速度的平衡选择",
    costPer1kTokens: 0.003,
    speed: "fast",
    quality: "high",
    capabilities: ["快速响应", "写作辅助", "对话"],
  },
  {
    id: "deepseek-chat",
    name: "DeepSeek Chat",
    provider: "DeepSeek",
    description: "高性价比选择，适合日常辅助",
    costPer1kTokens: 0.001,
    speed: "fast",
    quality: "standard",
    capabilities: ["快速响应", "基础辅助", "对话"],
  },
]

// 模块配置
const moduleSettings = [
  { id: "tuiyan", name: "推演", icon: Layers, defaultModel: "gpt-4-turbo" },
  { id: "liuguang", name: "流光", icon: Sparkles, defaultModel: "gpt-4o" },
  { id: "wence", name: "问策", icon: MessageSquare, defaultModel: "claude-3-sonnet" },
  { id: "luobi", name: "落笔", icon: PenTool, defaultModel: "gpt-4o" },
  { id: "shenghui", name: "生辉", icon: Zap, defaultModel: "claude-3-opus" },
]

// 模拟用量数据
const mockUsageData = {
  currentMonth: {
    tokens: 2450000,
    cost: 18.75,
    budget: 50,
    daysRemaining: 12,
  },
  dailyAverage: {
    tokens: 125000,
    cost: 0.95,
  },
  byModule: [
    { module: "推演", tokens: 850000, cost: 6.8, percentage: 36 },
    { module: "生辉", tokens: 720000, cost: 5.4, percentage: 29 },
    { module: "问策", tokens: 480000, cost: 3.6, percentage: 19 },
    { module: "落笔", tokens: 280000, cost: 2.1, percentage: 11 },
    { module: "流光", tokens: 120000, cost: 0.85, percentage: 5 },
  ],
  trend: [
    { date: "4/1", tokens: 180000, cost: 1.35 },
    { date: "4/2", tokens: 220000, cost: 1.65 },
    { date: "4/3", tokens: 95000, cost: 0.71 },
    { date: "4/4", tokens: 310000, cost: 2.32 },
    { date: "4/5", tokens: 175000, cost: 1.31 },
  ],
}

// 费用与额度设置组件
function BillingSettings() {
  const [showBudgetDialog, setShowBudgetDialog] = useState(false)
  const [monthlyBudget, setMonthlyBudget] = useState(50)
  const [alertThreshold, setAlertThreshold] = useState(80)
  const [autoStop, setAutoStop] = useState(true)

  const usagePercentage = (mockUsageData.currentMonth.cost / mockUsageData.currentMonth.budget) * 100
  const projectedCost = mockUsageData.dailyAverage.cost * 30
  const isOverBudget = projectedCost > mockUsageData.currentMonth.budget

  return (
    <div className="space-y-6">
      {/* 用量概览 */}
      <div className="rounded-xl border border-border/40 bg-card/50 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">本月用量</h3>
          <Badge variant="outline" className="gap-1">
            <Calendar className="h-3 w-3" />
            {mockUsageData.currentMonth.daysRemaining} 天剩余
          </Badge>
        </div>

        {/* 费用进度 */}
        <div className="mb-6">
          <div className="mb-2 flex items-end justify-between">
            <div>
              <span className="text-3xl font-bold text-foreground">
                ${mockUsageData.currentMonth.cost.toFixed(2)}
              </span>
              <span className="ml-2 text-sm text-muted-foreground">
                / ${mockUsageData.currentMonth.budget}
              </span>
            </div>
            <span className={cn(
              "text-sm font-medium",
              usagePercentage > 80 ? "text-amber-500" : "text-green-500"
            )}>
              {usagePercentage.toFixed(1)}%
            </span>
          </div>
          <Progress
            value={usagePercentage}
            className={cn(
              "h-3",
              usagePercentage > 80 ? "[&>div]:bg-amber-500" : "[&>div]:bg-green-500"
            )}
          />
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>已使用 {(mockUsageData.currentMonth.tokens / 1000000).toFixed(2)}M tokens</span>
            {usagePercentage > alertThreshold && (
              <span className="flex items-center gap-1 text-amber-500">
                <AlertTriangle className="h-3 w-3" />
                接近预算上限
              </span>
            )}
          </div>
        </div>

        {/* 预测与统计 */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-border/30 bg-muted/20 p-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Activity className="h-4 w-4" />
              日均消耗
            </div>
            <p className="mt-1 text-lg font-semibold text-foreground">
              ${mockUsageData.dailyAverage.cost.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">
              {(mockUsageData.dailyAverage.tokens / 1000).toFixed(0)}K tokens
            </p>
          </div>
          <div className="rounded-lg border border-border/30 bg-muted/20 p-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingUp className="h-4 w-4" />
              预计月底
            </div>
            <p className={cn(
              "mt-1 text-lg font-semibold",
              isOverBudget ? "text-amber-500" : "text-foreground"
            )}>
              ${projectedCost.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">
              {isOverBudget ? "可能超支" : "预算内"}
            </p>
          </div>
          <div className="rounded-lg border border-border/30 bg-muted/20 p-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Wallet className="h-4 w-4" />
              余额
            </div>
            <p className="mt-1 text-lg font-semibold text-foreground">
              ${(mockUsageData.currentMonth.budget - mockUsageData.currentMonth.cost).toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">
              本月剩余
            </p>
          </div>
        </div>
      </div>

      {/* 模块用量分布 */}
      <div className="rounded-xl border border-border/40 bg-card/50 p-6">
        <h3 className="mb-4 text-lg font-semibold text-foreground">模块用量分布</h3>
        <div className="space-y-3">
          {mockUsageData.byModule.map((item) => {
            const moduleConfig = moduleSettings.find((m) => m.name === item.module)
            const Icon = moduleConfig?.icon || Zap
            return (
              <div key={item.module} className="flex items-center gap-4">
                <div className="flex w-20 items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-foreground">{item.module}</span>
                </div>
                <div className="flex-1">
                  <Progress value={item.percentage} className="h-2" />
                </div>
                <div className="w-24 text-right">
                  <span className="text-sm font-medium text-foreground">${item.cost.toFixed(2)}</span>
                  <span className="ml-1 text-xs text-muted-foreground">({item.percentage}%)</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 预算控制 */}
      <div className="rounded-xl border border-border/40 bg-card/50 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">预算控制</h3>
          <Button variant="outline" size="sm" onClick={() => setShowBudgetDialog(true)}>
            修改设置
          </Button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border/30 bg-muted/20 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <CircleDollarSign className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-foreground">月度预算上限</p>
                <p className="text-sm text-muted-foreground">达到上限后的处理方式</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-lg font-semibold text-foreground">${monthlyBudget}</p>
              <p className="text-xs text-muted-foreground">
                {autoStop ? "达到后自动暂停" : "仅提醒不暂停"}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/30 bg-muted/20 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="font-medium text-foreground">预警阈值</p>
                <p className="text-sm text-muted-foreground">接近预算时发出提醒</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-lg font-semibold text-foreground">{alertThreshold}%</p>
              <p className="text-xs text-muted-foreground">
                约 ${(monthlyBudget * alertThreshold / 100).toFixed(2)}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/30 bg-muted/20 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-500/10">
                <Gauge className="h-5 w-5 text-rose-500" />
              </div>
              <div>
                <p className="font-medium text-foreground">单次请求限制</p>
                <p className="text-sm text-muted-foreground">防止意外大量消耗</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-lg font-semibold text-foreground">100K</p>
              <p className="text-xs text-muted-foreground">tokens/次</p>
            </div>
          </div>
        </div>
      </div>

      {/* 超阈值强制验证设置 */}
      <div className="rounded-xl border border-border/40 bg-card/50 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">超阈值强制验证</h3>
          <Badge variant="outline" className="gap-1 text-amber-500 border-amber-500/50">
            <Shield className="h-3 w-3" />
            安全保护
          </Badge>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          当单次AI请求预估消耗超过设定阈值时，需要二次确认才能执行，防止误操作导致大量消耗
        </p>

        <div className="space-y-4">
          {/* 验证模式 */}
          <div className="rounded-lg border border-border/30 bg-muted/20 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-medium text-foreground">验证模式</p>
            </div>
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border/30 bg-background/50 p-3 hover:bg-muted/30">
                <input type="radio" name="verifyMode" className="text-primary" defaultChecked />
                <div>
                  <p className="text-sm font-medium text-foreground">关闭</p>
                  <p className="text-xs text-muted-foreground">不进行任何验证提示</p>
                </div>
              </label>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border/30 bg-background/50 p-3 hover:bg-muted/30">
                <input type="radio" name="verifyMode" className="text-primary" />
                <div>
                  <p className="text-sm font-medium text-foreground">仅提示</p>
                  <p className="text-xs text-muted-foreground">显示消耗预估，用户可选择继续</p>
                </div>
              </label>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-primary/50 bg-primary/5 p-3">
                <input type="radio" name="verifyMode" className="text-primary" />
                <div>
                  <p className="text-sm font-medium text-foreground">强制确认</p>
                  <p className="text-xs text-muted-foreground">必须点击确认按钮才能继续执行</p>
                </div>
                <Badge className="ml-auto">推荐</Badge>
              </label>
            </div>
          </div>

          {/* 验证阈值设置 */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-border/30 bg-muted/20 p-4">
              <div className="mb-2 flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                <p className="text-sm font-medium text-foreground">Token 阈值</p>
              </div>
              <p className="mb-3 text-xs text-muted-foreground">单次请求预估超过此值时触发验证</p>
              <Select defaultValue="50000">
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="20000">20K tokens (约$0.02)</SelectItem>
                  <SelectItem value="50000">50K tokens (约$0.05)</SelectItem>
                  <SelectItem value="100000">100K tokens (约$0.10)</SelectItem>
                  <SelectItem value="200000">200K tokens (约$0.20)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-lg border border-border/30 bg-muted/20 p-4">
              <div className="mb-2 flex items-center gap-2">
                <CircleDollarSign className="h-4 w-4 text-green-500" />
                <p className="text-sm font-medium text-foreground">费用阈值</p>
              </div>
              <p className="mb-3 text-xs text-muted-foreground">单次请求预估费用超过此值时触发验证</p>
              <Select defaultValue="0.10">
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0.05">$0.05</SelectItem>
                  <SelectItem value="0.10">$0.10</SelectItem>
                  <SelectItem value="0.25">$0.25</SelectItem>
                  <SelectItem value="0.50">$0.50</SelectItem>
                  <SelectItem value="1.00">$1.00</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 高危操作始终确认 */}
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <p className="font-medium text-foreground">高危操作始终确认</p>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              以下操作无论消耗大小，都需要二次确认
            </p>
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-3">
                <Checkbox defaultChecked id="verify-batch" />
                <span className="text-sm text-foreground">批量生成（整卷仿写、多章推演）</span>
              </label>
              <label className="flex cursor-pointer items-center gap-3">
                <Checkbox defaultChecked id="verify-rag" />
                <span className="text-sm text-foreground">全文关联生成（使用藏经提炼）</span>
              </label>
              <label className="flex cursor-pointer items-center gap-3">
                <Checkbox id="verify-rewrite" />
                <span className="text-sm text-foreground">重写已有内容（覆盖原文）</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* 进阶防误触设置 */}
      <div className="rounded-xl border border-border/40 bg-card/50 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">进阶防误触</h3>
          <Badge variant="outline" className="text-xs">可选</Badge>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          额外的安全机制，适合担心误操作的用户。这些设置会增加操作步骤但能有效防止意外消耗。
        </p>

        <div className="space-y-4">
          {/* 数字确认 */}
          <div className="flex items-center justify-between rounded-lg border border-border/30 bg-muted/20 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                <Keyboard className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="font-medium text-foreground">数字确认</p>
                <p className="text-xs text-muted-foreground">超阈值时需输入屏幕显示的验证码</p>
              </div>
            </div>
            <Switch />
          </div>

          {/* 长按确认 */}
          <div className="flex items-center justify-between rounded-lg border border-border/30 bg-muted/20 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
                <Timer className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="font-medium text-foreground">长按确认</p>
                <p className="text-xs text-muted-foreground">高危操作需长按按钮2秒以上</p>
              </div>
            </div>
            <Switch />
          </div>

          {/* 冷却时间 */}
          <div className="flex items-center justify-between rounded-lg border border-border/30 bg-muted/20 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/10">
                <Clock className="h-5 w-5 text-cyan-500" />
              </div>
              <div>
                <p className="font-medium text-foreground">操作冷却</p>
                <p className="text-xs text-muted-foreground">同一高危操作间隔至少5秒</p>
              </div>
            </div>
            <Switch />
          </div>

          {/* 会话/日累计限制 */}
          <div className="rounded-lg border border-border/30 bg-muted/20 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-orange-500" />
                <p className="font-medium text-foreground">累计消耗限制</p>
              </div>
              <Switch defaultChecked />
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              当会话或当日累计消耗达到限额时，锁定AI功能需手动解锁
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">会话限额</label>
                <Select defaultValue="5">
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">$2.00</SelectItem>
                    <SelectItem value="5">$5.00</SelectItem>
                    <SelectItem value="10">$10.00</SelectItem>
                    <SelectItem value="unlimited">不限制</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">日限额</label>
                <Select defaultValue="10">
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">$5.00</SelectItem>
                    <SelectItem value="10">$10.00</SelectItem>
                    <SelectItem value="20">$20.00</SelectItem>
                    <SelectItem value="unlimited">不限制</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 充值与订阅 */}
      <div className="rounded-xl border border-border/40 bg-card/50 p-6">
        <h3 className="mb-4 text-lg font-semibold text-foreground">充值与订阅</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col items-center rounded-lg border border-border/30 bg-muted/20 p-6 text-center">
            <Gift className="mb-2 h-8 w-8 text-primary" />
            <h4 className="font-medium text-foreground">按量付费</h4>
            <p className="mt-1 text-sm text-muted-foreground">用多少付多少，灵活可控</p>
            <Button className="mt-4" variant="outline">
              充值余额
            </Button>
          </div>
          <div className="relative flex flex-col items-center rounded-lg border-2 border-primary/50 bg-primary/5 p-6 text-center">
            <Badge className="absolute -top-2.5 right-4 bg-primary">推荐</Badge>
            <Crown className="mb-2 h-8 w-8 text-primary" />
            <h4 className="font-medium text-foreground">Pro 订阅</h4>
            <p className="mt-1 text-sm text-muted-foreground">每月固定额度，享受更多特权</p>
            <Button className="mt-4">
              升级 Pro
            </Button>
          </div>
        </div>
      </div>

      {/* 预算设置对话框 */}
      <Dialog open={showBudgetDialog} onOpenChange={setShowBudgetDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>预算设置</DialogTitle>
            <DialogDescription>设置月度预算上限和预警阈值</DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-3">
              <label className="text-sm font-medium text-foreground">月度预算上限</label>
              <div className="flex items-center gap-3">
                <span className="text-lg text-muted-foreground">$</span>
                <Input
                  type="number"
                  value={monthlyBudget}
                  onChange={(e) => setMonthlyBudget(Number(e.target.value))}
                  className="bg-muted/30"
                />
              </div>
              <div className="flex gap-2">
                {[20, 50, 100, 200].map((amount) => (
                  <Button
                    key={amount}
                    variant="outline"
                    size="sm"
                    onClick={() => setMonthlyBudget(amount)}
                    className={cn(monthlyBudget === amount && "border-primary bg-primary/10")}
                  >
                    ${amount}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">预警阈值</label>
                <span className="text-sm text-muted-foreground">{alertThreshold}%</span>
              </div>
              <Slider
                value={[alertThreshold]}
                onValueChange={([value]) => setAlertThreshold(value)}
                min={50}
                max={95}
                step={5}
              />
              <p className="text-xs text-muted-foreground">
                当用量达到预算的 {alertThreshold}%（约 ${(monthlyBudget * alertThreshold / 100).toFixed(2)}）时发出提醒
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border/30 bg-muted/20 p-3">
              <div>
                <p className="text-sm font-medium text-foreground">达到上限后自动暂停</p>
                <p className="text-xs text-muted-foreground">防止超支，需手动恢复</p>
              </div>
              <Switch checked={autoStop} onCheckedChange={setAutoStop} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBudgetDialog(false)}>
              取消
            </Button>
            <Button onClick={() => setShowBudgetDialog(false)}>
              保存设置
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// AI 设置组件
function AISettings() {
  const [selectedModels, setSelectedModels] = useState<Record<string, string>>({
    tuiyan: "jianshan",
    liuguang: "guanyun",
    wence: "jianshan",
    luobi: "tingyu",
    shenghui: "tingyu",
  })
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(4000)
  const [streamResponse, setStreamResponse] = useState(true)
  const [autoSave, setAutoSave] = useState(true)
  const [showModelSelector, setShowModelSelector] = useState(false)
  const [editingModule, setEditingModule] = useState<string | null>(null)

  const getModelConfig = (modelId: string) => AI_MODELS.find((m) => m.id === modelId)

  const handleOpenModelSelector = (moduleId: string) => {
    setEditingModule(moduleId)
    setShowModelSelector(true)
  }

  const handleSelectModel = (modelId: string) => {
    if (editingModule) {
      setSelectedModels({ ...selectedModels, [editingModule]: modelId })
    }
    setShowModelSelector(false)
    setEditingModule(null)
  }

  return (
    <div className="space-y-6">
      {/* 模块模型配置 */}
      <div className="rounded-xl border border-border/40 bg-card/50 p-6">
        <h3 className="mb-4 text-lg font-semibold text-foreground">模块模型配置</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          为不同模块选择最适合的 AI 模型，平衡质量与成本
        </p>

        <div className="space-y-4">
          {moduleSettings.map((module) => {
            const Icon = module.icon
            const currentModel = getModelConfig(selectedModels[module.id])
            return (
              <div
                key={module.id}
                className="flex items-center justify-between rounded-lg border border-border/30 bg-muted/20 p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{module.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {currentModel?.subtitle}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleOpenModelSelector(module.id)}
                  className="flex items-center gap-2 rounded-lg border border-border/50 bg-background px-3 py-2 text-left transition-colors hover:bg-muted/50"
                >
                  {currentModel?.icon}
                  <div>
                    <p className="text-sm font-medium text-foreground">{currentModel?.name}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* 可用模型概览 */}
      <div className="rounded-xl border border-border/40 bg-card/50 p-6">
        <h3 className="mb-4 text-lg font-semibold text-foreground">可用模型</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {AI_MODELS.map((model) => (
            <div
              key={model.id}
              className="rounded-lg border border-border/30 bg-muted/20 p-4"
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {model.icon}
                  <div>
                    <h4 className="font-medium text-foreground">{model.name}</h4>
                    <p className="text-xs text-muted-foreground">{model.subtitle}</p>
                  </div>
                </div>
                {model.isLocal && (
                  <Badge variant="outline" className="border-green-500/50 text-green-500">
                    本地
                  </Badge>
                )}
              </div>
              <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">{model.description}</p>
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    文采
                    <span className="ml-1 flex gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <span
                          key={i}
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            i < model.ratings.literary ? "bg-amber-400" : "bg-muted"
                          )}
                        />
                      ))}
                    </span>
                  </span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    遵从
                    <span className="ml-1 flex gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <span
                          key={i}
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            i < model.ratings.instruction ? "bg-amber-400" : "bg-muted"
                          )}
                        />
                      ))}
                    </span>
                  </span>
                </div>
                <span className="text-muted-foreground">{model.provider}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* AI Model Selector Dialog */}
      <AIModelSelector
        open={showModelSelector}
        onOpenChange={setShowModelSelector}
        selectedModelId={editingModule ? selectedModels[editingModule] : "jianshan"}
        onSelectModel={handleSelectModel}
        title="选择模型"
      />

      {/* 全局参数 */}
      <div className="rounded-xl border border-border/40 bg-card/50 p-6">
        <h3 className="mb-4 text-lg font-semibold text-foreground">全局参数</h3>
        <div className="space-y-6">
          {/* Temperature */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-orange-500" />
                <label className="text-sm font-medium text-foreground">创意度 (Temperature)</label>
              </div>
              <span className="text-sm text-muted-foreground">{temperature}</span>
            </div>
            <Slider
              value={[temperature]}
              onValueChange={([value]) => setTemperature(value)}
              min={0}
              max={1}
              step={0.1}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Snowflake className="h-3 w-3" />
                精确严谨
              </span>
              <span className="flex items-center gap-1">
                <Flame className="h-3 w-3" />
                创意发散
              </span>
            </div>
          </div>

          {/* Max Tokens */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-blue-500" />
                <label className="text-sm font-medium text-foreground">最大输出长度</label>
              </div>
              <span className="text-sm text-muted-foreground">{maxTokens} tokens</span>
            </div>
            <Slider
              value={[maxTokens]}
              onValueChange={([value]) => setMaxTokens(value)}
              min={1000}
              max={8000}
              step={500}
            />
            <p className="text-xs text-muted-foreground">
              约 {Math.round(maxTokens * 0.75)} 个汉字
            </p>
          </div>

          {/* 开关选项 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-border/30 bg-muted/20 p-3">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">流式输出</p>
                  <p className="text-xs text-muted-foreground">逐字显示 AI 回复</p>
                </div>
              </div>
              <Switch checked={streamResponse} onCheckedChange={setStreamResponse} />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border/30 bg-muted/20 p-3">
              <div className="flex items-center gap-2">
                <Save className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">自动保存对话</p>
                  <p className="text-xs text-muted-foreground">保存所有 AI 交互记录</p>
                </div>
              </div>
              <Switch checked={autoSave} onCheckedChange={setAutoSave} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// 编辑器设置组件
function EditorSettings() {
  const [fontSize, setFontSize] = useState(16)
  const [lineHeight, setLineHeight] = useState(1.8)
  const [fontFamily, setFontFamily] = useState("system")
  const [autoSave, setAutoSave] = useState(true)
  const [autoSaveInterval, setAutoSaveInterval] = useState(30)
  const [showWordCount, setShowWordCount] = useState(true)
  const [typewriterMode, setTypewriterMode] = useState(false)
  const [focusMode, setFocusMode] = useState(false)

  return (
    <div className="space-y-6">
      {/* 字体设置 */}
      <div className="rounded-xl border border-border/40 bg-card/50 p-6">
        <h3 className="mb-4 text-lg font-semibold text-foreground">字体设置</h3>
        <div className="space-y-6">
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">字体</label>
            <Select value={fontFamily} onValueChange={setFontFamily}>
              <SelectTrigger className="bg-muted/30">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">系统默认</SelectItem>
                <SelectItem value="serif">宋体</SelectItem>
                <SelectItem value="sans">黑体</SelectItem>
                <SelectItem value="mono">等宽字体</SelectItem>
                <SelectItem value="kaiti">楷体</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">字号</label>
              <span className="text-sm text-muted-foreground">{fontSize}px</span>
            </div>
            <Slider
              value={[fontSize]}
              onValueChange={([value]) => setFontSize(value)}
              min={12}
              max={24}
              step={1}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">行高</label>
              <span className="text-sm text-muted-foreground">{lineHeight}</span>
            </div>
            <Slider
              value={[lineHeight]}
              onValueChange={([value]) => setLineHeight(value)}
              min={1.2}
              max={2.5}
              step={0.1}
            />
          </div>

          {/* 预览 */}
          <div
            className="rounded-lg border border-border/30 bg-muted/20 p-4"
            style={{ fontSize: `${fontSize}px`, lineHeight: lineHeight }}
          >
            <p className="text-foreground">
              这是一段预览文字。The quick brown fox jumps over the lazy dog. 天地玄黄，宇宙洪荒。
            </p>
          </div>
        </div>
      </div>

      {/* 编辑体验 */}
      <div className="rounded-xl border border-border/40 bg-card/50 p-6">
        <h3 className="mb-4 text-lg font-semibold text-foreground">编辑体验</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-border/30 bg-muted/20 p-3">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">打字机模式</p>
                <p className="text-xs text-muted-foreground">当前行始终保持在屏幕中央</p>
              </div>
            </div>
            <Switch checked={typewriterMode} onCheckedChange={setTypewriterMode} />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/30 bg-muted/20 p-3">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">专注模式</p>
                <p className="text-xs text-muted-foreground">淡化非当前段落，减少干扰</p>
              </div>
            </div>
            <Switch checked={focusMode} onCheckedChange={setFocusMode} />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/30 bg-muted/20 p-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">显示字数统计</p>
                <p className="text-xs text-muted-foreground">底部显示实时字数</p>
              </div>
            </div>
            <Switch checked={showWordCount} onCheckedChange={setShowWordCount} />
          </div>
        </div>
      </div>

      {/* 自动保存 */}
      <div className="rounded-xl border border-border/40 bg-card/50 p-6">
        <h3 className="mb-4 text-lg font-semibold text-foreground">自动保存</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Save className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">启用自动保存</span>
            </div>
            <Switch checked={autoSave} onCheckedChange={setAutoSave} />
          </div>

          {autoSave && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm text-muted-foreground">保存间隔</label>
                <span className="text-sm text-muted-foreground">{autoSaveInterval} 秒</span>
              </div>
              <Slider
                value={[autoSaveInterval]}
                onValueChange={([value]) => setAutoSaveInterval(value)}
                min={10}
                max={120}
                step={10}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// 外观设置组件
function AppearanceSettings() {
  const [theme, setTheme] = useState<"light" | "dark" | "system">("dark")
  const [accentColor, setAccentColor] = useState("blue")
  const [sidebarPosition, setSidebarPosition] = useState<"left" | "right">("left")
  const [compactMode, setCompactMode] = useState(false)

  const accentColors = [
    { id: "blue", label: "蓝色", class: "bg-blue-500" },
    { id: "purple", label: "紫色", class: "bg-purple-500" },
    { id: "green", label: "绿色", class: "bg-green-500" },
    { id: "amber", label: "琥珀", class: "bg-amber-500" },
    { id: "rose", label: "玫瑰", class: "bg-rose-500" },
    { id: "cyan", label: "青色", class: "bg-cyan-500" },
  ]

  return (
    <div className="space-y-6">
      {/* 主题 */}
      <div className="rounded-xl border border-border/40 bg-card/50 p-6">
        <h3 className="mb-4 text-lg font-semibold text-foreground">主题</h3>
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => setTheme("light")}
            className={cn(
              "flex flex-col items-center gap-2 rounded-lg border p-4 transition-all",
              theme === "light"
                ? "border-primary bg-primary/5"
                : "border-border/30 bg-muted/20 hover:border-primary/30"
            )}
          >
            <Sun className="h-6 w-6" />
            <span className="text-sm">浅色</span>
          </button>
          <button
            onClick={() => setTheme("dark")}
            className={cn(
              "flex flex-col items-center gap-2 rounded-lg border p-4 transition-all",
              theme === "dark"
                ? "border-primary bg-primary/5"
                : "border-border/30 bg-muted/20 hover:border-primary/30"
            )}
          >
            <Moon className="h-6 w-6" />
            <span className="text-sm">深色</span>
          </button>
          <button
            onClick={() => setTheme("system")}
            className={cn(
              "flex flex-col items-center gap-2 rounded-lg border p-4 transition-all",
              theme === "system"
                ? "border-primary bg-primary/5"
                : "border-border/30 bg-muted/20 hover:border-primary/30"
            )}
          >
            <Monitor className="h-6 w-6" />
            <span className="text-sm">跟随系统</span>
          </button>
        </div>
      </div>

      {/* 强调色 */}
      <div className="rounded-xl border border-border/40 bg-card/50 p-6">
        <h3 className="mb-4 text-lg font-semibold text-foreground">强调色</h3>
        <div className="flex flex-wrap gap-3">
          {accentColors.map((color) => (
            <button
              key={color.id}
              onClick={() => setAccentColor(color.id)}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 transition-all",
                accentColor === color.id
                  ? "border-primary bg-primary/5"
                  : "border-border/30 bg-muted/20 hover:border-primary/30"
              )}
            >
              <div className={cn("h-4 w-4 rounded-full", color.class)} />
              <span className="text-sm">{color.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 布局 */}
      <div className="rounded-xl border border-border/40 bg-card/50 p-6">
        <h3 className="mb-4 text-lg font-semibold text-foreground">布局</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border/30 bg-muted/20 p-3">
            <div className="flex items-center gap-2">
              <Columns className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">侧边栏位置</p>
                <p className="text-xs text-muted-foreground">选择导航栏的位置</p>
              </div>
            </div>
            <Select value={sidebarPosition} onValueChange={(v) => setSidebarPosition(v as "left" | "right")}>
              <SelectTrigger className="w-[100px] bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="left">左侧</SelectItem>
                <SelectItem value="right">右侧</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/30 bg-muted/20 p-3">
            <div className="flex items-center gap-2">
              <Minimize2 className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">紧凑模式</p>
                <p className="text-xs text-muted-foreground">减少间距，显示更多内容</p>
              </div>
            </div>
            <Switch checked={compactMode} onCheckedChange={setCompactMode} />
          </div>
        </div>
      </div>
    </div>
  )
}

// 账户设置组件
function AccountSettings() {
  return (
    <div className="space-y-6">
      {/* 个人信息 */}
      <div className="rounded-xl border border-border/40 bg-card/50 p-6">
        <h3 className="mb-4 text-lg font-semibold text-foreground">个人信息</h3>
        <div className="flex items-start gap-6">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary/30 to-primary/10">
            <User className="h-10 w-10 text-primary" />
          </div>
          <div className="flex-1 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">用户名</label>
                <Input defaultValue="写作者" className="bg-muted/30" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">笔名</label>
                <Input defaultValue="墨染青山" className="bg-muted/30" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">邮箱</label>
              <Input defaultValue="writer@example.com" className="bg-muted/30" />
            </div>
          </div>
        </div>
      </div>

      {/* 会员状态 */}
      <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20">
              <Crown className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Pro 会员</h3>
              <p className="text-sm text-muted-foreground">有效期至 2024-12-31</p>
            </div>
          </div>
          <Button variant="outline">
            管理订阅
          </Button>
        </div>
      </div>

      {/* 安全设置 */}
      <div className="rounded-xl border border-border/40 bg-card/50 p-6">
        <h3 className="mb-4 text-lg font-semibold text-foreground">安全设置</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-border/30 bg-muted/20 p-4">
            <div className="flex items-center gap-3">
              <Lock className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium text-foreground">修改密码</p>
                <p className="text-sm text-muted-foreground">上次修改于 30 天前</p>
              </div>
            </div>
            <Button variant="outline" size="sm">
              修改
            </Button>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/30 bg-muted/20 p-4">
            <div className="flex items-center gap-3">
              <Smartphone className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium text-foreground">两步验证</p>
                <p className="text-sm text-muted-foreground">未开启</p>
              </div>
            </div>
            <Button variant="outline" size="sm">
              开启
            </Button>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/30 bg-muted/20 p-4">
            <div className="flex items-center gap-3">
              <Activity className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium text-foreground">登录历史</p>
                <p className="text-sm text-muted-foreground">查看所有登录记录</p>
              </div>
            </div>
            <Button variant="outline" size="sm">
              查看
            </Button>
          </div>
        </div>
      </div>

      {/* 危险区域 */}
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6">
        <h3 className="mb-4 text-lg font-semibold text-destructive">危险区域</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-foreground">删除账户</p>
            <p className="text-sm text-muted-foreground">永久删除账户及所有数据，此操作不可恢复</p>
          </div>
          <Button variant="destructive" size="sm">
            删除账户
          </Button>
        </div>
      </div>
    </div>
  )
}

// 主组件
export function SettingsModule() {
  const [activeCategory, setActiveCategory] = useState("billing")

  const renderContent = () => {
    switch (activeCategory) {
      case "account":
        return <AccountSettings />
      case "billing":
        return <BillingSettings />
      case "ai":
        return <AISettings />
      case "editor":
        return <EditorSettings />
      case "appearance":
        return <AppearanceSettings />
      default:
        return (
          <div className="flex flex-col items-center justify-center py-20">
            <Settings className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">该设置页面正在开发中</p>
          </div>
        )
    }
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* 侧边导航 */}
      <aside className="w-64 shrink-0 border-r border-border/40 bg-card/30">
        <ScrollArea className="h-full">
          <div className="p-4">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
              <Settings className="h-5 w-5 text-primary" />
              设置
            </h2>
            <div className="space-y-1">
              {settingsCategories.map((category) => {
                const Icon = category.icon
                return (
                  <button
                    key={category.id}
                    onClick={() => setActiveCategory(category.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                      activeCategory === category.id
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{category.label}</p>
                      <p className="text-xs opacity-60">{category.description}</p>
                    </div>
                    <ChevronRight className={cn(
                      "h-4 w-4 transition-transform",
                      activeCategory === category.id && "rotate-90"
                    )} />
                  </button>
                )
              })}
            </div>
          </div>
        </ScrollArea>
      </aside>

      {/* 主内容区 */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="mx-auto max-w-3xl p-6">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-foreground">
                {settingsCategories.find((c) => c.id === activeCategory)?.label}
              </h1>
              <p className="text-muted-foreground">
                {settingsCategories.find((c) => c.id === activeCategory)?.description}
              </p>
            </div>
            {renderContent()}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
