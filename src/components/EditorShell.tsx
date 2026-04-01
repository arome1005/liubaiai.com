import { Link, Outlet } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RightRailContext, type RightRailTab, type RightRailTabId } from "./RightRailContext";
import { TopbarContext } from "./TopbarContext";

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

  const [topbarTitleNode, setTopbarTitleNode] = useState<React.ReactNode | null>(null);
  const [topbarActionsNode, setTopbarActionsNode] = useState<React.ReactNode | null>(null);

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
          className={"app-shell app-shell--editor" + (!rightOpen ? " app-shell--right-closed" : "")}
        >
          <div className="app-body">
            <header className="app-topbar app-topbar--editor" aria-label="写作顶栏">
              <div className="app-topbar-left app-topbar-left--editor">
                <Link to="/library" className="btn small app-editor-back">
                  作品库
                </Link>
                <div className="app-topbar-title">
                  {topbarTitleNode ? (
                    topbarTitleNode
                  ) : (
                    <span className="muted small">加载中…</span>
                  )}
                </div>
              </div>
              <div className="app-topbar-actions app-topbar-actions--editor">
                {topbarActionsNode}
                <button
                  type="button"
                  className="btn small app-editor-rail-toggle"
                  onClick={() => setRightOpen((v) => !v)}
                  title="展开或收起 AI 等辅助侧栏（宽屏侧栏，小屏抽屉）"
                >
                  {rightOpen ? "关闭右栏" : "打开右栏"}
                </button>
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
            <div className="app-right-body">
              {currentContent ? (
                currentContent
              ) : (
                <>
                  <p className="muted small" style={{ marginTop: 0 }}>
                    写作辅助侧栏。选择上方标签进入对应面板。
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
