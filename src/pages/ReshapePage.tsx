import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Play, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { approxRoughTokenCount } from "../ai/approx-tokens";
import { generateWithProviderStream, isFirstAiGateCancelledError } from "../ai/client";
import { isLocalAiProvider } from "../ai/local-provider";
import { getProviderConfig, loadAiSettings, type AiSettings } from "../ai/storage";
import type { AiChatMessage, AiProviderId } from "../ai/types";
import { getWork, listChapters, resolveWorkIdFromRouteParam } from "../db/repo";
import type { Chapter, GlobalPromptTemplate, Work } from "../db/types";
import { PROMPT_SCOPE_SLOTS } from "../db/types";
import { cn } from "../lib/utils";
import { aiModelIdToProvider, aiProviderToModelId } from "../util/ai-ui-model-map";
import {
  loadReshapeHistory,
  saveReshapeHistory,
  type ReshapeHistoryItem,
} from "../util/reshape-history-storage";
import { listReshapePromptHotlist } from "../util/reshape-prompt-hotlist";
import { RESHAPE_WENCE_QUICK } from "../util/wence-chat-templates";
import { AI_MODELS } from "../components/ai-model-selector";
import { UnifiedAIModelSelector as AIModelSelector } from "../components/ai-model-selector-unified";
import { ReshapePromptBrowseModal } from "../components/reshape/ReshapePromptBrowseModal";
import { GlobalPromptQuickDialog } from "../components/prompt-quick/GlobalPromptQuickDialog";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { useRightRail } from "../components/RightRailContext";
import { useResolvedWorkFromRoute } from "../hooks/useResolvedWorkFromRoute";
import { workPathSegment } from "../util/work-url";

const WRITER_SLOTS = PROMPT_SCOPE_SLOTS.writer;

function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (err && typeof err === "object" && "name" in err && (err as { name: string }).name === "AbortError") return true;
  return false;
}

