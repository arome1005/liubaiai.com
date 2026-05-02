import { Link, matchPath, Outlet, useLocation } from "react-router-dom";
import { Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { EditorWritingSettingsSheet } from "./EditorWritingSettingsSheet";
import { exitDocumentFullscreen, getFullscreenElement, requestDocumentFullscreen } from "../util/browser-fullscreen";
import { useAuthUserState } from "../hooks/useAuthUserState";
import { workIdFromPath } from "../util/workPath";
import { resolveWorkIdFromRouteParam } from "../db/repo";
import { shortcutModifierSymbol } from "../util/keyboardHints";
import { EditorZenProvider } from "./EditorZenContext";
import { GlobalCommandPalette } from "./GlobalCommandPalette";
import { RightRailContext, type RightRailTab, type RightRailTabId } from "./RightRailContext";
import { TopbarContext } from "./TopbarContext";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { TopbarEditorLeftNav, TopbarEditorSettingsIcon } from "./editor/TopbarEditorNav";

const LS_RIGHT_OPEN = "liubai:rightRailOpen";
const LS_RIGHT_TAB = "liubai:rightRailTab";
const LS_RIGHT_W_PX = "liubai:rightRailWidthPx";

function safeGetLocalStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetLocalStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Keep existing UX when storage is unavailable.
  }
}

