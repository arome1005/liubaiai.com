"use client";

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Layers,
  MessageSquare,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "../lib/utils";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import {
  addGlobalPromptTemplate,
  deleteGlobalPromptTemplate,
  getWork,
  listApprovedPromptTemplates,
  listGlobalPromptTemplates,
  reorderGlobalPromptTemplates,
  updateGlobalPromptTemplate,
} from "../db/repo";
import {
  PROMPT_STATUS_LABELS,
  PROMPT_TYPE_LABELS,
  PROMPT_TYPES,
  type GlobalPromptTemplate,
  type PromptStatus,
  type PromptType,
} from "../db/types";
import { getSupabase } from "../lib/supabase";
import { TYPE_ICONS, TYPE_COLOR_BADGE } from "../components/prompts/PromptTypeGrid";
import { PersonalPromptCard } from "../components/prompts/PersonalPromptCard";
import { readLastWorkId } from "../util/lastWorkId";
import { workPathSegment } from "../util/work-url";
import { bumpPromptHeat, getPromptHeat } from "../util/prompt-usage-heat";
import {
  matchesPromptListSearch,
  matchesPromptListSearchWithBody,
  promptLibraryListPreview,
} from "../util/prompt-template-display";

// ── 收藏持久化 ────────────────────────────────────────────────────────────────

const FAVORITES_KEY = "liubai:promptFavorites";

function loadFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveFavorites(set: Set<string>): void {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...set]));
}

const TYPE_COLOR = TYPE_COLOR_BADGE;

const STATUS_STYLE: Record<PromptStatus, string> = {
  draft:     "bg-muted text-muted-foreground",
  submitted: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  approved:  "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  rejected:  "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

// ── 视图模式 ──────────────────────────────────────────────────────────────────

type ViewTab = "mine" | "approved" | "favorites" | "personal";

type PersonalSort = "updated" | "heat";

function pickAuthorLabel(u: {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}): string {
  const meta = u.user_metadata;
  const candidates = [meta?.full_name, meta?.name, meta?.preferred_username, meta?.user_name];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  const em = u.email?.trim();
  if (em) return em.split("@")[0] || em;
  return "本地用户";
}

// ── 状态 Badge ────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: PromptStatus }) {
  if (status !== "rejected") return null;
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_STYLE[status])}>
      {PROMPT_STATUS_LABELS[status]}
    </span>
  );
}

// ── 单张卡片 ──────────────────────────────────────────────────────────────────