export function ReshapePage() {
  const { resolvedWorkId, phase } = useResolvedWorkFromRoute();
  const workId = phase === "ok" && resolvedWorkId ? resolvedWorkId : null;
  const navigate = useNavigate();
  const rightRail = useRightRail();
  const [work, setWork] = useState<Work | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [outputText, setOutputText] = useState("");
  const [running, setRunning] = useState(false);
  const [extraNote, setExtraNote] = useState("");
  const [tab, setTab] = useState<"split" | "history" | "wence">("split");
  const [mode, setMode] = useState<"chapter" | "book">("chapter");

  const [history, setHistory] = useState<ReshapeHistoryItem[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const historySaveTimer = useRef<number | null>(null);
  const outputScrollRef = useRef<HTMLDivElement | null>(null);
  /** 分章 / 全书重塑：用户点击「重塑终止」时 abort 当前流式请求 */
  const reshapeAbortRef = useRef<AbortController | null>(null);
  /** AI 问策对话的可中断请求 */
  const wenceAbortRef = useRef<AbortController | null>(null);
  /** 本次任务累计 tokens：API 返回则精确，否则按字数粗估 */
  const [consumeReport, setConsumeReport] = useState<{ total: number; allFromApi: boolean } | null>(null);
  const [wenceMessages, setWenceMessages] = useState<Array<{ id: string; role: "user" | "assistant"; content: string }>>([]);
  const [wenceInput, setWenceInput] = useState("");
  const [wenceRunning, setWenceRunning] = useState(false);
  const [wenceLinkHistoryIds, setWenceLinkHistoryIds] = useState<Set<string>>(new Set());

  const [hotList, setHotList] = useState<GlobalPromptTemplate[]>([]);
  const [selectedHotId, setSelectedHotId] = useState<string | null>(null);
  const [pickerTemplate, setPickerTemplate] = useState<GlobalPromptTemplate | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);

  const [selectedModelId, setSelectedModelId] = useState<string>(() => aiProviderToModelId(loadAiSettings().provider));
  /** 问策独立模型，可与重塑不同 */
  const [wenceSelectedModelId, setWenceSelectedModelId] = useState<string>(() => aiProviderToModelId(loadAiSettings().provider));
  const [modelPicker, setModelPicker] = useState<"reshape" | "wence" | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  const sortedChapters = useMemo(() => [...chapters].sort((a, b) => a.order - b.order), [chapters]);
  const activeTemplate = useMemo(() => {
    if (pickerTemplate) return pickerTemplate;
    return hotList.find((h) => h.id === selectedHotId) ?? null;
  }, [hotList, pickerTemplate, selectedHotId]);
  const providerId = useMemo<AiProviderId>(() => aiModelIdToProvider(selectedModelId), [selectedModelId]);
  const wenceProviderId = useMemo<AiProviderId>(() => aiModelIdToProvider(wenceSelectedModelId), [wenceSelectedModelId]);
  const currentModel = useMemo(() => AI_MODELS.find((m) => m.id === selectedModelId) ?? AI_MODELS[0], [selectedModelId]);
  const wenceCurrentModel = useMemo(
    () => AI_MODELS.find((m) => m.id === wenceSelectedModelId) ?? AI_MODELS[0],
    [wenceSelectedModelId],
  );
  const activeHistory = history.find((h) => h.id === selectedHistoryId) ?? null;

  const outputPanelHint = useMemo(() => {
    if (tab === "wence") {
      return wenceRunning ? "AI 问策对话中，回复实时生成…" : "AI 问策：可基于时光机记录多轮讨论写作与拆章思路";
    }
    if (running) {
      return mode === "book" ? "全书重塑生成中，结果逐字显示如下…" : "分章重塑生成中，结果逐字显示如下…";
    }
    if (tab === "history" && activeHistory) {
      return `时光机记录 · ${new Date(activeHistory.createdAt).toLocaleString("zh-CN")}`;
    }
    return "请选择章节后再提交进行重塑";
  }, [running, mode, tab, activeHistory, wenceRunning]);

  useEffect(() => {
    if (!running) return;
    const el = outputScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [outputText, running]);

  useEffect(() => {
    if (tab !== "wence") return;
    const el = outputScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [wenceMessages, wenceRunning, tab]);

  useEffect(() => {
    return () => {
      reshapeAbortRef.current?.abort();
      wenceAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    rightRail.setOpen(false);
    // 重塑独立页使用整屏，不保留编辑页右栏
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase === "notfound") {
      setLoading(false);
      toast.error("未找到该作品，或书号无效");
      navigate("/library", { replace: true });
      return;
    }
    if (phase === "loading" || !workId) {
      if (phase === "loading") setLoading(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const [w, ch, hs, hot] = await Promise.all([
          getWork(workId),
          listChapters(workId),
          loadReshapeHistory(workId),
          listReshapePromptHotlist(6),
        ]);
        if (cancelled) return;
        setWork(w ?? null);
        setChapters(ch);
        setHistory(hs);
        if (hot[0]) setSelectedHotId(hot[0].id);
        setHotList(hot);
        // 默认不预选章节，避免误触发重塑范围
        setSelectedIds(new Set());
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "加载重塑页失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workId, phase, navigate]);

  useEffect(() => {
    if (!workId) return;
    if (historySaveTimer.current) window.clearTimeout(historySaveTimer.current);
    historySaveTimer.current = window.setTimeout(() => {
      void saveReshapeHistory(workId, history);
    }, 450);
    return () => {
      if (historySaveTimer.current) window.clearTimeout(historySaveTimer.current);
    };
  }, [history, workId]);

  const toggleId = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /** 连载常用：选末尾 N 章（时间线上「最近」） */
  const selectTailN = useCallback((n: number) => {
    const next = new Set<string>();
    for (const c of sortedChapters.slice(-n)) next.add(c.id);
    setSelectedIds(next);
  }, [sortedChapters]);

  /** 从书开头起选前 N 章 */
  const selectHeadN = useCallback((n: number) => {
    const next = new Set<string>();
    for (const c of sortedChapters.slice(0, n)) next.add(c.id);
    setSelectedIds(next);
  }, [sortedChapters]);

  const stopReshape = useCallback(() => {
    reshapeAbortRef.current?.abort();
  }, []);

  const stopWence = useCallback(() => {
    wenceAbortRef.current?.abort();
  }, []);

  const toggleWenceLinkHistory = useCallback((id: string) => {
    setWenceLinkHistoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const addSelectedHistoryToWenceLinks = useCallback(() => {
    if (!selectedHistoryId) {
      toast.info("请先在「时光机」中选中一条记录，或点列表项后再试。");
      return;
    }
    setWenceLinkHistoryIds((prev) => new Set(prev).add(selectedHistoryId));
  }, [selectedHistoryId]);

  async function runWence() {
    const ask = wenceInput.trim();
    if (!ask) {
      toast.info("请先输入问策问题。");
      return;
    }
    const sBase = loadAiSettings();
    const merged: AiSettings = { ...sBase, provider: wenceProviderId };
    if (!isLocalAiProvider(merged.provider)) {
      if (!merged.privacy.consentAccepted || !merged.privacy.allowCloudProviders) {
        toast.error("请先在设置中开启云端模型。");
        return;
      }
      if (!merged.privacy.allowChapterContent) {
        toast.error("请先在隐私设置中开启「允许正文上云」。");
        return;
      }
    }
    const config = getProviderConfig(merged, merged.provider);
    const linkedRows = history.filter((h) => wenceLinkHistoryIds.has(h.id));
    const linkedContext = linkedRows
      .slice(0, 3)
      .map((h, idx) => {
        const body = h.output.length > 1600 ? `${h.output.slice(0, 1600)}\n...(已截断)` : h.output;
        return `【关联时光机${idx + 1}】${h.mode === "book" ? "全书重塑" : "分章重塑"} · ${h.chapterCount}章 · ${h.promptTitle}\n${body}`;
      })
      .join("\n\n---\n\n");

    const userMessageId = `wence-user-${Date.now()}`;
    const assistantMessageId = `wence-assistant-${Date.now()}`;
    setWenceMessages((prev) => [...prev, { id: userMessageId, role: "user", content: ask }, { id: assistantMessageId, role: "assistant", content: "" }]);
    setWenceInput("");

    wenceAbortRef.current?.abort();
    wenceAbortRef.current = new AbortController();
    const signal = wenceAbortRef.current.signal;
    setWenceRunning(true);

    const messages: AiChatMessage[] = [
      {
        role: "system",
        content:
          "你是留白写作的 AI 问策助手。请基于用户问题给出可执行的写作建议，风格简洁、分点、避免空话，不要输出思维链。",
      },
      {
        role: "user",
        content: linkedContext
          ? `用户问题：\n${ask}\n\n以下是用户勾选的时光机重塑记录（仅供参考）：\n${linkedContext}`
          : `用户问题：\n${ask}`,
      },
    ];

    let answer = "";
    try {
      await generateWithProviderStream({
        provider: merged.provider,
        config,
        messages,
        signal,
        usageLog: { task: "重塑·问策", workId },
        onDelta: (delta) => {
          answer += delta;
          setWenceMessages((prev) => prev.map((m) => (m.id === assistantMessageId ? { ...m, content: answer } : m)));
        },
      });
    } catch (err) {
      if (isFirstAiGateCancelledError(err) || isAbortError(err)) {
        if (isAbortError(err) && answer.trim()) {
          setWenceMessages((prev) =>
            prev.map((m) => (m.id === assistantMessageId ? { ...m, content: `${answer}\n\n（已终止）` } : m)),
          );
        }
        return;
      }
      const msg = err instanceof Error ? err.message : "问策请求失败";
      setWenceMessages((prev) =>
        prev.map((m) => (m.id === assistantMessageId ? { ...m, content: `请求失败：${msg}` } : m)),
      );
      toast.error(msg);
    } finally {
      wenceAbortRef.current = null;
      setWenceRunning(false);
    }
  }

  async function runSplit(runMode: "chapter" | "book") {
    if (!activeTemplate?.body?.trim()) {
      toast.error("请先选择重塑提示词。");
      return;
    }
    const selected = sortedChapters.filter((c) => selectedIds.has(c.id) && (c.content ?? "").trim());
    if (selected.length === 0) {
      toast.error("请先选择有正文的章节。");
      return;
    }
    const sBase = loadAiSettings();
    const merged: AiSettings = { ...sBase, provider: providerId };
    if (!isLocalAiProvider(merged.provider)) {
      if (!merged.privacy.consentAccepted || !merged.privacy.allowCloudProviders) {
        toast.error("请先在设置中开启云端模型。");
        return;
      }
      if (!merged.privacy.allowChapterContent) {
        toast.error("请先在隐私设置中开启「允许正文上云」。");
        return;
      }
    }

    const config = getProviderConfig(merged, merged.provider);
    reshapeAbortRef.current?.abort();
    reshapeAbortRef.current = null;

    setMode(runMode);
    setRunning(true);
    setTab("split");
    setOutputText("");
    setConsumeReport(null);

    reshapeAbortRef.current = new AbortController();
    const signal = reshapeAbortRef.current.signal;

    let sumTokens = 0;
    let allFromApi = true;
    const recordUsage = (
      r: Awaited<ReturnType<typeof generateWithProviderStream>>,
      systemP: string,
      userP: string,
      assistantText: string,
    ) => {
      if (r.tokenUsage?.source === "api") {
        sumTokens += r.tokenUsage.totalTokens;
      } else {
        allFromApi = false;
        sumTokens += approxRoughTokenCount(`${systemP}

${userP}

${assistantText}`);
      }
      setConsumeReport({ total: sumTokens, allFromApi });
    };

    try {
      const systemPrompt = activeTemplate.body.trim();
      const workTitle = work?.title ?? "未命名作品";
      let finalOutput = "";

      if (runMode === "book") {
        const joined = selected
          .map((ch) => `【第${ch.order}章 ${ch.title}】\n${(ch.content ?? "").slice(0, 2600)}`)
          .join("\n\n---\n\n");
        const userPrompt = `作品：${workTitle}
选择章节：${selected.map((c) => `第${c.order}章`).join("、")}
${extraNote.trim() ? `补充要求：${extraNote.trim()}
` : ""}
请基于以下正文执行重塑分析：
${joined}`;
        const r = await generateWithProviderStream({
          provider: merged.provider,
          config,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          signal,
          usageLog: { task: "重塑·全书分析", workId },
          onDelta: (delta) => {
            finalOutput += delta;
            setOutputText(finalOutput);
          },
        });
        recordUsage(r, systemPrompt, userPrompt, r.text ?? finalOutput);
      } else {
        for (const ch of selected) {
          if (signal.aborted) break;
          const userPrompt = `作品：${workTitle}
章节：第${ch.order}章 ${ch.title}
${extraNote.trim() ? `补充要求：${extraNote.trim()}
` : ""}
正文：
${(ch.content ?? "").slice(0, 3200)}`;
          const sectionHeader = `# 第${ch.order}章 ${ch.title}

`;
          let chunk = "";
          const r = await generateWithProviderStream({
            provider: merged.provider,
            config,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            signal,
            usageLog: { task: "重塑·按章", workId },
            onDelta: (delta) => {
              chunk += delta;
              setOutputText(finalOutput + sectionHeader + chunk);
            },
          });
          recordUsage(r, systemPrompt, userPrompt, chunk.trim());
          if (signal.aborted) {
            finalOutput += `${sectionHeader}${chunk.trim()}

`;
            setOutputText(finalOutput);
            break;
          }
          finalOutput += `${sectionHeader}${chunk.trim()}

`;
          setOutputText(finalOutput);
        }
      }

      if (signal.aborted) {
        toast.message("已终止重塑", { description: "已保留当前已生成的正文。" });
        return;
      }

      const item: ReshapeHistoryItem = {
        id: `reshape-${Date.now()}`,
        createdAt: Date.now(),
        mode: runMode,
        chapterCount: selected.length,
        promptTitle: activeTemplate.title,
        output: finalOutput.trim(),
      };
      setHistory((prev) => [item, ...prev].slice(0, 50));
      setSelectedHistoryId(item.id);
      setTab("history");
      toast.success("重塑完成。");
    } catch (err) {
      if (isFirstAiGateCancelledError(err)) return;
      if (isAbortError(err)) {
        toast.message("已终止重塑", { description: "已保留当前已生成的正文。" });
        return;
      }
      toast.error(err instanceof Error ? err.message : "重塑失败");
    } finally {
      reshapeAbortRef.current = null;
      setRunning(false);
    }
  }

  const backToEditor = useCallback(() => {
    if (work) void navigate(`/work/${workPathSegment(work)}`, { replace: false });
    else if (workId) {
      void (async () => {
        const internal = (await resolveWorkIdFromRouteParam(workId)) ?? workId;
        const w = await getWork(internal);
        const seg = w ? workPathSegment(w) : workId;
        void navigate(`/work/${seg}`, { replace: false });
      })();
    } else void navigate("/library");
  }, [navigate, workId, work]);

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/40 px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Button size="sm" className="h-7 text-xs" variant={tab === "split" ? "default" : "outline"} onClick={() => setTab("split")}>
            重塑
          </Button>
          <Button size="sm" className="h-7 text-xs" variant={tab === "history" ? "default" : "outline"} onClick={() => setTab("history")}>
            时光机
          </Button>
          <Button size="sm" className="h-7 text-xs" variant={tab === "wence" ? "default" : "outline"} onClick={() => setTab("wence")}>
            AI 问策
          </Button>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" onClick={() => setGuideOpen(true)}>
            新手指引
          </button>
          <Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label="关闭重塑页" title="返回写作" onClick={backToEditor}>
            <X className="size-5" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="min-h-0 flex-1 p-4 text-sm text-muted-foreground">加载重塑页…</div>
      ) : (
      <div className="grid min-h-0 flex-1 grid-cols-[320px_1fr] gap-3 overflow-hidden p-3 pt-2">
        <aside className="flex min-h-0 flex-col overflow-hidden rounded-md border border-border/50 bg-card/30">
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {tab === "split" ? (
            <>
              <div className="mb-2 flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" className="h-7 text-xs" title="选列表末尾 5 章，适合连载最近更新" onClick={() => selectTailN(5)}>
                  最近5章
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" title="选列表末尾 10 章" onClick={() => selectTailN(10)}>
                  最近10章
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" title="从第 0 章起选开头 10 章" onClick={() => selectHeadN(10)}>
                  开篇10章
                </Button>
                <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => setSelectedIds(new Set())}>重置</Button>
              </div>
              <div className="mb-3 max-h-[38dvh] overflow-auto rounded-md border border-border/50 p-1.5">
                <ul className="space-y-1">
                  {sortedChapters.map((ch) => {
                    const checked = selectedIds.has(ch.id);
                    return (
                      <li key={ch.id}>
                        <label className={cn("flex cursor-pointer items-start gap-2 rounded-md border px-2 py-1.5 text-xs", checked ? "border-primary/60 bg-primary/5" : "border-border/40")}>
                          <input type="checkbox" checked={checked} onChange={() => toggleId(ch.id)} />
                          <span className="min-w-0">
                            <span className="font-medium">第{ch.order}章</span>
                            <span className="ml-1 line-clamp-1">{ch.title || "无标题"}</span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">重塑要求（关联提示词）</span>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" className={cn("h-7 gap-1 px-2 text-xs", activeTemplate ? "border-primary/60 bg-primary/5 text-primary" : "")} onClick={() => setQuickOpen(true)}>
                    <span className="max-w-[10rem] truncate">{activeTemplate ? activeTemplate.title : "快速选"}</span>
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPickerTemplate(null)}>自定义</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setBrowseOpen(true)}>更多</Button>
                </div>
              </div>
              <label className="mt-3 block space-y-1">
                <span className="text-xs text-muted-foreground">补充信息（可选）</span>
                <textarea
                  rows={4}
                  value={extraNote}
                  onChange={(e) => setExtraNote(e.target.value)}
                  className="w-full resize-y rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm"
                  placeholder="添加任何有助于重塑的补充信息…"
                />
              </label>
              <div className="mt-3 space-y-1">
                <span className="text-xs text-muted-foreground">AI模型</span>
                <button type="button" onClick={() => setModelPicker("reshape")} className="flex w-full items-center gap-2 rounded-md border border-border/60 bg-background px-2.5 py-2 text-left text-sm">
                  <span>{currentModel.icon}</span>
                  <span className="flex-1 truncate">{currentModel.name}<span className="ml-1 text-xs text-muted-foreground">{currentModel.subtitle}</span></span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </button>
                <p className="text-xs leading-snug text-muted-foreground">
                  {consumeReport
                    ? `此次重塑消耗tokens：${consumeReport.total.toLocaleString()}/2000${consumeReport.allFromApi ? "" : "（部分估算）"}`
                    : "此次重塑消耗tokens：0/2000"}
                </p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button
                  variant={running && mode === "chapter" ? "destructive" : "outline"}
                  disabled={running && mode === "book"}
                  onClick={() => {
                    if (running && mode === "chapter") {
                      stopReshape();
                      return;
                    }
                    void runSplit("chapter");
                  }}
                >
                  {running && mode === "chapter" ? "重塑终止" : "分章重塑"}
                </Button>
                <Button
                  variant={running && mode === "book" ? "destructive" : "default"}
                  disabled={running && mode === "chapter"}
                  onClick={() => {
                    if (running && mode === "book") {
                      stopReshape();
                      return;
                    }
                    void runSplit("book");
                  }}
                >
                  {running && mode === "book" ? "重塑终止" : (<><Play className="mr-1.5 h-4 w-4" />全书重塑</>)}
                </Button>
              </div>
            </>
          ) : tab === "history" ? (
            <div className="rounded-md border border-border/40 p-2">
              {history.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">暂无时光机记录</p>
              ) : (
                <ul className="space-y-1">
                  {history.map((h) => (
                    <li key={h.id}>
                      <button
                        type="button"
                        className={cn("w-full rounded-md border px-2 py-1.5 text-left text-xs", selectedHistoryId === h.id ? "border-primary/60 bg-primary/5" : "border-border/40")}
                        onClick={() => {
                          setSelectedHistoryId(h.id);
                          setOutputText(h.output);
                        }}
                      >
                        <div className="font-medium">{h.mode === "book" ? "全书重塑" : "分章重塑"} · {h.chapterCount}章</div>
                        <div className="text-muted-foreground line-clamp-1">{h.promptTitle}</div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">问策模型</span>
                <button
                  type="button"
                  onClick={() => setModelPicker("wence")}
                  className="flex w-full items-center gap-2 rounded-md border border-border/60 bg-background px-2.5 py-2 text-left text-sm"
                >
                  <span>{wenceCurrentModel.icon}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {wenceCurrentModel.name}
                    <span className="ml-1 text-xs text-muted-foreground">{wenceCurrentModel.subtitle}</span>
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </div>
              <div className="rounded-md border border-border/40 p-2">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
                  <p className="text-xs text-muted-foreground">关联时光机记录（可多选）</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-6 px-2 text-[10px] leading-tight"
                    onClick={addSelectedHistoryToWenceLinks}
                  >
                    一键加入当前项
                  </Button>
                </div>
                <p className="mb-1 text-[10px] text-muted-foreground/90">在「时光机」点选一条后点此，可快速把该条加入上方勾选。</p>
                <div className="max-h-36 space-y-1 overflow-auto">
                  {history.length === 0 ? (
                    <p className="text-xs text-muted-foreground">暂无时光机记录可关联</p>
                  ) : (
                    history.slice(0, 12).map((h) => {
                      const checked = wenceLinkHistoryIds.has(h.id);
                      return (
                        <label key={h.id} className={cn("flex cursor-pointer items-start gap-2 rounded-md border px-2 py-1.5 text-xs", checked ? "border-primary/60 bg-primary/5" : "border-border/40")}>
                          <input type="checkbox" checked={checked} onChange={() => toggleWenceLinkHistory(h.id)} />
                          <span className="min-w-0">
                            <span className="font-medium">{h.mode === "book" ? "全书重塑" : "分章重塑"} · {h.chapterCount}章</span>
                            <span className="mt-0.5 block line-clamp-1 text-muted-foreground">{h.promptTitle}</span>
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <span className="text-xs text-muted-foreground">快速填入</span>
                <div className="flex flex-wrap gap-1">
                  {RESHAPE_WENCE_QUICK.map((q) => (
                    <Button
                      key={q.label}
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[10px] leading-tight"
                      onClick={() => {
                        setWenceInput((prev) => (prev.trim() ? `${prev.trim()}\n\n` : "") + q.text);
                      }}
                    >
                      {q.label}
                    </Button>
                  ))}
                </div>
              </div>
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">问策问题</span>
                <textarea
                  rows={5}
                  value={wenceInput}
                  onChange={(e) => setWenceInput(e.target.value)}
                  className="w-full resize-y rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm"
                  placeholder="例如：结合关联记录，帮我给下一章设计冲突升级路径。"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={wenceRunning ? "destructive" : "outline"}
                  onClick={() => {
                    if (wenceRunning) stopWence();
                    else void runWence();
                  }}
                >
                  {wenceRunning ? "终止问策" : "发起问策"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setWenceMessages([]);
                    setWenceLinkHistoryIds(new Set());
                  }}
                >
                  清空会话
                </Button>
              </div>
            </div>
          )}
          </div>
        </aside>

        <section className="flex min-h-0 flex-col rounded-md border border-emerald-500/30 bg-card/10 p-3">
          <p className="mb-2 shrink-0 text-sm text-muted-foreground">{outputPanelHint}</p>
          <div
            ref={outputScrollRef}
            className="min-h-0 flex-1 overflow-auto rounded-md border border-border/40 bg-background/30 p-3"
          >
            {tab === "wence" ? (
              wenceMessages.length === 0 ? (
                <p className="text-sm text-muted-foreground">在左侧选择模型并输入问题后发起问策，多轮回复会显示在这里。</p>
              ) : (
                <div className="space-y-3">
                  {wenceMessages.map((m) => (
                    <div key={m.id} className={cn("rounded-md border px-3 py-2", m.role === "assistant" ? "border-primary/30 bg-primary/5" : "border-border/40 bg-card/20")}>
                      <p className="mb-1 text-xs text-muted-foreground">{m.role === "assistant" ? "AI 问策" : "我"}</p>
                      <pre className="whitespace-pre-wrap text-sm leading-6">{m.content || (m.role === "assistant" && wenceRunning ? "…" : "")}</pre>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <pre className="whitespace-pre-wrap text-sm leading-6">
                {outputText || (running ? "" : "（重塑结果在此显示）")}
                {running ? (
                  <span
                    className="ml-0.5 inline-block h-[1.15em] w-px animate-pulse bg-primary align-text-bottom"
                    aria-hidden
                  />
                ) : null}
              </pre>
            )}
          </div>
        </section>
      </div>
      )}

      <AIModelSelector
        open={modelPicker !== null}
        onOpenChange={(o) => {
          if (!o) setModelPicker(null);
        }}
        selectedModelId={modelPicker === "wence" ? wenceSelectedModelId : selectedModelId}
        onSelectModel={(id) => {
          if (modelPicker === "wence") setWenceSelectedModelId(id);
          else setSelectedModelId(id);
          setModelPicker(null);
        }}
        title="选择模型"
        overlayClassName="z-[220]"
        contentClassName="z-[221]"
      />
      <GlobalPromptQuickDialog
        open={quickOpen}
        onOpenChange={setQuickOpen}
        filterTypes={["book_split"]}
        filterSlots={WRITER_SLOTS}
        selectedId={activeTemplate?.id ?? null}
        activeTemplate={activeTemplate}
        onSelect={(t) => {
          setPickerTemplate(t);
          if (t) setSelectedHotId(null);
        }}
        onOpenBrowse={() => setBrowseOpen(true)}
        labels={{
          mineEmpty: "暂无自建的重塑类提示词，可前往提示词库新建。",
          popularEmpty: "暂无重塑类提示词。",
        }}
      />
      <ReshapePromptBrowseModal
        open={browseOpen}
        onOpenChange={setBrowseOpen}
        selectedId={activeTemplate?.id ?? null}
        onSelect={(t) => {
          setPickerTemplate(t);
          setSelectedHotId(null);
        }}
      />
      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogContent className="z-[231] max-h-[min(90dvh,720px)] max-w-lg overflow-y-auto" overlayClassName="z-[230]" showCloseButton>
          <DialogHeader>
            <DialogTitle>重塑功能说明</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">重塑是什么</h3>
              <p>
                重塑会用你选中的章节正文，按「重塑类」提示词里的要求，让 AI 输出结构化的阅读笔记、梗概、亮点或仿写要点等。适合分析剧情节奏、人设张力、伏笔与爽点，把长文压缩成可复用的创作参考。
              </p>
            </section>
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">推荐操作顺序</h3>
              <ol className="list-decimal space-y-1.5 pl-5">
                <li>在左侧勾选要参与重塑的章节（需有正文）。可用「最近 5/10 章」快速勾选连载末尾章节，「开篇 10 章」从书开头选取，「重置」清空选择。</li>
                <li>在「重塑要求」里选定提示词：点「快速选」从常用重塑模板里挑；「更多」可打开提示词库浏览。「自定义」用于取消当前从浏览/快速选带入的模板，回到热门列表中的默认选中项（仍须从提示词库选择重塑类模板，暂不支持在页内手写全文）。</li>
                <li>如有需要，在「补充信息」里写视角、侧重（例如只要人物弧光、只要节奏表）、输出格式等，会和章节内容一起交给模型。</li>
                <li>在「AI 模型」里选择本次调用使用的模型（与写作页其它 AI 功能共用一套模型列表与隐私设置）。</li>
                <li>点击「分章重塑」或「全书重塑」生成结果，在右侧阅读；完成后可到「时光机」查看与恢复本次作品下的重塑记录（本地与会话同步策略与账号相关，以你环境已开启的同步为准）。</li>
              </ol>
            </section>
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">分章重塑 和 全书重塑 怎么选</h3>
              <p>
                <span className="font-medium text-foreground">分章重塑</span>：按章多次请求，每章单独一段输出，适合逐章做笔记、章末小结，或单章很长、想控制单次上下文。
              </p>
              <p>
                <span className="font-medium text-foreground">全书重塑</span>：把所选章节拼成一次对话里的「节选正文」，适合要跨章统一归纳结构、主线或整体节奏；章节很多时注意模型上下文与费用。
              </p>
            </section>
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">提示词从哪来</h3>
              <p>
                在「落笔 → 提示词库」中新建类型为「重塑」的模板，写入你希望 AI 扮演的分析角度与输出格式。重塑页只会选用这类模板，与写作正文里的其它提示词互不干扰。
              </p>
            </section>
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">隐私与失败排查</h3>
              <p>
                若提示需开启云端模型或「允许正文上云」，请到「设置」里完成隐私与服务商配置。生成失败时可根据报错检查网络、配额以及是否选中了带正文的章节。
              </p>
            </section>
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">AI 问策</h3>
              <p>
                在「AI 问策」里可与模型多轮对话。左侧可单独为问策选模型，与分章/全书重塑所用模型可不同。勾选或「一键加入当前项」可带入时光机里的重塑结果作参考；亦可用「续写建议」「冲突升级」等快速填入。右侧主区域为聊天气泡，发起问策后流式显示回复。
              </p>
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
