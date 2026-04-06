import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  buildWenceChatApiMessages,
  buildWenceChatSystemContent,
  clampContextText,
  type WenceChatWorkAttach,
  type WritingWorkStyleSlice,
} from "../ai/assemble-context";
import { generateWithProviderStream, isFirstAiGateCancelledError } from "../ai/client";
import { getProviderConfig, loadAiSettings } from "../ai/storage";
import type { AiChatMessage, AiSettings } from "../ai/types";
import {
  getWork,
  getWorkStyleCard,
  listBibleCharacters,
  listBibleGlossaryTerms,
  listBibleWorldEntries,
  listWorks,
} from "../db/repo";
import type { Work, WorkStyleCard } from "../db/types";
import { workTagsToProfileText } from "../util/work-tags";
import { AiInlineErrorNotice } from "../components/AiInlineErrorNotice";
import { HubAiSettingsHint } from "../components/HubAiSettingsHint";

const LS_LAST_WORK = "liubai:lastWorkId";
const LS_CHAT_PREFIX = "liubai:wenceChat:v1:";

function chatStorageKey(workId: string | null): string {
  return LS_CHAT_PREFIX + (workId ?? "none");
}

function styleCardToSlice(card: WorkStyleCard | undefined): WritingWorkStyleSlice {
  if (!card) return { pov: "", tone: "", bannedPhrases: "", styleAnchor: "", extraRules: "" };
  return {
    pov: card.pov ?? "",
    tone: card.tone ?? "",
    bannedPhrases: card.bannedPhrases ?? "",
    styleAnchor: card.styleAnchor ?? "",
    extraRules: card.extraRules ?? "",
  };
}

async function buildSettingIndexText(workId: string, maxChars: number): Promise<string> {
  const [chars, worlds, gloss] = await Promise.all([
    listBibleCharacters(workId),
    listBibleWorldEntries(workId),
    listBibleGlossaryTerms(workId),
  ]);
  const parts: string[] = [];
  if (chars.length) {
    const line = chars
      .map((c) => {
        const tab = (c.taboos ?? "").trim();
        return tab ? `${c.name}（禁忌摘要：${tab.slice(0, 60)}${tab.length > 60 ? "…" : ""}）` : c.name;
      })
      .join("、");
    parts.push(`【人物】${line}`);
  }
  if (worlds.length) {
    const lines = worlds.map((w) => {
      const b = (w.body ?? "").trim();
      const snippet = b ? `：${b.slice(0, 100)}${b.length > 100 ? "…" : ""}` : "";
      const kind = (w.entryKind ?? "").trim();
      return kind ? `「${w.title}」(${kind})${snippet}` : `「${w.title}」${snippet}`;
    });
    parts.push(`【世界观】\n${lines.join("\n")}`);
  }
  if (gloss.length) {
    parts.push(`【术语】${gloss.map((g) => g.term).join("、")}`);
  }
  return clampContextText(parts.join("\n\n"), maxChars);
}

function parseStoredMessages(raw: string | null): AiChatMessage[] | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as unknown;
    if (!j || typeof j !== "object") return null;
    const m = (j as { messages?: unknown }).messages;
    if (!Array.isArray(m)) return null;
    const out: AiChatMessage[] = [];
    for (const row of m) {
      if (!row || typeof row !== "object") return null;
      const role = (row as { role?: string }).role;
      const content = (row as { content?: string }).content;
      if (role !== "user" && role !== "assistant") return null;
      if (typeof content !== "string") return null;
      out.push({ role, content });
    }
    return out;
  } catch {
    return null;
  }
}

