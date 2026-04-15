import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Send, Sparkles } from "lucide-react";
import { cn } from "../lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { ScrollArea } from "./ui/scroll-area";
import { AIModelSelector, AI_MODELS } from "./ai-model-selector";
import { aiModelIdToProvider, aiProviderToModelId } from "../util/ai-ui-model-map";
import { generateWithProviderStream } from "../ai/client";
import { getProviderConfig, loadAiSettings, saveAiSettings } from "../ai/storage";
import type { AiChatMessage, AiProviderId, AiSettings } from "../ai/types";
import { isLocalAiProvider } from "../ai/local-provider";
import { addGlobalPromptTemplate, listReferenceLibrary } from "../db/repo";
import type { GlobalPromptTemplate, PromptType } from "../db/types";
import { getDB } from "../db/database";

type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  ts: number;
};

function makeId() {
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isCloudProvider(p: AiProviderId) {
  return !isLocalAiProvider(p);
}

function assertCanChat(args: { settings: AiSettings; injectingBookContent: boolean }) {
  if (!isCloudProvider(args.settings.provider)) return;
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
  const lines: string[] = [];
  lines.push(
    "你是专业的网文创作顾问，擅长把用户的自然语言需求转化为可复用的写作提示词模板（Prompt Template）。",
    "当用户明确要求“生成/整理为提示词模板”时，你必须输出结构化 Markdown 模板，格式严格如下：",
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
  );

  const title = (args.bookTitle ?? "").trim();
  const chunks = args.bookChunks ?? [];
  const combined = chunks.join("\n\n").trim();
  if (title || combined) {
    lines.push("", "—— 以下为藏经参考上下文（可用来提炼风格/结构，但不要照抄原文）——");
  }
  if (title) lines.push(`参考书目：《${title}》`);
  if (combined) {
    const MAX = 12_000;
    const excerpt = combined.length > MAX ? combined.slice(0, MAX) + "\n\n…（节选已截断）" : combined;
    lines.push("", "参考原文节选：", excerpt);
  }
  return lines.join("\n");
}

export function ReferenceAiChatDialog(props: {
  open: boolean;
  onClose: () => void;
  bookTitle?: string;
  bookChunks?: string[];
  refWorkId?: string | null;
}) {
  const { open, onClose, bookTitle, bookChunks, refWorkId } = props;
  const [settings, setSettings] = useState<AiSettings>(() => loadAiSettings());
  const [selectedModelId, setSelectedModelId] = useState(() => aiProviderToModelId(settings.provider));
  const [showModelSelector, setShowModelSelector] = useState(false);

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const [libraryItems, setLibraryItems] = useState<Array<{ id: string; title: string }>>([]);
  const [selectedRefWorkId, setSelectedRefWorkId] = useState<string>(() => (refWorkId ?? "").trim());
  const [selectedBookTitle, setSelectedBookTitle] = useState<string>(() => (bookTitle ?? "").trim());
  const [selectedBookChunks, setSelectedBookChunks] = useState<string[]>(() => bookChunks ?? []);

  useEffect(() => {
    if (!open) return;
    setSettings(loadAiSettings());
  }, [open]);

  // 打开时同步外部传入的“当前打开书”
  useEffect(() => {
    if (!open) return;
    setSelectedRefWorkId((refWorkId ?? "").trim());
    setSelectedBookTitle((bookTitle ?? "").trim());
    setSelectedBookChunks(bookChunks ?? []);
  }, [open, refWorkId, bookTitle, bookChunks]);

  // 加载藏经书目列表（用于弹窗内选择）
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const list = await listReferenceLibrary();
        if (cancelled) return;
        setLibraryItems(list.map((x) => ({ id: x.id, title: x.title })));
      } catch {
        if (!cancelled) setLibraryItems([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // 当弹窗内切换书目时，加载前 N 段 chunks 并刷新 system 注入
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
        if (!cancelled) {
          setSelectedBookChunks([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, selectedRefWorkId, libraryItems, selectedBookTitle]);

  useEffect(() => {
    if (!open) return;
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [open, messages.length, busy]);

  const provider = useMemo(() => aiModelIdToProvider(selectedModelId), [selectedModelId]);
  const selectedAiModel = useMemo(() => AI_MODELS.find((m) => m.id === selectedModelId) ?? AI_MODELS[0], [selectedModelId]);

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

  function toApiMessages(list: ChatMsg[]): AiChatMessage[] {
    return list.map((m) => ({ role: m.role, content: m.content }));
  }

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
      assertCanChat({ settings: latest, injectingBookContent });
      const cfg = getProviderConfig(latest, latest.provider);

      const apiMsgs: AiChatMessage[] = [
        { role: "system", content: systemPrompt },
        ...toApiMessages([...messages, userMsg]),
      ];

      let buf = "";
      await generateWithProviderStream({
        provider: latest.provider,
        config: cfg,
        messages: apiMsgs,
        signal: abortRef.current.signal,
        onDelta: (delta) => {
          buf += delta;
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: buf } : m)));
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
      const title = selectedBookTitle?.trim() ? `【藏经·${selectedBookTitle.trim()}】自由提炼` : "【藏经】自由提炼";
      const tags = selectedBookTitle?.trim() ? ["藏经", selectedBookTitle.trim()] : ["藏经"];
      const input: Omit<GlobalPromptTemplate, "id" | "sortOrder" | "createdAt" | "updatedAt"> = {
        title,
        type: "style" as PromptType,
        tags,
        body: msg.content.trim(),
        status,
        slots: undefined,
        source_kind: "reference_chat",
        source_ref_work_id: selectedRefWorkId.trim() ? selectedRefWorkId.trim() : (refWorkId ?? null),
        source_excerpt_ids: null,
        source_note: status === "submitted" ? "chat:submitted" : "chat:draft",
        reviewNote: "",
        userId: undefined,
      };
      await addGlobalPromptTemplate(input);
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
      <DialogContent className="h-[min(90dvh,820px)] w-full max-w-3xl overflow-hidden p-0">
        <DialogHeader className="border-b border-border/40 px-4 py-3">
          <DialogTitle className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-2"
                onClick={() => setShowModelSelector(true)}
                title="选择模型"
              >
                <span className="min-w-0 truncate text-xs font-medium">{selectedAiModel.name}</span>
                <span className="text-[11px] text-muted-foreground">· {provider}</span>
              </Button>
              <div className="flex items-center gap-2">
                <select
                  className="h-8 max-w-[220px] rounded-md border border-border/60 bg-background px-2 text-xs text-foreground shadow-sm"
                  value={selectedRefWorkId}
                  onChange={(e) => setSelectedRefWorkId(e.target.value)}
                  title="选择藏经书目（用于注入原文节选）"
                >
                  <option value="">不选书（仅按描述）</option>
                  {libraryItems.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.title}
                    </option>
                  ))}
                </select>
              </div>
              <span className="min-w-0 truncate text-sm font-medium text-foreground">
                藏经 AI{selectedBookTitle?.trim() ? ` · 《${selectedBookTitle.trim()}》` : ""}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {busy ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => abortRef.current?.abort()}
                  className="h-8"
                >
                  停止
                </Button>
              ) : null}
            </div>
          </DialogTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {selectedBookTitle?.trim()
              ? "已注入书名与原文节选；你可以让 AI 生成模板，再手动微调。"
              : "可先选择一本藏经书注入原文节选；也可以直接描述你想要的提示词风格。"}
          </p>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          <ScrollArea className="min-h-0 flex-1 px-4 py-3">
            <div className="flex flex-col gap-3">
              {messages.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/60 bg-card/30 p-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2 text-foreground">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="font-medium">你可以这样问</span>
                  </div>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                    <li>“帮我从这本书提炼一个续写提示词模板，要求节奏紧凑、镜头感强。”</li>
                    <li>“我想要一个用于推演情节转折的模板，输出必须包含冲突升级与信息增量。”</li>
                    <li>“把我下面这段描述整理成符合你们标准的提示词模板格式。”</li>
                  </ul>
                </div>
              ) : null}

              {messages.map((m) => {
                const isUser = m.role === "user";
                const canSave = !isUser && hasPromptTemplateShape(m.content) && !busy;
                return (
                  <div
                    key={m.id}
                    className={cn(
                      "flex w-full",
                      isUser ? "justify-end" : "justify-start",
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl border px-3 py-2 text-sm shadow-sm",
                        isUser
                          ? "border-primary/20 bg-primary/10 text-foreground"
                          : "border-border/50 bg-card/60 text-foreground",
                      )}
                    >
                      <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                        {m.content || (m.role === "assistant" && busy ? "…" : "")}
                      </div>
                      {canSave && (
                        <div className="mt-2 flex items-center justify-end">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1.5 text-xs"
                            disabled={savingId === m.id}
                            onClick={() => void saveTemplate(m, "draft")}
                          >
                            {savingId === m.id ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                保存中…
                              </>
                            ) : (
                              <>
                                <Check className="h-3.5 w-3.5" />
                                保存到提示词库（草稿）
                              </>
                            )}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="ml-2 h-7 gap-1.5 text-xs"
                            disabled={savingId === m.id}
                            onClick={() => void saveTemplate(m, "submitted")}
                            title="提交后将出现在提示词库的审核队列中（管理员可见）"
                          >
                            {savingId === m.id ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                提交中…
                              </>
                            ) : (
                              <>
                                <Check className="h-3.5 w-3.5" />
                                提交审核
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>

          <div className="shrink-0 border-t border-border/40 bg-card/20 px-4 py-3">
            {error ? (
              <div className="mb-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            ) : null}

            <div className="flex items-end gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="输入你的需求…（Enter 发送，Shift+Enter 换行）"
                className="min-h-[44px] max-h-[22dvh] resize-none overflow-y-auto"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                disabled={busy}
              />
              <Button type="button" className="h-9 gap-2" onClick={() => void send()} disabled={!input.trim() || busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                发送
              </Button>
            </div>
          </div>
        </div>

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

