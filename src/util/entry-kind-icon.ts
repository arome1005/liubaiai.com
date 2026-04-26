/**
 * entryKind → 图标 + 颜色 动态映射。
 * 覆盖用户提供的数百个词条类别，采用"精确匹配 → 关键词 contains → 默认"三级策略。
 * 图标均为 lucide-react 图标组件引用（ComponentType）。
 */
import type { LucideIcon } from "lucide-react"
import {
  BookOpen,
  Building2,
  Coins,
  Cpu,
  Crown,
  Dna,
  FileText,
  Flame,
  Gem,
  GitBranch,
  Globe,
  Heart,
  Leaf,
  Lock,
  MapPin,
  Package,
  Scale,
  Shield,
  Sparkles,
  Star,
  Sword,
  User,
  Users,
  Zap,
} from "lucide-react"

export type EntryKindConfig = {
  icon: LucideIcon
  /** Tailwind 文字颜色类，用于图标和 chip 前景 */
  colorClass: string
}

// ── 精确匹配表（优先级最高） ───────────────────────────────────────────────────

const EXACT_MAP: Record<string, EntryKindConfig> = {
  // 人物相关
  人物:      { icon: User,     colorClass: "text-sky-400" },
  角色:      { icon: User,     colorClass: "text-sky-400" },
  // 组织
  势力:      { icon: Shield,   colorClass: "text-indigo-400" },
  宗门:      { icon: Building2,colorClass: "text-indigo-400" },
  帮派:      { icon: Shield,   colorClass: "text-indigo-400" },
  家族:      { icon: Users,    colorClass: "text-indigo-300" },
  王朝:      { icon: Crown,    colorClass: "text-yellow-400" },
  朝廷:      { icon: Crown,    colorClass: "text-yellow-400" },
  种族:      { icon: Users,    colorClass: "text-teal-400" },
  军团:      { icon: Sword,    colorClass: "text-red-400" },
  公会:      { icon: Shield,   colorClass: "text-indigo-300" },
  商会:      { icon: Coins,    colorClass: "text-amber-400" },
  // 地点
  地点:      { icon: MapPin,   colorClass: "text-emerald-400" },
  场景:      { icon: MapPin,   colorClass: "text-emerald-400" },
  秘境:      { icon: MapPin,   colorClass: "text-cyan-400" },
  禁地:      { icon: MapPin,   colorClass: "text-red-400" },
  遗迹:      { icon: MapPin,   colorClass: "text-stone-400" },
  城市:      { icon: MapPin,   colorClass: "text-emerald-400" },
  地宫:      { icon: MapPin,   colorClass: "text-stone-400" },
  圣域:      { icon: Sparkles, colorClass: "text-yellow-300" },
  洞府:      { icon: MapPin,   colorClass: "text-stone-400" },
  // 武学/能力
  功法:      { icon: Sword,    colorClass: "text-orange-400" },
  武器:      { icon: Sword,    colorClass: "text-orange-400" },
  术法:      { icon: Zap,      colorClass: "text-violet-400" },
  阵法:      { icon: Zap,      colorClass: "text-violet-400" },
  神通:      { icon: Sparkles, colorClass: "text-amber-300" },
  法则:      { icon: Scale,    colorClass: "text-blue-400" },
  符箓:      { icon: Zap,      colorClass: "text-violet-300" },
  禁术:      { icon: Lock,     colorClass: "text-red-400" },
  // 境界/修炼
  境界:      { icon: Flame,    colorClass: "text-orange-400" },
  体质:      { icon: Flame,    colorClass: "text-orange-300" },
  灵根:      { icon: Leaf,     colorClass: "text-green-400" },
  悟性:      { icon: Sparkles, colorClass: "text-yellow-300" },
  寿元:      { icon: Sparkles, colorClass: "text-teal-300" },
  血统:      { icon: Dna,      colorClass: "text-red-400" },
  血脉:      { icon: Dna,      colorClass: "text-red-400" },
  // 物品
  丹药:      { icon: Package,  colorClass: "text-amber-400" },
  法宝:      { icon: Gem,      colorClass: "text-cyan-400" },
  神器:      { icon: Gem,      colorClass: "text-yellow-300" },
  秘宝:      { icon: Gem,      colorClass: "text-purple-400" },
  材料:      { icon: Package,  colorClass: "text-stone-400" },
  矿产:      { icon: Package,  colorClass: "text-stone-400" },
  灵植:      { icon: Leaf,     colorClass: "text-green-400" },
  // 历史/世界观
  历史:      { icon: BookOpen, colorClass: "text-amber-300" },
  纪元:      { icon: BookOpen, colorClass: "text-amber-300" },
  传说:      { icon: BookOpen, colorClass: "text-purple-300" },
  典故:      { icon: BookOpen, colorClass: "text-amber-300" },
  // 信仰/神明
  信仰:      { icon: Star,     colorClass: "text-yellow-300" },
  神祇:      { icon: Star,     colorClass: "text-yellow-300" },
  图腾:      { icon: Star,     colorClass: "text-orange-300" },
  神格:      { icon: Sparkles, colorClass: "text-yellow-300" },
  神位:      { icon: Sparkles, colorClass: "text-yellow-300" },
  // 剧情
  伏笔:      { icon: GitBranch,colorClass: "text-purple-400" },
  线索:      { icon: GitBranch,colorClass: "text-purple-400" },
  主线:      { icon: GitBranch,colorClass: "text-blue-400" },
  预言:      { icon: GitBranch,colorClass: "text-violet-400" },
  因果:      { icon: GitBranch,colorClass: "text-pink-400" },
  宿命:      { icon: GitBranch,colorClass: "text-pink-400" },
  任务:      { icon: GitBranch,colorClass: "text-blue-300" },
  // 契约/羁绊
  契约:      { icon: Heart,    colorClass: "text-pink-400" },
  誓言:      { icon: Heart,    colorClass: "text-pink-400" },
  缘分:      { icon: Heart,    colorClass: "text-rose-400" },
  // 律法
  律法:      { icon: Scale,    colorClass: "text-slate-400" },
  规则:      { icon: Scale,    colorClass: "text-slate-400" },
  禁忌:      { icon: Lock,     colorClass: "text-red-400" },
  // 位面/宇宙
  位面:      { icon: Globe,    colorClass: "text-cyan-400" },
  星系:      { icon: Globe,    colorClass: "text-cyan-400" },
  维度:      { icon: Globe,    colorClass: "text-cyan-300" },
  宇宙:      { icon: Globe,    colorClass: "text-cyan-300" },
  // 科技
  系统:      { icon: Cpu,      colorClass: "text-green-400" },
  金手指:    { icon: Cpu,      colorClass: "text-green-400" },
  算法:      { icon: Cpu,      colorClass: "text-teal-400" },
  芯片:      { icon: Cpu,      colorClass: "text-teal-400" },
  // 经济
  货币:      { icon: Coins,    colorClass: "text-amber-400" },
  赏金:      { icon: Coins,    colorClass: "text-amber-400" },
  // 称号
  称谓:      { icon: Crown,    colorClass: "text-yellow-400" },
  爵位:      { icon: Crown,    colorClass: "text-yellow-400" },
  勋章:      { icon: Crown,    colorClass: "text-yellow-300" },
  头衔:      { icon: Crown,    colorClass: "text-yellow-400" },
  // 情报/秘密
  情报:      { icon: Lock,     colorClass: "text-slate-400" },
  暗号:      { icon: Lock,     colorClass: "text-slate-400" },
  密令:      { icon: Lock,     colorClass: "text-slate-400" },
  // 战争/战力
  战绩:      { icon: Sword,    colorClass: "text-red-300" },
  战争:      { icon: Sword,    colorClass: "text-red-400" },
  // 灵脉/地理
  灵脉:      { icon: MapPin,   colorClass: "text-teal-400" },
  龙脉:      { icon: Sparkles, colorClass: "text-yellow-300" },
}