export function ChatPage() {
  const [settings, setSettings] = useState<AiSettings>(() => loadAiSettings());

  useEffect(() => {
    const sync = () => setSettings(loadAiSettings());
    window.addEventListener("focus", sync);
    return () => window.removeEventListener("focus", sync);
  }, []);
  const [works, setWorks] = useState<Work[]>([]);
  const [workId, setWorkId] = useState<string | null>(null);
  const [work, setWork] = useState<Work | null>(null);
  const [styleCard, setStyleCard] = useState<WorkStyleCard | undefined>(undefined);
  const [includeSettingIndex, setIncludeSettingIndex] = useState(false);
  const [settingIndexText, setSettingIndexText] = useState("");
  const [settingIndexLoading, setSettingIndexLoading] = useState(false);
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const listEndRef = useRef<HTMLDivElement | null>(null);
  const [storageHydrated, setStorageHydrated] = useState(false);

  const isCloudProvider = settings.provider !== "ollama";
  const cloudAllowed =
    !isCloudProvider || (settings.privacy.consentAccepted && settings.privacy.allowCloudProviders);
  const canInjectWorkMeta = !isCloudProvider || settings.privacy.allowMetadata;

  const refreshWorks = useCallback(async () => {
    const list = await listWorks();
    setWorks(list);
    return list;
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const list = await refreshWorks();
        let wid: string | null = null;
        try {
          wid = localStorage.getItem(LS_LAST_WORK);
        } catch {
          wid = null;
        }
        if (wid && !list.some((w) => w.id === wid)) wid = list[0]?.id ?? null;
        if (!wid) wid = list[0]?.id ?? null;
        setWorkId(wid);
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshWorks]);

  useEffect(() => {
    if (!workId) {
      setWork(null);
      setStyleCard(undefined);
      return;
    }
    void (async () => {
      const [w, sc] = await Promise.all([getWork(workId), getWorkStyleCard(workId)]);
      setWork(w ?? null);
      setStyleCard(sc);
    })();
  }, [workId]);

  useEffect(() => {
    if (!canInjectWorkMeta && includeSettingIndex) setIncludeSettingIndex(false);
  }, [canInjectWorkMeta, includeSettingIndex]);

  useEffect(() => {
    if (!workId || !includeSettingIndex) {
      setSettingIndexText("");
      setSettingIndexLoading(false);
      return;
    }
    setSettingIndexLoading(true);
    void (async () => {
      try {
        const t = await buildSettingIndexText(workId, 6000);
        setSettingIndexText(t);
      } finally {
        setSettingIndexLoading(false);
      }
    })();
  }, [workId, includeSettingIndex]);

  const storageKey = useMemo(() => chatStorageKey(workId), [workId]);

  useLayoutEffect(() => {
    if (loading) {
      setStorageHydrated(false);
      return;
    }
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(storageKey);
    } catch {
      raw = null;
    }
    const parsed = parseStoredMessages(raw);
    setMessages(parsed ?? []);
    setStorageHydrated(true);
  }, [loading, storageKey]);

  useEffect(() => {
    if (!storageHydrated || loading) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ v: 1, messages }));
    } catch {
      /* ignore quota */
    }
  }, [messages, storageKey, loading, storageHydrated]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  const tagProfileText = useMemo(() => (work ? workTagsToProfileText(work.tags) : ""), [work]);

  const workAttach = useMemo((): WenceChatWorkAttach | null => {
    if (!workId || !work) return null;
    if (!canInjectWorkMeta) return null;
    const slice = styleCardToSlice(styleCard);
    return {
      workTitle: work.title.trim() || "未命名",
      workStyle: slice,
      tagProfileText: tagProfileText || undefined,
      settingIndexText:
        includeSettingIndex && settingIndexText.trim() ? settingIndexText : undefined,
    };
  }, [
    workId,
    work,
    canInjectWorkMeta,
    styleCard,
    tagProfileText,
    includeSettingIndex,
    settingIndexText,
  ]);

  const systemContent = useMemo(() => buildWenceChatSystemContent(workAttach), [workAttach]);

  function clearChat() {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ v: 1, messages: [] }));
    } catch {
      /* ignore */
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    if (isCloudProvider && !cloudAllowed) {
      setError("请先在设置中同意云端 AI 并允许调用。");
      return;
    }

    setInput("");
    setError(null);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);

    const nextTurns: AiChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages([...nextTurns, { role: "assistant", content: "" }]);

    const provider = settings.provider;
    const cfg = getProviderConfig(settings, provider);
    const apiMessages = buildWenceChatApiMessages(systemContent, nextTurns);

    try {
      const r = await generateWithProviderStream({
        provider,
        config: cfg,
        messages: apiMessages,
        signal: ac.signal,
        onDelta: (d) => {
          setMessages((prev) => {
            if (prev.length < 2) return prev;
            const copy = [...prev];
            const last = copy[copy.length - 1]!;
            if (last.role !== "assistant") return prev;
            copy[copy.length - 1] = { role: "assistant", content: last.content + d };
            return copy;
          });
        },
        temperature: provider !== "ollama" ? settings.geminiTemperature : undefined,
      });
      const tail = (r.text ?? "").trim();
      if (tail) {
        setMessages((prev) => {
          if (prev.length < 1) return prev;
          const copy = [...prev];
          const last = copy[copy.length - 1]!;
          if (last.role === "assistant" && !last.content.trim()) {
            copy[copy.length - 1] = { role: "assistant", content: tail };
          }
          return copy;
        });
      }
    } catch (e) {
      if (isFirstAiGateCancelledError(e)) {
        setMessages((prev) => {
          if (prev.length < 2) return prev;
          const last = prev[prev.length - 1]!;
          if (last.role === "assistant" && !last.content.trim()) {
            return prev.slice(0, -1);
          }
          return prev;
        });
        return;
      }
      const aborted = e instanceof Error && (e.name === "AbortError" || /abort/i.test(e.message));
      if (!aborted) {
        setError(e instanceof Error ? e.message : String(e));
      }
      setMessages((prev) => {
        if (prev.length < 2) return prev;
        const last = prev[prev.length - 1]!;
        if (last.role === "assistant" && !last.content.trim()) {
          return prev.slice(0, -1);
        }
        return prev;
      });
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  return (
    <div className="page-content wence-page">
      <header className="page-header wence-page-header">
        <div className="wence-page-header-text">
          <div className="hub-module-placeholder-title-row">
            <h1>问策</h1>
            <span className="hub-module-placeholder-kbd" aria-hidden>
              4
            </span>
          </div>
          <p className="muted small wence-page-sub">
            开放式策略与拆书向对话；定纲、改纲与文策流水请在「推演」完成。可选关联作品以注入风格卡与标签侧写。
          </p>
          <Link to="/" className="hub-module-placeholder-back small">
            ← 返回首页
          </Link>
        </div>
      </header>

      {loading ? (
        <p className="muted">加载中…</p>
      ) : works.length === 0 ? (
        <div className="wence-empty card">
          <p className="muted">暂无作品。请先在「留白」创建作品后再关联上下文。</p>
          <Link to="/library" className="btn">
            去作品库
          </Link>
          <HubAiSettingsHint />
        </div>
      ) : (
        <>
          <div className="wence-toolbar card">
            <label className="wence-field">
              <span className="wence-field-label">关联作品</span>
              <select
                className="input wence-select"
                value={workId ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setWorkId(v || null);
                  setError(null);
                  try {
                    if (v) localStorage.setItem(LS_LAST_WORK, v);
                  } catch {
                    /* ignore */
                  }
                }}
              >
                <option value="">不关联（通用咨询）</option>
                {works.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.title.trim() || "未命名"}
                  </option>
                ))}
              </select>
            </label>
            <label className="wence-check">
              <input
                type="checkbox"
                checked={includeSettingIndex}
                disabled={!workId || settingIndexLoading || !canInjectWorkMeta}
                onChange={(e) => setIncludeSettingIndex(e.target.checked)}
              />
              <span>附带设定索引（人物 / 世界观 / 术语名录，不上正文）</span>
            </label>
            {settingIndexLoading ? <span className="muted small">索引加载中…</span> : null}
            <div className="wence-toolbar-actions">
              <button type="button" className="btn small secondary" onClick={clearChat} disabled={busy}>
                新对话
              </button>
            </div>
          </div>

          {workId && work && !canInjectWorkMeta && isCloudProvider ? (
            <p className="wence-warn muted small">
              当前为云端模型且未允许作品元数据：问策将不会注入书名与风格卡。请在{" "}
              <Link to="/settings#ai-privacy">设置 → 隐私与上传范围</Link> 中打开「允许作品元数据」，或改用 Ollama。
            </p>
          ) : null}

          <div className="wence-chat-shell card">
            <div className="wence-messages" role="log" aria-live="polite" aria-relevant="additions">
              {messages.length === 0 ? (
                <p className="muted wence-chat-empty">输入问题后开始对话。上下文仅本标签页 session 内保留。</p>
              ) : (
                messages.map((m, i) => (
                  <div
                    key={i}
                    className={
                      m.role === "user" ? "wence-bubble wence-bubble--user" : "wence-bubble wence-bubble--assistant"
                    }
                  >
                    <div className="wence-bubble-role">{m.role === "user" ? "你" : "问策"}</div>
                    <div className="wence-bubble-body">{m.content || (busy && i === messages.length - 1 ? "…" : "")}</div>
                  </div>
                ))
              )}
              <div ref={listEndRef} />
            </div>

            {error ? (
              <div className="wence-error-wrap">
                <AiInlineErrorNotice message={error} />
              </div>
            ) : null}

            <div className="wence-composer">
              <textarea
                className="input wence-input"
                rows={3}
                placeholder="写下你的问题…（Enter 发送，Shift+Enter 换行）"
                value={input}
                disabled={busy}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <div className="wence-composer-actions">
                {busy ? (
                  <button type="button" className="btn small secondary" onClick={stop}>
                    停止
                  </button>
                ) : null}
                <button type="button" className="btn small" onClick={() => void send()} disabled={busy || !input.trim()}>
                  发送
                </button>
              </div>
            </div>
          </div>

          <HubAiSettingsHint />
        </>
      )}
    </div>
  );
}
