import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { getWork, listChapters } from "../db/repo";
import { useAuthUserState } from "../hooks/useAuthUserState";
import { UserAccountMenu } from "./UserAccountMenu";
import { GlobalCommandPalette } from "./GlobalCommandPalette";
import { shortcutModifierSymbol } from "../util/keyboardHints";
import { wordCount } from "../util/wordCount";
import { resolveDefaultChapterId } from "../util/resolve-default-chapter";
import { isWorkBibleOrSummaryPath, workIdFromPath } from "../util/workPath";
import type { Chapter, Work } from "../db/types";

const LS_LAST_WORK = "liubai:lastWorkId";

function sectionLabelFromPath(pathname: string): string {
  if (pathname === "/") return "首页";
  if (pathname === "/library") return "留白";
  if (pathname.startsWith("/reference")) return "藏经";
  if (pathname.startsWith("/settings")) return "设置";
  if (pathname.startsWith("/login")) return "登录";
  if (pathname.startsWith("/forgot-password")) return "忘记密码";
  if (pathname.startsWith("/reset-password")) return "重置密码";
  if (pathname.startsWith("/logic")) return "推演";
  if (pathname.startsWith("/inspiration")) return "流光";
  if (pathname.startsWith("/chat")) return "问策";
  if (pathname.startsWith("/sheng-hui")) return "生辉";
  if (pathname.includes("/bible")) return "落笔";
  if (pathname.includes("/summary")) return "概要";
  return "留白写作";
}

