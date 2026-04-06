import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { isFirstAiGateCancelledError } from "../ai/client";
import { generateLogicThreeBranches } from "../ai/logic-branch-predict";
import { loadAiSettings } from "../ai/storage";
import type { WritingWorkStyleSlice } from "../ai/assemble-context";
import {
  addBibleTimelineEvent,
  getChapterBible,
  getWork,
  getWorkStyleCard,
  listBibleCharacters,
  listBibleGlossaryTerms,
  listBibleTimelineEvents,
  listBibleWorldEntries,
  listChapters,
  listWorks,
} from "../db/repo";
import type { BibleTimelineEvent, BibleWorldEntry, Chapter, Work } from "../db/types";
import { resolveDefaultChapterId } from "../util/resolve-default-chapter";
import { workTagsToProfileText } from "../util/work-tags";
import { runBibleConsistencyScan, type ConsistencyAlert } from "../util/bible-consistency-scan";
import { AiInlineErrorNotice } from "../components/AiInlineErrorNotice";
import { HubAiSettingsHint } from "../components/HubAiSettingsHint";

const LS_LAST_WORK = "liubai:lastWorkId";

export function LogicPage() {
  const [works, setWorks] = useState<Work[]>([]);
  const [workId, setWorkId] = useState<string | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [workTitle, setWorkTitle] = useState("");
  const [scanChapterTitle, setScanChapterTitle] = useState<string | null>(null);
  const [scanAlerts, setScanAlerts] = useState<ConsistencyAlert[] | null>(null);
  const [branchHint, setBranchHint] = useState("");
  const [branchResult, setBranchResult] = useState<{ title: string; summary: string }[] | null>(null);
  const [branchError, setBranchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanBusy, setScanBusy] = useState(false);
  const [branchBusy, setBranchBusy] = useState(false);
  const branchAbortRef = useRef<AbortController | null>(null);

  const [timelineEvents, setTimelineEvents] = useState<BibleTimelineEvent[]>([]);
  const [worldEntries, setWorldEntries] = useState<BibleWorldEntry[]>([]);
  const [newTlLabel, setNewTlLabel] = useState("");
  const [newTlNote, setNewTlNote] = useState("");
  const [newTlChapterId, setNewTlChapterId] = useState("");
  const [tlBusy, setTlBusy] = useState(false);

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
      setChapters([]);
      setChapterId(null);
      setWorkTitle("");
      return;
    }
    void (async () => {
      const w = await getWork(workId);
      setWorkTitle(w?.title ?? "");
      const ch = await listChapters(workId);
      setChapters(ch);
      setChapterId(resolveDefaultChapterId(workId, ch, w ?? undefined));
    })();
  }, [workId]);

  useEffect(() => {
    if (!workId) {
      setTimelineEvents([]);
      setWorldEntries([]);
      return;
    }
    void (async () => {
      const [te, we] = await Promise.all([listBibleTimelineEvents(workId), listBibleWorldEntries(workId)]);
      setTimelineEvents(te);
      setWorldEntries(we);
    })();
  }, [workId]);

  const refreshTimelineAndWorld = useCallback(async () => {
    if (!workId) return;
    const [te, we] = await Promise.all([listBibleTimelineEvents(workId), listBibleWorldEntries(workId)]);
    setTimelineEvents(te);
    setWorldEntries(we);
  }, [workId]);

  useEffect(() => {
    setScanAlerts(null);
    setScanChapterTitle(null);
    setBranchResult(null);
    setBranchError(null);
  }, [chapterId]);

  const runScan = useCallback(async () => {
    if (!workId || !chapterId) return;
    setScanBusy(true);
    setScanAlerts(null);
    setScanChapterTitle(null);
    try {
      const ch = chapters.find((c) => c.id === chapterId);
      if (!ch) return;
      const [bible, style, glossary, characters] = await Promise.all([
        getChapterBible(chapterId),
        getWorkStyleCard(workId),
        listBibleGlossaryTerms(workId),
        listBibleCharacters(workId),
      ]);
      const alerts = runBibleConsistencyScan({
        chapterContent: ch.content ?? "",
        chapterBibleForbid: bible?.forbidText ?? "",
        styleBannedPhrases: style?.bannedPhrases ?? "",
        glossaryTerms: glossary.map((g) => ({ term: g.term, category: g.category })),
        characterTaboos: characters.map((c) => ({ name: c.name, taboos: c.taboos })),
      });
      setScanChapterTitle(ch.title);
      setScanAlerts(alerts);
    } finally {
      setScanBusy(false);
    }
  }, [workId, chapterId, chapters]);

  const runBranchPredict = useCallback(async () => {
    if (!workId || !chapterId) return;
    const ch = chapters.find((c) => c.id === chapterId);
    if (!ch) return;
    branchAbortRef.current?.abort();
    const ac = new AbortController();
    branchAbortRef.current = ac;
    setBranchBusy(true);
    setBranchError(null);
    setBranchResult(null);
    try {
      const [card, w] = await Promise.all([
        workId ? getWorkStyleCard(workId) : Promise.resolve(undefined),
        workId ? getWork(workId) : Promise.resolve(undefined),
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
        userHint: branchHint,
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
    }
  }, [workId, chapterId, chapters, branchHint, workTitle]);

  const handleAddTimeline = useCallback(async () => {
    if (!workId || !newTlLabel.trim()) return;
    setTlBusy(true);
    try {
      await addBibleTimelineEvent(workId, {
        label: newTlLabel.trim(),
        note: newTlNote.trim(),
        chapterId: newTlChapterId.trim() ? newTlChapterId : null,
      });
      setNewTlLabel("");
      setNewTlNote("");
      setNewTlChapterId("");
      await refreshTimelineAndWorld();
    } finally {
      setTlBusy(false);
    }
  }, [workId, newTlLabel, newTlNote, newTlChapterId, refreshTimelineAndWorld]);

  const chapterTitleById = useCallback(
    (id: string | null) => {
      if (!id) return null;
      return chapters.find((c) => c.id === id)?.title ?? null;
    },
    [chapters],
  );

  if (loading) {
    return (
      <div className="page logic-page">
        <p className="muted">加载中…</p>
      </div>
    );
  }

  if (works.length === 0) {
    return (
      <div className="page logic-page">
        <header className="page-header logic-page-header">
          <div>
            <Link to="/" className="back-link logic-page-back">
              ← 返回首页
            </Link>
            <h1>推演</h1>
            <p className="muted small logic-page-lead">一致性扫描：正文与圣经约束、风格卡、术语表（规则版，无 AI）。</p>
          </div>
          <div className="header-actions">
            <Link to="/library" className="btn ghost small">
              作品库
            </Link>
          </div>
        </header>
        <p className="muted">暂无作品。请先在作品库创建或导入作品。</p>
        <Link to="/library" className="btn primary">
          前往作品库
        </Link>
        <HubAiSettingsHint />
      </div>
    );
  }

  return (
    <div className="page logic-page">
      <header className="page-header logic-page-header">
        <div className="logic-page-header-text">
          <Link to="/" className="back-link logic-page-back">
            ← 返回首页
          </Link>
          <div className="logic-page-title-row">
            <span className="logic-page-kbd" aria-hidden>
              2
            </span>
            <h1>推演</h1>
          </div>
          <p className="muted small logic-page-lead">
            <strong>一致性扫描</strong>：对照本章正文与圣经禁写、风格卡禁用套话、术语「已死」、人物禁忌，纯本地规则、无 AI。
            <strong> 三分支预测</strong>：基于当前章正文调用已选模型生成三条走向；可自行复制到写作侧栏草稿。
            <strong> 时间轴 / 世界观</strong>：与<strong>落笔 · 圣经</strong>同源（时间线事件 + 世界观条目），可在此速览并快速追加时间线。
          </p>
        </div>
        <div className="header-actions">
          {workId ? (
            <>
              <Link to={`/work/${workId}`} className="btn ghost small">
                写作
              </Link>
              <Link to={`/work/${workId}/bible`} className="btn ghost small">
                圣经
              </Link>
            </>
          ) : null}
          <Link to="/library" className="btn ghost small">
            作品库
          </Link>
        </div>
      </header>

      <section className="logic-toolbar" aria-label="扫描范围">
        <label className="logic-toolbar-field">
          <span className="muted small">作品</span>
          <select
            className="logic-select"
            value={workId ?? ""}
            onChange={(e) => {
              const v = e.target.value || null;
              setWorkId(v);
              try {
                if (v) localStorage.setItem(LS_LAST_WORK, v);
              } catch {
                /* ignore */
              }
            }}
          >
            {works.map((w) => (
              <option key={w.id} value={w.id}>
                {w.title || "未命名"}
              </option>
            ))}
          </select>
        </label>
        <label className="logic-toolbar-field">
          <span className="muted small">章节</span>
          <select
            className="logic-select"
            value={chapterId ?? ""}
            onChange={(e) => setChapterId(e.target.value || null)}
            disabled={!chapters.length}
          >
            {chapters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title || "未命名章节"}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn primary small"
          disabled={!chapterId || scanBusy}
          onClick={() => void runScan()}
        >
          {scanBusy ? "扫描中…" : "扫描本章"}
        </button>
      </section>

      {workTitle ? (
        <p className="muted small logic-page-context">
          当前作品：<strong>{workTitle}</strong>
        </p>
      ) : null}

      <section className="logic-timeline-panel" aria-labelledby="logic-tl-h">
        <div className="logic-timeline-panel-head">
          <h2 id="logic-tl-h" className="logic-timeline-heading">
            时间轴与地点（极简）
          </h2>
          {workId ? (
            <Link to={`/work/${workId}/bible`} className="btn ghost small">
              在圣经中编辑
            </Link>
          ) : null}
        </div>
        <p className="muted small logic-timeline-lead">
          数据存于创作圣经；此处供推演时对照。地点侧以「世界观」条目的类型与标题为索引（可先手填，AI 辅助留待后续）。
        </p>

        <div className="logic-timeline-grid">
          <div className="logic-timeline-col">
            <h3 className="logic-timeline-subh">时间线</h3>
            {timelineEvents.length === 0 ? (
              <p className="muted small">暂无事件。可用下方表单快速添加，或在圣经「时间线」分区维护。</p>
            ) : (
              <ol className="logic-timeline-list">
                {timelineEvents.map((ev) => (
                  <li key={ev.id} className="logic-timeline-item">
                    <span className="logic-timeline-label">{ev.label}</span>
                    {ev.note?.trim() ? <p className="logic-timeline-note muted small">{ev.note.trim()}</p> : null}
                    {ev.chapterId ? (
                      <p className="muted small logic-timeline-ch">
                        关联章：{chapterTitleById(ev.chapterId) ?? ev.chapterId.slice(0, 8)}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
            <div className="logic-timeline-quick">
              <span className="muted small">快速追加</span>
              <input
                type="text"
                className="logic-timeline-input"
                placeholder="事件名称"
                value={newTlLabel}
                onChange={(e) => setNewTlLabel(e.target.value)}
                disabled={tlBusy}
              />
              <textarea
                className="logic-timeline-textarea"
                rows={2}
                placeholder="备注（可选）"
                value={newTlNote}
                onChange={(e) => setNewTlNote(e.target.value)}
                disabled={tlBusy}
              />
              <label className="logic-timeline-ch-field muted small">
                关联章节（可选）
                <select
                  className="logic-select logic-timeline-ch-select"
                  value={newTlChapterId}
                  onChange={(e) => setNewTlChapterId(e.target.value)}
                  disabled={tlBusy || !chapters.length}
                >
                  <option value="">（不关联）</option>
                  {chapters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title || "未命名"}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="btn primary small"
                disabled={!workId || !newTlLabel.trim() || tlBusy}
                onClick={() => void handleAddTimeline()}
              >
                {tlBusy ? "保存中…" : "添加时间线"}
              </button>
            </div>
          </div>

          <div className="logic-timeline-col">
            <h3 className="logic-timeline-subh">世界观 / 地点索引</h3>
            {worldEntries.length === 0 ? (
              <p className="muted small">暂无条目。请在圣经「世界观」中添加（如地理、势力、规则）。</p>
            ) : (
              <ul className="logic-world-list">
                {worldEntries.map((w) => {
                  const body = (w.body ?? "").trim().replace(/\s+/g, " ");
                  const clip = body.length > 140 ? body.slice(0, 140) + "…" : body;
                  return (
                    <li key={w.id} className="logic-world-item">
                      <div className="logic-world-meta">
                        <span className="logic-world-kind">{w.entryKind.trim() || "条目"}</span>
                        <strong className="logic-world-title">{w.title.trim() || "未命名"}</strong>
                      </div>
                      {clip ? <p className="logic-world-body muted small">{clip}</p> : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="logic-scan-panel" aria-live="polite">
        {scanChapterTitle ? (
          <p className="muted small logic-scan-meta">
            已扫描章节：<strong>{scanChapterTitle}</strong>
          </p>
        ) : null}
        {scanAlerts === null ? (
          <p className="muted small logic-scan-empty">选择章节后点击「扫描本章」查看告警列表。</p>
        ) : scanAlerts.length === 0 ? (
          <p className="logic-scan-ok">
            未发现规则级命中。当前为<strong>本地规则</strong>扫描，不含语义与 AI 推断。
          </p>
        ) : (
          <ul className="logic-scan-list">
            {scanAlerts.map((a, i) => (
              <li key={i} className={"logic-scan-item logic-scan-item--" + a.severity}>
                <span className="logic-scan-badge">{a.severity === "warn" ? "注意" : "提示"}</span>
                <span className="logic-scan-code">{a.code}</span>
                <p className="logic-scan-msg">{a.message}</p>
                {a.snippet ? (
                  <pre className="logic-scan-snippet">{a.snippet}</pre>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="logic-branch-panel" aria-labelledby="logic-branch-h">
        <h2 id="logic-branch-h" className="logic-branch-heading">
          三分支预测
        </h2>
        <p className="muted small logic-branch-lead">
          使用与写作侧栏相同的模型与隐私设置；云端需允许<strong>元数据 + 本章正文</strong>上传。
        </p>
        <label className="logic-branch-hint-label">
          <span className="muted small">补充倾向（可选）</span>
          <textarea
            className="logic-branch-hint"
            rows={2}
            placeholder="例如：希望更偏悬疑 / 放慢节奏 / 强化某配角"
            value={branchHint}
            onChange={(e) => setBranchHint(e.target.value)}
            disabled={branchBusy}
          />
        </label>
        <div className="logic-branch-actions">
          <button
            type="button"
            className="btn primary small"
            disabled={!chapterId || branchBusy}
            onClick={() => void runBranchPredict()}
          >
            {branchBusy ? "生成中…" : "生成分支"}
          </button>
          {branchBusy ? (
            <button type="button" className="btn ghost small" onClick={() => branchAbortRef.current?.abort()}>
              取消
            </button>
          ) : null}
        </div>
        {branchError ? <AiInlineErrorNotice message={branchError} className="logic-branch-error" /> : null}
        {branchResult ? (
          <ul className="logic-branch-cards">
            {branchResult.map((b, i) => (
              <li key={i} className="logic-branch-card">
                <div className="logic-branch-card-head">
                  <span className="logic-branch-card-ix">{i + 1}</span>
                  <strong className="logic-branch-card-title">{b.title}</strong>
                </div>
                <p className="logic-branch-card-body">{b.summary}</p>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <footer className="logic-page-footer">
        <HubAiSettingsHint />
      </footer>
    </div>
  );
}
