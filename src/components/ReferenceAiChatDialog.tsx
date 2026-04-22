import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Send, Sparkles, Square, X } from "lucide-react";
import { cn } from "../lib/utils";
import { Dialog, DialogContent } from "./ui/dialog";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { AI_MODELS } from "./ai-model-selector";
import { UnifiedAIModelSelector as AIModelSelector } from "./ai-model-selector-unified";
import { aiModelIdToProvider, aiProviderToModelId } from "../util/ai-ui-model-map";
import { generateWithProviderStream } from "../ai/client";
import { getProviderConfig, loadAiSettings, saveAiSettings } from "../ai/storage";
import type { AiChatMessage, AiProviderId, AiSettings } from "../ai/types";
import { isLocalAiProvider } from "../ai/local-provider";
import { LiubaiLogo } from "./LiubaiLogo";
import { addGlobalPromptTemplate, listReferenceLibrary } from "../db/repo";
import type { GlobalPromptTemplate, PromptType } from "../db/types";
import { getDB } from "../db/database";

// ── 类型 ──────────────────────────────────────────────────────────────────────

type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  ts: number;
};

type SavedState = Record<string, "draft" | "submitted">;

function makeId() {
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isCloudProvider(p: AiProviderId) {
  return !isLocalAiProvider(p);
}

function assertCanChat(args: { settings: AiSettings; provider: AiProviderId; injectingBookContent: boolean }) {
  if (!isCloudProvider(args.provider)) return;
  if (!args.settings.privacy.consentAccepted || !args.settings.privacy.allowCloudProviders) {
    throw new Error("请先在设置中同意云端 AI 并允许调用。");
  }
  if (args.injectingBookContent && !args.settings.privacy.allowChapterContent) {
    throw new Error("本对话将注入书籍片段，请在隐私设置中开启「允许正文上云」。");
  }
}

function hasPromptTemplateShape(s: string): boolean {
  const t = s.toLowerCase();
  return t.includes("## 任务") && (t.includes("## 输出要求") || t.includes("## 输出"));
}

function buildSystemPrompt(args: { bookTitle?: string; bookChunks?: string[] }) {
  const lines: string[] = [
    "你是专业的网文创作顾问，擅长把用户的自然语言需求转化为可复用的写作提示词模板（Prompt Template）。",
    "当用户明确要求「生成/整理为提示词模板」时，你必须输出结构化 Markdown 模板，格式严格如下：",
    "",
    "## 任务",
    "<一段话描述 AI 要完成的写作任务>",
    "",
    "## 输入（变量）",
    "- 参考书目：{{ref_title}}",
    "- 作品标题：{{work_title}}",
    "- 章节标题：{{chapter_title}}",
    "- 章节正文（节选）：{{chapter_content}}",
    "- 额外要求（可选）：{{user_hint}}",
    "",
    "## 输出要求",
    "<以条目列出具体要求>",
    "",
    "不要输出开场白。不要解释你在做什么。除了模板外不要输出其他内容。",
  ];

  const title = (args.bookTitle ?? "").trim();
  const combined = (args.bookChunks ?? []).join("\n\n").trim();
  if (title || combined) {
    lines.push("", "—— 以下为藏经参考上下文（可用来提炼风格/结构，但不要照抄原文）——");
    if (title) lines.push(`参考书目：《${title}》`);
    if (combined) {
      const MAX = 12_000;
      const excerpt = combined.length > MAX ? combined.slice(0, MAX) + "\n\n…（节选已截断）" : combined;
      lines.push("", "参考原文节选：", excerpt);
    }
  }
  return lines.join("\n");
}

// ── 组件 ──────────────────────────────────────────────────────────────────────

export function ReferenceAiChatDialog(props: {
  open: boolean;
  onClose: () => void;
  bookTitle?: string;
  bookChunks?: string[];
  refWorkId?: string | null;
}) {
  const { open, onClose, bookTitle, bookChunks, refWorkId } = props;

  const [, setSettings] = useState<AiSettings>(() => loadAiSettings());
  const [selectedModelId, setSelectedModelId] = useState(() => aiProviderToModelId(loadAiSettings().provider));
  const [showModelSelector, setShowModelSelector] = useState(false);

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedState>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [libraryItems, setLibraryItems] = useState<Array<{ id: string; title: string }>>([]);
  const [selectedRefWorkId, setSelectedRefWorkId] = useState<string>(() => (refWorkId ?? "").trim());
  const [selectedBookTitle, setSelectedBookTitle] = useState<string>(() => (bookTitle ?? "").trim());
  const [selectedBookChunks, setSelectedBookChunks] = useState<string[]>(() => bookChunks ?? []);

  // 打开时重置输入、同步外部传入书目
  useEffect(() => {
    if (!open) return;
    setSettings(loadAiSettings());
    setSelectedRefWorkId((refWorkId ?? "").trim());
    setSelectedBookTitle((bookTitle ?? "").trim());
    setSelectedBookChunks(bookChunks ?? []);
  }, [open, refWorkId, bookTitle, bookChunks]);

  // 加载书目列表
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const list = await listReferenceLibrary();
        if (!cancelled) setLibraryItems(list.map((x) => ({ id: x.id, title: x.title })));
      } catch {
        if (!cancelled) setLibraryItems([]);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  // 切书时自动加载 chunks
  useEffect(() => {
    if (!open) return;
    const id = selectedRefWorkId.trim();
    if (!id) return;
    let cancelled = false;
    void (async () => {
      try {
        const db = getDB();
        const chunks = await db.referenceChunks.where("refWorkId").equals(id).sortBy("ordinal");
        const head = chunks.slice(0, 4).map((c) => c.content);
        const title = libraryItems.find((x) => x.id === id)?.title ?? selectedBookTitle;
        if (!cancelled) {
          setSelectedBookTitle((title ?? "").trim());
          setSelectedBookChunks(head);
        }
      } catch {
        if (!cancelled) setSelectedBookChunks([]);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedRefWorkId, libraryItems]);

  // 自动滚到底
  useEffect(() => {
    if (!open) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [open, messages.length, busy]);

  const provider = useMemo(() => aiModelIdToProvider(selectedModelId), [selectedModelId]);
  const selectedAiModel = useMemo(
    () => AI_MODELS.find((m) => m.id === selectedModelId) ?? AI_MODELS[0],
    [selectedModelId],
  );
  const injectingBookContent = Boolean(selectedBookChunks.join("").trim());
  const systemPrompt = useMemo(
    () => buildSystemPrompt({ bookTitle: selectedBookTitle, bookChunks: selectedBookChunks }),
    [selectedBookTitle, selectedBookChunks],
  );

  const handleSelectAiModel = (modelId: string) => {
    setSelectedModelId(modelId);
    const nextProvider = aiModelIdToProvider(modelId);
    setSettings((prev) => {
      const next = { ...prev, provider: nextProvider };
      saveAiSettings(next);
      return next;
    });
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);

    const userMsg: ChatMsg = { id: makeId(), role: "user", content: text, ts: Date.now() };
    const assistantId = makeId();
    const assistantMsg: ChatMsg = { id: assistantId, role: "assistant", content: "", ts: Date.now() };

    setInput("");
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setBusy(true);

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const latest = loadAiSettings();
      assertCanChat({ settings: latest, provider, injectingBookContent });
      const cfg = getProviderConfig(latest, provider);

      const apiMsgs: AiChatMessage[] = [
        { role: "system", content: systemPrompt },
        ...[...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
      ];

      let buf = "";
      await generateWithProviderStream({
        provider,
        config: cfg,
        messages: apiMsgs,
        signal: abortRef.current.signal,
        onDelta: (delta) => {
          buf += delta;
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: buf } : m)),
          );
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || "生成失败");
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, content: m.content || "（生成失败）" } : m)),
      );
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const saveTemplate = async (msg: ChatMsg, status: "draft" | "submitted") => {
    if (!hasPromptTemplateShape(msg.content)) return;
    setSavingId(msg.id);
    setError(null);
    try {
      const title = selectedBookTitle?.trim()
        ? `【藏经·${selectedBookTitle.trim()}】提炼模板`
        : "【藏经】提炼模板";
      const tags = selectedBookTitle?.trim() ? ["藏经", selectedBookTitle.trim()] : ["藏经"];
      const payload: Omit<GlobalPromptTemplate, "id" | "sortOrder" | "createdAt" | "updatedAt"> = {
        title,
        type: "style" as PromptType,
        tags,
        body: msg.content.trim(),
        status,
        slots: undefined,
        source_kind: "reference_chat",
        source_ref_work_id: selectedRefWorkId.trim() ? selectedRefWorkId.trim() : (refWorkId ?? null),
        source_excerpt_ids: null,
        source_note: "chat",
        reviewNote: "",
        userId: undefined,
      };
      await addGlobalPromptTemplate(payload);
      setSaved((prev) => ({ ...prev, [msg.id]: status }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败，请重试");
    } finally {
      setSavingId(null);
    }
  };

  const handleClose = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setError(null);
    setSavingId(null);
    setShowModelSelector(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="flex h-[min(92dvh,820px)] w-full max-w-2xl flex-col gap-0 overflow-hidden p-0">

        {/* ── 顶栏 ── */}
        <div className="shrink-0 border-b border-border/40 bg-card/80 px-4 pb-2.5 pt-4">
          {/* 第一行：标题 + 关闭 */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <LiubaiLogo className="h-4 w-4 text-foreground" />
              <span className="text-sm font-semibold text-foreground">
                藏经 AI
                {selectedBookTitle?.trim() ? (
                  <span className="ml-1 font-normal text-muted-foreground">· 《{selectedBookTitle.trim()}》</span>
                ) : null}
              </span>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* 第二行：模型 + 书目选择 */}
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowModelSelector(true)}
              className="flex h-7 items-center gap-1.5 rounded-full border border-border/60 bg-background px-2.5 text-xs text-foreground transition-colors hover:border-primary/50 hover:bg-muted/60"
            >
              <LiubaiLogo className="h-3 w-3 text-foreground" />
              <span className="font-medium">{selectedAiModel.name}</span>
              <span className="text-muted-foreground">{selectedAiModel.provider}</span>
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </button>

            <select
              className="h-7 max-w-[200px] rounded-full border border-border/60 bg-background px-2.5 text-xs text-foreground transition-colors hover:border-primary/50"
              value={selectedRefWorkId}
              onChange={(e) => setSelectedRefWorkId(e.target.value)}
              title="选择参考书（注入原文节选）"
            >
              <option value="">不选书（纯对话）</option>
              {libraryItems.map((it) => (
                <option key={it.id} value={it.id}>{it.title}</option>
              ))}
            </select>

            {injectingBookContent && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                已注入原文
              </span>
            )}
          </div>
        </div>

        {/* ── 消息区 ── */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="flex flex-col gap-3">
            {messages.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/50 bg-muted/20 p-4">
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  可以这样问 AI
                </p>
                <ul className="space-y-1 text-[11px] leading-relaxed text-muted-foreground">
                  <li>· 帮我从这本书提炼一个续写模板，节奏紧凑、镜头感强。</li>
                  <li>· 我想要一个推演情节转折的模板，输出必须包含冲突升级与信息增量。</li>
                  <li>· 把下面这段描述整理成标准的提示词模板格式。</li>
                </ul>
              </div>
            ) : null}

            {messages.map((m) => {
              const isUser = m.role === "user";
              const canSave = !isUser && hasPromptTemplateShape(m.content) && !busy;
              const savedStatus = saved[m.id];
              return (
                <div key={m.id} className={cn("flex w-full gap-2", isUser ? "justify-end" : "justify-start")}>
                  {!isUser && (
                    <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border/40 bg-card shadow-sm">
                      <LiubaiLogo className="h-3.5 w-3.5 text-foreground" />
                    </div>
                  )}
                  <div
                    className={cn(
                      "max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm",
                      isUser
                        ? "rounded-br-sm bg-primary text-primary-foreground"
                        : "rounded-bl-sm border border-border/50 bg-card text-foreground",
                    )}
                  >
                    <div className="whitespace-pre-wrap break-words">
                      {m.content || (m.role === "assistant" && busy ? (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:0ms]" />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:150ms]" />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:300ms]" />
                        </span>
                      ) : "")}
                    </div>

                    {canSave && (
                      <div className="mt-2.5 flex items-center gap-1.5 border-t border-border/30 pt-2">
                        {savedStatus ? (
                          <span className="flex items-center gap-1 text-[11px] text-green-600 dark:text-green-400">
                            <Check className="h-3 w-3" />
                            {savedStatus === "submitted" ? "已提交审核" : "已保存为草稿"}
                          </span>
                        ) : (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-6 gap-1 px-2 text-[11px]"
                              disabled={savingId === m.id}
                              onClick={() => void saveTemplate(m, "draft")}
                            >
                              {savingId === m.id
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : "存为草稿"}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              className="h-6 gap-1 px-2 text-[11px]"
                              disabled={savingId === m.id}
                              onClick={() => void saveTemplate(m, "submitted")}
                              title="提交后进入审核队列，管理员批准后全局可用"
                            >
                              {savingId === m.id
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : "提交审核"}
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* ── 输入区 ── */}
        <div className="shrink-0 border-t border-border/40 bg-card/50 px-4 py-3">
          {error ? (
            <div className="mb-2 flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <span className="flex-1">{error}</span>
              <button type="button" onClick={() => setError(null)} className="mt-0.5 shrink-0 opacity-60 hover:opacity-100">
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : null}

          <div className="flex items-end gap-2">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="输入需求… Enter 发送，Shift+Enter 换行"
              className="min-h-[42px] max-h-[180px] flex-1 resize-none overflow-y-auto rounded-xl border-border/60 bg-background text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary/50"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              disabled={busy}
              rows={1}
            />
            {busy ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-xl"
                onClick={() => abortRef.current?.abort()}
                title="停止生成"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </Button>
            ) : (
              <Button
                type="button"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-xl"
                onClick={() => void send()}
                disabled={!input.trim()}
                title="发送"
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* 模型选择弹窗 */}
        <AIModelSelector
          open={showModelSelector}
          onOpenChange={setShowModelSelector}
          selectedModelId={selectedModelId}
          onSelectModel={handleSelectAiModel}
          title="选择模型"
        />
      </DialogContent>
    </Dialog>
  );
}
