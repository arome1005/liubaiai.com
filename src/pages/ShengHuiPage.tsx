import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { WritingWorkStyleSlice } from "../ai/assemble-context";
import { clampContextText } from "../ai/assemble-context";
import { loadAiSettings } from "../ai/storage";
import { isFirstAiGateCancelledError } from "../ai/client";
import { generateShengHuiProseStream } from "../ai/sheng-hui-generate";
import type { AiSettings } from "../ai/types";
import {
  getChapterBible,
  getWork,
  getWorkStyleCard,
  listBibleCharacters,
  listBibleGlossaryTerms,
  listBibleWorldEntries,
  listChapters,
  listWorks,
} from "../db/repo";
import type { Chapter, ChapterBible, Work, WorkStyleCard } from "../db/types";
import { resolveDefaultChapterId } from "../util/resolve-default-chapter";
import { workTagsToProfileText } from "../util/work-tags";
import { AiInlineErrorNotice } from "../components/AiInlineErrorNotice";
import { HubAiSettingsHint } from "../components/HubAiSettingsHint";

const LS_LAST_WORK = "liubai:lastWorkId";
const LS_OUTLINE_PREFIX = "liubai:shengHuiOutline:v1:";

function outlineStorageKey(workId: string | null): string {
  return LS_OUTLINE_PREFIX + (workId ?? "none");
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

function formatChapterBibleForPrompt(b: ChapterBible | undefined): string {
  if (!b) return "";
  const parts: string[] = [];
  if (b.goalText.trim()) parts.push(`本章目标：\n${b.goalText.trim()}`);
  if (b.forbidText.trim()) parts.push(`禁止：\n${b.forbidText.trim()}`);
  if (b.povText.trim()) parts.push(`视角/口吻：\n${b.povText.trim()}`);
  if (b.sceneStance.trim()) parts.push(`场景状态：\n${b.sceneStance.trim()}`);
  if (b.characterStateText.trim()) {
    parts.push(`本章人物状态：\n${b.characterStateText.trim()}`);
  }
  return parts.join("\n\n");
}

export function ShengHuiPage() {
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
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [outline, setOutline] = useState("");
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [includeSummary, setIncludeSummary] = useState(true);
  const [includeBible, setIncludeBible] = useState(true);
  const [includeBodyTail, setIncludeBodyTail] = useState(false);
  const [includeSettingIndex, setIncludeSettingIndex] = useState(false);
  const [settingIndexText, setSettingIndexText] = useState("");
  const [settingIndexLoading, setSettingIndexLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const [outlineHydrated, setOutlineHydrated] = useState(false);

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
    if (!workId) {
      setChapters([]);
      setChapterId(null);
      return;
    }
    void (async () => {
      const [list, w] = await Promise.all([listChapters(workId), getWork(workId)]);
      setChapters(list);
      setChapterId((prev) => {
        if (prev && list.some((c) => c.id === prev)) return prev;
        return resolveDefaultChapterId(workId, list, w ?? undefined);
      });
    })();
  }, [workId]);

  const outlineKey = useMemo(() => outlineStorageKey(workId), [workId]);

  useEffect(() => {
    if (loading) {
      setOutlineHydrated(false);
      return;
    }
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(outlineKey);
    } catch {
      raw = null;
    }
    setOutline(raw ?? "");
    setOutlineHydrated(true);
  }, [loading, outlineKey]);

  useEffect(() => {
    if (!outlineHydrated || loading) return;
    try {
      sessionStorage.setItem(outlineKey, outline);
    } catch {
      /* ignore quota */
    }
  }, [outline, outlineKey, outlineHydrated, loading]);

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

  const tagProfileText = useMemo(() => (work ? workTagsToProfileText(work.tags) : ""), [work]);

  const selectedChapter = useMemo(
    () => (chapterId ? chapters.find((c) => c.id === chapterId) : undefined),
    [chapters, chapterId],
  );

  async function runGenerate() {
    if (!workId || !work || busy) return;
    const outlineText = outline.trim();
    if (!outlineText) {
      setError("请先填写「大纲与文策」。");
      return;
    }
    if (isCloudProvider && !cloudAllowed) {
      setError("请先在设置中同意云端 AI 并允许调用。");
      return;
    }

    setError(null);
    setOutput("");
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);

    let bibleFormatted = "";
    if (chapterId && includeBible) {
      const row = await getChapterBible(chapterId);
      bibleFormatted = formatChapterBibleForPrompt(row);
    }

    const summary =
      chapterId && includeSummary ? (selectedChapter?.summary ?? "").trim() : "";
    const bodyTail =
      chapterId && includeBodyTail ? (selectedChapter?.content ?? "").trim() : "";

    try {
      const r = await generateShengHuiProseStream({
        workTitle: work.title.trim() || "未命名",
        chapterTitle: selectedChapter?.title?.trim() || undefined,
        outlineAndStrategy: outlineText,
        chapterSummary: summary || undefined,
        chapterBodyTail: bodyTail || undefined,
        chapterBibleFormatted: bibleFormatted || undefined,
        settingIndexText:
          includeSettingIndex && settingIndexText.trim() ? settingIndexText : undefined,
        workStyle: styleCardToSlice(styleCard),
        tagProfileText: tagProfileText || undefined,
        settings,
        signal: ac.signal,
        onDelta: (d) => {
          setOutput((prev) => prev + d);
        },
      });
      setOutput((prev) => {
        if (prev.trim()) return prev;
        return (r.text ?? "").trim();
      });
    } catch (e) {
      if (isFirstAiGateCancelledError(e)) return;
      const aborted = e instanceof Error && (e.name === "AbortError" || /abort/i.test(e.message));
      if (!aborted) {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  function copyOutput() {
    const t = output.trim();
    if (!t) return;
    void navigator.clipboard.writeText(t);
  }

  if (loading) {
    return (
      <div className="page-content wence-page">
        <p className="muted">加载中…</p>
      </div>
    );
  }

  if (works.length === 0) {
    return (
      <div className="page-content wence-page">
        <header className="page-header wence-page-header">
          <div className="wence-page-header-text">
            <div className="hub-module-placeholder-title-row">
              <h1>生辉</h1>
              <span className="hub-module-placeholder-kbd" aria-hidden>
                6
              </span>
            </div>
            <p className="muted small wence-page-sub">按已定稿的大纲与文策生成章节正文；与写作编辑页解耦。</p>
            <Link to="/" className="hub-module-placeholder-back small">
              ← 返回首页
            </Link>
          </div>
        </header>
        <div className="wence-empty card">
          <p className="muted">暂无作品。请先在「留白」创建作品后再选择上下文。</p>
          <Link to="/library" className="btn">
            去作品库
          </Link>
          <HubAiSettingsHint />
        </div>
      </div>
    );
  }

  return (
    <div className="page-content wence-page">
      <header className="page-header wence-page-header">
        <div className="wence-page-header-text">
          <div className="hub-module-placeholder-title-row">
            <h1>生辉</h1>
            <span className="hub-module-placeholder-kbd" aria-hidden>
              6
            </span>
          </div>
          <p className="muted small wence-page-sub">
            按纲仿写：将推演定稿的<strong>大纲与文策</strong>粘贴到下方，挂载本书<strong>风格卡、标签侧写与落笔圣经</strong>（与写作侧栏装配同源）；生成结果可再粘贴到写作侧栏草稿或正文。
          </p>
          <Link to="/" className="hub-module-placeholder-back small">
            ← 返回首页
          </Link>
        </div>
      </header>

      <div className="wence-toolbar card">
        <label className="wence-field">
          <span className="wence-field-label">作品</span>
          <select
            className="input wence-select"
            value={workId ?? ""}
            onChange={(e) => {
              const v = e.target.value || null;
              setWorkId(v);
              setError(null);
              try {
                if (v) localStorage.setItem(LS_LAST_WORK, v);
              } catch {
                /* ignore */
              }
            }}
          >
            {works.map((w) => (
              <option key={w.id} value={w.id}>
                {w.title.trim() || "未命名"}
              </option>
            ))}
          </select>
        </label>
        <label className="wence-field">
          <span className="wence-field-label">章节（可选）</span>
          <select
            className="input wence-select"
            value={chapterId ?? ""}
            onChange={(e) => setChapterId(e.target.value || null)}
            disabled={!chapters.length}
          >
            {!chapters.length ? (
              <option value="">暂无章节</option>
            ) : null}
            {chapters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title || "未命名章节"}
              </option>
            ))}
          </select>
        </label>
        {workId ? (
          <div className="wence-toolbar-actions">
            <Link to={`/work/${workId}`} className="btn small ghost">
              写作
            </Link>
            <Link to={`/work/${workId}/bible`} className="btn small ghost">
              落笔 · 圣经
            </Link>
          </div>
        ) : null}
      </div>

      <div className="wence-toolbar card">
        <label className="wence-check">
          <input
            type="checkbox"
            checked={includeSummary}
            disabled={!chapterId}
            onChange={(e) => setIncludeSummary(e.target.checked)}
          />
          <span>附带本章概要（若有）</span>
        </label>
        <label className="wence-check">
          <input
            type="checkbox"
            checked={includeBible}
            disabled={!chapterId}
            onChange={(e) => setIncludeBible(e.target.checked)}
          />
          <span>附带本章圣经要点</span>
        </label>
        <label className="wence-check">
          <input
            type="checkbox"
            checked={includeBodyTail}
            disabled={!chapterId}
            onChange={(e) => setIncludeBodyTail(e.target.checked)}
          />
          <span>附带本章正文末尾节选（续接）</span>
        </label>
        <label className="wence-check">
          <input
            type="checkbox"
            checked={includeSettingIndex}
            disabled={!workId || settingIndexLoading || !canInjectWorkMeta}
            onChange={(e) => setIncludeSettingIndex(e.target.checked)}
          />
          <span>附带设定索引（人物 / 世界观 / 术语名录）</span>
        </label>
        {settingIndexLoading ? <span className="muted small">索引加载中…</span> : null}
      </div>

      {workId && work && !canInjectWorkMeta && isCloudProvider ? (
        <p className="wence-warn muted small">
          当前为云端模型且未允许作品元数据：无法注入书名与风格卡。请在{" "}
          <Link to="/settings#ai-privacy">设置 → 隐私与上传范围</Link> 中打开「允许作品元数据」，或改用 Ollama。
        </p>
      ) : null}

      <div className="card">
        <label className="wence-field">
          <span className="wence-field-label">大纲与文策（定稿，必填）</span>
          <textarea
            className="input wence-input"
            rows={12}
            placeholder="从「推演」定稿后粘贴卷纲、细纲与文策要点；生辉将据此写正文，不直接消费藏经原文。"
            value={outline}
            disabled={busy}
            onChange={(e) => setOutline(e.target.value)}
          />
        </label>
        <p className="muted small">本会话按作品将上述草稿缓存在浏览器 sessionStorage。</p>
      </div>

      <div className="card">
        <div className="wence-composer-actions" style={{ marginBottom: "0.75rem" }}>
          {busy ? (
            <button type="button" className="btn small secondary" onClick={stop}>
              停止
            </button>
          ) : null}
          <button
            type="button"
            className="btn primary small"
            onClick={() => void runGenerate()}
            disabled={busy || !outline.trim() || !workId}
          >
            {busy ? "生成中…" : "按纲生成正文"}
          </button>
          <button type="button" className="btn small ghost" onClick={copyOutput} disabled={busy || !output.trim()}>
            复制正文
          </button>
        </div>
        {error ? (
          <div className="wence-error-wrap">
            <AiInlineErrorNotice message={error} />
          </div>
        ) : null}
        <div
          className="sheng-hui-output"
          role="region"
          aria-label="生成结果"
          aria-live="polite"
        >
          {output.trim() ? output : busy ? "…" : "生成结果将显示在此处。"}
        </div>
      </div>

      <HubAiSettingsHint />
    </div>
  );
}