// ── 关键词 contains 规则（按优先级排序） ────────────────────────────────────

type KeywordRule = {
  keywords: string[]
  config: EntryKindConfig
}

const KEYWORD_RULES: KeywordRule[] = [
  // 人物/职业/称谓
  { keywords: ["人物", "角色", "职业", "称谓", "武者", "修士", "弟子", "门主"],
    config: { icon: User, colorClass: "text-sky-400" } },
  // 组织/势力
  { keywords: ["势力", "宗门", "宗派", "帮派", "家族", "门派", "教", "盟", "会", "团", "军", "队", "营", "卫"],
    config: { icon: Shield, colorClass: "text-indigo-400" } },
  // 朝代/政权
  { keywords: ["王朝", "朝廷", "皇", "帝国", "朝代", "政权", "国"],
    config: { icon: Crown, colorClass: "text-yellow-400" } },
  // 种族/血统
  { keywords: ["种族", "血统", "血脉", "基因", "祖先", "妖族", "魔族", "人族"],
    config: { icon: Dna, colorClass: "text-red-400" } },
  // 地点类
  { keywords: ["地点", "场景", "秘境", "禁地", "遗迹", "城", "镇", "村", "山", "洞", "宫", "殿", "阁",
               "楼", "府", "墓", "陵", "岛", "海", "森林", "荒漠", "星域", "界"],
    config: { icon: MapPin, colorClass: "text-emerald-400" } },
  // 功法/武技
  { keywords: ["功法", "武技", "刀法", "剑法", "拳法", "枪法", "掌法", "步法", "身法", "遁术", "秘法", "秘术"],
    config: { icon: Sword, colorClass: "text-orange-400" } },
  // 武器/法器
  { keywords: ["武器", "法器", "神兵", "兵器", "剑", "刀", "枪", "斧", "弓", "弩"],
    config: { icon: Sword, colorClass: "text-orange-300" } },
  // 法术/阵法
  { keywords: ["术法", "阵法", "符箓", "禁制", "法阵", "神通", "咒语", "巫术", "幻术"],
    config: { icon: Zap, colorClass: "text-violet-400" } },
  // 法则/权能
  { keywords: ["法则", "权能", "领域", "意境", "道果", "神性"],
    config: { icon: Scale, colorClass: "text-blue-400" } },
  // 境界/修炼
  { keywords: ["境界", "修为", "层次", "段位", "阶段", "等级", "品级"],
    config: { icon: Flame, colorClass: "text-orange-400" } },
  // 体质/根骨
  { keywords: ["体质", "灵根", "悟性", "资质", "天资", "潜力", "根骨", "骨龄"],
    config: { icon: Sparkles, colorClass: "text-yellow-300" } },
  // 丹药/材料
  { keywords: ["丹药", "药方", "灵药", "药草", "丹方", "炼丹", "丹炉"],
    config: { icon: Package, colorClass: "text-amber-400" } },
  // 灵植/自然
  { keywords: ["灵植", "草木", "树", "花", "草", "藤", "菌", "木灵"],
    config: { icon: Leaf, colorClass: "text-green-400" } },
  // 矿产/材料
  { keywords: ["矿产", "材料", "矿石", "金属", "矿脉", "矿洞", "灵晶", "灵石", "原料"],
    config: { icon: Package, colorClass: "text-stone-400" } },
  // 法宝/神器
  { keywords: ["法宝", "神器", "灵宝", "秘宝", "宝物", "神兵", "法器", "圣遗物", "传承物"],
    config: { icon: Gem, colorClass: "text-cyan-400" } },
  // 历史/年代
  { keywords: ["历史", "纪元", "典故", "年代", "古史", "秘史", "年历", "纪年"],
    config: { icon: BookOpen, colorClass: "text-amber-300" } },
  // 传说/秘辛
  { keywords: ["传说", "神话", "秘辛", "异闻", "史诗", "预言书", "典籍", "古籍"],
    config: { icon: BookOpen, colorClass: "text-purple-300" } },
  // 信仰/神明
  { keywords: ["信仰", "神祇", "神明", "图腾", "神格", "祭祀", "神位", "圣教"],
    config: { icon: Star, colorClass: "text-yellow-300" } },
  // 剧情/命运
  { keywords: ["伏笔", "线索", "主线", "任务", "因果", "宿命", "命运", "劫数", "预言", "征兆"],
    config: { icon: GitBranch, colorClass: "text-purple-400" } },
  // 契约/羁绊
  { keywords: ["契约", "誓言", "缘分", "羁绊", "盟约", "婚约", "血誓", "主仆"],
    config: { icon: Heart, colorClass: "text-pink-400" } },
  // 律法/禁忌
  { keywords: ["律法", "法律", "规则", "禁忌", "禁令", "天条", "规约", "戒律"],
    config: { icon: Scale, colorClass: "text-slate-400" } },
  // 秘密/情报
  { keywords: ["情报", "暗号", "密令", "密语", "秘密", "黑话", "密函", "密卷"],
    config: { icon: Lock, colorClass: "text-slate-400" } },
  // 位面/宇宙
  { keywords: ["位面", "星系", "维度", "宇宙", "界域", "天界", "地界", "冥界", "虚空"],
    config: { icon: Globe, colorClass: "text-cyan-400" } },
  // 科技/系统
  { keywords: ["系统", "金手指", "算法", "芯片", "网络", "程序", "代码", "数据"],
    config: { icon: Cpu, colorClass: "text-green-400" } },
  // 经济/货币
  { keywords: ["货币", "金币", "灵石", "银两", "赏金", "财富", "商铺", "拍卖"],
    config: { icon: Coins, colorClass: "text-amber-400" } },
  // 称号/地位
  { keywords: ["称谓", "爵位", "勋章", "头衔", "封号", "绰号", "尊号", "荣誉"],
    config: { icon: Crown, colorClass: "text-yellow-400" } },
  // 战争/军事
  { keywords: ["战争", "战绩", "军团", "战役", "征伐", "兵法", "战阵"],
    config: { icon: Sword, colorClass: "text-red-400" } },
  // 灵脉/地脉
  { keywords: ["灵脉", "地脉", "龙脉", "灵源", "泉眼", "灵气"],
    config: { icon: Sparkles, colorClass: "text-teal-300" } },
]

// ── 默认 fallback ────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: EntryKindConfig = {
  icon: FileText,
  colorClass: "text-muted-foreground",
}

// ── 主函数 ───────────────────────────────────────────────────────────────────

/**
 * 根据 entryKind 字符串返回对应的图标和颜色类。
 * BibleCharacter 固定传 "人物" 可得到 User 图标。
 */
export function getEntryKindConfig(kind: string): EntryKindConfig {
  const normalized = kind.trim()
  if (!normalized) return DEFAULT_CONFIG

  // 1. 精确匹配
  if (normalized in EXACT_MAP) return EXACT_MAP[normalized]

  // 2. 关键词 contains 匹配（按规则顺序，第一个命中的获胜）
  for (const rule of KEYWORD_RULES) {
    if (rule.keywords.some((kw) => normalized.includes(kw))) {
      return rule.config
    }
  }

  // 3. 默认
  return DEFAULT_CONFIG
}

/** BibleCharacter 固定使用 User 图标 */
export const CHARACTER_CONFIG: EntryKindConfig = {
  icon: User,
  colorClass: "text-sky-400",
}