function PromptCard(props: {
  item: GlobalPromptTemplate;
  isOwn: boolean;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onSaveAsMyDraft?: () => void;
  onAssemble: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  const {
    item, isOwn, isFavorite,
    onToggleFavorite, onEdit, onDelete,
    onSaveAsMyDraft,
    onAssemble, onMoveUp, onMoveDown, isFirst, isLast,
  } = props;

  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const listPreview = promptLibraryListPreview(item);
  const rawIntro = (item.intro ?? "").trim();
  const fullPreview = listPreview.isPlaceholder
    ? listPreview.text
    : rawIntro;
  const previewText =
    fullPreview.length > 130 && !expanded
      ? fullPreview.slice(0, 130) + "…"
      : fullPreview;
  const canToggleExpand = rawIntro.length > 130;

  const handleCopy = () => {
    if (isOwn) {
      void navigator.clipboard.writeText(item.body).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      });
    } else {
      const t = (item.intro ?? "").trim();
      if (!t) {
        toast.info("作者未填写对外介绍，可尝试「装配」以使用正文", { duration: 4000 });
        return;
      }
      void navigator.clipboard.writeText(t).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      });
    }
  };

  const isRejected = isOwn && item.status === "rejected";

  return (
    <div className="prompt-card group flex flex-col gap-2 rounded-xl border border-border/50 bg-card/60 p-4 shadow-sm transition-shadow hover:shadow-md">
      {/* 顶行 */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
            TYPE_COLOR[item.type],
          )}>
            {TYPE_ICONS[item.type]}
            {PROMPT_TYPE_LABELS[item.type]}
          </span>
          <StatusBadge status={item.status} />
          {!isOwn && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              精选
            </span>
          )}
          {item.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              #{tag}
            </span>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            title={isFavorite ? "取消收藏" : "收藏"}
            onClick={onToggleFavorite}
            className={cn(
              "rounded p-1 transition-colors hover:bg-muted",
              isFavorite ? "text-amber-500" : "text-muted-foreground",
            )}
          >
            <Star className="h-4 w-4" fill={isFavorite ? "currentColor" : "none"} />
          </button>
          {isOwn && !isFirst && onMoveUp && (
            <button type="button" title="上移" onClick={onMoveUp}
              className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100">
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
          )}
          {isOwn && !isLast && onMoveDown && (
            <button type="button" title="下移" onClick={onMoveDown}
              className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100">
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 标题 */}
      <h3 className="text-sm font-semibold leading-snug text-foreground">{item.title}</h3>

      {/* 驳回原因 */}
      {isRejected && item.reviewNote && (
        <div className="flex items-start gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{item.reviewNote}</span>
        </div>
      )}

      {/* 仅「提示词介绍」：不展示 body */}
      <p
        className={cn(
          "whitespace-pre-wrap break-words text-xs leading-relaxed",
          listPreview.isPlaceholder ? "text-muted-foreground/80 italic" : "text-muted-foreground",
        )}
      >
        {previewText}
      </p>
      {canToggleExpand && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="self-start text-[11px] text-primary hover:underline"
        >
          {expanded ? "收起" : "展开全部"}
        </button>
      )}

      {/* 操作行 */}
      <div className="mt-1 flex flex-wrap items-center gap-1.5 border-t border-border/30 pt-2">
        <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={handleCopy}>
          {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "已复制" : "复制"}
        </Button>
        <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={onAssemble}>
          <MessageSquare className="h-3.5 w-3.5" />
          装配
        </Button>

        {/* 他人精选：另存为草稿 */}
        {!isOwn && onSaveAsMyDraft && (
          <Button size="sm" variant="ghost"
            className="h-7 gap-1 px-2 text-xs text-primary hover:text-primary"
            onClick={onSaveAsMyDraft}>
            <Plus className="h-3.5 w-3.5" />
            另存为草稿
          </Button>
        )}

        {/* 自己的：编辑 / 删除 */}
        {isOwn && (
          <div className="ml-auto flex items-center gap-1">
            {onEdit && (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={onEdit}>
                编辑
              </Button>
            )}
            {onDelete && (
              <Button size="sm" variant="ghost"
                className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                onClick={onDelete}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

export function PromptsPage() {
  const navigate = useNavigate();

  // 数据
  const [myTemplates, setMyTemplates] = useState<GlobalPromptTemplate[]>([]);
  const [approvedTemplates, setApprovedTemplates] = useState<GlobalPromptTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  // UI 状态
  const [viewTab, setViewTab] = useState<ViewTab>("mine");
  const [typeFilter, setTypeFilter] = useState<PromptType | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [favorites, setFavorites] = useState<Set<string>>(() => loadFavorites());
  const [authorLabel, setAuthorLabel] = useState("本地用户");
  const [personalSort, setPersonalSort] = useState<PersonalSort>("updated");
  const [heatTick, setHeatTick] = useState(0);

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  // ── 数据加载 ────────────────────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    let mine = await listGlobalPromptTemplates();
    mine.sort((a, b) => a.sortOrder - b.sortOrder);
    const stuckSubmitted = mine.filter((t) => t.status === "submitted");
    if (stuckSubmitted.length > 0) {
      await Promise.all(
        stuckSubmitted.map((t) => updateGlobalPromptTemplate(t.id, { status: "approved", reviewNote: "" })),
      );
      mine = (await listGlobalPromptTemplates()).sort((a, b) => a.sortOrder - b.sortOrder);
    }
    const approved = await listApprovedPromptTemplates();
    setMyTemplates(mine);
    setApprovedTemplates(approved);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try { await refresh(); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await getSupabase().auth.getUser();
        if (cancelled || !data.user) return;
        setAuthorLabel(pickAuthorLabel(data.user));
      } catch {
        /* 未配置 Supabase 或未登录 */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── 过滤逻辑 ────────────────────────────────────────────────────────────────

  const baseList: GlobalPromptTemplate[] = (() => {
    if (viewTab === "mine") return myTemplates;
    if (viewTab === "personal") return myTemplates;
    if (viewTab === "approved") return approvedTemplates;
    // favorites：先 mine，再 approved（去重）
    const myIds = new Set(myTemplates.map((t) => t.id));
    const favApproved = approvedTemplates.filter(
      (t) => favorites.has(t.id) && !myIds.has(t.id),
    );
    return [...myTemplates.filter((t) => favorites.has(t.id)), ...favApproved];
  })();

  const displayed = (() => {
    let list = baseList;
    if (typeFilter !== "all") list = list.filter((t) => t.type === typeFilter);
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      const canSearchBody = viewTab === "mine" || viewTab === "personal";
      list = list.filter((t) =>
        canSearchBody ? matchesPromptListSearchWithBody(t, q) : matchesPromptListSearch(t, q),
      );
    }
    if (viewTab === "personal") {
      if (personalSort === "heat") {
        list = [...list].sort((a, b) => getPromptHeat(b.id) - getPromptHeat(a.id));
      } else {
        list = [...list].sort((a, b) => b.updatedAt - a.updatedAt);
      }
    }
    // 精选 tab 按更新时间降序；我的/收藏保持 sortOrder
    if (viewTab === "approved") list = [...list].sort((a, b) => b.updatedAt - a.updatedAt);
    return list;
  })();

  // ── 收藏 ────────────────────────────────────────────────────────────────────

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      saveFavorites(next);
      return next;
    });
  };

  const openNew = () => {
    navigate("/prompts/new");
  };
  const openEdit = (item: GlobalPromptTemplate) => {
    navigate(`/prompts/${item.id}/edit`);
  };

  // ── 另存为草稿（他人精选 → 我的草稿） ─────────────────────────────────────

  const handleSaveAsMyDraft = async (item: GlobalPromptTemplate) => {
    await addGlobalPromptTemplate({
      title: item.title,
      type: item.type,
      tags: item.tags,
      intro: item.intro ?? "",
      body: item.body,
      status: "draft",
      usageMethod: item.usageMethod,
    });
    setViewTab("mine");
    await refresh();
  };

  // ── 删除 ────────────────────────────────────────────────────────────────────

  const runDelete = async (id: string) => {
    await deleteGlobalPromptTemplate(id);
    setFavorites((prev) => {
      const next = new Set(prev);
      next.delete(id);
      saveFavorites(next);
      return next;
    });
    setDeleteTarget(null);
    await refresh();
  };

  // ── 排序移动 ────────────────────────────────────────────────────────────────

  const handleMove = async (id: string, dir: -1 | 1) => {
    const idx = myTemplates.findIndex((t) => t.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= myTemplates.length) return;
    const ids = myTemplates.map((t) => t.id);
    [ids[idx], ids[j]] = [ids[j]!, ids[idx]!];
    const next = [...myTemplates];
    [next[idx], next[j]] = [next[j]!, next[idx]!];
    setMyTemplates(next);
    await reorderGlobalPromptTemplates(ids);
  };

  // ── 装配 ────────────────────────────────────────────────────────────────────

  const handleAssemble = async (item: GlobalPromptTemplate) => {
    bumpPromptHeat(item.id);
    setHeatTick((x) => x + 1);
    const workId = readLastWorkId();
    if (!workId) { alert("尚未打开过作品，请先去作品库选择或新建作品。"); return; }
    const w = await getWork(workId);
    navigate(`/work/${w ? workPathSegment(w) : workId}`, { state: { applyUserHint: item.body } });
  };

  // ── 计数徽标 ────────────────────────────────────────────────────────────────

  // ── 渲染 ────────────────────────────────────────────────────────────────────

  return (
    <div className="page prompts-page mx-auto max-w-6xl px-4 pb-12">
      {/* 页眉 */}
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">提示词库</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            列表仅展示「提示词介绍」；正文通过「装配」注入侧栏，避免在库中泄露核心指令。
          </p>
        </div>
        <Button onClick={openNew} className="gap-1.5">
          <Plus className="h-4 w-4" />新建提示词
        </Button>
      </header>

      <div className="flex gap-5">
        {/* 左侧类型筛选 */}
        <aside className="hidden w-44 shrink-0 flex-col gap-1 lg:flex">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">分类筛选</p>
          <TypeFilterBtn active={typeFilter === "all"} onClick={() => setTypeFilter("all")}
            icon={<Layers className="h-4 w-4" />} label="全部"
            count={
              viewTab === "mine" || viewTab === "personal" ? myTemplates.length :
              viewTab === "approved" ? approvedTemplates.length :
              favorites.size
            } />
          {PROMPT_TYPES.map((pt) => (
            <TypeFilterBtn key={pt} active={typeFilter === pt} onClick={() => setTypeFilter(pt)}
              icon={TYPE_ICONS[pt]} label={PROMPT_TYPE_LABELS[pt]}
              count={baseList.filter((t) => t.type === pt).length} />
          ))}
        </aside>

        {/* 主区 */}
        <main className="min-w-0 flex-1">
          {/* 视图 Tab */}
          <div className="mb-4 flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-0.5 rounded-xl border border-border bg-muted/40 p-1">
              {([
                { id: "mine" as const,      label: "我的",    badge: 0 },
                { id: "personal" as const, label: "个人中心", badge: 0 },
                { id: "approved" as const,  label: "精选",    badge: 0 },
                { id: "favorites" as const, label: "已收藏",  badge: 0 },
              ] as const).map(({ id, label, badge }) => (
                <button key={id} type="button" onClick={() => setViewTab(id)}
                  className={cn(
                    "relative inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                    viewTab === id
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}>
                  {id === "personal" && <User className="mr-1 h-3.5 w-3.5 opacity-80" />}
                  {label}
                  {badge > 0 && (
                    <span className="ml-1 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* 搜索 + 移动端类型筛选 */}
          <div className="mb-4 flex flex-col gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9 pr-9" placeholder="搜索标题、介绍或标签（「我的」可搜正文）"
                  value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                {searchQuery && (
                  <button type="button" onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {/* 移动端类型 chip */}
              <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
                {(["all", ...PROMPT_TYPES] as const).map((pt) => (
                  <button key={pt} type="button"
                    onClick={() => setTypeFilter(pt)}
                    className={cn(
                      "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      typeFilter === pt
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:border-primary/40",
                    )}>
                    {pt === "all" ? "全部" : PROMPT_TYPE_LABELS[pt]}
                  </button>
                ))}
              </div>
            </div>

          {/* 精选 tab 说明 */}
          {viewTab === "approved" && !loading && (
            <p className="mb-3 text-xs text-muted-foreground">
              以下为已发布的提示词（含其他用户贡献）。点「另存为草稿」可复制到你的草稿库。
            </p>
          )}

          {viewTab === "personal" && !loading && (
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                查看你创建的提示词：<span className="font-medium text-foreground">{authorLabel}</span>
                。热度为本地统计的「装配」次数；最近更新来自保存时间。
              </p>
              <div className="flex shrink-0 gap-1 rounded-lg border border-border/60 bg-muted/30 p-0.5">
                <button
                  type="button"
                  onClick={() => setPersonalSort("updated")}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                    personalSort === "updated" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  最近更新
                </button>
                <button
                  type="button"
                  onClick={() => setPersonalSort("heat")}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                    personalSort === "heat" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  热度
                </button>
              </div>
            </div>
          )}

          {/* 卡片区 */}
          {loading ? (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">加载中…</div>
            ) : displayed.length === 0 ? (
              <EmptyState
                viewTab={viewTab}
                hasTemplates={myTemplates.length > 0}
                isFiltered={typeFilter !== "all" || !!searchQuery}
                onNew={openNew}
                onClear={() => { setTypeFilter("all"); setSearchQuery(""); }}
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {displayed.map((item, idx) => {
                  const isOwn = viewTab === "mine" || viewTab === "personal" || !item.userId ||
                    myTemplates.some((m) => m.id === item.id);
                  if (viewTab === "personal") {
                    return (
                      <PersonalPromptCard
                        key={`${item.id}-${heatTick}`}
                        item={item}
                        authorLabel={authorLabel}
                        heat={getPromptHeat(item.id)}
                        isFavorite={favorites.has(item.id)}
                        onToggleFavorite={() => toggleFavorite(item.id)}
                        onEdit={() => openEdit(item)}
                        onDelete={() => setDeleteTarget({ id: item.id, title: item.title })}
                        onAssemble={() => handleAssemble(item)}
                        onMoveUp={() => void handleMove(item.id, -1)}
                        onMoveDown={() => void handleMove(item.id, 1)}
                        isFirst={idx === 0}
                        isLast={idx === displayed.length - 1}
                      />
                    );
                  }
                  return (
                    <PromptCard
                      key={item.id}
                      item={item}
                      isOwn={isOwn}
                      isFavorite={favorites.has(item.id)}
                      onToggleFavorite={() => toggleFavorite(item.id)}
                      onEdit={isOwn ? () => openEdit(item) : undefined}
                      onDelete={isOwn ? () => setDeleteTarget({ id: item.id, title: item.title }) : undefined}
                      onSaveAsMyDraft={!isOwn ? () => void handleSaveAsMyDraft(item) : undefined}
                      onAssemble={() => handleAssemble(item)}
                      onMoveUp={isOwn && viewTab === "mine" ? () => void handleMove(item.id, -1) : undefined}
                      onMoveDown={isOwn && viewTab === "mine" ? () => void handleMove(item.id, 1) : undefined}
                      isFirst={idx === 0}
                      isLast={idx === displayed.length - 1}
                    />
                  );
                })}
              </div>
            )}
        </main>
      </div>

      <AlertDialog open={deleteTarget != null} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除提示词？</AlertDialogTitle>
            <AlertDialogDescription>
              「{deleteTarget?.title ?? ""}」将永久删除，无法恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteTarget) void runDelete(deleteTarget.id); }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── 辅助子组件 ────────────────────────────────────────────────────────────────

function TypeFilterBtn(props: {
  active: boolean; onClick: () => void;
  icon: React.ReactNode; label: string; count: number;
}) {
  return (
    <button type="button" onClick={props.onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
        props.active
          ? "bg-primary/10 font-medium text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}>
      {props.icon}
      <span className="flex-1 text-left">{props.label}</span>
      <span className="text-xs tabular-nums opacity-70">{props.count}</span>
    </button>
  );
}

function EmptyState(props: {
  viewTab: ViewTab;
  hasTemplates: boolean;
  isFiltered: boolean;
  onNew: () => void;
  onClear: () => void;
}) {
  if (props.isFiltered) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center text-sm text-muted-foreground">
        <Search className="h-8 w-8 opacity-40" />
        <p>没有符合条件的提示词</p>
        <Button variant="ghost" size="sm" onClick={props.onClear}>清除筛选</Button>
      </div>
    );
  }
  if (props.viewTab === "approved") {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
        <Sparkles className="h-8 w-8 opacity-40" />
        <p>暂无精选提示词</p>
        <p className="text-xs">创建或保存为已发布后，会出现在这里（含他人分享的提示词）。</p>
      </div>
    );
  }
  if (props.viewTab === "favorites") {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
        <Star className="h-8 w-8 opacity-40" />
        <p>还没有收藏任何提示词</p>
        <p className="text-xs">点卡片右上角的星标即可收藏。</p>
      </div>
    );
  }
  if (props.viewTab === "personal") {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
        <User className="h-8 w-8 opacity-40" />
        <p>个人中心暂无提示词</p>
        <p className="max-w-sm text-xs">在「我的」中创建后，会同步出现在这里，可查看热度与最近更新时间。</p>
        <Button onClick={props.onNew} className="mt-1 gap-1.5">
          <Plus className="h-4 w-4" />新建提示词
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <MessageSquare className="h-7 w-7" strokeWidth={1.5} />
      </div>
      <p className="text-sm font-medium">还没有提示词</p>
      <p className="max-w-xs text-xs text-muted-foreground">
        创建可复用的写作提示词，一键装配到任意作品的 AI 侧栏。
      </p>
      <Button onClick={props.onNew} className="mt-1 gap-1.5">
        <Plus className="h-4 w-4" />新建第一条提示词
      </Button>
    </div>
  );
}