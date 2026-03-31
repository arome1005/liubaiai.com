import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RightRailContext, type RightRailTab, type RightRailTabId } from "./RightRailContext";
import { getWork, listChapters } from "../db/repo";
import { wordCount } from "../util/wordCount";
import type { Chapter, Work } from "../db/types";
import { TopbarContext } from "./TopbarContext";

const LS_RIGHT_OPEN = "liubai:rightRailOpen";
const LS_NAV_COLLAPSED = "liubai:navCollapsed";
const LS_RIGHT_TAB = "liubai:rightRailTab";
const LS_RIGHT_W_PX = "liubai:rightRailWidthPx";
const LS_LAST_WORK = "liubai:lastWorkId";

function safeBool(v: string | null, fallback: boolean): boolean {
  if (v === "1") return true;
  if (v === "0") return false;
  return fallback;
}

function workIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/work\/([^/]+)(?:\/|$)/);
  return m?.[1] ?? null;
}

function sectionLabelFromPath(pathname: string): string {
  if (pathname === "/") return "作品";
  if (pathname.startsWith("/reference")) return "参考库";
  if (pathname.startsWith("/settings")) return "设置";
  if (pathname.includes("/bible")) return "圣经";
  if (pathname.includes("/summary")) return "概要";
  if (pathname.startsWith("/work/")) return "写作";
  return "留白写作";
}

