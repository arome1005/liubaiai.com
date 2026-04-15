import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";
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
  deleteWritingPromptTemplate,
  deleteWritingStyleSample,
  getWork,
  listBibleChapterTemplates,
  listBibleCharacters,
  listBibleForeshadowing,
  listBibleGlossaryTerms,
  listBibleTimelineEvents,
  listBibleWorldEntries,
  listChapters,
  listWritingPromptTemplates,
  listWritingStyleSamples,
  reorderBibleCharacters,
  reorderBibleForeshadowing,
  reorderBibleTimelineEvents,
  reorderBibleWorldEntries,
  reorderWritingPromptTemplates,
  reorderWritingStyleSamples,
  addWritingPromptTemplate,
  addWritingStyleSample,
  updateBibleChapterTemplate,
  updateBibleCharacter,
  updateBibleForeshadow,
  updateBibleGlossaryTerm,
  updateBibleTimelineEvent,
  updateBibleWorldEntry,
  updateWritingPromptTemplate,
  updateWritingStyleSample,
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
  WritingPromptTemplate,
  WritingStyleSample,
} from "../db/types";

type Tab =
  | "characters"
  | "world"
  | "foreshadow"
  | "timeline"
  | "templates"
  | "glossary"
  | "prompts"
  | "penfeel";


const TAB_IDS: Tab[] = [
  "characters",
  "world",
  "foreshadow",
  "timeline",
  "templates",
  "glossary",
  "prompts",
  "penfeel",
];

