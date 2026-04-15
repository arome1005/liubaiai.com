"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  FileText,
  Layers,
  Lock,
  MessageSquare,
  PenLine,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Type,
  Users,
  X,
  Zap,
} from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  addGlobalPromptTemplate,
  deleteGlobalPromptTemplate,
  listApprovedPromptTemplates,
  listGlobalPromptTemplates,
  listSubmittedPromptTemplates,
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
import { readLastWorkId } from "../util/lastWorkId";

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

// ── 图标 & 颜色映射 ────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<PromptType, React.ReactNode> = {
  continue:      <PenLine   className="h-3.5 w-3.5" strokeWidth={1.6} />,
  outline:       <Layers    className="h-3.5 w-3.5" strokeWidth={1.6} />,
  volume:        <BookOpen  className="h-3.5 w-3.5" strokeWidth={1.6} />,
  scene:         <FileText  className="h-3.5 w-3.5" strokeWidth={1.6} />,
  style:         <Type      className="h-3.5 w-3.5" strokeWidth={1.6} />,
  opening:       <Zap       className="h-3.5 w-3.5" strokeWidth={1.6} />,
  character:     <Users     className="h-3.5 w-3.5" strokeWidth={1.6} />,
  worldbuilding: <Sparkles  className="h-3.5 w-3.5" strokeWidth={1.6} />,
};

const TYPE_COLOR: Record<PromptType, string> = {
  continue:      "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  outline:       "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  volume:        "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  scene:         "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  style:         "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
  opening:       "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  character:     "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  worldbuilding: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
};

const STATUS_STYLE: Record<PromptStatus, string> = {
  draft:     "bg-muted text-muted-foreground",
  submitted: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  approved:  "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  rejected:  "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

// ── 视图模式 ──────────────────────────────────────────────────────────────────

type ViewTab = "mine" | "approved" | "favorites" | "admin";

// ── 管理员解锁 ────────────────────────────────────────────────────────────────

const ADMIN_SESSION_KEY = "liubai:admin_unlocked";

function isAdminUnlocked(): boolean {
  try { return sessionStorage.getItem(ADMIN_SESSION_KEY) === "1"; }
  catch { return false; }
}

function persistAdminUnlock(): void {
  try { sessionStorage.setItem(ADMIN_SESSION_KEY, "1"); }
  catch { /* ignore */ }
}

// ── 表单状态 ──────────────────────────────────────────────────────────────────

type FormState = {
  title: string;
  type: PromptType;
  tagsInput: string;
  body: string;
};

const EMPTY_FORM: FormState = { title: "", type: "continue", tagsInput: "", body: "" };

function templateToForm(t: GlobalPromptTemplate): FormState {
  return { title: t.title, type: t.type, tagsInput: t.tags.join("，"), body: t.body };
}

function parseTags(raw: string): string[] {
  return raw.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean);
}

