import { useEffect, useMemo, useState, type ReactNode } from "react";
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
import { getWork } from "../db/repo";
import { workPathSegment } from "../util/work-url";

type ToolDef = {
  id: string;
  title: string;
  description: string;
  icon: ReactNode;
  group: "global" | "work" | "generator";
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
    group: "global",
    staticHref: "/prompts",
    needsWork: false,
  },
  {
    id: "penfeel",
    title: "笔感",
    description: "文风样本、名家段落；生成时约束语气节奏（侧栏装配同源）",
    icon: <PenLine className="h-7 w-7" strokeWidth={1.5} />,
    group: "work",
    hrefWithWork: "/work/{workId}/bible?tab=penfeel",
    needsWork: true,
  },
  {
    id: "bible",
    title: "锦囊",
    description: "本书设定总览：人物卡与全书结构化设定入口",
    icon: <BookMarked className="h-7 w-7" strokeWidth={1.5} />,
    group: "work",
    hrefWithWork: "/work/{workId}/bible",
    needsWork: true,
  },
  {
    id: "world",
    title: "世界观",
    description: "世界观条目与结构化设定",
    icon: <Globe className="h-7 w-7" strokeWidth={1.5} />,
    group: "work",
    hrefWithWork: "/work/{workId}/bible?tab=world",
    needsWork: true,
  },
  {
    id: "foreshadow",
    title: "伏笔",
    description: "埋钩与回收清单，写作与扫描时可对照",
    icon: <Link2 className="h-7 w-7" strokeWidth={1.5} />,
    group: "work",
    hrefWithWork: "/work/{workId}/bible?tab=foreshadow",
    needsWork: true,
  },
  {
    id: "timeline",
    title: "时间线",
    description: "故事内时间轴事件，防穿帮、供扫描引用",
    icon: <Clock className="h-7 w-7" strokeWidth={1.5} />,
    group: "work",
    hrefWithWork: "/work/{workId}/bible?tab=timeline",
    needsWork: true,
  },
  {
    id: "templates",
    title: "章模板",
    description: "每章结构、节奏复用，减少重复劳动",
    icon: <LayoutTemplate className="h-7 w-7" strokeWidth={1.5} />,
    group: "work",
    hrefWithWork: "/work/{workId}/bible?tab=templates",
    needsWork: true,
  },
  {
    id: "style",
    title: "风格卡",
    description: "全书调性锁、禁用套话与文风锚点（写作侧栏同源）",
    icon: <Palette className="h-7 w-7" strokeWidth={1.5} />,
    group: "work",
    hrefWithWork: "/work/{workId}",
    needsWork: true,
  },
  {
    id: "glossary",
    title: "词典",
    description: "本书术语表与专有名词一致",
    icon: <BookText className="h-7 w-7" strokeWidth={1.5} />,
    group: "work",
    hrefWithWork: "/work/{workId}/bible?tab=glossary",
    needsWork: true,
  },
  {
    id: "gen-title",
    title: "书名生成器",
    description: "按题材与梗概批量产出书名备选，可写入当前作品书名",
    icon: <BookType className="h-7 w-7" strokeWidth={1.5} />,
    group: "generator",
    staticHref: "/luobi/generate/book-title",
    needsWork: false,
  },
  {
    id: "gen-blurb",
    title: "简介生成器",
    description: "按设定写展示用简介文案，可写入当前作品简介",
    icon: <AlignLeft className="h-7 w-7" strokeWidth={1.5} />,
    group: "generator",
    staticHref: "/luobi/generate/blurb",
    needsWork: false,
  },
  {
    id: "gen-names",
    title: "NPC 命名",
    description: "人名、地名、势力名批量灵感，复制到正文或术语表",
    icon: <Users className="h-7 w-7" strokeWidth={1.5} />,
    group: "generator",
    staticHref: "/luobi/generate/names",
    needsWork: false,
  },
];

function ToolCard(props: { tool: ToolDef; workPathSeg: string | null; onNeedLibrary: () => void }) {
  const { tool, workPathSeg, onNeedLibrary } = props;
  const href =
    tool.staticHref ?? (workPathSeg && tool.hrefWithWork ? tool.hrefWithWork.split("{workId}").join(workPathSeg) : null);

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
  const lastId = readLastWorkId();
  const [workPathSeg, setWorkPathSeg] = useState<string | null>(null);
  useEffect(() => {
    if (!lastId) {
      setWorkPathSeg(null);
      return;
    }
    void getWork(lastId).then((w) => setWorkPathSeg(w ? workPathSegment(w) : lastId));
  }, [lastId]);
  const globalTools = useMemo(() => TOOLS.filter((t) => t.group === "global"), []);
  const workTools = useMemo(() => TOOLS.filter((t) => t.group === "work"), []);
  const generators = useMemo(() => TOOLS.filter((t) => t.group === "generator"), []);

  return (
    <div className="page luobi-hub mx-auto max-w-6xl">
      <header className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.65rem]">创作工具箱</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          落笔是「能力域」：把可复用资产与本书设定沉淀下来，让写作/推演/生辉/问策有据可依。
        </p>
        <p className="mt-1 text-xs text-muted-foreground/90">
          本页无需选中作品即可浏览；编辑本书数据时会使用你<strong className="font-medium text-foreground/90">最近一次</strong>
          在作品中打开过的上下文（与顶栏书本菜单一致）。若无记录，请点击卡片前往作品库。
        </p>
      </header>

      <section className="mb-8">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold tracking-tight text-foreground">全局资产（跨作品）</h2>
          <p className="text-xs text-muted-foreground">不会绑定某一本书，适合沉淀可复用模板。</p>
        </div>
        <nav
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
          aria-label="落笔入口：全局资产"
        >
          {globalTools.map((tool) => (
            <ToolCard key={tool.id} tool={tool} workPathSeg={workPathSeg} onNeedLibrary={() => navigate("/library")} />
          ))}
        </nav>
      </section>

      <section className="mb-8">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold tracking-tight text-foreground">本书资产（需要作品上下文）</h2>
          <p className="text-xs text-muted-foreground">
            {lastId ? "将编辑最近打开的那本书（可在作品库切换）。" : "需要先在作品库打开/新建一本书。"}
          </p>
        </div>
        <nav
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
          aria-label="落笔入口：本书资产"
        >
          {workTools.map((tool) => (
            <ToolCard key={tool.id} tool={tool} workPathSeg={workPathSeg} onNeedLibrary={() => navigate("/library")} />
          ))}
        </nav>
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold tracking-tight text-foreground">工具（不依赖作品）</h2>
          <p className="text-xs text-muted-foreground">可直接生成并复制；部分模式支持写入最近作品。</p>
        </div>
        <nav
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
          aria-label="落笔入口：生成器"
        >
          {generators.map((tool) => (
            <ToolCard key={tool.id} tool={tool} workPathSeg={workPathSeg} onNeedLibrary={() => navigate("/library")} />
          ))}
        </nav>
      </section>
    </div>
  );
}