function isTab(s: string): s is Tab {
  return (TAB_IDS as readonly string[]).includes(s);
}

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
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = useMemo(() => {
    const t = searchParams.get("tab");
    if (t && isTab(t)) return t;
    return "characters";
  }, [searchParams]);
  const [work, setWork] = useState<Work | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [characters, setCharacters] = useState<BibleCharacter[]>([]);
  const [world, setWorld] = useState<BibleWorldEntry[]>([]);
  const [foreshadow, setForeshadow] = useState<BibleForeshadow[]>([]);
  const [timeline, setTimeline] = useState<BibleTimelineEvent[]>([]);
  const [templates, setTemplates] = useState<BibleChapterTemplate[]>([]);
  const [glossary, setGlossary] = useState<BibleGlossaryTerm[]>([]);
  const [promptTemplates, setPromptTemplates] = useState<WritingPromptTemplate[]>([]);
  const [styleSamples, setStyleSamples] = useState<WritingStyleSample[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!workId) return;
    const w = await getWork(workId);
    setWork(w ?? null);
    const chs = await listChapters(workId);
    setChapters(chs);
    const [c, wo, fo, ti, te, g, pt, ss] = await Promise.all([
      listBibleCharacters(workId),
      listBibleWorldEntries(workId),
      listBibleForeshadowing(workId),
      listBibleTimelineEvents(workId),
      listBibleChapterTemplates(workId),
      listBibleGlossaryTerms(workId),
      listWritingPromptTemplates(workId),
      listWritingStyleSamples(workId),
    ]);
    setCharacters(c);
    setWorld(wo);
    setForeshadow(fo);
    setTimeline(ti);
    setTemplates(te);
    setGlossary(g);
    setPromptTemplates(pt);
    setStyleSamples(ss);
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


  if (!workId) {
    return (
      <div className="page bible-page flex flex-col gap-4">
        <div className="rounded-xl border border-border/40 bg-card/30 px-4 py-6 shadow-sm sm:px-6">
          <p>无效地址。</p>
          <Link to="/library">返回</Link>
        </div>
      </div>
    );
  }

  if (loading || !work) {
    return (
      <div className="page bible-page flex flex-col gap-4">
        <div className="rounded-xl border border-border/40 bg-card/30 px-4 py-8 text-center shadow-sm sm:px-6">
          <p className="muted">{loading ? "加载中…" : "作品不存在。"}</p>
          <Link to="/library">返回作品库</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("page bible-page flex flex-col gap-4")}>
      {tab === "characters" ? (
        <section className="bible-section bible-section-panel card" aria-labelledby="bible-char-h">
          <h2 id="bible-char-h" className="bible-section-title">
            人物卡
          </h2>
          <Button
            type="button"
            size="sm"
            onClick={() =>
              void (async () => {
                await addBibleCharacter(workId, { name: "新人物" });
                await refresh();
              })()
            }
          >
            + 添加人物
          </Button>
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
                    <Button
                      type="button"
                      title="上移"
                      variant="ghost" size="sm"
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
                    </Button>
                    <Button
                      type="button"
                      title="下移"
                      variant="ghost" size="sm"
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
                    </Button>
                    <Button
                      type="button"
                      variant="destructive" size="sm"
                      onClick={() => {
                        if (!window.confirm("删除该人物卡？")) return;
                        void deleteBibleCharacter(c.id).then(refresh);
                      }}
                    >
                      删除
                    </Button>
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
        <section className="bible-section bible-section-panel card">
          <h2 className="bible-section-title">世界观条目</h2>
          <Button
            type="button"
            size="sm"
            onClick={() =>
              void (async () => {
                await addBibleWorldEntry(workId, { entryKind: "分类", title: "新条目", body: "" });
                await refresh();
              })()
            }
          >
            + 添加条目
          </Button>
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
                    <Button
                      type="button"
                      variant="ghost" size="sm"
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
                    </Button>
                    <Button
                      type="button"
                      variant="ghost" size="sm"
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
                    </Button>
                    <Button
                      type="button"
                      variant="destructive" size="sm"
                      onClick={() => {
                        if (!window.confirm("删除该条目？")) return;
                        void deleteBibleWorldEntry(w.id).then(refresh);
                      }}
                    >
                      删除
                    </Button>
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
        <section className="bible-section bible-section-panel card">
          <h2 className="bible-section-title">伏笔</h2>
          <Button
            type="button"
            size="sm"
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
          </Button>
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
                    <Button
                      type="button"
                      variant="ghost" size="sm"
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
                    </Button>
                    <Button
                      type="button"
                      variant="ghost" size="sm"
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
                    </Button>
                    <Button
                      type="button"
                      variant="destructive" size="sm"
                      onClick={() => {
                        if (!window.confirm("删除？")) return;
                        void deleteBibleForeshadow(f.id).then(refresh);
                      }}
                    >
                      删除
                    </Button>
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
        <section className="bible-section bible-section-panel card">
          <h2 className="bible-section-title">时间线</h2>
          <Button
            type="button"
            size="sm"
            onClick={() =>
              void (async () => {
                await addBibleTimelineEvent(workId, { label: "事件", note: "", chapterId: null });
                await refresh();
              })()
            }
          >
            + 添加事件
          </Button>
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
                    <Button
                      type="button"
                      variant="ghost" size="sm"
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
                    </Button>
                    <Button
                      type="button"
                      variant="ghost" size="sm"
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
                    </Button>
                    <Button
                      type="button"
                      variant="destructive" size="sm"
                      onClick={() => {
                        if (!window.confirm("删除？")) return;
                        void deleteBibleTimelineEvent(ev.id).then(refresh);
                      }}
                    >
                      删除
                    </Button>
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
        <section className="bible-section bible-section-panel card">
          <h2 className="bible-section-title">章头 / 章尾模板</h2>
          <Button
            type="button"
            size="sm"
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
          </Button>
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
                  <Button
                    type="button"
                    variant="destructive" size="sm"
                    onClick={() => {
                      if (!window.confirm("删除该模板？")) return;
                      void deleteBibleChapterTemplate(t.id).then(refresh);
                    }}
                  >
                    删除
                  </Button>
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
        <section className="bible-section bible-section-panel card">
          <h2 className="bible-section-title">术语 / 人名表</h2>
          <p className="muted small">
            编辑器侧栏会提示正文中出现的术语（字面匹配）；生成请求时也会把本表注入 AI 上下文（云端需打开「元数据」上传许可）。
          </p>
          <Button
            type="button"
            size="sm"
            onClick={() =>
              void (async () => {
                await addBibleGlossaryTerm(workId, { term: "新术语", category: "term", note: "" });
                await refresh();
              })()
            }
          >
            + 添加术语
          </Button>
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
                  <Button
                    type="button"
                    variant="destructive" size="sm"
                    onClick={() => {
                      if (!window.confirm("删除？")) return;
                      void deleteBibleGlossaryTerm(g.id).then(refresh);
                    }}
                  >
                    删除
                  </Button>
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

      {tab === "prompts" ? (
        <section className="bible-section bible-section-panel card">
          <h2 className="bible-section-title">Prompt 模板</h2>
          <p className="muted small">
            维护可复用的「额外要求」类片段；在写作页打开 AI 侧栏后，内容会写入「额外要求」文本框（覆盖当前框内文字）。
          </p>
          <Button
            type="button"
            size="sm"
            onClick={() =>
              void (async () => {
                await addWritingPromptTemplate(workId, {
                  category: "通用",
                  title: "新模板",
                  body: "",
                });
                await refresh();
              })()
            }
          >
            + 添加模板
          </Button>
          <ul className="bible-card-list">
            {promptTemplates.map((p) => (
              <li key={p.id} className="bible-card">
                <div className="bible-card-head">
                  <input
                    className="bible-input-title"
                    defaultValue={p.title}
                    key={`ptt-${p.id}-${p.updatedAt}`}
                    onBlur={(e) =>
                      void updateWritingPromptTemplate(p.id, { title: e.target.value }).then(refresh)
                    }
                    placeholder="标题"
                  />
                  <input
                    className="bible-input-title"
                    style={{ maxWidth: "8rem" }}
                    defaultValue={p.category}
                    key={`ptc-${p.id}-${p.updatedAt}`}
                    onBlur={(e) =>
                      void updateWritingPromptTemplate(p.id, { category: e.target.value }).then(refresh)
                    }
                    placeholder="分类"
                  />
                  <div className="bible-card-actions">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() =>
                        navigate(`/work/${workId}`, { state: { applyUserHint: p.body } })
                      }
                    >
                      去写作装配
                    </Button>
                    <Button
                      type="button"
                      variant="ghost" size="sm"
                      onClick={() =>
                        void (async () => {
                          const ids = swapOrderIds(promptTemplates, p.id, -1);
                          if (ids) {
                            await reorderWritingPromptTemplates(workId, ids);
                            await refresh();
                          }
                        })()
                      }
                    >
                      ↑
                    </Button>
                    <Button
                      type="button"
                      variant="ghost" size="sm"
                      onClick={() =>
                        void (async () => {
                          const ids = swapOrderIds(promptTemplates, p.id, 1);
                          if (ids) {
                            await reorderWritingPromptTemplates(workId, ids);
                            await refresh();
                          }
                        })()
                      }
                    >
                      ↓
                    </Button>
                    <Button
                      type="button"
                      variant="destructive" size="sm"
                      onClick={() => {
                        if (!window.confirm("删除该模板？")) return;
                        void deleteWritingPromptTemplate(p.id).then(refresh);
                      }}
                    >
                      删除
                    </Button>
                  </div>
                </div>
                <label className="bible-field">
                  <span>正文（写入侧栏「额外要求」）</span>
                  <textarea
                    defaultValue={p.body}
                    key={`ptb-${p.id}-${p.updatedAt}`}
                    onBlur={(e) =>
                      void updateWritingPromptTemplate(p.id, { body: e.target.value }).then(refresh)
                    }
                    rows={5}
                  />
                </label>
              </li>
            ))}
          </ul>
          {promptTemplates.length === 0 ? <p className="muted small">暂无模板。</p> : null}
        </section>
      ) : null}

      {tab === "penfeel" ? (
        <section className="bible-section bible-section-panel card">
          <h2 className="bible-section-title">笔感样本</h2>
          <p className="muted small">
            粘贴或摘抄参考段落（可为名家片段或自己喜欢的章节）。保存后，写作页 AI 侧栏组装请求时会附带这些文本，用于模仿语气与节奏；请勿依赖其中的具体情节当作本书设定。
          </p>
          <Button
            type="button"
            size="sm"
            onClick={() =>
              void (async () => {
                await addWritingStyleSample(workId, { title: "新样本", body: "" });
                await refresh();
              })()
            }
          >
            + 添加样本
          </Button>
          <ul className="bible-card-list">
            {styleSamples.map((s) => (
              <li key={s.id} className="bible-card">
                <div className="bible-card-head">
                  <input
                    className="bible-input-title"
                    defaultValue={s.title}
                    key={`sst-${s.id}-${s.updatedAt}`}
                    onBlur={(e) =>
                      void updateWritingStyleSample(s.id, { title: e.target.value }).then(refresh)
                    }
                    placeholder="标题"
                  />
                  <div className="bible-card-actions">
                    <Button
                      type="button"
                      variant="ghost" size="sm"
                      onClick={() =>
                        void (async () => {
                          const ids = swapOrderIds(styleSamples, s.id, -1);
                          if (ids) {
                            await reorderWritingStyleSamples(workId, ids);
                            await refresh();
                          }
                        })()
                      }
                    >
                      ↑
                    </Button>
                    <Button
                      type="button"
                      variant="ghost" size="sm"
                      onClick={() =>
                        void (async () => {
                          const ids = swapOrderIds(styleSamples, s.id, 1);
                          if (ids) {
                            await reorderWritingStyleSamples(workId, ids);
                            await refresh();
                          }
                        })()
                      }
                    >
                      ↓
                    </Button>
                    <Button
                      type="button"
                      variant="destructive" size="sm"
                      onClick={() => {
                        if (!window.confirm("删除该样本？")) return;
                        void deleteWritingStyleSample(s.id).then(refresh);
                      }}
                    >
                      删除
                    </Button>
                  </div>
                </div>
                <label className="bible-field">
                  <span>正文</span>
                  <textarea
                    defaultValue={s.body}
                    key={`ssb-${s.id}-${s.updatedAt}`}
                    onBlur={(e) =>
                      void updateWritingStyleSample(s.id, { body: e.target.value }).then(refresh)
                    }
                    rows={8}
                  />
                </label>
              </li>
            ))}
          </ul>
          {styleSamples.length === 0 ? <p className="muted small">暂无笔感样本。</p> : null}
        </section>
      ) : null}
    </div>
  );
}
