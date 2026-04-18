import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const [highlightEntryId, setHighlightEntryId] = useState<string | null>(null);
  const highlightTimerRef = useRef<number | null>(null);
  const tab: Tab = useMemo(() => {
    const t = searchParams.get("tab");
    if (t && isTab(t)) return t;
    return "characters";
  }, [searchParams]);
  const deepLinkEntryId = useMemo(() => (searchParams.get("entry") ?? "").trim(), [searchParams]);
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

  // P2-1：更强筛选 + 批量操作（tab 内局部状态）
  const [filterQuery, setFilterQuery] = useState("");
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelection, setBulkSelection] = useState<Set<string>>(() => new Set());
  const [foStatusFilter, setFoStatusFilter] = useState<"all" | BibleForeshadowStatus>("all");
  const [foChapterFilter, setFoChapterFilter] = useState<string>(""); // "" 表示全部
  const [tiChapterFilter, setTiChapterFilter] = useState<string>(""); // "" 表示全部
  const [tiBulkChapterId, setTiBulkChapterId] = useState<string>(""); // "" 表示不改

  const clearBulk = useCallback(() => {
    setBulkMode(false);
    setBulkSelection(new Set());
  }, []);

  const toggleBulkSelect = useCallback((id: string) => {
    setBulkSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    // 切换分区时清空筛选与批量选择，避免误操作
    setFilterQuery("");
    setFoStatusFilter("all");
    setFoChapterFilter("");
    setTiChapterFilter("");
    setTiBulkChapterId("");
    clearBulk();
  }, [tab, clearBulk]);

  const q = filterQuery.trim().toLowerCase();
  const filteredCharacters = useMemo(() => {
    if (!q) return characters;
    return characters.filter((c) =>
      [c.name, c.motivation, c.relationships, c.voiceNotes, c.taboos].some((x) =>
        (x ?? "").toLowerCase().includes(q),
      ),
    );
  }, [characters, q]);

  const filteredWorld = useMemo(() => {
    if (!q) return world;
    return world.filter((w) =>
      [w.entryKind, w.title, w.body].some((x) => (x ?? "").toLowerCase().includes(q)),
    );
  }, [q, world]);

  const filteredForeshadow = useMemo(() => {
    return foreshadow.filter((f) => {
      if (foStatusFilter !== "all" && f.status !== foStatusFilter) return false;
      if (foChapterFilter && (f.chapterId ?? "") !== foChapterFilter) return false;
      if (!q) return true;
      return [f.title, f.note, f.plantedWhere, f.plannedResolve].some((x) =>
        (x ?? "").toLowerCase().includes(q),
      );
    });
  }, [foChapterFilter, foStatusFilter, foreshadow, q]);

  const filteredTimeline = useMemo(() => {
    return timeline.filter((ev) => {
      if (tiChapterFilter && (ev.chapterId ?? "") !== tiChapterFilter) return false;
      if (!q) return true;
      return [ev.label, ev.note].some((x) => (x ?? "").toLowerCase().includes(q));
    });
  }, [q, tiChapterFilter, timeline]);

  const filteredTemplates = useMemo(() => {
    if (!q) return templates;
    return templates.filter((t) =>
      [t.name, t.goalText, t.forbidText, t.povText].some((x) => (x ?? "").toLowerCase().includes(q)),
    );
  }, [q, templates]);

  const filteredGlossary = useMemo(() => {
    if (!q) return glossary;
    return glossary.filter((g) => [g.term, g.note].some((x) => (x ?? "").toLowerCase().includes(q)));
  }, [glossary, q]);

  const filteredPromptTemplates = useMemo(() => {
    if (!q) return promptTemplates;
    return promptTemplates.filter((p) =>
      [p.title, p.category, p.body].some((x) => (x ?? "").toLowerCase().includes(q)),
    );
  }, [promptTemplates, q]);

  const filteredStyleSamples = useMemo(() => {
    if (!q) return styleSamples;
    return styleSamples.filter((s) => [s.title, s.body].some((x) => (x ?? "").toLowerCase().includes(q)));
  }, [q, styleSamples]);

  const inferTabByEntryId = useCallback(
    (entryId: string): Tab | null => {
      if (!entryId) return null;
      if (characters.some((x) => x.id === entryId)) return "characters";
      if (world.some((x) => x.id === entryId)) return "world";
      if (foreshadow.some((x) => x.id === entryId)) return "foreshadow";
      if (timeline.some((x) => x.id === entryId)) return "timeline";
      if (templates.some((x) => x.id === entryId)) return "templates";
      if (glossary.some((x) => x.id === entryId)) return "glossary";
      if (promptTemplates.some((x) => x.id === entryId)) return "prompts";
      if (styleSamples.some((x) => x.id === entryId)) return "penfeel";
      return null;
    },
    [characters, foreshadow, glossary, promptTemplates, styleSamples, templates, timeline, world],
  );

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

  // P1-1：条目级深链定位（tab + entry）—— 滚动定位 + 高亮
  useEffect(() => {
    if (loading) return;
    const entryId = deepLinkEntryId;
    if (!entryId) return;

    const t = searchParams.get("tab");
    if (!t) {
      const inferred = inferTabByEntryId(entryId);
      if (inferred) {
        const next = new URLSearchParams(searchParams);
        next.set("tab", inferred);
        setSearchParams(next, { replace: true });
        return;
      }
    }

    const el = document.querySelector<HTMLElement>(`[data-bible-entry="${CSS.escape(entryId)}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    setHighlightEntryId(entryId);
    if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = window.setTimeout(() => {
      setHighlightEntryId(null);
      highlightTimerRef.current = null;
      const next = new URLSearchParams(searchParams);
      next.delete("entry");
      setSearchParams(next, { replace: true });
    }, 2200);
  }, [deepLinkEntryId, inferTabByEntryId, loading, searchParams, setSearchParams]);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
    };
  }, []);


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
          <div className="flex flex-wrap items-center gap-2">
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
            <input
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="搜索（姓名/动机/关系/口吻/禁忌）…"
              className="h-9 w-[min(24rem,70vw)] rounded-md border border-border bg-background px-3 text-sm"
            />
            {!bulkMode ? (
              <Button type="button" size="sm" variant="outline" onClick={() => setBulkMode(true)}>
                批量
              </Button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">已选 {bulkSelection.size}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setBulkSelection(new Set(filteredCharacters.map((x) => x.id)))}
                >
                  全选
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setBulkSelection(new Set())}>
                  清空
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() =>
                    void (async () => {
                      const ids = [...bulkSelection];
                      if (!ids.length) return;
                      if (!window.confirm(`确定删除选中 ${ids.length} 张人物卡？`)) return;
                      await Promise.all(ids.map((id) => deleteBibleCharacter(id)));
                      await refresh();
                      setBulkSelection(new Set());
                      setBulkMode(false);
                    })()
                  }
                >
                  删除
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => clearBulk()}>
                  退出
                </Button>
              </div>
            )}
          </div>
          <ul className="bible-card-list">
            {filteredCharacters.map((c) => (
              <li
                key={c.id}
                className={cn(
                  "bible-card relative",
                  highlightEntryId === c.id && "ring-2 ring-primary/50 bg-primary/5",
                )}
                data-bible-entry={c.id}
              >
                {bulkMode ? (
                  <button
                    type="button"
                    onClick={() => toggleBulkSelect(c.id)}
                    className={cn(
                      "absolute left-3 top-3 z-10 flex h-6 w-6 items-center justify-center rounded-md border",
                      bulkSelection.has(c.id)
                        ? "border-primary/40 bg-primary/15 text-primary"
                        : "border-border/60 bg-background/60 text-muted-foreground hover:bg-background",
                    )}
                    aria-label={bulkSelection.has(c.id) ? "取消选择" : "选择"}
                  >
                    {bulkSelection.has(c.id) ? "✓" : null}
                  </button>
                ) : null}
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
          <div className="flex flex-wrap items-center gap-2">
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
            <input
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="搜索（分类/标题/正文）…"
              className="h-9 w-[min(24rem,70vw)] rounded-md border border-border bg-background px-3 text-sm"
            />
            {!bulkMode ? (
              <Button type="button" size="sm" variant="outline" onClick={() => setBulkMode(true)}>
                批量
              </Button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">已选 {bulkSelection.size}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setBulkSelection(new Set(filteredWorld.map((x) => x.id)))}
                >
                  全选
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setBulkSelection(new Set())}>
                  清空
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() =>
                    void (async () => {
                      const ids = [...bulkSelection];
                      if (!ids.length) return;
                      if (!window.confirm(`确定删除选中 ${ids.length} 条世界观？`)) return;
                      await Promise.all(ids.map((id) => deleteBibleWorldEntry(id)));
                      await refresh();
                      setBulkSelection(new Set());
                      setBulkMode(false);
                    })()
                  }
                >
                  删除
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => clearBulk()}>
                  退出
                </Button>
              </div>
            )}
          </div>
          <ul className="bible-card-list">
            {filteredWorld.map((w) => (
              <li
                key={w.id}
                className={cn(
                  "bible-card relative",
                  highlightEntryId === w.id && "ring-2 ring-primary/50 bg-primary/5",
                )}
                data-bible-entry={w.id}
              >
                {bulkMode ? (
                  <button
                    type="button"
                    onClick={() => toggleBulkSelect(w.id)}
                    className={cn(
                      "absolute left-3 top-3 z-10 flex h-6 w-6 items-center justify-center rounded-md border",
                      bulkSelection.has(w.id)
                        ? "border-primary/40 bg-primary/15 text-primary"
                        : "border-border/60 bg-background/60 text-muted-foreground hover:bg-background",
                    )}
                    aria-label={bulkSelection.has(w.id) ? "取消选择" : "选择"}
                  >
                    {bulkSelection.has(w.id) ? "✓" : null}
                  </button>
                ) : null}
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
          <div className="flex flex-wrap items-center gap-2">
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
            <input
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="搜索（标题/埋点/回收/备注）…"
              className="h-9 w-[min(20rem,70vw)] rounded-md border border-border bg-background px-3 text-sm"
            />
            <select
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
              value={foStatusFilter}
              onChange={(e) => setFoStatusFilter(e.target.value as "all" | BibleForeshadowStatus)}
              title="状态筛选"
            >
              <option value="all">全部状态</option>
              <option value="pending">pending</option>
              <option value="resolved">resolved</option>
              <option value="abandoned">abandoned</option>
            </select>
            <select
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
              value={foChapterFilter}
              onChange={(e) => setFoChapterFilter(e.target.value)}
              title="关联章节筛选"
            >
              <option value="">全部章节</option>
              {chapters.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.title}
                </option>
              ))}
            </select>
            {!bulkMode ? (
              <Button type="button" size="sm" variant="outline" onClick={() => setBulkMode(true)}>
                批量
              </Button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">已选 {bulkSelection.size}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setBulkSelection(new Set(filteredForeshadow.map((x) => x.id)))}
                >
                  全选
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void (async () => {
                      const ids = [...bulkSelection];
                      if (!ids.length) return;
                      if (!window.confirm(`将选中 ${ids.length} 条伏笔标记为 pending？`)) return;
                      await Promise.all(ids.map((id) => updateBibleForeshadow(id, { status: "pending" })));
                      await refresh();
                      setBulkSelection(new Set());
                      setBulkMode(false);
                    })()
                  }
                >
                  标记 pending
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void (async () => {
                      const ids = [...bulkSelection];
                      if (!ids.length) return;
                      if (!window.confirm(`将选中 ${ids.length} 条伏笔标记为 resolved？`)) return;
                      await Promise.all(ids.map((id) => updateBibleForeshadow(id, { status: "resolved" })));
                      await refresh();
                      setBulkSelection(new Set());
                      setBulkMode(false);
                    })()
                  }
                >
                  标记 resolved
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void (async () => {
                      const ids = [...bulkSelection];
                      if (!ids.length) return;
                      if (!window.confirm(`将选中 ${ids.length} 条伏笔标记为 abandoned？`)) return;
                      await Promise.all(ids.map((id) => updateBibleForeshadow(id, { status: "abandoned" })));
                      await refresh();
                      setBulkSelection(new Set());
                      setBulkMode(false);
                    })()
                  }
                >
                  标记 abandoned
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() =>
                    void (async () => {
                      const ids = [...bulkSelection];
                      if (!ids.length) return;
                      if (!window.confirm(`确定删除选中 ${ids.length} 条伏笔？不可恢复。`)) return;
                      await Promise.all(ids.map((id) => deleteBibleForeshadow(id)));
                      await refresh();
                      setBulkSelection(new Set());
                      setBulkMode(false);
                    })()
                  }
                >
                  删除
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setBulkSelection(new Set())}>
                  清空
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => clearBulk()}>
                  退出
                </Button>
              </div>
            )}
          </div>
          <ul className="bible-card-list">
            {filteredForeshadow.map((f) => (
              <li
                key={f.id}
                className={cn(
                  "bible-card relative",
                  highlightEntryId === f.id && "ring-2 ring-primary/50 bg-primary/5",
                )}
                data-bible-entry={f.id}
              >
                {bulkMode ? (
                  <button
                    type="button"
                    onClick={() => toggleBulkSelect(f.id)}
                    className={cn(
                      "absolute left-3 top-3 z-10 flex h-6 w-6 items-center justify-center rounded-md border",
                      bulkSelection.has(f.id)
                        ? "border-primary/40 bg-primary/15 text-primary"
                        : "border-border/60 bg-background/60 text-muted-foreground hover:bg-background",
                    )}
                    aria-label={bulkSelection.has(f.id) ? "取消选择" : "选择"}
                  >
                    {bulkSelection.has(f.id) ? "✓" : null}
                  </button>
                ) : null}
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
          <div className="flex flex-wrap items-center gap-2">
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
            <input
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="搜索（事件/备注）…"
              className="h-9 w-[min(20rem,70vw)] rounded-md border border-border bg-background px-3 text-sm"
            />
            <select
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
              value={tiChapterFilter}
              onChange={(e) => setTiChapterFilter(e.target.value)}
              title="关联章节筛选"
            >
              <option value="">全部章节</option>
              {chapters.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.title}
                </option>
              ))}
            </select>
            {!bulkMode ? (
              <Button type="button" size="sm" variant="outline" onClick={() => setBulkMode(true)}>
                批量
              </Button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">已选 {bulkSelection.size}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setBulkSelection(new Set(filteredTimeline.map((x) => x.id)))}
                >
                  全选
                </Button>
                <select
                  className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                  value={tiBulkChapterId}
                  onChange={(e) => setTiBulkChapterId(e.target.value)}
                  title="批量设置关联章节（先选章节，再点应用）"
                >
                  <option value="">（不改章节）</option>
                  <option value="__null__">设为无关联</option>
                  {chapters.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.title}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void (async () => {
                      const ids = [...bulkSelection];
                      if (!ids.length) return;
                      if (!window.confirm(`应用关联章节到选中 ${ids.length} 条时间线事件？`)) return;
                      const v = tiBulkChapterId;
                      if (!v) return;
                      const chapterId = v === "__null__" ? null : v;
                      await Promise.all(ids.map((id) => updateBibleTimelineEvent(id, { chapterId })));
                      await refresh();
                      setBulkSelection(new Set());
                      setBulkMode(false);
                    })()
                  }
                >
                  应用章节
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() =>
                    void (async () => {
                      const ids = [...bulkSelection];
                      if (!ids.length) return;
                      if (!window.confirm(`确定删除选中 ${ids.length} 条时间线事件？不可恢复。`)) return;
                      await Promise.all(ids.map((id) => deleteBibleTimelineEvent(id)));
                      await refresh();
                      setBulkSelection(new Set());
                      setBulkMode(false);
                    })()
                  }
                >
                  删除
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setBulkSelection(new Set())}>
                  清空
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => clearBulk()}>
                  退出
                </Button>
              </div>
            )}
          </div>
          <ul className="bible-card-list">
            {filteredTimeline.map((ev) => (
              <li
                key={ev.id}
                className={cn(
                  "bible-card relative",
                  highlightEntryId === ev.id && "ring-2 ring-primary/50 bg-primary/5",
                )}
                data-bible-entry={ev.id}
              >
                {bulkMode ? (
                  <button
                    type="button"
                    onClick={() => toggleBulkSelect(ev.id)}
                    className={cn(
                      "absolute left-3 top-3 z-10 flex h-6 w-6 items-center justify-center rounded-md border",
                      bulkSelection.has(ev.id)
                        ? "border-primary/40 bg-primary/15 text-primary"
                        : "border-border/60 bg-background/60 text-muted-foreground hover:bg-background",
                    )}
                    aria-label={bulkSelection.has(ev.id) ? "取消选择" : "选择"}
                  >
                    {bulkSelection.has(ev.id) ? "✓" : null}
                  </button>
                ) : null}
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
          <div className="flex flex-wrap items-center gap-2">
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
            <input
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="搜索（模板名/目标/禁止/视角）…"
              className="h-9 w-[min(24rem,70vw)] rounded-md border border-border bg-background px-3 text-sm"
            />
            {!bulkMode ? (
              <Button type="button" size="sm" variant="outline" onClick={() => setBulkMode(true)}>
                批量
              </Button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">已选 {bulkSelection.size}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setBulkSelection(new Set(filteredTemplates.map((x) => x.id)))}
                >
                  全选
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setBulkSelection(new Set())}>
                  清空
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() =>
                    void (async () => {
                      const ids = [...bulkSelection];
                      if (!ids.length) return;
                      if (!window.confirm(`确定删除选中 ${ids.length} 个章模板？`)) return;
                      await Promise.all(ids.map((id) => deleteBibleChapterTemplate(id)));
                      await refresh();
                      setBulkSelection(new Set());
                      setBulkMode(false);
                    })()
                  }
                >
                  删除
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => clearBulk()}>
                  退出
                </Button>
              </div>
            )}
          </div>
          <ul className="bible-card-list">
            {filteredTemplates.map((t) => (
              <li
                key={t.id}
                className={cn(
                  "bible-card relative",
                  highlightEntryId === t.id && "ring-2 ring-primary/50 bg-primary/5",
                )}
                data-bible-entry={t.id}
              >
                {bulkMode ? (
                  <button
                    type="button"
                    onClick={() => toggleBulkSelect(t.id)}
                    className={cn(
                      "absolute left-3 top-3 z-10 flex h-6 w-6 items-center justify-center rounded-md border",
                      bulkSelection.has(t.id)
                        ? "border-primary/40 bg-primary/15 text-primary"
                        : "border-border/60 bg-background/60 text-muted-foreground hover:bg-background",
                    )}
                    aria-label={bulkSelection.has(t.id) ? "取消选择" : "选择"}
                  >
                    {bulkSelection.has(t.id) ? "✓" : null}
                  </button>
                ) : null}
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
          <div className="flex flex-wrap items-center gap-2">
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
            <input
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="搜索（术语/备注）…"
              className="h-9 w-[min(24rem,70vw)] rounded-md border border-border bg-background px-3 text-sm"
            />
            {!bulkMode ? (
              <Button type="button" size="sm" variant="outline" onClick={() => setBulkMode(true)}>
                批量
              </Button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">已选 {bulkSelection.size}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setBulkSelection(new Set(filteredGlossary.map((x) => x.id)))}
                >
                  全选
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setBulkSelection(new Set())}>
                  清空
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() =>
                    void (async () => {
                      const ids = [...bulkSelection];
                      if (!ids.length) return;
                      if (!window.confirm(`确定删除选中 ${ids.length} 个术语？`)) return;
                      await Promise.all(ids.map((id) => deleteBibleGlossaryTerm(id)));
                      await refresh();
                      setBulkSelection(new Set());
                      setBulkMode(false);
                    })()
                  }
                >
                  删除
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => clearBulk()}>
                  退出
                </Button>
              </div>
            )}
          </div>
          <ul className="bible-card-list">
            {filteredGlossary.map((g) => (
              <li
                key={g.id}
                className={cn(
                  "bible-card relative",
                  highlightEntryId === g.id && "ring-2 ring-primary/50 bg-primary/5",
                )}
                data-bible-entry={g.id}
              >
                {bulkMode ? (
                  <button
                    type="button"
                    onClick={() => toggleBulkSelect(g.id)}
                    className={cn(
                      "absolute left-3 top-3 z-10 flex h-6 w-6 items-center justify-center rounded-md border",
                      bulkSelection.has(g.id)
                        ? "border-primary/40 bg-primary/15 text-primary"
                        : "border-border/60 bg-background/60 text-muted-foreground hover:bg-background",
                    )}
                    aria-label={bulkSelection.has(g.id) ? "取消选择" : "选择"}
                  >
                    {bulkSelection.has(g.id) ? "✓" : null}
                  </button>
                ) : null}
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
          <div className="flex flex-wrap items-center gap-2">
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
            <input
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="搜索（标题/分类/正文）…"
              className="h-9 w-[min(24rem,70vw)] rounded-md border border-border bg-background px-3 text-sm"
            />
            {!bulkMode ? (
              <Button type="button" size="sm" variant="outline" onClick={() => setBulkMode(true)}>
                批量
              </Button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">已选 {bulkSelection.size}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setBulkSelection(new Set(filteredPromptTemplates.map((x) => x.id)))}
                >
                  全选
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setBulkSelection(new Set())}>
                  清空
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() =>
                    void (async () => {
                      const ids = [...bulkSelection];
                      if (!ids.length) return;
                      if (!window.confirm(`确定删除选中 ${ids.length} 个 Prompt 模板？`)) return;
                      await Promise.all(ids.map((id) => deleteWritingPromptTemplate(id)));
                      await refresh();
                      setBulkSelection(new Set());
                      setBulkMode(false);
                    })()
                  }
                >
                  删除
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => clearBulk()}>
                  退出
                </Button>
              </div>
            )}
          </div>
          <ul className="bible-card-list">
            {filteredPromptTemplates.map((p) => (
              <li
                key={p.id}
                className={cn(
                  "bible-card relative",
                  highlightEntryId === p.id && "ring-2 ring-primary/50 bg-primary/5",
                )}
                data-bible-entry={p.id}
              >
                {bulkMode ? (
                  <button
                    type="button"
                    onClick={() => toggleBulkSelect(p.id)}
                    className={cn(
                      "absolute left-3 top-3 z-10 flex h-6 w-6 items-center justify-center rounded-md border",
                      bulkSelection.has(p.id)
                        ? "border-primary/40 bg-primary/15 text-primary"
                        : "border-border/60 bg-background/60 text-muted-foreground hover:bg-background",
                    )}
                    aria-label={bulkSelection.has(p.id) ? "取消选择" : "选择"}
                  >
                    {bulkSelection.has(p.id) ? "✓" : null}
                  </button>
                ) : null}
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
          <div className="flex flex-wrap items-center gap-2">
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
            <input
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="搜索（标题/正文）…"
              className="h-9 w-[min(24rem,70vw)] rounded-md border border-border bg-background px-3 text-sm"
            />
            {!bulkMode ? (
              <Button type="button" size="sm" variant="outline" onClick={() => setBulkMode(true)}>
                批量
              </Button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">已选 {bulkSelection.size}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setBulkSelection(new Set(filteredStyleSamples.map((x) => x.id)))}
                >
                  全选
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setBulkSelection(new Set())}>
                  清空
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() =>
                    void (async () => {
                      const ids = [...bulkSelection];
                      if (!ids.length) return;
                      if (!window.confirm(`确定删除选中 ${ids.length} 个笔感样本？`)) return;
                      await Promise.all(ids.map((id) => deleteWritingStyleSample(id)));
                      await refresh();
                      setBulkSelection(new Set());
                      setBulkMode(false);
                    })()
                  }
                >
                  删除
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => clearBulk()}>
                  退出
                </Button>
              </div>
            )}
          </div>
          <ul className="bible-card-list">
            {filteredStyleSamples.map((s) => (
              <li
                key={s.id}
                className={cn(
                  "bible-card relative",
                  highlightEntryId === s.id && "ring-2 ring-primary/50 bg-primary/5",
                )}
                data-bible-entry={s.id}
              >
                {bulkMode ? (
                  <button
                    type="button"
                    onClick={() => toggleBulkSelect(s.id)}
                    className={cn(
                      "absolute left-3 top-3 z-10 flex h-6 w-6 items-center justify-center rounded-md border",
                      bulkSelection.has(s.id)
                        ? "border-primary/40 bg-primary/15 text-primary"
                        : "border-border/60 bg-background/60 text-muted-foreground hover:bg-background",
                    )}
                    aria-label={bulkSelection.has(s.id) ? "取消选择" : "选择"}
                  >
                    {bulkSelection.has(s.id) ? "✓" : null}
                  </button>
                ) : null}
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
