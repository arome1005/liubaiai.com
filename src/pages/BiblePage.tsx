import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  addBibleChapterTemplate,
  addBibleCharacter,
  addBibleForeshadow,
  addBibleGlossaryTerm,
  addBibleTimelineEvent,
  addBibleWorldEntry,
  deleteBibleChapterTemplate,
  deleteBibleCharacter,
  deleteBibleForeshadow,
  deleteBibleTimelineEvent,
  deleteBibleGlossaryTerm,
  deleteBibleWorldEntry,
  exportBibleMarkdown,
  getWork,
  listBibleChapterTemplates,
  listBibleCharacters,
  listBibleForeshadowing,
  listBibleGlossaryTerms,
  listBibleTimelineEvents,
  listBibleWorldEntries,
  listChapters,
  reorderBibleCharacters,
  reorderBibleForeshadowing,
  reorderBibleTimelineEvents,
  reorderBibleWorldEntries,
  updateBibleChapterTemplate,
  updateBibleCharacter,
  updateBibleForeshadow,
  updateBibleGlossaryTerm,
  updateBibleTimelineEvent,
  updateBibleWorldEntry,
} from "../db/repo";
import type {
  BibleChapterTemplate,
  BibleCharacter,
  BibleForeshadow,
  BibleForeshadowStatus,
  BibleGlossaryTerm,
  BibleTimelineEvent,
  BibleWorldEntry,
  Chapter,
  Work,
} from "../db/types";

type Tab = "characters" | "world" | "foreshadow" | "timeline" | "templates" | "glossary";

function swapOrderIds<T extends { id: string }>(list: T[], id: string, dir: -1 | 1): string[] | null {
  const ix = list.findIndex((x) => x.id === id);
  const j = ix + dir;
  if (ix < 0 || j < 0 || j >= list.length) return null;
  const ids = list.map((x) => x.id);
  const tmp = ids[ix];
  ids[ix] = ids[j]!;
  ids[j] = tmp!;
  return ids;
}