// ── 状态 Badge ────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: PromptStatus }) {
  if (status === "draft") return null; // 草稿不显示
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
  onSubmit?: () => void;
  onWithdraw?: () => void;
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
    onSubmit, onWithdraw, onSaveAsMyDraft,
    onAssemble, onMoveUp, onMoveDown, isFirst, isLast,
  } = props;

  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(item.body).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  const bodyPreview = item.body.length > 130 && !expanded
    ? item.body.slice(0, 130) + "…"
    : item.body;

  const canSubmit  = isOwn && item.status === "draft";
  const canWithdraw = isOwn && item.status === "submitted";
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

      {/* 正文 */}
      <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">
        {bodyPreview}
      </p>
      {item.body.length > 130 && (
        <button type="button" onClick={() => setExpanded((v) => !v)}
          className="self-start text-[11px] text-primary hover:underline">
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

        {/* 提交审核 / 撤回 */}
        {canSubmit && onSubmit && (
          <Button size="sm" variant="ghost"
            className="h-7 gap-1 px-2 text-xs text-amber-600 hover:text-amber-700"
            onClick={onSubmit}>
            提交审核
          </Button>
        )}
        {canWithdraw && onWithdraw && (
          <Button size="sm" variant="ghost"
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={onWithdraw}>
            撤回
          </Button>
        )}
        {isRejected && onSubmit && (
          <Button size="sm" variant="ghost"
            className="h-7 gap-1 px-2 text-xs text-amber-600 hover:text-amber-700"
            onClick={onSubmit}>
            重新提交
          </Button>
        )}

        {/* 他人精选：另存为草稿 */}
        {!isOwn && onSaveAsMyDraft && (
          <Button size="sm" variant="ghost"
            className="h-7 gap-1 px-2 text-xs text-primary hover:text-primary"
            onClick={onSaveAsMyDraft}>
            <Plus className="h-3.5 w-3.5" />
            另存为草稿
          </Button>
        )}

        {/* 自己的：编辑 / 删除（submitted 期间不可编辑正文） */}
        {isOwn && (
          <div className="ml-auto flex items-center gap-1">
            {onEdit && item.status !== "submitted" && (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={onEdit}>
                编辑
              </Button>
            )}
            {onDelete && item.status !== "submitted" && item.status !== "approved" && (
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

// ── 新建/编辑弹层 ─────────────────────────────────────────────────────────────

function PromptFormDialog(props: {
  open: boolean;
  isNew: boolean;
  form: FormState;
  saving: boolean;
  onChange: (patch: Partial<FormState>) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const { open, isNew, form, saving, onChange, onSave, onClose } = props;
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => bodyRef.current?.focus(), 80);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); if (!saving) onSave(); }
          if (e.key === "Escape") { e.stopPropagation(); onClose(); }
        }}
      >
        <DialogHeader>
          <DialogTitle>{isNew ? "新建提示词" : "编辑提示词"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* 标题 */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">标题</label>
            <Input placeholder="给这条提示词起个名字" value={form.title}
              onChange={(e) => onChange({ title: e.target.value })} maxLength={80} />
          </div>

          {/* 类型 */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">类型</label>
            <div className="flex flex-wrap gap-2">
              {PROMPT_TYPES.map((pt) => (
                <button key={pt} type="button" onClick={() => onChange({ type: pt })}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    form.type === pt
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-muted/50 text-muted-foreground hover:border-primary/40 hover:text-foreground",
                  )}>
                  {TYPE_ICONS[pt]}
                  {PROMPT_TYPE_LABELS[pt]}
                </button>
              ))}
            </div>
          </div>

          {/* 标签 */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">
              标签
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">逗号分隔</span>
            </label>
            <Input placeholder="爽文，升级，逆袭…" value={form.tagsInput}
              onChange={(e) => onChange({ tagsInput: e.target.value })} />
          </div>

          {/* 正文 */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">
              正文
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">⌘↩ 保存</span>
            </label>
            <textarea
              ref={bodyRef}
              className="min-h-[12rem] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="在这里写提示词正文…"
              value={form.body}
              onChange={(e) => onChange({ body: e.target.value })}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>取消</Button>
          <Button onClick={onSave} disabled={saving || !form.body.trim()}>
            {saving ? "保存中…" : isNew ? "创建" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── 管理员审核卡片 ────────────────────────────────────────────────────────────

function AdminReviewCard(props: {
  item: GlobalPromptTemplate;
  onApprove: () => void;
  onReject: (note: string) => void;
  busy: boolean;
}) {
  const { item, onApprove, onReject, busy } = props;
  const [expanded, setExpanded]     = useState(false);
  const [rejecting, setRejecting]   = useState(false);
  const [rejectNote, setRejectNote] = useState("");

  const bodyPreview = item.body.length > 200 && !expanded
    ? item.body.slice(0, 200) + "…"
    : item.body;

  const sourceLabel: Record<string, string> = {
    manual:             "手动创建",
    reference_excerpt:  "摘录提炼",
    reference_book:     "整书提炼",
    reference_chat:     "藏经对话",
  };

  const handleRejectConfirm = () => {
    onReject(rejectNote.trim());
    setRejecting(false);
    setRejectNote("");
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4 shadow-sm dark:border-amber-800/40 dark:bg-amber-900/10">
      {/* 顶行：类型 + 来源 + 提交时间 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
          TYPE_COLOR[item.type],
        )}>
          {TYPE_ICONS[item.type]}
          {PROMPT_TYPE_LABELS[item.type]}
        </span>
        {item.source_kind && (
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
            {sourceLabel[item.source_kind] ?? item.source_kind}
          </span>
        )}
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_STYLE["submitted"])}>
          {PROMPT_STATUS_LABELS["submitted"]}
        </span>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {new Date(item.updatedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      {/* 标题 */}
      <h3 className="text-sm font-semibold leading-snug text-foreground">{item.title}</h3>

      {/* 标签 */}
      {item.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {item.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* 槽位 */}
      {item.slots && item.slots.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {item.slots.map((s) => (
            <span key={s} className="rounded border border-primary/30 bg-primary/5 px-1.5 py-0.5 text-[11px] font-medium text-primary">
              {s}
            </span>
          ))}
        </div>
      )}

      {/* 提交者 ID（匿名显示后6位） */}
      {item.userId && (
        <p className="text-[11px] text-muted-foreground">
          提交者 UID：…{item.userId.slice(-6)}
        </p>
      )}

      {/* 正文 */}
      <div className="rounded-lg border border-border/40 bg-background px-3 py-2.5">
        <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground">
          {bodyPreview}
        </p>
        {item.body.length > 200 && (
          <button type="button" onClick={() => setExpanded((v) => !v)}
            className="mt-1 text-[11px] text-primary hover:underline">
            {expanded ? "收起" : "展开全部"}
          </button>
        )}
      </div>

      {/* 驳回理由输入区 */}
      {rejecting && (
        <div className="flex flex-col gap-2">
          <textarea
            className="min-h-[4rem] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-xs leading-relaxed placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="请填写驳回原因（将展示给提交者）…"
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            autoFocus
          />
          <div className="flex items-center gap-2">
            <Button size="sm" variant="destructive" className="h-7 gap-1 px-3 text-xs"
              disabled={busy || !rejectNote.trim()}
              onClick={handleRejectConfirm}>
              <ThumbsDown className="h-3.5 w-3.5" />
              确认驳回
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-3 text-xs"
              onClick={() => { setRejecting(false); setRejectNote(""); }}>
              取消
            </Button>
          </div>
        </div>
      )}

      {/* 操作行 */}
      {!rejecting && (
        <div className="flex items-center gap-2 border-t border-amber-200/60 pt-2 dark:border-amber-800/30">
          <Button size="sm"
            className="h-8 gap-1.5 bg-green-600 px-3 text-xs text-white hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600"
            disabled={busy}
            onClick={onApprove}>
            <ThumbsUp className="h-3.5 w-3.5" />
            通过发布
          </Button>
          <Button size="sm" variant="outline"
            className="h-8 gap-1.5 border-red-300 px-3 text-xs text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
            disabled={busy}
            onClick={() => setRejecting(true)}>
            <ThumbsDown className="h-3.5 w-3.5" />
            驳回
          </Button>
        </div>
      )}
    </div>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

export function PromptsPage() {
  const navigate = useNavigate();

  // 数据
  const [myTemplates, setMyTemplates] = useState<GlobalPromptTemplate[]>([]);
  const [approvedTemplates, setApprovedTemplates] = useState<GlobalPromptTemplate[]>([]);
  const [submittedTemplates, setSubmittedTemplates] = useState<GlobalPromptTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  // UI 状态
  const [viewTab, setViewTab] = useState<ViewTab>("mine");
  const [typeFilter, setTypeFilter] = useState<PromptType | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [favorites, setFavorites] = useState<Set<string>>(() => loadFavorites());

  // 管理员解锁
  const [adminUnlocked, setAdminUnlocked] = useState(isAdminUnlocked);
  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false);
  const [unlockInput, setUnlockInput] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const [adminBusyId, setAdminBusyId] = useState<string | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);

  // 弹层
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const isNew = editingId === null;

  // ── 数据加载 ────────────────────────────────────────────────────────────────

  const refresh = useCallback(async (withAdmin = false) => {
    const fetches: [
      Promise<GlobalPromptTemplate[]>,
      Promise<GlobalPromptTemplate[]>,
      Promise<GlobalPromptTemplate[]>,
    ] = [
      listGlobalPromptTemplates(),
      listApprovedPromptTemplates(),
      withAdmin ? listSubmittedPromptTemplates() : Promise.resolve([]),
    ];
    const [mine, approved, submitted] = await Promise.all(fetches);
    mine.sort((a, b) => a.sortOrder - b.sortOrder);
    setMyTemplates(mine);
    setApprovedTemplates(approved);
    if (withAdmin) setSubmittedTemplates(submitted);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try { await refresh(adminUnlocked); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [refresh, adminUnlocked]);

  // ── 过滤逻辑 ────────────────────────────────────────────────────────────────

  const baseList: GlobalPromptTemplate[] = (() => {
    if (viewTab === "mine") return myTemplates;
    if (viewTab === "approved") return approvedTemplates;
    if (viewTab === "admin") return [];   // admin 面板单独渲染，不走通用过滤
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
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.body.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q)),
      );
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

  // ── 弹层 ────────────────────────────────────────────────────────────────────

  const openNew = () => { setEditingId(null); setForm(EMPTY_FORM); setDialogOpen(true); };
  const openEdit = (item: GlobalPromptTemplate) => {
    setEditingId(item.id); setForm(templateToForm(item)); setDialogOpen(true);
  };
  const closeDialog = () => { setDialogOpen(false); setEditingId(null); setForm(EMPTY_FORM); };

  const handleSave = async () => {
    if (!form.body.trim()) return;
    setSaving(true);
    try {
      const tags = parseTags(form.tagsInput);
      if (isNew) {
        await addGlobalPromptTemplate({
          title: form.title.trim() || "未命名模板",
          type: form.type, tags, body: form.body, status: "draft",
        });
      } else {
        await updateGlobalPromptTemplate(editingId!, {
          title: form.title.trim() || "未命名模板",
          type: form.type, tags, body: form.body,
        });
      }
      await refresh();
      closeDialog();
    } finally { setSaving(false); }
  };

  // ── 管理员解锁 ──────────────────────────────────────────────────────────────

  const handleUnlock = () => {
    const key = import.meta.env.VITE_ADMIN_KEY;
    if (!key) {
      setUnlockError("未配置 VITE_ADMIN_KEY，请在 .env.local 中设置后重新构建。");
      return;
    }
    if (unlockInput.trim() !== key) {
      setUnlockError("密码错误，请重试。");
      return;
    }
    persistAdminUnlock();
    setAdminUnlocked(true);
    setUnlockError("");
    setUnlockInput("");
    setUnlockDialogOpen(false);
    setViewTab("admin");
  };

  // ── 管理员：通过 / 驳回 ─────────────────────────────────────────────────────

  const handleApprove = async (item: GlobalPromptTemplate) => {
    setAdminBusyId(item.id);
    try {
      await updateGlobalPromptTemplate(item.id, { status: "approved", reviewNote: "" });
      setSubmittedTemplates((prev) => prev.filter((t) => t.id !== item.id));
    } finally {
      setAdminBusyId(null);
    }
  };

  const handleReject = async (item: GlobalPromptTemplate, note: string) => {
    setAdminBusyId(item.id);
    try {
      await updateGlobalPromptTemplate(item.id, { status: "rejected", reviewNote: note });
      setSubmittedTemplates((prev) => prev.filter((t) => t.id !== item.id));
    } finally {
      setAdminBusyId(null);
    }
  };

  const refreshSubmitted = async () => {
    setAdminLoading(true);
    try {
      const submitted = await listSubmittedPromptTemplates();
      setSubmittedTemplates(submitted);
    } finally {
      setAdminLoading(false);
    }
  };

  // ── 审核操作 ────────────────────────────────────────────────────────────────

  const handleSubmit = async (item: GlobalPromptTemplate) => {
    if (!window.confirm(`提交「${item.title}」进行审核？提交后不可编辑，直到审核结束。`)) return;
    await updateGlobalPromptTemplate(item.id, { status: "submitted" });
    await refresh();
  };

  const handleWithdraw = async (item: GlobalPromptTemplate) => {
    await updateGlobalPromptTemplate(item.id, { status: "draft" });
    await refresh();
  };

  // ── 另存为草稿（他人精选 → 我的草稿） ─────────────────────────────────────

  const handleSaveAsMyDraft = async (item: GlobalPromptTemplate) => {
    await addGlobalPromptTemplate({
      title: item.title, type: item.type, tags: item.tags, body: item.body, status: "draft",
    });
    setViewTab("mine");
    await refresh();
  };

  // ── 删除 ────────────────────────────────────────────────────────────────────

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`删除「${title}」？此操作不可恢复。`)) return;
    await deleteGlobalPromptTemplate(id);
    setFavorites((prev) => { const next = new Set(prev); next.delete(id); saveFavorites(next); return next; });
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

  const handleAssemble = (body: string) => {
    const workId = readLastWorkId();
    if (!workId) { alert("尚未打开过作品，请先去作品库选择或新建作品。"); return; }
    navigate(`/work/${workId}`, { state: { applyUserHint: body } });
  };

  // ── 计数徽标 ────────────────────────────────────────────────────────────────

  const pendingCount  = myTemplates.filter((t) => t.status === "submitted").length;
  const reviewCount   = submittedTemplates.length;

  // ── 渲染 ────────────────────────────────────────────────────────────────────

  return (
    <div className="page prompts-page mx-auto max-w-6xl px-4 pb-12">
      {/* 页眉 */}
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">提示词库</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            管理可跨作品复用的写作提示词；点「装配」可直接注入当前作品 AI 侧栏。
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
              viewTab === "mine"     ? myTemplates.length :
              viewTab === "approved" ? approvedTemplates.length :
              viewTab === "admin"    ? submittedTemplates.length :
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
                { id: "mine",      label: "我的",    badge: pendingCount },
                { id: "approved",  label: "精选",    badge: 0 },
                { id: "favorites", label: "已收藏",  badge: 0 },
                ...(adminUnlocked
                  ? [{ id: "admin" as ViewTab, label: "审核", badge: reviewCount }]
                  : []),
              ] as { id: ViewTab; label: string; badge: number }[]).map(({ id, label, badge }) => (
                <button key={id} type="button" onClick={() => setViewTab(id)}
                  className={cn(
                    "relative rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                    viewTab === id
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                    id === "admin" && "text-amber-600 dark:text-amber-400",
                  )}>
                  {id === "admin" && <ShieldCheck className="mr-1 inline h-3.5 w-3.5" />}
                  {label}
                  {badge > 0 && (
                    <span className={cn(
                      "ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white",
                      id === "admin" ? "bg-red-500" : "bg-amber-500",
                    )}>
                      {badge}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* 管理员解锁入口（未解锁时显示锁图标，已解锁不显示） */}
            {!adminUnlocked && (
              <button
                type="button"
                title="管理员入口"
                onClick={() => { setUnlockInput(""); setUnlockError(""); setUnlockDialogOpen(true); }}
                className="rounded-lg border border-border/50 p-1.5 text-muted-foreground/40 transition-colors hover:border-border hover:text-muted-foreground"
              >
                <Lock className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* 搜索 + 移动端类型筛选（admin tab 不需要） */}
          {viewTab !== "admin" && (
            <div className="mb-4 flex flex-col gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9 pr-9" placeholder="搜索标题、正文或标签…"
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
          )}

          {/* ── 管理员审核面板 ── */}
          {viewTab === "admin" && (
            <div className="flex flex-col gap-4">
              {/* 说明栏 */}
              <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3 dark:border-amber-800/40 dark:bg-amber-900/10">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <span className="text-sm font-medium text-amber-700 dark:text-amber-300">管理员审核</span>
                  <span className="text-xs text-amber-600/70 dark:text-amber-400/70">
                    · 共 {submittedTemplates.length} 条待审核
                  </span>
                </div>
                <Button
                  size="sm" variant="ghost"
                  className="h-7 gap-1 px-2 text-xs text-amber-700 hover:text-amber-800 dark:text-amber-400"
                  disabled={adminLoading}
                  onClick={() => void refreshSubmitted()}
                >
                  {adminLoading ? "刷新中…" : "刷新"}
                </Button>
              </div>

              {/* 列表 */}
              {adminLoading ? (
                <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">加载中…</div>
              ) : submittedTemplates.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
                  <ShieldCheck className="h-10 w-10 opacity-30" />
                  <p>暂无待审核提示词</p>
                  <p className="text-xs">用户提交后将出现在这里。</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                  {submittedTemplates.map((item) => (
                    <AdminReviewCard
                      key={item.id}
                      item={item}
                      busy={adminBusyId === item.id}
                      onApprove={() => void handleApprove(item)}
                      onReject={(note) => void handleReject(item, note)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 精选 tab 说明 */}
          {viewTab === "approved" && !loading && (
            <p className="mb-3 text-xs text-muted-foreground">
              以下为已通过审核的精选提示词（含其他用户贡献）。点「另存为草稿」可复制到你的草稿库。
            </p>
          )}

          {/* 普通卡片区（非 admin tab） */}
          {viewTab !== "admin" && (
            loading ? (
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
                  const isOwn = viewTab === "mine" || !item.userId ||
                    myTemplates.some((m) => m.id === item.id);
                  return (
                    <PromptCard
                      key={item.id}
                      item={item}
                      isOwn={isOwn}
                      isFavorite={favorites.has(item.id)}
                      onToggleFavorite={() => toggleFavorite(item.id)}
                      onEdit={isOwn ? () => openEdit(item) : undefined}
                      onDelete={isOwn ? () => void handleDelete(item.id, item.title) : undefined}
                      onSubmit={isOwn ? () => void handleSubmit(item) : undefined}
                      onWithdraw={isOwn ? () => void handleWithdraw(item) : undefined}
                      onSaveAsMyDraft={!isOwn ? () => void handleSaveAsMyDraft(item) : undefined}
                      onAssemble={() => handleAssemble(item.body)}
                      onMoveUp={isOwn && viewTab === "mine" ? () => void handleMove(item.id, -1) : undefined}
                      onMoveDown={isOwn && viewTab === "mine" ? () => void handleMove(item.id, 1) : undefined}
                      isFirst={idx === 0}
                      isLast={idx === displayed.length - 1}
                    />
                  );
                })}
              </div>
            )
          )}
        </main>
      </div>

      {/* ── 新建/编辑弹层 ── */}
      <PromptFormDialog
        open={dialogOpen} isNew={isNew} form={form} saving={saving}
        onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
        onSave={() => void handleSave()}
        onClose={closeDialog}
      />

      {/* ── 管理员解锁弹窗 ── */}
      <Dialog open={unlockDialogOpen} onOpenChange={(v) => { if (!v) { setUnlockDialogOpen(false); setUnlockError(""); setUnlockInput(""); } }}>
        <DialogContent className="w-full max-w-sm"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleUnlock(); } }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-amber-600" />
              管理员解锁
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <p className="text-xs text-muted-foreground">
              输入管理员密码（VITE_ADMIN_KEY）以解锁审核 Tab。解锁状态保持到关闭浏览器标签页。
            </p>
            <Input
              type="password"
              placeholder="管理员密码…"
              value={unlockInput}
              onChange={(e) => { setUnlockInput(e.target.value); setUnlockError(""); }}
              autoFocus
            />
            {unlockError && (
              <p className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {unlockError}
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => { setUnlockDialogOpen(false); setUnlockError(""); setUnlockInput(""); }}>
              取消
            </Button>
            <Button onClick={handleUnlock} disabled={!unlockInput.trim()}>
              <Lock className="mr-1.5 h-3.5 w-3.5" />
              解锁
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
        <p className="text-xs">提交你的草稿审核后，通过即可出现在这里。</p>
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