import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlignLeft,
  BookMarked,
  BookText,
  BookType,
  Clock,
  Globe,
  LayoutTemplate,
  Link2,
  MessageSquare,
  Palette,
  PenLine,
  Users,
} from "lucide-react";
import { cn } from "../lib/utils";
import { readLastWorkId } from "../util/lastWorkId";

type ToolDef = {
  id: string;
  title: string;
  description: string;
  icon: ReactNode;
  /** 有最近作品时的跳转路径模板，`{workId}` 会被替换 */
  hrefWithWork?: string;
  /** 不依赖作品 id 的固定入口（如生成器） */
  staticHref?: string;
  /** 无最近作品时：去作品库（仅对依赖作品的入口生效） */
  needsWork: boolean;
};

const TOOLS: ToolDef[] = [
  {
    id: "prompts",
    title: "提示词",
    description: "跨作品可复用模板，支持类型筛选与一键装配到写作 AI 侧栏",
    icon: <MessageSquare className="h-7 w-7" strokeWidth={1.5} />,
    staticHref: "/prompts",
    needsWork: false,
  },
  {
    id: "penfeel",
    title: "笔感",
    description: "文风样本、名家段落；生成时约束语气节奏（侧栏装配同源）",
    icon: <PenLine className="h-7 w-7" strokeWidth={1.5} />,
    hrefWithWork: "/work/{workId}/bible?tab=penfeel",
    needsWork: true,
  },
  {
    id: "bible",
    title: "锦囊",
    description: "本书设定总览：人物卡与全书结构化设定入口",
    icon: <BookMarked className="h-7 w-7" strokeWidth={1.5} />,
    hrefWithWork: "/work/{workId}/bible",
    needsWork: true,
  },
  {
    id: "world",
    title: "世界观",
    description: "世界观条目与结构化设定",
    icon: <Globe className="h-7 w-7" strokeWidth={1.5} />,
    hrefWithWork: "/work/{workId}/bible?tab=world",
    needsWork: true,
  },
  {
    id: "foreshadow",
    title: "伏笔",
    description: "埋钩与回收清单，写作与扫描时可对照",
    icon: <Link2 className="h-7 w-7" strokeWidth={1.5} />,
    hrefWithWork: "/work/{workId}/bible?tab=foreshadow",
    needsWork: true,
  },
  {
    id: "timeline",
    title: "时间线",
    description: "故事内时间轴事件，防穿帮、供扫描引用",
    icon: <Clock className="h-7 w-7" strokeWidth={1.5} />,
    hrefWithWork: "/work/{workId}/bible?tab=timeline",
    needsWork: true,
  },
  {
    id: "templates",
    title: "章模板",
    description: "每章结构、节奏复用，减少重复劳动",
    icon: <LayoutTemplate className="h-7 w-7" strokeWidth={1.5} />,
    hrefWithWork: "/work/{workId}/bible?tab=templates",
    needsWork: true,
  },
  {
    id: "style",
    title: "风格卡",
    description: "全书调性锁、禁用套话与文风锚点（写作侧栏同源）",
    icon: <Palette className="h-7 w-7" strokeWidth={1.5} />,
    hrefWithWork: "/work/{workId}",
    needsWork: true,
  },
  {
    id: "glossary",
    title: "词典",
    description: "本书术语表与专有名词一致",
    icon: <BookText className="h-7 w-7" strokeWidth={1.5} />,
    hrefWithWork: "/work/{workId}/bible?tab=glossary",
    needsWork: true,
  },
  {
    id: "gen-title",
    title: "书名生成器",
    description: "按题材与梗概批量产出书名备选，可写入当前作品书名",
    icon: <BookType className="h-7 w-7" strokeWidth={1.5} />,
    staticHref: "/luobi/generate/book-title",
    needsWork: false,
  },
  {
    id: "gen-blurb",
    title: "简介生成器",
    description: "按设定写展示用简介文案，可写入当前作品简介",
    icon: <AlignLeft className="h-7 w-7" strokeWidth={1.5} />,
    staticHref: "/luobi/generate/blurb",
    needsWork: false,
  },
  {
    id: "gen-names",
    title: "NPC 命名",
    description: "人名、地名、势力名批量灵感，复制到正文或术语表",
    icon: <Users className="h-7 w-7" strokeWidth={1.5} />,
    staticHref: "/luobi/generate/names",
    needsWork: false,
  },
];

function ToolCard(props: { tool: ToolDef; workId: string | null; onNeedLibrary: () => void }) {
  const { tool, workId, onNeedLibrary } = props;
  const href =
    tool.staticHref ?? (workId && tool.hrefWithWork ? tool.hrefWithWork.split("{workId}").join(workId) : null);

  const className = cn(
    "group flex min-h-[9.5rem] flex-col items-center justify-start rounded-xl border border-dashed border-border/60 bg-card/40 px-4 py-5 text-center shadow-sm transition-colors",
    "hover:border-primary/40 hover:bg-card/70",
    href && "cursor-pointer no-underline",
    !href && "cursor-pointer",
  );

  const body = (
    <>
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
        {tool.icon}
      </div>
      <h3 className="text-base font-semibold tracking-tight text-foreground">{tool.title}</h3>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{tool.description}</p>
      {!href && tool.needsWork ? (
        <p className="mt-3 text-[11px] text-muted-foreground/90">需先在作品库打开或新建作品</p>
      ) : null}
    </>
  );

  if (href) {
    return (
      <Link to={href} className={className}>
        {body}
      </Link>
    );
  }

  return (
    <button type="button" className={className} onClick={onNeedLibrary}>
      {body}
    </button>
  );
}

export function LuobiHubPage() {
  const navigate = useNavigate();
  const workId = readLastWorkId();

  return (
    <div className="page luobi-hub mx-auto max-w-6xl">
      <header className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.65rem]">创作工具箱</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          选择下列能力：锦囊各分区与写作页风格卡，或使用书名/简介/NPC 命名生成器（无需先选作品）
        </p>
        <p className="mt-1 text-xs text-muted-foreground/90">
          本页无需选中作品即可浏览；编辑本书数据时会使用你<strong className="font-medium text-foreground/90">最近一次</strong>
          在作品中打开过的上下文（与顶栏书本菜单一致）。若无记录，请点击卡片前往作品库。
        </p>
      </header>

      <nav className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" aria-label="落笔能力入口">
        {TOOLS.map((tool) => (
          <ToolCard key={tool.id} tool={tool} workId={workId} onNeedLibrary={() => navigate("/library")} />
        ))}
      </nav>
    </div>
  );
}
