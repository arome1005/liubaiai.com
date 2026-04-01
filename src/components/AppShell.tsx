import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { getWork, listChapters } from "../db/repo";
import { wordCount } from "../util/wordCount";
import type { Chapter, Work } from "../db/types";

const LS_LAST_WORK = "liubai:lastWorkId";

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
  if (pathname.startsWith("/sheng-hui")) return "生辉";
  if (pathname.includes("/bible")) return "落笔";
  if (pathname.includes("/summary")) return "概要";
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

/** 全局壳：顶栏七导航等。AI 右侧栏仅在 {@link EditorShell}（写作页）中提供。 */
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

  const [curWork, setCurWork] = useState<Work | null>(null);
  const [curChapters, setCurChapters] = useState<Chapter[]>([]);
  const curBookWords = useMemo(() => {
    if (!curChapters.length) return 0;
    return curChapters.reduce((s, c) => s + (c.wordCountCache ?? wordCount(c.content)), 0);
  }, [curChapters]);
  const curProgressTitle = useMemo(() => {
    if (!curWork?.progressCursor) return "";
    return curChapters.find((c) => c.id === curWork.progressCursor)?.title ?? "";
  }, [curWork?.progressCursor, curChapters]);

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

  const hubPaths = useMemo(() => new Set(["/", "/library", "/logic", "/inspiration", "/chat", "/sheng-hui"]), []);
  const showPageTopbar = !hubPaths.has(pathname);

  const mastheadNavClass = (extra: string) => `app-masthead-link${extra}`;

  return (
    <div className="app-shell app-shell--app">
      <div className="app-body">
        <header className="app-masthead" aria-label="主导航">
          <div className="app-masthead-left">
            <Link to="/" className="app-masthead-brand" title="首页">
              <img className="app-masthead-mark" src="/favicon.svg" alt="" width={26} height={26} />
              <span className="app-masthead-brand-text">留白写作</span>
            </Link>
          </div>

          <nav className="app-masthead-center" aria-label="核心功能">
            <NavLink end to="/library" className={({ isActive }) => mastheadNavClass(isActive ? " active" : "")}>
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
              <NavLink to={`/work/${workId}/bible`} className={({ isActive }) => mastheadNavClass(isActive ? " active" : "")}>
                落笔
              </NavLink>
            ) : (
              <Link to="/library" className="app-masthead-link" title="请先在作品库打开或创建作品">
                落笔
              </Link>
            )}
            <NavLink to="/sheng-hui" className={({ isActive }) => mastheadNavClass(isActive ? " active" : "")}>
              生辉
            </NavLink>
            <NavLink to="/reference" className={({ isActive }) => mastheadNavClass(isActive ? " active" : "")}>
              藏经
            </NavLink>
          </nav>

          <div className="app-masthead-right">
            <Link to="/settings" className="icon-btn app-masthead-settings" title="设置" aria-label="设置">
              <SettingsGearIcon />
            </Link>
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
                <strong>{section}</strong>
                {workIdInPath ? <span className="muted small"> · {workIdInPath.slice(0, 6)}</span> : null}
              </div>
            </div>
          </header>
        ) : null}

        <main className="app-main" aria-label="主内容">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