function MastheadSearchIcon() {
  return (
    <svg className="app-masthead-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function SettingsGearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** v2 顶栏通知位：暂无业务数据，仅占位与无障碍说明 */
function MastheadBellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
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
  /** 非写作路由但 localStorage 有 lastWorkId 时，用于顶栏「最近作品」 */
  const [hubContextWork, setHubContextWork] = useState<Work | null>(null);
  /** 与写作页 session 或进度游标对齐，用于顶栏「最近 · 书名 · 章」 */
  const [hubContextChapter, setHubContextChapter] = useState<{ id: string; title: string } | null>(null);
  const { authUser, refreshAuth } = useAuthUserState(pathname);
  const [commandOpen, setCommandOpen] = useState(false);
  const [moreNavOpen, setMoreNavOpen] = useState(false);
  const moreNavRef = useRef<HTMLDivElement>(null);
  const curBookWords = useMemo(() => {
    if (!curChapters.length) return 0;
    return curChapters.reduce((s, c) => s + (c.wordCountCache ?? wordCount(c.content)), 0);
  }, [curChapters]);
  const curProgressTitle = useMemo(() => {
    if (!curWork?.progressCursor) return "";
    return curChapters.find((c) => c.id === curWork.progressCursor)?.title ?? "";
  }, [curWork, curChapters]);

  useEffect(() => {
    if (!workIdInPath) {
      queueMicrotask(() => {
        setCurWork(null);
        setCurChapters([]);
      });
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
    if (workIdInPath || !workId) {
      queueMicrotask(() => {
        setHubContextWork(null);
        setHubContextChapter(null);
      });
      return;
    }
    let cancelled = false;
    void (async () => {
      const w = await getWork(workId);
      if (cancelled) return;
      setHubContextWork(w ?? null);
      if (!w) {
        setHubContextChapter(null);
        return;
      }
      const chapters = await listChapters(workId);
      if (cancelled) return;
      const cid = resolveDefaultChapterId(workId, chapters, w);
      const ch = cid ? chapters.find((c) => c.id === cid) : null;
      setHubContextChapter(ch ? { id: ch.id, title: ch.title } : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [workIdInPath, workId, pathname]);

  useEffect(() => {
    if (!workIdInPath) return;
    try {
      localStorage.setItem(LS_LAST_WORK, workIdInPath);
    } catch {
      /* ignore */
    }
  }, [workIdInPath]);

  const hubPaths = useMemo(
    () =>
      new Set([
        "/",
        "/library",
        "/reference",
        "/logic",
        "/inspiration",
        "/chat",
        "/sheng-hui",
        "/login",
        "/forgot-password",
        "/reset-password",
      ]),
    [],
  );

  const searchModKey = useMemo(() => shortcutModifierSymbol(), []);

  /** 步 45：在非输入域按 Ctrl/⌘+K 开关全局命令面板（写作区 CodeMirror 为 contenteditable，不抢键） */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== "k") return;
      if (!e.metaKey && !e.ctrlKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable=true]")) return;
      e.preventDefault();
      setMoreNavOpen(false);
      setCommandOpen((o) => !o);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    queueMicrotask(() => setMoreNavOpen(false));
  }, [pathname]);

  useEffect(() => {
    if (!moreNavOpen) return;
    function onDoc(e: MouseEvent) {
      if (!moreNavRef.current?.contains(e.target as Node)) setMoreNavOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setMoreNavOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onEsc);
    };
  }, [moreNavOpen]);
  const showPageTopbar = !hubPaths.has(pathname) && !isWorkBibleOrSummaryPath(pathname);

  const mastheadNavClass = (extra: string) => `app-masthead-link${extra}`;

  const mastheadSecondary: { to: string; label: string; hint: string }[] = [
    { to: "/logic", label: "推演", hint: "2" },
    { to: "/inspiration", label: "流光", hint: "3" },
    { to: "/chat", label: "问策", hint: "4" },
    { to: "/sheng-hui", label: "生辉", hint: "6" },
  ];

  /** 登录页：独立全屏，不显示主导航；仍挂命令面板（⌘K）便于离开登录态 */
  if (pathname === "/login") {
    return (
      <div className="app-shell app-shell--auth-fullbleed">
        <Outlet />
        <GlobalCommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} workId={workId} />
      </div>
    );
  }

  return (
    <div className="app-shell app-shell--app">
      <div className="app-body">
        <header className="app-masthead" aria-label="主导航">
          <div className="app-masthead-left">
            <Link to="/" className="app-masthead-brand" title="首页">
              <span className="app-masthead-brand-mark-wrap" aria-hidden>
                <img className="app-masthead-mark" src="/favicon.svg" alt="" width={22} height={22} />
              </span>
              <span className="app-masthead-brand-text-row">
                <span className="app-masthead-brand-title-line">
                  <span className="app-masthead-brand-text">留白写作</span>
                  <span className="app-masthead-beta">BETA</span>
                </span>
              </span>
            </Link>
          </div>

          <nav className="app-masthead-center" aria-label="核心功能">
            <NavLink
              end
              to="/library"
              className={({ isActive }) => mastheadNavClass(isActive ? " active" : "")}
            >
              <span className="app-masthead-link-text">留白</span>
              <span className="app-masthead-link-kbd">1</span>
            </NavLink>
            <div className="app-masthead-more" ref={moreNavRef}>
              <button
                type="button"
                className="app-masthead-more-trigger"
                aria-expanded={moreNavOpen}
                aria-haspopup="true"
                onClick={() => setMoreNavOpen((v) => !v)}
              >
                更多
                <span aria-hidden>▾</span>
              </button>
              {moreNavOpen ? (
                <div className="app-masthead-more-panel" role="menu">
                  {mastheadSecondary.map((m) => (
                    <NavLink
                      key={m.to}
                      to={m.to}
                      role="menuitem"
                      className={({ isActive }) => mastheadNavClass(isActive ? " active" : "")}
                      onClick={() => setMoreNavOpen(false)}
                    >
                      <span className="app-masthead-link-text">{m.label}</span>
                      <span className="app-masthead-link-kbd">{m.hint}</span>
                    </NavLink>
                  ))}
                </div>
              ) : null}
            </div>
            {workId ? (
              <NavLink
                to={`/work/${workId}/bible`}
                className={({ isActive }) => mastheadNavClass(isActive ? " active" : "")}
              >
                <span className="app-masthead-link-text">落笔</span>
                <span className="app-masthead-link-kbd">5</span>
              </NavLink>
            ) : (
              <Link to="/library" className="app-masthead-link" title="请先在作品库打开或创建作品">
                <span className="app-masthead-link-text">落笔</span>
                <span className="app-masthead-link-kbd">5</span>
              </Link>
            )}
            <NavLink
              to="/reference"
              className={({ isActive }) => mastheadNavClass(isActive ? " active" : "")}
            >
              <span className="app-masthead-link-text">藏经</span>
              <span className="app-masthead-link-kbd">7</span>
            </NavLink>
          </nav>

          <div className="app-masthead-right">
            <button
              type="button"
              className="app-masthead-search"
              title={`搜索作品与章节、跳转模块（快捷键 ${searchModKey}+K）`}
              onClick={() => {
                setMoreNavOpen(false);
                setCommandOpen(true);
              }}
            >
              <MastheadSearchIcon />
              <span className="app-masthead-search-text">搜索</span>
              <kbd className="app-masthead-search-kbd">{searchModKey}+K</kbd>
            </button>
            <span className="app-masthead-divider" aria-hidden />
            <button
              type="button"
              className="icon-btn app-masthead-bell"
              disabled
              title="暂无系统通知（业务接入前占位，对齐 v2 顶栏）"
              aria-label="通知（暂未开放）"
            >
              <MastheadBellIcon />
            </button>
            {!workIdInPath && workId && hubContextWork ? (
              <Link
                className="app-masthead-context muted small"
                to={
                  hubContextChapter
                    ? `/work/${workId}?chapter=${encodeURIComponent(hubContextChapter.id)}`
                    : `/work/${workId}`
                }
                title={
                  hubContextChapter
                    ? `${hubContextWork.title} · ${hubContextChapter.title}`
                    : hubContextWork.title
                }
              >
                最近 · {hubContextWork.title}
                {hubContextChapter ? ` · ${hubContextChapter.title}` : ""}
              </Link>
            ) : null}
            <UserAccountMenu authUser={authUser} onAuthUpdated={refreshAuth} />
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
      <GlobalCommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} workId={workId} />
    </div>
  );
}