export function BiblePage() {
  const { workId } = useParams<{ workId: string }>();
  const [work, setWork] = useState<Work | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [tab, setTab] = useState<Tab>("characters");
  const [characters, setCharacters] = useState<BibleCharacter[]>([]);
  const [world, setWorld] = useState<BibleWorldEntry[]>([]);
  const [foreshadow, setForeshadow] = useState<BibleForeshadow[]>([]);
  const [timeline, setTimeline] = useState<BibleTimelineEvent[]>([]);
  const [templates, setTemplates] = useState<BibleChapterTemplate[]>([]);
  const [glossary, setGlossary] = useState<BibleGlossaryTerm[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!workId) return;
    const w = await getWork(workId);
    setWork(w ?? null);
    const chs = await listChapters(workId);
    setChapters(chs);
    const [c, wo, fo, ti, te, g] = await Promise.all([
      listBibleCharacters(workId),
      listBibleWorldEntries(workId),
      listBibleForeshadowing(workId),
      listBibleTimelineEvents(workId),
      listBibleChapterTemplates(workId),
      listBibleGlossaryTerms(workId),
    ]);
    setCharacters(c);
    setWorld(wo);
    setForeshadow(fo);
    setTimeline(ti);
    setTemplates(te);
    setGlossary(g);
  }, [workId]);

  useEffect(() => {
    if (!workId) return;
    void (async () => {
      setLoading(true);
      try {
        await refresh();
      } finally {
        setLoading(false);
      }
    })();
  }, [workId, refresh]);

  async function handleExportMd() {
    if (!workId || !work) return;
    const md = await exportBibleMarkdown(workId);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const safe = work.title.replace(/[/\\?%*:|"<>]/g, "_");
    a.download = `${safe}-创作圣经.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (!workId) {
    return (
      <div className="page bible-page">
        <p>无效地址。</p>
        <Link to="/">返回</Link>
      </div>
    );
  }

  if (loading || !work) {
    return (
      <div className="page bible-page">
        <p className="muted">{loading ? "加载中…" : "作品不存在。"}</p>
        <Link to="/">返回作品库</Link>
      </div>
    );
  }

  return (
    <div className="page bible-page">
      <header className="page-header">
        <div>
          <Link to={`/work/${workId}`} className="back-link">
            ← 返回编辑
          </Link>
          <h1>创作圣经 · {work.title}</h1>
          <p className="muted small">人物、世界观、伏笔、时间线、章模板与术语表；与章节侧栏「本章约束」联动。</p>
        </div>
        <div className="header-actions">
          <button type="button" className="btn ghost" onClick={() => void handleExportMd()}>
            导出 Markdown
          </button>
        </div>
      </header>

      <nav className="bible-tabs" aria-label="圣经分区">
        {(
          [
            ["characters", "人物卡"],
            ["world", "世界观"],
            ["foreshadow", "伏笔"],
            ["timeline", "时间线"],
            ["templates", "章模板"],
            ["glossary", "术语表"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={`btn small ${tab === k ? "primary" : "ghost"}`}
            onClick={() => setTab(k)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "characters" ? (
        <section className="bible-section" aria-labelledby="bible-char-h">
          <h2 id="bible-char-h" className="bible-section-title">
            人物卡
          </h2>
          <button
            type="button"
            className="btn primary small"
            onClick={() =>
              void (async () => {
                await addBibleCharacter(workId, { name: "新人物" });
                await refresh();
              })()
            }
          >
            + 添加人物
          </button>
          <ul className="bible-card-list">
            {characters.map((c) => (
              <li key={c.id} className="bible-card">
                <div className="bible-card-head">
                  <input
                    className="bible-input-title"
                    defaultValue={c.name}
                    key={`name-${c.id}-${c.updatedAt}`}
                    onBlur={(e) =>
                      void updateBibleCharacter(c.id, { name: e.target.value }).then(refresh)
                    }
                  />
                  <div className="bible-card-actions">
                    <button
                      type="button"
                      title="上移"
                      className="btn ghost small"
                      onClick={() =>
                        void (async () => {
                          const ids = swapOrderIds(characters, c.id, -1);
                          if (ids) {
                            await reorderBibleCharacters(workId, ids);
                            await refresh();
                          }
                        })()
                      }
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      title="下移"
                      className="btn ghost small"
                      onClick={() =>
                        void (async () => {
                          const ids = swapOrderIds(characters, c.id, 1);
                          if (ids) {
                            await reorderBibleCharacters(workId, ids);
                            await refresh();
                          }
                        })()
                      }
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="btn danger small"
                      onClick={() => {
                        if (!window.confirm("删除该人物卡？")) return;
                        void deleteBibleCharacter(c.id).then(refresh);
                      }}
                    >
                      删除
                    </button>
                  </div>
                </div>
                <label className="bible-field">
                  <span>动机</span>
                  <textarea
                    defaultValue={c.motivation}
                    key={`mot-${c.id}-${c.updatedAt}`}
                    onBlur={(e) =>
                      void updateBibleCharacter(c.id, { motivation: e.target.value }).then(refresh)
                    }
                    rows={2}
                  />
                </label>
                <label className="bible-field">
                  <span>关系</span>
                  <textarea
                    defaultValue={c.relationships}
                    key={`rel-${c.id}-${c.updatedAt}`}
                    onBlur={(e) =>
                      void updateBibleCharacter(c.id, { relationships: e.target.value }).then(refresh)
                    }
                    rows={2}
                  />
                </label>
                <label className="bible-field">
                  <span>口吻</span>
                  <textarea
                    defaultValue={c.voiceNotes}
                    key={`voice-${c.id}-${c.updatedAt}`}
                    onBlur={(e) =>
                      void updateBibleCharacter(c.id, { voiceNotes: e.target.value }).then(refresh)
                    }
                    rows={2}
                  />
                </label>
                <label className="bible-field">
                  <span>禁忌</span>
                  <textarea
                    defaultValue={c.taboos}
                    key={`tab-${c.id}-${c.updatedAt}`}
                    onBlur={(e) =>
                      void updateBibleCharacter(c.id, { taboos: e.target.value }).then(refresh)
                    }
                    rows={2}
                  />
                </label>
              </li>
            ))}
          </ul>
          {characters.length === 0 ? <p className="muted small">暂无人物，点「添加人物」。</p> : null}
        </section>
      ) : null}

      {tab === "world" ? (
        <section className="bible-section">
          <h2 className="bible-section-title">世界观条目</h2>
          <button
            type="button"
            className="btn primary small"
            onClick={() =>
              void (async () => {
                await addBibleWorldEntry(workId, { entryKind: "分类", title: "新条目", body: "" });
                await refresh();
              })()
            }
          >
            + 添加条目
          </button>
          <ul className="bible-card-list">
            {world.map((w) => (
              <li key={w.id} className="bible-card">
                <div className="bible-card-head">
                  <input
                    className="bible-input-kind"
                    defaultValue={w.entryKind}
                    key={`k-${w.id}-${w.updatedAt}`}
                    onBlur={(e) =>
                      void updateBibleWorldEntry(w.id, { entryKind: e.target.value }).then(refresh)
                    }
                    placeholder="分类"
                  />
                  <input
                    className="bible-input-title"
                    defaultValue={w.title}
                    key={`t-${w.id}-${w.updatedAt}`}
                    onBlur={(e) =>
                      void updateBibleWorldEntry(w.id, { title: e.target.value }).then(refresh)
                    }
                  />
                  <div className="bible-card-actions">
                    <button
                      type="button"
                      className="btn ghost small"
                      onClick={() =>
                        void (async () => {
                          const ids = swapOrderIds(world, w.id, -1);
                          if (ids) {
                            await reorderBibleWorldEntries(workId, ids);
                            await refresh();
                          }
                        })()
                      }
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn ghost small"
                      onClick={() =>
                        void (async () => {
                          const ids = swapOrderIds(world, w.id, 1);
                          if (ids) {
                            await reorderBibleWorldEntries(workId, ids);
                            await refresh();
                          }
                        })()
                      }
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="btn danger small"
                      onClick={() => {
                        if (!window.confirm("删除该条目？")) return;
                        void deleteBibleWorldEntry(w.id).then(refresh);
                      }}
                    >
                      删除
                    </button>
                  </div>
                </div>
                <label className="bible-field">
                  <span>正文</span>
                  <textarea
                    defaultValue={w.body}
                    key={`b-${w.id}-${w.updatedAt}`}
                    onBlur={(e) =>
                      void updateBibleWorldEntry(w.id, { body: e.target.value }).then(refresh)
                    }
                    rows={4}
                  />
                </label>
              </li>
            ))}
          </ul>
          {world.length === 0 ? <p className="muted small">暂无条目。</p> : null}
        </section>
      ) : null}

      {tab === "foreshadow" ? (
        <section className="bible-section">
          <h2 className="bible-section-title">伏笔</h2>
          <button
            type="button"
            className="btn primary small"
            onClick={() =>
              void (async () => {
                await addBibleForeshadow(workId, {
                  title: "新伏笔",
                  plantedWhere: "",
                  plannedResolve: "",
                  status: "pending",
                  note: "",
                  chapterId: null,
                });
                await refresh();
              })()
            }
          >
            + 添加伏笔
          </button>
          <ul className="bible-card-list">
            {foreshadow.map((f) => (
              <li key={f.id} className="bible-card">
                <div className="bible-card-head">
                  <input
                    className="bible-input-title"
                    defaultValue={f.title}
                    key={`ft-${f.id}-${f.updatedAt}`}
                    onBlur={(e) =>
                      void updateBibleForeshadow(f.id, { title: e.target.value }).then(refresh)
                    }
                  />
                  <select
                    value={f.status}
                    onChange={(e) =>
                      void updateBibleForeshadow(f.id, {
                        status: e.target.value as BibleForeshadowStatus,
                      }).then(refresh)
                    }
                  >
                    <option value="pending">pending</option>
                    <option value="resolved">resolved</option>
                    <option value="abandoned">abandoned</option>
                  </select>
                  <select
                    value={f.chapterId ?? ""}
                    onChange={(e) =>
                      void updateBibleForeshadow(f.id, {
                        chapterId: e.target.value || null,
                      }).then(refresh)
                    }
                  >
                    <option value="">关联章节（无）</option>
                    {chapters.map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        {ch.title}
                      </option>
                    ))}
                  </select>
                  <div className="bible-card-actions">
                    <button
                      type="button"
                      className="btn ghost small"
                      onClick={() =>
                        void (async () => {
                          const ids = swapOrderIds(foreshadow, f.id, -1);
                          if (ids) {
                            await reorderBibleForeshadowing(workId, ids);
                            await refresh();
                          }
                        })()
                      }
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn ghost small"
                      onClick={() =>
                        void (async () => {
                          const ids = swapOrderIds(foreshadow, f.id, 1);
                          if (ids) {
                            await reorderBibleForeshadowing(workId, ids);
                            await refresh();
                          }
                        })()
                      }
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="btn danger small"
                      onClick={() => {
                        if (!window.confirm("删除？")) return;
                        void deleteBibleForeshadow(f.id).then(refresh);
                      }}
                    >
                      删除
                    </button>
                  </div>
                </div>
                <label className="bible-field">
                  <span>埋设位置</span>
                  <textarea
                    defaultValue={f.plantedWhere}
                    key={`fp-${f.id}-${f.updatedAt}`}
                    onBlur={(e) =>
                      void updateBibleForeshadow(f.id, { plantedWhere: e.target.value }).then(refresh)
                    }
                    rows={2}
                  />
                </label>
                <label className="bible-field">
                  <span>计划回收</span>
                  <textarea
                    defaultValue={f.plannedResolve}
                    key={`fr-${f.id}-${f.updatedAt}`}
                    onBlur={(e) =>
                      void updateBibleForeshadow(f.id, { plannedResolve: e.target.value }).then(refresh)
                    }
                    rows={2}
                  />
                </label>
                <label className="bible-field">
                  <span>备注</span>
                  <textarea
                    defaultValue={f.note}
                    key={`fn-${f.id}-${f.updatedAt}`}
                    onBlur={(e) =>
                      void updateBibleForeshadow(f.id, { note: e.target.value }).then(refresh)
                    }
                    rows={2}
                  />
                </label>
              </li>
            ))}
          </ul>
          {foreshadow.length === 0 ? <p className="muted small">暂无伏笔。</p> : null}
        </section>
      ) : null}

      {tab === "timeline" ? (
        <section className="bible-section">
          <h2 className="bible-section-title">时间线</h2>
          <button
            type="button"
            className="btn primary small"
            onClick={() =>
              void (async () => {
                await addBibleTimelineEvent(workId, { label: "事件", note: "", chapterId: null });
                await refresh();
              })()
            }
          >
            + 添加事件
          </button>
          <ul className="bible-card-list">
            {timeline.map((ev) => (
              <li key={ev.id} className="bible-card">
                <div className="bible-card-head">
                  <input
                    className="bible-input-title"
                    defaultValue={ev.label}
                    key={`el-${ev.id}-${ev.updatedAt}`}
                    onBlur={(e) =>
                      void updateBibleTimelineEvent(ev.id, { label: e.target.value }).then(refresh)
                    }
                  />
                  <select
                    value={ev.chapterId ?? ""}
                    onChange={(e) =>
                      void updateBibleTimelineEvent(ev.id, {
                        chapterId: e.target.value || null,
                      }).then(refresh)
                    }
                  >
                    <option value="">关联章节（无）</option>
                    {chapters.map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        {ch.title}
                      </option>
                    ))}
                  </select>
                  <div className="bible-card-actions">
                    <button
                      type="button"
                      className="btn ghost small"
                      onClick={() =>
                        void (async () => {
                          const ids = swapOrderIds(timeline, ev.id, -1);
                          if (ids) {
                            await reorderBibleTimelineEvents(workId, ids);
                            await refresh();
                          }
                        })()
                      }
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn ghost small"
                      onClick={() =>
                        void (async () => {
                          const ids = swapOrderIds(timeline, ev.id, 1);
                          if (ids) {
                            await reorderBibleTimelineEvents(workId, ids);
                            await refresh();
                          }
                        })()
                      }
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="btn danger small"
                      onClick={() => {
                        if (!window.confirm("删除？")) return;
                        void deleteBibleTimelineEvent(ev.id).then(refresh);
                      }}
                    >
                      删除
                    </button>
                  </div>
                </div>
                <label className="bible-field">
                  <span>备注</span>
                  <textarea
                    defaultValue={ev.note}
                    key={`en-${ev.id}-${ev.updatedAt}`}
                    onBlur={(e) =>
                      void updateBibleTimelineEvent(ev.id, { note: e.target.value }).then(refresh)
                    }
                    rows={2}
                  />
                </label>
              </li>
            ))}
          </ul>
          {timeline.length === 0 ? <p className="muted small">暂无事件。</p> : null}
        </section>
      ) : null}

      {tab === "templates" ? (
        <section className="bible-section">
          <h2 className="bible-section-title">章头 / 章尾模板</h2>
          <button
            type="button"
            className="btn primary small"
            onClick={() =>
              void (async () => {
                await addBibleChapterTemplate(workId, {
                  name: "新模板",
                  goalText: "",
                  forbidText: "",
                  povText: "",
                });
                await refresh();
              })()
            }
          >
            + 添加模板
          </button>
          <ul className="bible-card-list">
            {templates.map((t) => (
              <li key={t.id} className="bible-card">
                <div className="bible-card-head">
                  <input
                    className="bible-input-title"
                    defaultValue={t.name}
                    key={`tn-${t.id}-${t.updatedAt}`}
                    onBlur={(e) =>
                      void updateBibleChapterTemplate(t.id, { name: e.target.value }).then(refresh)
                    }
                  />
                  <button
                    type="button"
                    className="btn danger small"
                    onClick={() => {
                      if (!window.confirm("删除该模板？")) return;
                      void deleteBibleChapterTemplate(t.id).then(refresh);
                    }}
                  >
                    删除
                  </button>
                </div>
                <label className="bible-field">
                  <span>本章目标</span>
                  <textarea
                    defaultValue={t.goalText}
                    key={`tg-${t.id}-${t.updatedAt}`}
                    onBlur={(e) =>
                      void updateBibleChapterTemplate(t.id, { goalText: e.target.value }).then(refresh)
                    }
                    rows={2}
                  />
                </label>
                <label className="bible-field">
                  <span>禁止</span>
                  <textarea
                    defaultValue={t.forbidText}
                    key={`tf-${t.id}-${t.updatedAt}`}
                    onBlur={(e) =>
                      void updateBibleChapterTemplate(t.id, { forbidText: e.target.value }).then(refresh)
                    }
                    rows={2}
                  />
                </label>
                <label className="bible-field">
                  <span>视角</span>
                  <textarea
                    defaultValue={t.povText}
                    key={`tp-${t.id}-${t.updatedAt}`}
                    onBlur={(e) =>
                      void updateBibleChapterTemplate(t.id, { povText: e.target.value }).then(refresh)
                    }
                    rows={2}
                  />
                </label>
              </li>
            ))}
          </ul>
          {templates.length === 0 ? <p className="muted small">暂无模板。</p> : null}
        </section>
      ) : null}

      {tab === "glossary" ? (
        <section className="bible-section">
          <h2 className="bible-section-title">术语 / 人名表</h2>
          <p className="muted small">编辑器侧栏会提示正文中出现的术语（字面匹配）。</p>
          <button
            type="button"
            className="btn primary small"
            onClick={() =>
              void (async () => {
                await addBibleGlossaryTerm(workId, { term: "新术语", category: "term", note: "" });
                await refresh();
              })()
            }
          >
            + 添加术语
          </button>
          <ul className="bible-card-list">
            {glossary.map((g) => (
              <li key={g.id} className="bible-card">
                <div className="bible-card-head">
                  <input
                    className="bible-input-title"
                    defaultValue={g.term}
                    key={`gt-${g.id}-${g.updatedAt}`}
                    onBlur={(e) =>
                      void updateBibleGlossaryTerm(g.id, { term: e.target.value }).then(refresh)
                    }
                  />
                  <select
                    value={g.category}
                    onChange={(e) =>
                      void updateBibleGlossaryTerm(g.id, {
                        category: e.target.value as BibleGlossaryTerm["category"],
                      }).then(refresh)
                    }
                  >
                    <option value="name">人名</option>
                    <option value="term">术语</option>
                    <option value="dead">已死</option>
                  </select>
                  <button
                    type="button"
                    className="btn danger small"
                    onClick={() => {
                      if (!window.confirm("删除？")) return;
                      void deleteBibleGlossaryTerm(g.id).then(refresh);
                    }}
                  >
                    删除
                  </button>
                </div>
                <label className="bible-field">
                  <span>备注</span>
                  <textarea
                    defaultValue={g.note}
                    key={`gn-${g.id}-${g.updatedAt}`}
                    onBlur={(e) =>
                      void updateBibleGlossaryTerm(g.id, { note: e.target.value }).then(refresh)
                    }
                    rows={2}
                  />
                </label>
              </li>
            ))}
          </ul>
          {glossary.length === 0 ? <p className="muted small">暂无术语。</p> : null}
        </section>
      ) : null}
    </div>
  );
}
