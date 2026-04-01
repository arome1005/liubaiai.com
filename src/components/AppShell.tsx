import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RightRailContext, type RightRailTab, type RightRailTabId } from "./RightRailContext";
import { getWork, listChapters } from "../db/repo";
import { wordCount } from "../util/wordCount";
import type { Chapter, Work } from "../db/types";
import { TopbarContext } from "./TopbarContext";

const LS_RIGHT_OPEN = "liubai:rightRailOpen";
const LS_RIGHT_TAB = "liubai:rightRailTab";
const LS_RIGHT_W_PX = "liubai:rightRailWidthPx";
const LS_LAST_WORK = "liubai:lastWorkId";

function safeBool(v: string | null, fallback: boolean): boolean {
  if (v === "1") return true;
  if (v === "0") return false;
  return fallback;
}

export function workIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/work\/([^/]+)(?:\/|$)/);
  return m?.[1] ?? null;
}

function sectionLabelFromPath(pathname: string): string {
  if (pathname === "/") return "首页";
  if (pathname === "/library") return "留白";
  if (pathname.startsWith("/reference")) return "藏经";
  if (pathname.startsWith("/settings")) return "设置";
  if (pathname.startsWith("/logic")) return "推演";
  if (pathname.startsWith("/inspiration")) return "流光";
  if (pathname.startsWith("/chat")) return "问策";
  if (pathname.includes("/bible")) return "落笔";
  if (pathname.includes("/summary")) return "概要";
  if (pathname.startsWith("/work/")) return "生辉";
  return "留白写作";
}

function SettingsGearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function AppShell() {
  const loc = useLocation();
  const pathname = loc.pathname;
  const workIdInPath = useMemo(() => workIdFromPath(pathname), [pathname]);
  const workId = useMemo(() => {
    const inPath = workIdFromPath(pathname);
    if (inPath) return inPath;
    try {
      return localStorage.getItem(LS_LAST_WORK);
    } catch {
      return null;
    }
  }, [pathname]);
  const section = useMemo(() => sectionLabelFromPath(pathname), [pathname]);

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
    localStorage.setItem(LS_RIGHT_OPEN, rightOpen ? "1" : "0");
  }, [rightOpen]);
  useEffect(() => {
    localStorage.setItem(LS_RIGHT_TAB, activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (!workIdInPath) {
      setCurWork(null);
      setCurChapters([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const w = await getWork(workIdInPath);
      const ch = await listChapters(workIdInPath);
      if (cancelled) return;
      setCurWork(w ?? null);
      setCurChapters(ch);
    })();
    return () => {
      cancelled = true;
    };
  }, [workIdInPath]);

  useEffect(() => {
    if (!workIdInPath) return;
    try {
      localStorage.setItem(LS_LAST_WORK, workIdInPath);
    } catch {
      /* ignore */
    }
  }, [workIdInPath]);
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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
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

  const hubPaths = useMemo(() => new Set(["/", "/library", "/logic", "/inspiration", "/chat"]), []);
  const showPageTopbar = !hubPaths.has(pathname) || topbarTitleNode != null;

  const mastheadNavClass = (extra: string) => `app-masthead-link${extra}`;

  return (
    <TopbarContext.Provider value={topbarApi}>
      <RightRailContext.Provider value={rightRailApi}>
        <div
          style={{ ["--shell-right-w" as any]: `${rightWidthPx}px` }}
          className={"app-shell" + (!rightOpen ? " app-shell--right-closed" : "")}
        >
          <div className="app-body">
            <header className="app-masthead" aria-label="主导航">
              <div className="app-masthead-left">
                <Link to="/" className="app-masthead-brand" title="首页">
                  <img className="app-masthead-mark" src="/favicon.svg" alt="" width={26} height={26} />
                  <span className="app-masthead-brand-text">留白写作</span>
                </Link>
              </div>

              <nav className="app-masthead-center" aria-label="核心功能">
                <NavLink
                  end
                  to="/library"
                  className={({ isActive }) => mastheadNavClass(isActive ? " active" : "")}
                >
                  留白
                </NavLink>
                <NavLink to="/logic" className={({ isActive }) => mastheadNavClass(isActive ? " active" : "")}>
                  推演
                </NavLink>
                <NavLink to="/inspiration" className={({ isActive }) => mastheadNavClass(isActive ? " active" : "")}>
                  流光
                </NavLink>
                <NavLink to="/chat" className={({ isActive }) => mastheadNavClass(isActive ? " active" : "")}>
                  问策
                </NavLink>
                {workId ? (
                  <NavLink
                    to={`/work/${workId}/bible`}
                    className={({ isActive }) => mastheadNavClass(isActive ? " active" : "")}
                  >
                    落笔
                  </NavLink>
                ) : (
                  <Link to="/library" className="app-masthead-link" title="请先在作品库打开或创建作品">
                    落笔
                  </Link>
                )}
                {workId ? (
                  <NavLink
                    end
                    to={`/work/${workId}`}
                    className={({ isActive }) => mastheadNavClass(isActive ? " active" : "")}
                  >
                    生辉
                  </NavLink>
                ) : (
                  <Link to="/library" className="app-masthead-link" title="请先在作品库打开或创建作品">
                    生辉
                  </Link>
                )}
                <NavLink to="/reference" className={({ isActive }) => mastheadNavClass(isActive ? " active" : "")}>
                  藏经
                </NavLink>
              </nav>

              <div className="app-masthead-right">
                <Link to="/settings" className="icon-btn app-masthead-settings" title="设置" aria-label="设置">
                  <SettingsGearIcon />
                </Link>
                <button
                  type="button"
                  className="btn small app-masthead-rail"
                  onClick={() => setRightOpen((v) => !v)}
                  title="右侧栏（宽屏常驻，小屏抽屉）"
                >
                  {rightOpen ? "关闭右栏" : "打开右栏"}
                </button>
              </div>
            </header>

            {workIdInPath ? (
              <div className="app-work-subnav" aria-label="当前作品">
                <div className="app-work-subnav-meta">
                  {curWork ? (
                    <>
                      <span className="app-work-subnav-title" title={curWork.title}>
                        {curWork.title}
                      </span>
                      <span className="muted small">
                        {curBookWords.toLocaleString()} 字
                        {curProgressTitle ? ` · ${curProgressTitle}` : ""}
                      </span>
                    </>
                  ) : (
                    <span className="muted small">加载中…</span>
                  )}
                </div>
                <nav className="app-work-subnav-links">
                  <NavLink
                    end
                    to={`/work/${workIdInPath}`}
                    className={({ isActive }) => "app-work-subnav-item" + (isActive ? " active" : "")}
                  >
                    写作
                  </NavLink>
                  <NavLink
                    to={`/work/${workIdInPath}/summary`}
                    className={({ isActive }) => "app-work-subnav-item" + (isActive ? " active" : "")}
                  >
                    概要
                  </NavLink>
                  <NavLink
                    to={`/work/${workIdInPath}/bible`}
                    className={({ isActive }) => "app-work-subnav-item" + (isActive ? " active" : "")}
                  >
                    圣经
                  </NavLink>
                  <Link to="/library" className="app-work-subnav-item muted">
                    作品库
                  </Link>
                </nav>
              </div>
            ) : null}

            {showPageTopbar ? (
              <header className="app-topbar" aria-label="页面顶栏">
                <div className="app-topbar-left">
                  <div className="app-topbar-title">
                    {topbarTitleNode ? (
                      topbarTitleNode
                    ) : (
                      <>
                        <strong>{section}</strong>
                        {workIdInPath ? <span className="muted small"> · {workIdInPath.slice(0, 6)}</span> : null}
                      </>
                    )}
                  </div>
                </div>

                <div className="app-topbar-actions">{topbarActionsNode}</div>
              </header>
            ) : null}

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
                    <Link className="btn small" to="/library">
                      作品库
                    </Link>
                    <Link className="btn small" to="/reference">
                      藏经
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
