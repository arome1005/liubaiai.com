/**
 * PromptExtractDialog — 藏经 → 提炼提示词弹窗（§藏经-Phase1）
 *
 * 两种来源：
 *   - source="excerpt"  → 基于单条摘录提炼
 *   - source="book"     → 基于整书 chunkTexts 提炼
 *
 * 流程：
 *   1. 展示来源（只读）
 *   2. 选择提示词类型
 *   3a. 选择适用范围（落笔/推演/写作）→ 联动显示槽位多选
 *   3b. 填写模板名称 + 标签
 *   4. 点击「开始提炼」→ 流式输出预览
 *   5. 「保存到提示词库（草稿）」→ 附带 slots + source_kind 元数据 → 跳转提示词库
 */

import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  Bot,
  Check,
  Copy,
  Loader2,
  Sparkles,
} from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { addGlobalPromptTemplate } from "../db/repo";
import {
  PROMPT_TYPE_LABELS,
  PROMPT_TYPES,
  PROMPT_SCOPE_LABELS,
  PROMPT_SCOPE_SLOTS,
  PROMPT_SLOT_LABELS,
  type PromptSlot,
  type PromptType,
} from "../db/types";
import {
  extractPromptTemplateFromExcerpt,
  extractPromptTemplateFromBook,
  PromptExtractError,
} from "../ai/extract-prompt-template";
import { UnifiedAIModelSelector as AIModelSelector } from "./ai-model-selector-unified";
import { AI_MODELS } from "./ai-model-selector";
import { loadAiSettings } from "../ai/storage";
import { aiModelIdToProvider } from "../util/ai-ui-model-map";

// ── 类型显示颜色（复用 PromptsPage 的配色） ───────────────────────────────────

function providerLogoSrc(providerId: string | null | undefined): string | null {
  switch (providerId) {
    case "openai":    return "/logos/openai.png";
    case "anthropic": return "/logos/claude.png";
    case "gemini":    return "/logos/gemini.png";
    case "doubao":    return "/logos/doubao.png";
    case "zhipu":     return "/logos/zhipu.png";
    case "kimi":      return "/logos/kimi.png";
    case "xiaomi":    return "/logos/xiaomi.png";
    case "ollama":    return "/logos/ollama.png";
    case "mlx":       return "/logos/ollama.png";
    default:          return null;
  }
}