export function AppShell() {
  const loc = useLocation();
  const workId = useMemo(() => {
    const inPath = workIdFromPath(loc.pathname);
    if (inPath) return inPath;
    try {
      return localStorage.getItem(LS_LAST_WORK);
    } catch {
      return null;
    }
  }, [loc.pathname]);
  const section = useMemo(() => sectionLabelFromPath(loc.pathname), [loc.pathname]);

  const [navCollapsed, setNavCollapsed] = useState<boolean>(() => safeBool(localStorage.getItem(LS_NAV_COLLAPSED), false));
  const [navOpenMobile, setNavOpenMobile] = useState(false);
  const [rightOpen, setRightOpen] = useState<boolean>(() => safeBool(localStorage.getItem(LS_RIGHT_OPEN), false));
  const [rightWidthPx, setRightWidthPx] = useState<number>(() => {
    const n = Number(localStorage.getItem(LS_RIGHT_W_PX));
    if (!Number.isFinite(n)) return 360;
    return Math.max(280, Math.min(560, Math.floor(n)));
  });

  const [activeTab, setActiveTab] = useState<RightRailTabId>(() => {
    const v = localStorage.getItem(LS_RIGHT_TAB) as RightRailTabId | null;
    return v === "ai" || v === "summary" || v === "bible" || v === "ref" ? v : "ai";
  });
  const [tabs, setTabs] = useState<RightRailTab[]>(() => [
    { id: "ai", label: "AI", icon: "✨", content: null, enabled: true },
    { id: "summary", label: "概要", icon: "🗂", content: null, enabled: true },
    { id: "bible", label: "圣经", icon: "📖", content: null, enabled: true },
    { id: "ref", label: "参考", icon: "📎", content: null, enabled: true },
  ]);

  const [curWork, setCurWork] = useState<Work | null>(null);
  const [curChapters, setCurChapters] = useState<Chapter[]>([]);
  const [topbarTitleNode, setTopbarTitleNode] = useState<React.ReactNode | null>(null);
  const [topbarActionsNode, setTopbarActionsNode] = useState<React.ReactNode | null>(null);
  const curBookWords = useMemo(() => {
    if (!curChapters.length) return 0;
    return curChapters.reduce((s, c) => s + (c.wordCountCache ?? wordCount(c.content)), 0);
  }, [curChapters]);
  const curProgressTitle = useMemo(() => {
    if (!curWork?.progressCursor) return "";
    return curChapters.find((c) => c.id === curWork.progressCursor)?.title ?? "";
  }, [curWork?.progressCursor, curChapters]);

  useEffect(() => {
    localStorage.setItem(LS_NAV_COLLAPSED, navCollapsed ? "1" : "0");
  }, [navCollapsed]);
  useEffect(() => {
    localStorage.setItem(LS_RIGHT_OPEN, rightOpen ? "1" : "0");
  }, [rightOpen]);
  useEffect(() => {
    localStorage.setItem(LS_RIGHT_TAB, activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (!workId) {
      setCurWork(null);
      setCurChapters([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const w = await getWork(workId);
      const ch = await listChapters(workId);
      if (cancelled) return;
      setCurWork(w ?? null);
      setCurChapters(ch);
    })();
    return () => {
      cancelled = true;
    };
  }, [workId]);

  useEffect(() => {
    const inPath = workIdFromPath(loc.pathname);
    if (!inPath) return;
    try {
      localStorage.setItem(LS_LAST_WORK, inPath);
    } catch {
      /* ignore */
    }
  }, [loc.pathname]);
  useEffect(() => {
    localStorage.setItem(LS_RIGHT_W_PX, String(rightWidthPx));
  }, [rightWidthPx]);

  const draggingRef = useRef<null | { startX: number; startW: number }>(null);
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!draggingRef.current) return;
      const dx = draggingRef.current.startX - e.clientX;
      const next = Math.max(280, Math.min(560, Math.floor(draggingRef.current.startW + dx)));
      setRightWidthPx(next);
    }
    function onUp() {
      draggingRef.current = null;
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // Close mobile nav when route changes
  useEffect(() => {
    setNavOpenMobile(false);
  }, [loc.pathname]);

  // ESC closes drawers (mobile nav / right rail drawer)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setNavOpenMobile(false);
      setRightOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const setTabEnabled = useCallback((id: RightRailTabId, enabled: boolean) => {
    setTabs((prev) => {
      const cur = prev.find((t) => t.id === id);
      if (!cur || cur.enabled === enabled) return prev;
      return prev.map((t) => (t.id === id ? { ...t, enabled } : t));
    });
  }, []);

  const setTabContent = useCallback((id: RightRailTabId, node: React.ReactNode | null) => {
    setTabs((prev) => {
      const cur = prev.find((t) => t.id === id);
      if (!cur || cur.content === node) return prev;
      return prev.map((t) => (t.id === id ? { ...t, content: node } : t));
    });
  }, []);

  const currentTab = tabs.find((t) => t.id === activeTab) ?? tabs[0]!;
  const currentContent = currentTab?.content ?? null;

  const topbarApi = useMemo(
    () => ({ setTitleNode: setTopbarTitleNode, setActionsNode: setTopbarActionsNode }),
    [],
  );
  const rightRailApi = useMemo(
    () => ({
      tabs,
      activeTab,
      setActiveTab,
      setTabEnabled,
      setTabContent,
      open: rightOpen,
      setOpen: setRightOpen,
    }),
    [tabs, activeTab, rightOpen, setTabEnabled, setTabContent],
  );

  return (
    <TopbarContext.Provider value={topbarApi}>
      <RightRailContext.Provider value={rightRailApi}>
        <div
          style={{ ["--shell-right-w" as any]: `${rightWidthPx}px` }}
          className={
            "app-shell" +
            (navCollapsed ? " app-shell--nav-collapsed" : "") +
            (!rightOpen ? " app-shell--right-closed" : "")
          }
        >
      <div
        className={"app-nav-overlay" + (navOpenMobile ? " open" : "")}
        onClick={() => setNavOpenMobile(false)}
        aria-hidden={!navOpenMobile}
      />

      <aside className={"app-nav" + (navOpenMobile ? " open" : "")} aria-label="主导航">
        <div className="app-brand">
          <Link to="/" className="app-brand-link" title="回到作品库">
            留白写作
          </Link>
        </div>

        <nav className="app-nav-links">
          <NavLink to="/" end className={({ isActive }) => "app-nav-item" + (isActive ? " active" : "")}>
            <span className="app-nav-ico">📚</span>
            <span className="app-nav-text">作品</span>
          </NavLink>
          <NavLink to="/reference" className={({ isActive }) => "app-nav-item" + (isActive ? " active" : "")}>
            <span className="app-nav-ico">📎</span>
            <span className="app-nav-text">参考库</span>
          </NavLink>

          {workId ? (
            <div className="app-nav-group">
              <div className="app-nav-group-title">当前作品</div>
              {curWork ? (
                <div className="app-nav-workmeta">
                  <div className="app-nav-worktitle" title={curWork.title}>
                    {curWork.title}
                  </div>
                  <div className="app-nav-workstats muted small">
                    {curBookWords.toLocaleString()} 字
                    {curProgressTitle ? ` · 进度：${curProgressTitle}` : ""}
                  </div>
                </div>
              ) : null}
              <NavLink to={`/work/${workId}`} end className={({ isActive }) => "app-nav-item" + (isActive ? " active" : "")}>
                <span className="app-nav-ico">✍️</span>
                <span className="app-nav-text">写作</span>
              </NavLink>
              <NavLink
                to={`/work/${workId}/summary`}
                className={({ isActive }) => "app-nav-item" + (isActive ? " active" : "")}
              >
                <span className="app-nav-ico">🗂</span>
                <span className="app-nav-text">概要</span>
              </NavLink>
              <NavLink to={`/work/${workId}/bible`} className={({ isActive }) => "app-nav-item" + (isActive ? " active" : "")}>
                <span className="app-nav-ico">📖</span>
                <span className="app-nav-text">圣经</span>
              </NavLink>
            </div>
          ) : null}

          <NavLink to="/settings" className={({ isActive }) => "app-nav-item" + (isActive ? " active" : "")}>
            <span className="app-nav-ico">⚙️</span>
            <span className="app-nav-text">设置</span>
          </NavLink>
        </nav>

        <div className="app-nav-foot">
          <button type="button" className="btn small" onClick={() => setNavCollapsed((v) => !v)}>
            {navCollapsed ? "展开导航" : "收起导航"}
          </button>
        </div>
      </aside>

      <div className="app-body">
        <header className="app-topbar" aria-label="顶部栏">
          <div className="app-topbar-left">
            <button type="button" className="icon-btn app-topbar-burger" title="打开导航" onClick={() => setNavOpenMobile(true)}>
              ☰
            </button>
            <div className="app-topbar-title">
              {topbarTitleNode ? (
                topbarTitleNode
              ) : (
                <>
                  <strong>{section}</strong>
                  {workId ? <span className="muted small"> · {workId.slice(0, 6)}</span> : null}
                </>
              )}
            </div>
          </div>

          <div className="app-topbar-actions">
            {topbarActionsNode}
            <button
              type="button"
              className="btn small"
              onClick={() => setRightOpen((v) => !v)}
              title="右侧栏（宽屏常驻，小屏抽屉）"
            >
              {rightOpen ? "关闭右栏" : "打开右栏"}
            </button>
          </div>
        </header>

        <main className="app-main" aria-label="主内容">
          <Outlet />
        </main>
      </div>

      <aside className={"app-right" + (rightOpen ? " open" : "")} aria-label="右侧栏">
        <div
          className="app-right-resize"
          role="separator"
          aria-label="调整右侧栏宽度"
          onMouseDown={(e) => {
            e.preventDefault();
            draggingRef.current = { startX: e.clientX, startW: rightWidthPx };
          }}
        />
        <div className="app-right-head">
          <div className="app-right-head-left">
            <strong>{currentTab?.label ?? "面板"}</strong>
          </div>
          <button type="button" className="icon-btn" title="关闭" onClick={() => setRightOpen(false)}>
            ×
          </button>
        </div>
        <div className="app-right-tabs" role="tablist" aria-label="右侧栏标签">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activeTab === t.id}
              className={"app-right-tab" + (activeTab === t.id ? " active" : "")}
              disabled={!t.enabled}
              onClick={() => {
                setActiveTab(t.id);
                setRightOpen(true);
              }}
              title={t.enabled ? t.label : `${t.label}（当前页不可用）`}
            >
              <span className="app-right-tab-ico" aria-hidden>
                {t.icon ?? ""}
              </span>
              <span className="app-right-tab-text">{t.label}</span>
            </button>
          ))}
        </div>
        <div className="app-right-body">
          {currentContent ? (
            currentContent
          ) : (
            <>
              <p className="muted small" style={{ marginTop: 0 }}>
                这里是全局右侧栏。选择上方标签进入对应面板。
              </p>
              <div className="app-right-quick">
                <Link className="btn small" to="/">
                  回作品库
                </Link>
                <Link className="btn small" to="/reference">
                  打开参考库
                </Link>
                <Link className="btn small" to="/settings">
                  设置
                </Link>
              </div>
            </>
          )}
        </div>
      </aside>

      <div
        className={"app-right-overlay" + (rightOpen ? " open" : "")}
        onClick={() => setRightOpen(false)}
        aria-hidden={!rightOpen}
      />
      </div>
      </RightRailContext.Provider>
    </TopbarContext.Provider>
  );
}