function useLocalStorageSync(key: string, value: string) {
  useEffect(() => {
    safeSetLocalStorage(key, value);
  }, [key, value]);
}

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
  /** 重塑独立页自带顶栏，不重复渲染写作顶栏（搜索/辅助/沉浸等） */
  const hideWritingTopbar = Boolean(matchPath({ path: "/work/:workId/reshape", end: true }, pathname));
  useAuthUserState(pathname);
  const [commandOpen, setCommandOpen] = useState(false);
  const commandOpenRef = useRef(false);
  const paletteWorkPathSeg = useMemo(() => {
    const id = workIdFromPath(pathname);
    if (id) return id;
    try {
      return localStorage.getItem("liubai:lastWorkId");
    } catch {
      return null;
    }
  }, [pathname]);
  const [paletteWorkUuid, setPaletteWorkUuid] = useState<string | null>(null);
  const paletteResolveTokenRef = useRef(0);
  useEffect(() => {
    const token = ++paletteResolveTokenRef.current;
    if (!paletteWorkPathSeg) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear stale work context when route has no work segment
      setPaletteWorkUuid(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const internal = (await resolveWorkIdFromRouteParam(paletteWorkPathSeg)) ?? paletteWorkPathSeg;
      if (cancelled || paletteResolveTokenRef.current !== token) return;
      setPaletteWorkUuid(internal);
    })();
    return () => {
      cancelled = true;
    };
  }, [paletteWorkPathSeg]);
  const cmdModKey = useMemo(() => shortcutModifierSymbol(), []);
  const [writingSettingsOpen, setWritingSettingsOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState<boolean>(() => safeBool(safeGetLocalStorage(LS_RIGHT_OPEN), false));
  const [rightWidthPx, setRightWidthPx] = useState<number>(() => {
    const n = Number(safeGetLocalStorage(LS_RIGHT_W_PX));
    if (!Number.isFinite(n)) return 360;
    return Math.max(280, Math.min(560, Math.floor(n)));
  });

  const [activeTab, setActiveTab] = useState<RightRailTabId>(() => {
    const v = safeGetLocalStorage(LS_RIGHT_TAB) as RightRailTabId | null;
    return v === "ai" || v === "summary" || v === "bible" || v === "ref" ? v : "ai";
  });
  const [tabs, setTabs] = useState<RightRailTab[]>(() => [
    { id: "ai", label: "AI", icon: "✨", content: null, enabled: true },
    { id: "summary", label: "知识库", icon: "🧰", content: null, enabled: true },
    { id: "bible", label: "设定", icon: "📖", content: null, enabled: true },
    { id: "ref", label: "参考", icon: "📎", content: null, enabled: true },
  ]);

  const [topbarTitleNode, setTopbarTitleNode] = useState<React.ReactNode | null>(null);
  const [topbarCenterNode, setTopbarCenterNode] = useState<React.ReactNode | null>(null);
  const [topbarActionsNode, setTopbarActionsNode] = useState<React.ReactNode | null>(null);
  const [zenWrite, setZenWrite] = useState(false);
  const zenWriteRef = useRef(zenWrite);

  useEffect(() => {
    commandOpenRef.current = commandOpen;
  }, [commandOpen]);
  useEffect(() => {
    zenWriteRef.current = zenWrite;
  }, [zenWrite]);

  useLocalStorageSync(LS_RIGHT_OPEN, rightOpen ? "1" : "0");
  useLocalStorageSync(LS_RIGHT_TAB, activeTab);
  useLocalStorageSync(LS_RIGHT_W_PX, String(rightWidthPx));

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

  // Unified keyboard & fullscreen listeners for the editor shell.
  // All key bindings and fullscreen-sync in one place for maintainability;
  // actual keys/behavior unchanged.
  useEffect(() => {
    function onKeyBubble(e: KeyboardEvent) {
      const key = e.key?.toLowerCase();

      if (key === "escape") {
        if (commandOpenRef.current) return;
        if (zenWriteRef.current) {
          e.preventDefault();
          void exitDocumentFullscreen().finally(() => setZenWrite(false));
          return;
        }
        setRightOpen(false);
        return;
      }

      if (key === "k" && (e.metaKey || e.ctrlKey)) {
        const t = e.target as HTMLElement | null;
        if (t?.closest("input, textarea, select, [contenteditable=true]")) return;
        e.preventDefault();
        setCommandOpen((o) => !o);
      }
    }

    function onKeyCapture(e: KeyboardEvent) {
      if (!e.altKey || e.key?.toLowerCase() !== "z" || e.repeat) return;
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

    function onFsChange() {
      if (!getFullscreenElement() && zenWriteRef.current) {
        setZenWrite(false);
      }
    }

    window.addEventListener("keydown", onKeyBubble);
    window.addEventListener("keydown", onKeyCapture, true);
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange);
    return () => {
      window.removeEventListener("keydown", onKeyBubble);
      window.removeEventListener("keydown", onKeyCapture, true);
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange);
    };
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void exitDocumentFullscreen();
      setZenWrite(false);
    });
  }, [pathname]);

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

  const handleEditorZenToggle = useCallback(() => {
    if (zenWrite) {
      void exitDocumentFullscreen().finally(() => setZenWrite(false));
    } else {
      setZenWrite(true);
      void requestDocumentFullscreen();
    }
  }, [zenWrite]);

  const handleWritingSettingsOpen = useCallback(() => {
    setWritingSettingsOpen(true);
  }, []);

  return (
    <>
    <TopbarContext.Provider value={topbarApi}>
      <RightRailContext.Provider value={rightRailApi}>
        <EditorZenProvider value={zenApi}>
        <div
          style={{ ["--shell-right-w" as string]: `${rightWidthPx}px` } as CSSProperties}
          className={"app-shell app-shell--editor app-shell--editor-xy" + (!rightOpen ? " app-shell--right-closed" : "")}
        >
          {!hideWritingTopbar ? (
            <header
              className="app-topbar app-topbar--editor app-topbar--editor-xy sticky top-0 z-50 grid min-h-12 shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-border/40 bg-background/95 px-3 py-2 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 lg:min-h-[3.25rem] lg:gap-3 lg:px-5"
              aria-label="写作顶栏"
            >
              <div className="app-topbar-left app-topbar-left--editor app-topbar-left--editor-xy flex min-w-0 max-w-[min(100%,14rem)] items-center gap-2 lg:max-w-[18rem] lg:gap-3">
                <div className="flex shrink-0 items-center gap-1">
                  <TopbarEditorLeftNav zenWrite={zenWrite} onZenToggle={handleEditorZenToggle} />
                </div>
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
                <span className="app-topbar-rail-toggle-area">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="app-editor-command-btn app-editor-command-btn--icon"
                    aria-label="搜索与命令"
                    title={`搜索与命令（${cmdModKey}+K）；正文聚焦时请先点顶栏或失焦再按快捷键`}
                    onClick={() => setCommandOpen(true)}
                  >
                    <Search className="app-editor-command-search-ico size-[1.05rem] shrink-0" strokeWidth={2.25} aria-hidden />
                    <kbd className="app-editor-command-kbd">{cmdModKey}+K</kbd>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="app-editor-rail-toggle h-9"
                    onClick={() => setRightOpen((v) => !v)}
                    title="展开或收起 AI 等辅助侧栏（宽屏侧栏，小屏抽屉）"
                  >
                    {rightOpen ? "关闭" : "辅助"}
                  </Button>
                  <TopbarEditorSettingsIcon onSettingsOpen={handleWritingSettingsOpen} />
                </span>
              </div>
            </header>
          ) : null}

          <div className="app-editor-split">
            <div className="app-body">
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
                <Card className="app-right-empty-card gap-0 border-border/60 py-4 shadow-none">
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
          </div>

          <div
            className={"app-right-overlay" + (rightOpen ? " open" : "")}
            onClick={() => setRightOpen(false)}
            aria-hidden={!rightOpen}
          />

          <GlobalCommandPalette
            open={commandOpen}
            onClose={() => setCommandOpen(false)}
            workId={paletteWorkUuid}
            workPathSeg={paletteWorkPathSeg}
          />
        </div>
        </EditorZenProvider>
      </RightRailContext.Provider>
    </TopbarContext.Provider>
    <EditorWritingSettingsSheet open={writingSettingsOpen} onOpenChange={setWritingSettingsOpen} />
    </>
  );
}
