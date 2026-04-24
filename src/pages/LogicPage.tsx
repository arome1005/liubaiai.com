/**
 * @deprecated 此页面已由 V0TuiyanPage (/logic) 取代。
 * 路由 /logic 现在直接渲染 V0TuiyanPage，此文件暂时保留供参考。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isFirstAiGateCancelledError } from "../ai/client";
import { generateLogicThreeBranches } from "../ai/logic-branch-predict";
import { loadAiSettings } from "../ai/storage";
import type { WritingWorkStyleSlice } from "../ai/assemble-context";
import { getWork, getWorkStyleCard, listChapters, listWorks } from "../db/repo";
import type { Chapter, Work } from "../db/types";
import { resolveDefaultChapterId } from "../util/resolve-default-chapter";
import { workPathSegment } from "../util/work-url";
import { workTagsToProfileText } from "../util/work-tags";
import { AiInlineErrorNotice } from "../components/AiInlineErrorNotice";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Textarea } from "../components/ui/textarea";
import { cn } from "../lib/utils";
import {
  Brain,
  GitBranch,
  FileText,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Plus,
  MoreHorizontal,
  AlertCircle,
  CheckCircle2,
  BookOpen,
  Sparkles,
  RefreshCw,
  ArrowRight,
  Edit3,
  Save,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";

const LS_LAST_WORK = "liubai:lastWorkId";

interface OutlineNode {
  id: string;
  title: string;
  summary: string;
  children: OutlineNode[];
  isExpanded?: boolean;
  wordCount?: number;
  status?: "draft" | "writing" | "completed";
}

function chaptersToOutlineNodes(chapters: Chapter[]): OutlineNode[] {
  const sorted = [...chapters].sort((a, b) => a.order - b.order);
  return sorted.map((ch) => {
    const wc = ch.wordCountCache ?? (ch.content ? ch.content.length : 0);
    let status: OutlineNode["status"] = "draft";
    if (wc > 800) status = "completed";
    else if (wc > 0) status = "writing";
    return {
      id: ch.id,
      title: ch.title || "未命名章节",
      summary: (ch.summary ?? "").trim() || "（本章暂无概要）",
      children: [],
      wordCount: wc,
      status,
      isExpanded: true,
    };
  });
}

// 分支推演结果
interface BranchOption {
  id: string;
  title: string;
  summary: string;
  pros: string[];
  cons: string[];
  confidence: number;
}

// 大纲树节点组件
function OutlineTreeNode({
  node,
  level = 0,
  onToggle,
  onSelect,
  selectedId,
}: {
  node: OutlineNode;
  level?: number;
  onToggle: (id: string) => void;
  onSelect: (node: OutlineNode) => void;
  selectedId: string | null;
}) {
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedId === node.id;

  const statusColors = {
    draft: "bg-gray-500/20 text-gray-400",
    writing: "bg-amber-500/20 text-amber-400",
    completed: "bg-green-500/20 text-green-400",
  };

  return (
    <div className="select-none">
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg px-3 py-2 cursor-pointer transition-colors",
          isSelected
            ? "bg-primary/20 border border-primary/30"
            : "hover:bg-muted/50 border border-transparent"
        )}
        style={{ paddingLeft: `${level * 16 + 12}px` }}
        onClick={() => onSelect(node)}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id);
            }}
            className="flex h-5 w-5 items-center justify-center rounded hover:bg-muted"
          >
            {node.isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        ) : (
          <span className="w-5" />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{node.title}</span>
            {node.status && (
              <Badge
                variant="secondary"
                className={cn("h-4 text-[10px] px-1.5", statusColors[node.status])}
              >
                {node.status === "draft" && "草稿"}
                {node.status === "writing" && "写作中"}
                {node.status === "completed" && "已完成"}
              </Badge>
            )}
          </div>
          {node.wordCount !== undefined && node.wordCount > 0 && (
            <p className="text-[10px] text-muted-foreground">
              {node.wordCount.toLocaleString()} 字
            </p>
          )}
        </div>
      </div>

      {hasChildren && node.isExpanded && (
        <div className="mt-0.5">
          {node.children.map((child) => (
            <OutlineTreeNode
              key={child.id}
              node={child}
              level={level + 1}
              onToggle={onToggle}
              onSelect={onSelect}
              selectedId={selectedId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// 分支卡片组件
function BranchCard({
  branch,
  isSelected,
  onSelect,
}: {
  branch: BranchOption;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4 cursor-pointer transition-all duration-200",
        isSelected
          ? "border-primary bg-primary/5 shadow-lg shadow-primary/10"
          : "border-border/40 bg-card/50 hover:border-primary/30 hover:bg-card/80"
      )}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <h4 className="font-medium text-sm">{branch.title}</h4>
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
            {branch.summary}
          </p>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
          <span className="text-xs font-medium text-primary">{branch.confidence}%</span>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <div>
          <p className="text-[10px] font-medium text-green-500 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            优势
          </p>
          <ul className="mt-1 space-y-0.5">
            {branch.pros.slice(0, 2).map((pro, i) => (
              <li key={i} className="text-[10px] text-muted-foreground truncate">
                • {pro}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[10px] font-medium text-amber-500 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            劣势
          </p>
          <ul className="mt-1 space-y-0.5">
            {branch.cons.slice(0, 2).map((con, i) => (
              <li key={i} className="text-[10px] text-muted-foreground truncate">
                • {con}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function LogicPage() {
  const navigate = useNavigate();
  const [works, setWorks] = useState<Work[]>([]);
  const [workId, setWorkId] = useState<string | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [workTitle, setWorkTitle] = useState("");
  const [branchResult, setBranchResult] = useState<{ title: string; summary: string }[] | null>(null);
  const [branchError, setBranchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [branchBusy, setBranchBusy] = useState(false);
  const branchAbortRef = useRef<AbortController | null>(null);

  const [outline, setOutline] = useState<OutlineNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<OutlineNode | null>(null);
  const [activeTab, setActiveTab] = useState<"outline" | "mindmap" | "text" | "ai">("outline");
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [aiInput, setAiInput] = useState("");
  const [showAiDialog, setShowAiDialog] = useState(false);

  const toggleNode = useCallback((id: string) => {
    setOutline((prev) => {
      const toggle = (nodes: OutlineNode[]): OutlineNode[] => {
        return nodes.map((node) => {
          if (node.id === id) {
            return { ...node, isExpanded: !node.isExpanded };
          }
          if (node.children) {
            return { ...node, children: toggle(node.children) };
          }
          return node;
        });
      };
      return toggle(prev);
    });
  }, []);

  const handleSelectNode = useCallback((node: OutlineNode) => {
    setSelectedNode(node);
    setChapterId(node.id);
  }, []);

  const runBranchPredict = useCallback(async () => {
    if (!workId || !chapterId || !aiInput.trim()) return;
    const ch = chapters.find((c) => c.id === chapterId);
    if (!ch) return;
    branchAbortRef.current?.abort();
    const ac = new AbortController();
    branchAbortRef.current = ac;
    setBranchBusy(true);
    setBranchError(null);
    setBranchResult(null);
    setShowAiDialog(true);
    try {
      const [card, w] = await Promise.all([
        getWorkStyleCard(workId),
        getWork(workId),
      ]);
      const tagProfile = workTagsToProfileText(w?.tags);
      const workStyle: WritingWorkStyleSlice = {
        pov: card?.pov ?? "",
        tone: card?.tone ?? "",
        bannedPhrases: card?.bannedPhrases ?? "",
        styleAnchor: card?.styleAnchor ?? "",
        extraRules: card?.extraRules ?? "",
      };
      const { branches } = await generateLogicThreeBranches({
        workTitle: workTitle.trim() || "未命名",
        chapterTitle: ch.title,
        chapterSummary: ch.summary ?? "",
        chapterContent: ch.content ?? "",
        userHint: aiInput.trim(),
        workStyle,
        tagProfileText: tagProfile,
        settings: loadAiSettings(),
        signal: ac.signal,
      });
      setBranchResult(branches);
    } catch (e) {
      if (isFirstAiGateCancelledError(e)) return;
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (e instanceof Error && e.name === "AbortError") return;
      setBranchError(e instanceof Error ? e.message : String(e));
    } finally {
      setBranchBusy(false);
      branchAbortRef.current = null;
      setShowAiDialog(false);
    }
  }, [workId, chapterId, chapters, aiInput, workTitle]);

  const displayBranches = useMemo((): BranchOption[] => {
    if (!branchResult?.length) return [];
    return branchResult.map((b, i) => ({
      id: `branch-${i}`,
      title: b.title,
      summary: b.summary,
      pros: [],
      cons: [],
      confidence: Math.max(55, 88 - i * 6),
    }));
  }, [branchResult]);

  useEffect(() => {
    void (async () => {
      try {
        const list = await listWorks();
        setWorks(list);
        if (list.length > 0) {
          const lastId = localStorage.getItem(LS_LAST_WORK);
          const defaultWork = list.find((w) => w.id === lastId) || list[0];
          setWorkId(defaultWork.id);
          setWorkTitle(defaultWork.title);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!workId) {
      setChapters([]);
      setChapterId(null);
      return;
    }
    void (async () => {
      const [list, w] = await Promise.all([listChapters(workId), getWork(workId)]);
      setChapters(list);
      setWorkTitle(w?.title ?? "");
      setChapterId(list.length ? resolveDefaultChapterId(workId, list, w ?? undefined) : null);
    })();
  }, [workId]);

  useEffect(() => {
    if (!chapters.length) {
      setOutline([]);
      setSelectedNode(null);
      return;
    }
    const nodes = chaptersToOutlineNodes(chapters);
    setOutline(nodes);
    if (chapterId && nodes.some((n) => n.id === chapterId)) {
      setSelectedNode(nodes.find((n) => n.id === chapterId) ?? null);
    } else {
      setSelectedNode(nodes[0] ?? null);
    }
  }, [chapters, chapterId]);

  useEffect(() => {
    setBranchResult(null);
    setBranchError(null);
  }, [chapterId]);

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="mt-2 text-sm text-muted-foreground">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex h-[calc(100vh-3.5rem)] flex-col">
        {/* 页面标题区 */}
        <div className="border-b border-border/40 bg-card/30 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
                  <Brain className="h-5 w-5 text-primary" />
                  推演
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {workTitle || "选择作品进行大纲推演"}
                </p>
              </div>
              {works.length > 0 && (
                <select
                  value={workId || ""}
                  onChange={(e) => {
                    const id = e.target.value;
                    setWorkId(id);
                    const work = works.find((w) => w.id === id);
                    if (work) {
                      setWorkTitle(work.title);
                      localStorage.setItem(LS_LAST_WORK, id);
                    }
                  }}
                  className="h-9 rounded-md border border-border/50 bg-background/50 px-3 text-sm"
                >
                  {works.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.title}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={!workId}
                onClick={() => {
                  if (!workId) return;
                  const w = works.find((x) => x.id === workId);
                  void navigate(`/work/${w ? workPathSegment(w) : workId}`);
                }}
              >
                <Edit3 className="h-4 w-4" />
                去写作
              </Button>
              <Button size="sm" className="gap-2">
                <Sparkles className="h-4 w-4" />
                AI推演
              </Button>
            </div>
          </div>
        </div>

        {/* 三栏布局 */}
        <div className="flex flex-1 overflow-hidden">
          {/* 左栏：大纲树 */}
          <div className="w-72 border-r border-border/40 bg-card/20 flex flex-col">
            {/* 大纲工具栏 */}
            <div className="flex items-center justify-between border-b border-border/40 p-3">
              <span className="text-sm font-medium">大纲结构</span>
              <div className="flex items-center gap-1">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>添加节点</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>刷新</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>

            {/* 大纲树 */}
            <div className="flex-1 overflow-auto p-2">
              {outline.map((node) => (
                <OutlineTreeNode
                  key={node.id}
                  node={node}
                  onToggle={toggleNode}
                  onSelect={handleSelectNode}
                  selectedId={selectedNode?.id || null}
                />
              ))}
            </div>

            {/* 大纲统计 */}
            <div className="border-t border-border/40 p-3">
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-lg bg-card/50 p-2">
                  <p className="text-lg font-semibold">
                    {outline.reduce((acc, node) => acc + (node.wordCount || 0), 0).toLocaleString()}
                  </p>
                  <p className="text-[10px] text-muted-foreground">总字数</p>
                </div>
                <div className="rounded-lg bg-card/50 p-2">
                  <p className="text-lg font-semibold">
                    {outline.length}
                  </p>
                  <p className="text-[10px] text-muted-foreground">章节数</p>
                </div>
              </div>
            </div>
          </div>

          {/* 中栏：内容区 */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* 标签切换 */}
            <div className="flex items-center gap-1 border-b border-border/40 bg-card/20 px-4 py-2">
              {[
                { id: "outline", label: "大纲视图", icon: FileText },
                { id: "mindmap", label: "思维导图", icon: GitBranch },
                { id: "text", label: "文策视图", icon: BookOpen },
                { id: "ai", label: "AI推演", icon: Sparkles },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors",
                    activeTab === tab.id
                      ? "bg-primary/20 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* 内容区域 */}
            <div className="flex-1 overflow-auto p-6">
              {activeTab === "outline" && (
                <div className="max-w-3xl mx-auto space-y-6">
                  {selectedNode ? (
                    <>
                      <div className="flex items-start justify-between">
                        <div>
                          <h2 className="text-2xl font-semibold">{selectedNode.title}</h2>
                          <p className="mt-2 text-muted-foreground">{selectedNode.summary}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">
                            {selectedNode.wordCount?.toLocaleString() || 0} 字
                          </Badge>
                          <Button variant="outline" size="sm" className="gap-2">
                            <Edit3 className="h-4 w-4" />
                            编辑
                          </Button>
                        </div>
                      </div>

                      {/* 节点详情 */}
                      <div className="rounded-xl border border-border/40 bg-card/50 p-6 space-y-4">
                        <div>
                          <label className="text-sm font-medium">章节标题</label>
                          <Input
                            value={selectedNode.title}
                            className="mt-1.5"
                            placeholder="输入章节标题"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium">内容概要</label>
                          <Textarea
                            value={selectedNode.summary}
                            className="mt-1.5 min-h-[120px]"
                            placeholder="输入章节内容概要"
                          />
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="outline">取消</Button>
                          <Button className="gap-2">
                            <Save className="h-4 w-4" />
                            保存
                          </Button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center text-center py-20">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted/50">
                        <FileText className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <h3 className="mt-4 text-lg font-medium">选择节点查看详情</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        点击左侧大纲树中的节点查看和编辑详情
                      </p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "mindmap" && (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted/50">
                    <GitBranch className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <h3 className="mt-4 text-lg font-medium">思维导图视图</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    可视化展示大纲结构，即将推出
                  </p>
                </div>
              )}

              {activeTab === "text" && (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted/50">
                    <BookOpen className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <h3 className="mt-4 text-lg font-medium">文策视图</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    大纲与正文对照编辑，即将推出
                  </p>
                </div>
              )}

              {activeTab === "ai" && (
                <div className="max-w-3xl mx-auto space-y-6">
                  <div className="rounded-xl border border-border/40 bg-card/50 p-6">
                    <h3 className="text-lg font-medium flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-primary" />
                      AI 分支推演
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      输入当前剧情节点，AI 将为你生成多个可能的发展方向
                    </p>

                    <div className="mt-4 space-y-4">
                      <Textarea
                        value={aiInput}
                        onChange={(e) => setAiInput(e.target.value)}
                        placeholder="描述当前剧情节点，例如：主角在宗门选拔中展现出惊人的天赋，引起了各方势力的关注..."
                        className="min-h-[120px]"
                      />
                      <Button
                        className="w-full gap-2"
                        onClick={() => void runBranchPredict()}
                        disabled={!aiInput.trim() || !chapterId || branchBusy}
                      >
                        <Sparkles className="h-4 w-4" />
                        {branchBusy ? "生成中…" : "生成分支选项"}
                      </Button>
                      {branchError ? (
                        <AiInlineErrorNotice message={branchError} className="mt-2" />
                      ) : null}
                    </div>
                  </div>

                  {/* 分支结果 */}
                  <div className="grid gap-4">
                    {displayBranches.map((branch) => (
                      <BranchCard
                        key={branch.id}
                        branch={branch}
                        isSelected={selectedBranch === branch.id}
                        onSelect={() => setSelectedBranch(branch.id)}
                      />
                    ))}
                  </div>

                  {selectedBranch && (
                    <div className="flex justify-end gap-2">
                      <Button variant="outline">重新生成</Button>
                      <Button className="gap-2">
                        <CheckCircle2 className="h-4 w-4" />
                        采用此分支
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 右栏：AI 对话区 */}
          <div className="w-80 border-l border-border/40 bg-card/20 flex flex-col">
            <div className="flex items-center justify-between border-b border-border/40 p-3">
              <span className="text-sm font-medium flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                AI 助手
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>清空对话</DropdownMenuItem>
                  <DropdownMenuItem>导出记录</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* 对话内容 */}
            <div className="flex-1 overflow-auto p-3 space-y-4">
              <div className="flex gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-sm">
                  <p>你好！我是你的 AI 写作助手。我可以帮你：</p>
                  <ul className="mt-2 space-y-1 text-muted-foreground">
                    <li>• 分析大纲结构</li>
                    <li>• 推演剧情分支</li>
                    <li>• 检查逻辑一致性</li>
                    <li>• 提供写作建议</li>
                  </ul>
                </div>
              </div>

              <div className="flex gap-2 flex-row-reverse">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                  <span className="text-xs">我</span>
                </div>
                <div className="rounded-lg bg-primary/10 p-3 text-sm">
                  帮我分析一下当前大纲的逻辑是否通顺
                </div>
              </div>

              <div className="flex gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-sm">
                  <p>根据当前大纲分析：</p>
                  <div className="mt-2 space-y-2">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">主线剧情清晰，起承转合完整</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">人物成长弧线合理</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">建议第三章增加更多冲突</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 输入区 */}
            <div className="border-t border-border/40 p-3">
              <div className="flex gap-2">
                <Input
                  placeholder="输入问题..."
                  className="flex-1"
                />
                <Button size="icon" className="shrink-0">
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* AI 生成对话框 */}
        <Dialog open={showAiDialog} onOpenChange={setShowAiDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                AI 推演中
              </DialogTitle>
              <DialogDescription>
                正在分析剧情节点，生成多个分支选项...
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
