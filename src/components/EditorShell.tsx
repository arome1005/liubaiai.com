import { Link, Outlet, useLocation } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { exitDocumentFullscreen, getFullscreenElement, requestDocumentFullscreen } from "../util/browser-fullscreen";
import { useAuthUserState } from "../hooks/useAuthUserState";
import { workIdFromPath } from "../util/workPath";
import { shortcutModifierSymbol } from "../util/keyboardHints";
import { EditorZenProvider } from "./EditorZenContext";
import { GlobalCommandPalette } from "./GlobalCommandPalette";
import { RightRailContext, type RightRailTab, type RightRailTabId } from "./RightRailContext";
import { TopbarContext } from "./TopbarContext";
import { UserAccountMenu } from "./UserAccountMenu";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";

const LS_RIGHT_OPEN = "liubai:rightRailOpen";
const LS_RIGHT_TAB = "liubai:rightRailTab";
const LS_RIGHT_W_PX = "liubai:rightRailWidthPx";

function safeBool(v: string | null, fallback: boolean): boolean {
  if (v === "1") return true;
  if (v === "0") return false;
  return fallback;
}

/**
 * 写作全屏壳：无顶栏七导航，保留编辑注入顶栏 + 右侧栏（与 AppShell 右栏行为一致）。
 */
