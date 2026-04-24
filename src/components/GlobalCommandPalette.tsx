import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  listBibleCharacters,
  listBibleWorldEntries,
  listBibleGlossaryTerms,
  listBibleTimelineEvents,
  listChapters,
  listReferenceLibrary,
  listWorks,
} from "../db/repo";
import { workPathSegment } from "../util/work-url";
import { cn } from "../lib/utils";
import { shortcutModifierSymbol } from "../util/keyboardHints";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";

type CommandRow = {
  id: string;
  label: string;
  /** 空格分词，供筛选 */
  keywords: string;
  path: string;
  group: string;
  hint?: string;
};

function CommandPaletteSearchIcon() {
  return (
    <svg
      className="h-5 w-5 shrink-0 text-muted-foreground"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function normalizeQuery(s: string): string {
  return s.trim().toLowerCase();
}

function rowMatches(row: CommandRow, q: string): boolean {
  if (!q) return true;
  const hay = `${row.label} ${row.keywords} ${row.group}`.toLowerCase();
  const parts = q.split(/\s+/).filter(Boolean);
  return parts.every((p) => hay.includes(p));
}

function buildStaticRows(workId: string | null, workPathSeg: string | null): CommandRow[] {
  const seg = workPathSeg ?? workId;
  const base: CommandRow[] = [
    {
      id: "home",
      label: "首页",
      keywords: "hub 最近",
      path: "/",
      group: "跳转",
      hint: "Hub",
    },
    {
      id: "library",
      label: "作品库",
      keywords: "搜索 管理 书 新建 导入",
      path: "/library",
      group: "跳转",
      hint: "留白",
    },
    {
      id: "reference",
      label: "藏经",
      keywords: "参考 资料 书目",
      path: "/reference",
      group: "跳转",
      hint: "7",
    },
    {
      id: "settings",
      label: "设置",
      keywords: "备份 隐私 模型",
      path: "/settings",
      group: "跳转",
    },
    {
      id: "logic",
      label: "推演",
      keywords: "分支 扫描",
      path: "/logic",
      group: "创作工具",
      hint: "2",
    },
    {
      id: "inspiration",
      label: "流光",
      keywords: "灵感 碎片 速记",
      path: "/inspiration",
      group: "创作工具",
      hint: "3",
    },
    {
      id: "chat",
      label: "问策",
      keywords: "对话 策划",
      path: "/chat",
      group: "创作工具",
      hint: "4",
    },
    {
      id: "luobi-hub",
      label: "落笔 · 创作工具箱",
      keywords: "提示词 锦囊 世界观 风格卡 词典 落笔",
      path: "/luobi",
      group: "创作工具",
      hint: "5",
    },
    {
      id: "luobi-gen-title",
      label: "落笔 · 书名生成器",
      keywords: "书名 起名 标题",
      path: "/luobi/generate/book-title",
      group: "创作工具",
    },
    {
      id: "luobi-gen-blurb",
      label: "落笔 · 简介生成器",
      keywords: "简介 文案 卖点",
      path: "/luobi/generate/blurb",
      group: "创作工具",
    },
    {
      id: "luobi-gen-names",
      label: "落笔 · NPC 命名",
      keywords: "人名 地名 势力 命名 NPC",
      path: "/luobi/generate/names",
      group: "创作工具",
    },
    {
      id: "sheng-hui",
      label: "生辉",
      keywords: "设定 约束",
      path: "/sheng-hui",
      group: "创作工具",
      hint: "6",
    },
    {
      id: "prompts",
      label: "提示词库",
      keywords: "提示词 模板 prompt template 续写 大纲 风格",
      path: "/prompts",
      group: "创作工具",
    },
    {
      id: "login",
      label: "登录 / 注册入口",
      keywords: "账号 密码",
      path: "/login",
      group: "账户",
    },
    {
      id: "privacy",
      label: "隐私政策",
      keywords: "协议",
      path: "/privacy",
      group: "其他",
    },
    {
      id: "terms",
      label: "用户条款",
      keywords: "协议",
      path: "/terms",
      group: "其他",
    },
  ];
  if (workId && seg) {
    base.splice(2, 0, {
      id: "write",
      label: "写作（当前作品）",
      keywords: "编辑 正文 章节",
      path: `/work/${seg}`,
      group: "当前作品",
    });
    base.splice(3, 0, {
      id: "summary",
      label: "概要总览",
      keywords: "章 摘要",
      path: `/work/${seg}/summary`,
      group: "当前作品",
    });
    base.splice(4, 0, {
      id: "bible",
      label: "本书锦囊",
      keywords: "落笔 设定 人物 术语",
      path: `/work/${seg}/bible`,
      group: "当前作品",
      hint: "5",
    });
  }
  return base;
}

export function GlobalCommandPalette(props: {
  open: boolean;
  onClose: () => void;
  /** 作品内部 UUID，用于本书锦囊等查询 */
  workId: string | null;
  /**
   * `/work/{段}/…` 使用书号或 UUID；未传时与 workId 相同。
   * 书号路径下应为 URL 段（如 `"123456"`），与 workId 可成对由路由解析得到。
   */
  workPathSeg?: string | null;
}) {
  const { open, onClose, workId, workPathSeg } = props;
  const pathSeg = workPathSeg ?? workId;
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [indexRows, setIndexRows] = useState<CommandRow[]>([]);
  const [indexLoading, setIndexLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const mod = shortcutModifierSymbol();

  const staticRows = useMemo(() => buildStaticRows(workId, pathSeg), [workId, pathSeg]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setIndexLoading(true);
    });
    void (async () => {
      try {
        const works = await listWorks();
        if (cancelled) return;
        const workRows: CommandRow[] = works.map((w) => ({
          id: `work-${w.id}`,
          label: w.title,
          keywords: `${w.title} ${(w.tags ?? []).join(" ")} 作品 书`,
          path: `/work/${workPathSegment(w)}`,
          group: "作品",
        }));
        const chapterBatches = await Promise.all(
          works.map(async (w) => {
            const chs = await listChapters(w.id);
            const seg = workPathSegment(w);
            return chs.map((c) => ({
              id: `ch-${c.id}`,
              label: `${w.title} · ${c.title}`,
              keywords: `${w.title} ${c.title} 章节 正文`,
              path: `/work/${seg}?chapter=${encodeURIComponent(c.id)}`,
              group: "章节",
            }));
          }),
        );

        // 本书锦囊条目（当前 workId）：条目级跳转与定位
        const bibleRows: CommandRow[] = [];
        if (workId && pathSeg) {
          const [chars, world, glossary, timeline] = await Promise.all([
            listBibleCharacters(workId),
            listBibleWorldEntries(workId),
            listBibleGlossaryTerms(workId),
            listBibleTimelineEvents(workId),
          ]);
          for (const c of chars.slice(0, 120)) {
            bibleRows.push({
              id: `bible-char-${c.id}`,
              label: `锦囊 · 人物 · ${c.name}`,
              keywords: `${c.name} 人物 锦囊 设定`,
              path: `/work/${pathSeg}/bible?tab=characters&entry=${encodeURIComponent(c.id)}`,
              group: "锦囊（当前作品）",
            });
          }
          for (const w of world.slice(0, 120)) {
            bibleRows.push({
              id: `bible-world-${w.id}`,
              label: `锦囊 · 世界观 · ${w.title}`,
              keywords: `${w.title} ${w.entryKind} 世界观 锦囊 设定`,
              path: `/work/${pathSeg}/bible?tab=world&entry=${encodeURIComponent(w.id)}`,
              group: "锦囊（当前作品）",
            });
          }
          for (const g of glossary.slice(0, 160)) {
            bibleRows.push({
              id: `bible-glossary-${g.id}`,
              label: `锦囊 · 术语 · ${g.term}`,
              keywords: `${g.term} 术语 词典 锦囊 设定`,
              path: `/work/${pathSeg}/bible?tab=glossary&entry=${encodeURIComponent(g.id)}`,
              group: "锦囊（当前作品）",
            });
          }
          for (const ev of timeline.slice(0, 160)) {
            bibleRows.push({
              id: `bible-time-${ev.id}`,
              label: `锦囊 · 时间线 · ${ev.label}`,
              keywords: `${ev.label} 时间线 锦囊 设定`,
              path: `/work/${pathSeg}/bible?tab=timeline&entry=${encodeURIComponent(ev.id)}`,
              group: "锦囊（当前作品）",
            });
          }
        }

        // 藏经书目（全局）：条目级跳转
        const refRows: CommandRow[] = [];
        try {
          const refs = await listReferenceLibrary();
          for (const r of refs.slice(0, 200)) {
            refRows.push({
              id: `ref-${r.id}`,
              label: `藏经 · ${r.title}`,
              keywords: `${r.title} 藏经 参考 资料`,
              path: `/reference?ref=${encodeURIComponent(r.id)}&ord=0`,
              group: "藏经",
            });
          }
        } catch {
          // ignore
        }

        if (!cancelled) {
          setIndexRows([...workRows, ...chapterBatches.flat(), ...bibleRows, ...refRows]);
          setIndexLoading(false);
        }
      } catch {
        if (!cancelled) {
          setIndexRows([]);
          setIndexLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, workId, pathSeg]);

  const rows = useMemo(() => [...staticRows, ...indexRows], [staticRows, indexRows]);

  const filtered = useMemo(() => {
    const nq = normalizeQuery(q);
    return rows.filter((r) => rowMatches(r, nq));
  }, [rows, q]);

  useLayoutEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setQ("");
      setActive(0);
    });
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    queueMicrotask(() => {
      setActive((i) => {
        if (filtered.length === 0) return 0;
        return Math.min(i, filtered.length - 1);
      });
    });
  }, [filtered.length]);

  const run = useCallback(
    (path: string) => {
      navigate(path);
      onClose();
    },
    [navigate, onClose],
  );

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-cmd-index="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const onListKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => (filtered.length === 0 ? 0 : (i + 1) % filtered.length));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) =>
          filtered.length === 0 ? 0 : (i - 1 + filtered.length) % filtered.length,
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        const row = filtered[active];
        if (row) run(row.path);
      }
    },
    [active, filtered, run],
  );

  if (!open) return null;

  const sections: { type: "label" | "row"; group?: string; row?: CommandRow; index?: number }[] = [];
  let prevGroup = "";
  filtered.forEach((row, index) => {
    if (row.group !== prevGroup) {
      sections.push({ type: "label", group: row.group });
      prevGroup = row.group;
    }
    sections.push({ type: "row", row, index });
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        overlayClassName="command-palette-dialog-overlay"
        aria-describedby={undefined}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        className={cn(
          "fixed z-[var(--z-command-content)] flex max-h-[min(72vh,28rem)] w-[min(32rem,calc(100%-2rem))] flex-col gap-0 overflow-hidden border-0 bg-transparent p-0 shadow-none",
          "left-[50%] top-[max(4rem,9vh)] translate-x-[-50%] translate-y-0",
          "sm:max-w-none",
        )}
      >
        <div className="command-palette-dialog">
          <div className="command-palette-head">
            <DialogTitle id="command-palette-title" className="command-palette-title">
              搜索与命令
            </DialogTitle>
            <p className="command-palette-lead muted small">
              搜索本地<strong>作品名、标签、章节标题</strong>，或筛选模块跳转；
              <kbd className="command-palette-kbd">{mod}</kbd>+<kbd className="command-palette-kbd">K</kbd>{" "}
              开关（正文码字区不抢键时请用顶栏入口或先失焦）。
            </p>
            <div className="command-palette-search-row">
              <CommandPaletteSearchIcon />
              <div className="command-palette-input-wrap">
                <div
                  className={cn(
                    "flex h-10 w-full items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-2.5",
                    "focus-within:ring-2 focus-within:ring-ring/35",
                  )}
                >
                  <Input
                    ref={inputRef}
                    type="search"
                    placeholder="搜索作品、章节或输入跳转关键字…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={onListKeyDown}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    className={cn(
                      "h-9 flex-1 border-0 bg-transparent px-0 text-[0.95rem] text-foreground shadow-none",
                      "placeholder:text-muted-foreground",
                      "focus-visible:ring-0 focus-visible:ring-offset-0",
                    )}
                  />
                </div>
              </div>
              <span className="command-palette-esc" title="按 Esc 关闭">
                Esc
              </span>
            </div>
          </div>
          <div ref={listRef} className="command-palette-list" role="listbox" aria-label="匹配项">
            {filtered.length === 0 ? (
              <p className="command-palette-empty muted small">无匹配项</p>
            ) : (
              sections.map((s, i) =>
                s.type === "label" ? (
                  <div key={`g-${i}-${s.group}`} className="command-palette-group-label">
                    {s.group}
                  </div>
                ) : (
                  <button
                    key={s.row!.id}
                    type="button"
                    role="option"
                    aria-selected={s.index === active}
                    data-cmd-index={s.index}
                    className={"command-palette-item" + (s.index === active ? " is-active" : "")}
                    onMouseEnter={() => setActive(s.index!)}
                    onClick={() => run(s.row!.path)}
                  >
                    <span className="command-palette-item-label">{s.row!.label}</span>
                    {s.row!.hint ? (
                      <span className="command-palette-item-hint" aria-hidden>
                        {s.row!.hint}
                      </span>
                    ) : null}
                  </button>
                ),
              )
            )}
          </div>
          <p className="command-palette-footer muted small">
            {indexLoading ? "正在加载作品与章节索引… · " : null}
            ↑↓ 选择 · Enter 打开 · Esc 关闭
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