const TYPE_COLOR: Record<PromptType, string> = {
  continue:       "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  outline:        "border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  volume:         "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  scene:          "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  style:          "border-pink-300 bg-pink-50 text-pink-700 dark:border-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  opening:        "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  character:      "border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-900/30 dark:text-green-300",
  worldbuilding:  "border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
  book_split:     "border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-700 dark:bg-orange-900/30 dark:text-orange-200",
  universal_entry:  "border-cyan-300 bg-cyan-50 text-cyan-800 dark:border-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-200",
  article_summary: "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-700 dark:bg-sky-900/30 dark:text-sky-200",
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface PromptExtractDialogBaseProps {
  open: boolean;
  onClose: () => void;
  bookTitle: string;
}

interface ExcerptSourceProps extends PromptExtractDialogBaseProps {
  source: "excerpt";
  excerptText: string;
  excerptNote?: string;
  /** 摘录的数据库 ID，保存时写入 source_excerpt_ids 供溯源 */
  excerptId?: string;
}

interface BookSourceProps extends PromptExtractDialogBaseProps {
  source: "book";
  chunkTexts: string[];
  chunkCount: number;
}

export type PromptExtractDialogProps = ExcerptSourceProps | BookSourceProps;

// ── 主组件 ────────────────────────────────────────────────────────────────────

export function PromptExtractDialog(props: PromptExtractDialogProps) {
  const navigate = useNavigate();
  const { open, onClose, bookTitle } = props;

  // 步骤 2
  const [selectedType, setSelectedType] = useState<PromptType>("style");

  // 步骤 3a：适用范围 + 槽位
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(new Set());
  const [selectedSlots, setSelectedSlots] = useState<Set<PromptSlot>>(new Set());

  // 步骤 3b：名称 + 标签
  const [templateName, setTemplateName] = useState("");
  const [tagsInput, setTagsInput] = useState("");

  // 步骤 4：提炼
  const [extracting, setExtracting] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 步骤 5：保存
  const [saved, setSaved] = useState<null | "draft" | "published">(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // AI 模型选择
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<string>(
    () => AI_MODELS[0]?.id ?? "gemini"
  );

  const hasResult = streamText.trim().length > 0;

  // 默认模板名
  const defaultName = `【藏经·${bookTitle}】${PROMPT_TYPE_LABELS[selectedType]}`;

  const effectiveName = templateName.trim() || defaultName;
  const effectiveTags = tagsInput.trim()
    ? tagsInput.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean)
    : ["藏经", bookTitle];

  // ── 开始提炼 ────────────────────────────────────────────────────────────────

  const handleExtract = async () => {
    setError(null);
    setStreamText("");
    setSaved(null);
    setExtracting(true);
    abortRef.current = new AbortController();
    const overrideProvider = aiModelIdToProvider(selectedModelId);

    try {
      if (props.source === "excerpt") {
        await extractPromptTemplateFromExcerpt({
          excerptText: props.excerptText,
          excerptNote: props.excerptNote,
          bookTitle,
          type: selectedType,
          overrideProvider,
          onDelta: (d) => setStreamText((prev) => prev + d),
          signal: abortRef.current.signal,
        });
      } else {
        await extractPromptTemplateFromBook({
          chunkTexts: props.chunkTexts,
          bookTitle,
          type: selectedType,
          overrideProvider,
          onDelta: (d) => setStreamText((prev) => prev + d),
          signal: abortRef.current.signal,
        });
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (e instanceof Error && e.name === "AbortError") return;
      setError(e instanceof PromptExtractError ? e.message : e instanceof Error ? e.message : String(e));
    } finally {
      setExtracting(false);
      abortRef.current = null;
    }
  };

  // ── 保存草稿 ────────────────────────────────────────────────────────────────

  const handleSave = async (status: "draft" | "approved") => {
    if (!streamText.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const slots = selectedSlots.size > 0 ? Array.from(selectedSlots) : undefined;
      await addGlobalPromptTemplate({
        title: effectiveName,
        type: selectedType,
        tags: effectiveTags,
        body: streamText.trim(),
        status,
        slots,
        source_kind: props.source === "excerpt" ? "reference_excerpt" : "reference_book",
        source_ref_work_id: null,
        source_excerpt_ids:
          props.source === "excerpt" && props.excerptId
            ? [props.excerptId]
            : null,
        source_note: `type=${selectedType}`,
      });
      setSaved(status === "approved" ? "published" : "draft");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  // ── 复制 ────────────────────────────────────────────────────────────────────

  const handleCopy = () => {
    void navigator.clipboard.writeText(streamText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  // ── 关闭时重置 ───────────────────────────────────────────────────────────────

  const handleClose = () => {
    abortRef.current?.abort();
    setStreamText("");
    setError(null);
    setSaved(null);
    setExtracting(false);
    setTemplateName("");
    setTagsInput("");
    setSelectedType("style");
    setSelectedScopes(new Set());
    setSelectedSlots(new Set());
    onClose();
  };

  // ── 范围/槽位联动 ────────────────────────────────────────────────────────────

  const toggleScope = (scope: string) => {
    setSelectedScopes((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) {
        next.delete(scope);
        // 移除该范围下的槽位
        const slotsForScope = PROMPT_SCOPE_SLOTS[scope] ?? [];
        setSelectedSlots((ps) => {
          const ns = new Set(ps);
          slotsForScope.forEach((s) => ns.delete(s));
          return ns;
        });
      } else {
        next.add(scope);
      }
      return next;
    });
  };

  const toggleSlot = (slot: PromptSlot) => {
    setSelectedSlots((prev) => {
      const next = new Set(prev);
      if (next.has(slot)) next.delete(slot);
      else next.add(slot);
      return next;
    });
  };

  const visibleSlots: PromptSlot[] = selectedScopes.size > 0
    ? Array.from(selectedScopes).flatMap((sc) => PROMPT_SCOPE_SLOTS[sc] ?? [])
    : [];

  // ── 渲染 ────────────────────────────────────────────────────────────────────

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-h-[90dvh] w-full max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              提炼为提示词
            </span>
            <button
              type="button"
              onClick={() => setModelPickerOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
              title="切换 AI 模型"
            >
              <Bot className="h-3 w-3 opacity-60" />
              <span className="text-muted-foreground/70">AI模型</span>
              {(() => {
                const model = AI_MODELS.find((m) => m.id === selectedModelId);
                const logoSrc = providerLogoSrc(model?.providerId);
                return (
                  <span className="flex items-center gap-1">
                    {logoSrc ? (
                      <img src={logoSrc} alt="" className="h-3.5 w-3.5 rounded-sm object-contain" />
                    ) : null}
                    <span className="font-medium text-foreground">{model?.name ?? "未选择"}</span>
                  </span>
                );
              })()}
            </button>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-1">
          {/* ── 步骤 1：来源 ── */}
          <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <BookOpen className="h-3.5 w-3.5" />
              来源
            </div>
            <p className="text-xs font-medium text-foreground">{bookTitle}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {props.source === "excerpt"
                ? `摘录：${props.excerptText.slice(0, 80)}${props.excerptText.length > 80 ? "…" : ""}`
                : `整本书（共 ${props.chunkCount} 块分段）`}
            </p>
          </div>

          {/* ── 步骤 2：类型选择 ── */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">提示词类型</label>
            <div className="flex flex-wrap gap-1.5">
              {PROMPT_TYPES.map((pt) => (
                <button
                  key={pt}
                  type="button"
                  disabled={extracting}
                  onClick={() => setSelectedType(pt)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    selectedType === pt
                      ? TYPE_COLOR[pt]
                      : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                  )}
                >
                  {PROMPT_TYPE_LABELS[pt]}
                </button>
              ))}
            </div>
          </div>

          {/* ── 步骤 3a：适用范围 + 槽位 ── */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">
              适用范围
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">选择后联动槽位</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {Object.keys(PROMPT_SCOPE_LABELS).map((sc) => (
                <button
                  key={sc}
                  type="button"
                  disabled={extracting}
                  onClick={() => toggleScope(sc)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    selectedScopes.has(sc)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                  )}
                >
                  {PROMPT_SCOPE_LABELS[sc]}
                </button>
              ))}
            </div>
            {visibleSlots.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pl-1">
                {visibleSlots.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    disabled={extracting}
                    onClick={() => toggleSlot(slot)}
                    className={cn(
                      "rounded border px-2 py-0.5 text-[11px] font-medium transition-colors",
                      selectedSlots.has(slot)
                        ? "border-primary/60 bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground",
                    )}
                  >
                    {PROMPT_SLOT_LABELS[slot]}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── 步骤 3b：名称 + 标签 ── */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">模板名称</label>
              <Input
                placeholder={defaultName}
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                maxLength={80}
                disabled={extracting}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">
                标签
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">逗号分隔；默认：藏经、书名</span>
              </label>
              <Input
                placeholder={`藏经，${bookTitle}`}
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                disabled={extracting}
              />
            </div>
          </div>

          {/* ── 步骤 4：提炼按钮 + 流式输出 ── */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              disabled={extracting}
              onClick={() => void handleExtract()}
              className="gap-1.5"
            >
              {extracting
                ? <><Loader2 className="h-4 w-4 animate-spin" />提炼中…</>
                : <><Sparkles className="h-4 w-4" />{hasResult ? "重新提炼" : "开始提炼"}</>}
            </Button>
            {extracting && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => abortRef.current?.abort()}
              >
                停止
              </Button>
            )}
          </div>

          {error && (
            <div className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          {(extracting || hasResult) && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">模板正文预览</span>
                {hasResult && !extracting && (
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                    {copied ? "已复制" : "复制"}
                  </button>
                )}
              </div>
              <div className="min-h-[8rem] max-h-64 overflow-hidden rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5">
                {extracting ? (
                  <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-foreground font-sans">
                    {streamText || " "}
                    <span className="inline-block h-3 w-0.5 animate-pulse bg-primary ml-0.5" />
                  </pre>
                ) : (
                  <textarea
                    className="min-h-[8rem] max-h-64 w-full resize-y bg-transparent text-[11px] leading-relaxed text-foreground font-sans outline-none"
                    value={streamText}
                    onChange={(e) => setStreamText(e.target.value)}
                    spellCheck={false}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── 底栏 ── */}
        <DialogFooter className="gap-2 pt-2">
          {saveError && (
            <p className="w-full text-xs text-destructive">{saveError}</p>
          )}
          <Button variant="ghost" onClick={handleClose} disabled={saving}>
            {saved ? "关闭" : "取消"}
          </Button>

          {hasResult && !extracting && !saved && (
            <>
              <Button
                variant="outline"
                onClick={() => void handleSave("draft")}
                disabled={saving}
                className="gap-1.5"
              >
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" />保存中…</> : "仅保存草稿"}
              </Button>
              <Button
                onClick={() => void handleSave("approved")}
                disabled={saving}
                className="gap-1.5"
              >
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" />保存中…</> : "保存到提示词库"}
              </Button>
            </>
          )}

          {saved && (
            <Button
              variant="outline"
              className="gap-1.5 border-green-500/50 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"
              onClick={() => { handleClose(); navigate("/prompts"); }}
            >
              <Check className="h-4 w-4" />
              {saved === "published" ? "已保存 · 去提示词库" : "草稿已保存 · 去提示词库"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AIModelSelector
      open={modelPickerOpen}
      onOpenChange={setModelPickerOpen}
      selectedModelId={selectedModelId}
      onSelectModel={(id) => setSelectedModelId(id)}
      title="选择 AI 模型"
    />
  </>
  );
}