export function EditorShell() {
  const { pathname } = useLocation();
  const { authUser, refreshAuth } = useAuthUserState(pathname);
  const [commandOpen, setCommandOpen] = useState(false);
  const commandOpenRef = useRef(false);
  const paletteWorkId = useMemo(() => {
    const id = workIdFromPath(pathname);
    if (id) return id;
    try {
      return localStorage.getItem("liubai:lastWorkId");
    } catch {
      return null;
    }
  }, [pathname]);
  const cmdModKey = useMemo(() => shortcutModifierSymbol(), []);
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
    { id: "bible", label: "锦囊", icon: "📖", content: null, enabled: true },
    { id: "ref", label: "参考", icon: "📎", content: null, enabled: true },
  ]);

  const [topbarTitleNode, setTopbarTitleNode] = useState<React.ReactNode | null>(null);
  const [topbarCenterNode, setTopbarCenterNode] = useState<React.ReactNode | null>(null);
  const [topbarActionsNode, setTopbarActionsNode] = useState<React.ReactNode | null>(null);
  const [zenWrite, setZenWrite] = useState(false);
  const zenWriteRef = useRef(zenWrite);
  const rightOpenRef = useRef(rightOpen);
  zenWriteRef.current = zenWrite;

  useEffect(() => {
    commandOpenRef.current = commandOpen;
  }, [commandOpen]);

  useEffect(() => {
    rightOpenRef.current = rightOpen;
  }, [rightOpen]);

  useEffect(() => {
    localStorage.setItem(LS_RIGHT_OPEN, rightOpen ? "1" : "0");
  }, [rightOpen]);
  useEffect(() => {
    localStorage.setItem(LS_RIGHT_TAB, activeTab);
  }, [activeTab]);
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
      if (commandOpenRef.current) return;
      if (zenWrite) {
        e.preventDefault();
        void exitDocumentFullscreen().finally(() => setZenWrite(false));
        return;
      }
      setRightOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zenWrite]);

  /** 与 AppShell 一致：码字区为 contenteditable 时不抢键；顶栏/失焦时 ⌘K 可开面板 */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key?.toLowerCase() !== "k") return;
      if (!e.metaKey && !e.ctrlKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable=true]")) return;
      e.preventDefault();
      setCommandOpen((o) => !o);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!e.altKey) return;
      if (e.key?.toLowerCase() !== "z") return;
      if (e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select")) return;
      e.preventDefault();
      setZenWrite((z) => {
        const next = !z;
        if (next) void requestDocumentFullscreen();
        else void exitDocumentFullscreen();
        return next;
      });
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void exitDocumentFullscreen();
      setZenWrite(false);
    });
  }, [pathname]);

  /** 用户用浏览器手段退出全屏时，同步关闭沉浸 UI */
  useEffect(() => {
    function onFsChange() {
      if (!getFullscreenElement() && zenWriteRef.current) {
        setZenWrite(false);
      }
    }
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange);
    };
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
    () => ({
      setTitleNode: setTopbarTitleNode,
      setCenterNode: setTopbarCenterNode,
      setActionsNode: setTopbarActionsNode,
    }),
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

  const zenApi = useMemo(() => ({ zenWrite, setZenWrite }), [zenWrite]);

  return (
    <TopbarContext.Provider value={topbarApi}>
      <RightRailContext.Provider value={rightRailApi}>
        <EditorZenProvider value={zenApi}>
        <div
          style={{ ["--shell-right-w" as string]: `${rightWidthPx}px` } as CSSProperties}
          className={"app-shell app-shell--editor app-shell--editor-xy" + (!rightOpen ? " app-shell--right-closed" : "")}
        >
          <div className="app-body">
            <header
              className="app-topbar app-topbar--editor app-topbar--editor-xy sticky top-0 z-50 grid min-h-12 shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-border/40 bg-background/95 px-3 py-2 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 lg:min-h-[3.25rem] lg:gap-3 lg:px-5"
              aria-label="写作顶栏"
            >
              <div className="app-topbar-left app-topbar-left--editor app-topbar-left--editor-xy flex min-w-0 max-w-[min(100%,14rem)] items-center gap-2 lg:max-w-[16rem] lg:gap-3">
                <Button asChild variant="outline" size="sm" className="app-editor-back shrink-0">
                  <Link to="/library">作品库</Link>
                </Button>
                <div className="app-topbar-title app-topbar-title--editor app-topbar-title--editor-xy min-w-0 flex-1 overflow-hidden">
                  {topbarTitleNode ? (
                    topbarTitleNode
                  ) : (
                    <span className="text-sm text-muted-foreground">加载中…</span>
                  )}
                </div>
              </div>
              <div className="app-topbar-center app-topbar-center--editor app-topbar-center--editor-xy min-w-0 justify-self-stretch px-1">
                {topbarCenterNode}
              </div>
              <div className="app-topbar-actions app-topbar-actions--editor app-topbar-actions--editor-xy flex min-w-0 flex-shrink-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
                {topbarActionsNode}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="app-editor-command-btn"
                  title={`搜索与命令（${cmdModKey}+K）；正文聚焦时请先点顶栏或失焦再按快捷键`}
                  onClick={() => setCommandOpen(true)}
                >
                  搜索
                  <kbd className="app-editor-command-kbd">{cmdModKey}+K</kbd>
                </Button>
                <Button
                  type="button"
                  variant={rightOpen ? "default" : "outline"}
                  size="sm"
                  className="app-editor-rail-toggle"
                  onClick={() => setRightOpen((v) => !v)}
                  title="展开或收起 AI 等辅助侧栏（宽屏侧栏，小屏抽屉）"
                >
                  {rightOpen ? "关闭右栏" : "打开右栏"}
                </Button>
              </div>
            </header>

            <main className="app-main app-main--editor" aria-label="写作区">
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
            <div className="app-right-body min-h-0 flex-1 overflow-auto">
              {currentContent ? (
                currentContent
              ) : (
                <Card className="gap-0 border-border/60 py-4 shadow-none">
                  <CardContent className="flex flex-col gap-4 px-4">
                    <p className="m-0 text-sm text-muted-foreground">
                      写作辅助侧栏。选择上方标签进入对应面板。
                    </p>
                    <div className="app-right-quick flex flex-wrap gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link to="/library">作品库</Link>
                      </Button>
                      <Button asChild variant="outline" size="sm">
                        <Link to="/reference">藏经</Link>
                      </Button>
                      <Button asChild variant="outline" size="sm">
                        <Link to="/settings">设置</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </aside>

          <div
            className={"app-right-overlay" + (rightOpen ? " open" : "")}
            onClick={() => setRightOpen(false)}
            aria-hidden={!rightOpen}
          />

          <GlobalCommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} workId={paletteWorkId} />
        </div>
        </EditorZenProvider>
      </RightRailContext.Provider>
    </TopbarContext.Provider>
  );
}
