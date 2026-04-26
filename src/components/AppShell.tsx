import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { getWork, listChapters, resolveWorkIdFromRouteParam } from "../db/repo";
import { useAuthUserState } from "../hooks/useAuthUserState";
import { GlobalCommandPalette } from "./GlobalCommandPalette";
import { shortcutModifierSymbol } from "../util/keyboardHints";
import { persistThemePreference } from "../theme";
import { applyAccentColor, readAccentColor } from "../util/accent-color";
import { applyEditorExperience, loadEditorExperience } from "../util/editor-experience";
import { readTodayApproxTokens, readLifetimeApproxTokens } from "../ai/daily-approx-tokens";
import { readSessionApproxTokens } from "../ai/sidepanel-session-tokens";
import { wordCount } from "../util/wordCount";
import { resolveDefaultChapterId } from "../util/resolve-default-chapter";
import { isWorkBibleOrSummaryPath, workIdFromPath } from "../util/workPath";
import { workPathSegment } from "../util/work-url";
import type { Chapter, Work } from "../db/types";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { authLogout } from "../api/auth";
import { uploadUserAvatar } from "../api/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Skeleton } from "./ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

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
  if (pathname.startsWith("/luobi")) return "落笔";
  if (pathname.includes("/bible")) return "落笔";
  if (pathname.includes("/summary")) return "概要";
  return "留白写作";
}

function IconSearch(props: { className?: string }) {
  return (
    <svg
      className={props.className}
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

function IconSettings(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconBookOpen(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <path d="M8 7h8" />
      <path d="M8 11h6" />
    </svg>
  );
}

function IconFileText(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
      <path d="M10 9H8" />
    </svg>
  );
}

function IconSparkles(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    </svg>
  );
}

function IconChevronRight(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function IconBell(props: { className?: string }) {
  return (
    <svg className={props.className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function IconMore(props: { className?: string }) {
  return (
    <svg className={props.className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
      <circle cx="5" cy="12" r="1.5" />
    </svg>
  );
}

function IconSun(props: { className?: string }) {
  return (
    <svg className={props.className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function IconMoon(props: { className?: string }) {
  return (
    <svg className={props.className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

function workStatusLabel(s: Work["status"] | undefined): string {
  if (s === "completed") return "已完结";
  if (s === "archived") return "归档";
  return "连载中";
}

function IconUser(props: { className?: string }) {
  return (
    <svg className={props.className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function initialsFromEmail(email: string): string {
  const local = email.split("@")[0]?.trim() ?? "?";
  if (!local) return "?";
  const arr = [...local];
  return (arr[0] + (arr[1] ?? "")).toUpperCase();
}

/** 全局壳：顶栏七导航（对齐 design/v0-ui-reference `app-shell`） */
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

  const { authUser, refreshAuth } = useAuthUserState(pathname);
  const [commandOpen, setCommandOpen] = useState(false);
  const [bookMenuOpen, setBookMenuOpen] = useState(false);
  const [creatorCenterOpen, setCreatorCenterOpen] = useState(false);
  const creatorEmail = authUser?.email ?? null;
  const creatorAvatarUrl = authUser?.avatarUrl ?? null;
  const creatorInitials = creatorEmail ? initialsFromEmail(creatorEmail) : "—";
  const [creatorUploading, setCreatorUploading] = useState(false);
  const [creatorUsageTick, setCreatorUsageTick] = useState(0);
  const creatorTodayTokens   = useMemo(() => readTodayApproxTokens(), [creatorUsageTick]);
  const creatorSessionTokens = useMemo(() => readSessionApproxTokens(), [creatorUsageTick]);
  const creatorLifetimeTokens= useMemo(() => readLifetimeApproxTokens(), [creatorUsageTick]);
  const creatorFileRef = useRef<HTMLInputElement | null>(null);

  const onCreatorPickFile = useCallback(() => {
    creatorFileRef.current?.click();
  }, []);

  const onCreatorFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      setCreatorUploading(true);
      try {
        await uploadUserAvatar(file);
        refreshAuth();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "上传失败");
      } finally {
        setCreatorUploading(false);
      }
    },
    [refreshAuth],
  );

  const onCreatorLogout = useCallback(async () => {
    setCreatorCenterOpen(false);
    await authLogout();
    refreshAuth();
    window.location.href = "/login";
  }, [refreshAuth]);

  // Resolved effective theme ("light" | "dark") for the toggle button icon
  const getEffectiveTheme = useCallback((): "light" | "dark" => {
    const t = document.documentElement.dataset.theme;
    return t === "dark" ? "dark" : "light";
  }, []);
  const [effectiveTheme, setEffectiveTheme] = useState<"light" | "dark">(() => getEffectiveTheme());

  useEffect(() => {
    const obs = new MutationObserver(() => setEffectiveTheme(getEffectiveTheme()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, [getEffectiveTheme]);

  /* 应用强调色 + 编辑器体验（挂载时读 localStorage 立即应用） */
  useEffect(() => {
    applyAccentColor(readAccentColor());
    applyEditorExperience(loadEditorExperience());
  }, []);

  function handleThemeToggle() {
    const next = effectiveTheme === "dark" ? "light" : "dark";
    persistThemePreference(next);
    setEffectiveTheme(next);
  }
  const [ctxWork, setCtxWork] = useState<Work | null>(null);
  const [ctxChapters, setCtxChapters] = useState<Chapter[]>([]);
  const [ctxLoading, setCtxLoading] = useState(false);
  const commandPalettePathSeg = useMemo(() => {
    if (ctxWork) return workPathSegment(ctxWork);
    if (workIdInPath) return workIdInPath;
    return workId;
  }, [ctxWork, workIdInPath, workId]);
  useEffect(() => {
    if (!workId) {
      queueMicrotask(() => {
        setCtxWork(null);
        setCtxChapters([]);
        setCtxLoading(false);
      });
      return;
    }
    let cancelled = false;
    queueMicrotask(() => setCtxLoading(true));
    void (async () => {
      const internalId = (await resolveWorkIdFromRouteParam(workId)) ?? workId;
      const w = await getWork(internalId);
      const ch = await listChapters(internalId);
      if (cancelled) return;
      setCtxWork(w ?? null);
      setCtxChapters(ch);
      setCtxLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [workId]);

  useEffect(() => {
    queueMicrotask(() => setBookMenuOpen(false));
  }, [pathname]);

  useEffect(() => {
    if (!workIdInPath) return;
    void (async () => {
      const id = (await resolveWorkIdFromRouteParam(workIdInPath)) ?? workIdInPath;
      try {
        localStorage.setItem(LS_LAST_WORK, id);
      } catch {
        /* ignore */
      }
    })();
  }, [workIdInPath]);

  const hubPaths = useMemo(
    () =>
      new Set([
        "/",
        "/library",
        "/reference",
        "/luobi",
        "/logic",
        "/inspiration",
        "/chat",
        "/sheng-hui",
        "/prompts",
        "/login",
        "/forgot-password",
        "/reset-password",
      ]),
    [],
  );

  const searchModKey = useMemo(() => shortcutModifierSymbol(), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key?.toLowerCase() !== "k") return;
      if (!e.metaKey && !e.ctrlKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable=true]")) return;
      e.preventDefault();
      setBookMenuOpen(false);
      setCommandOpen((o) => !o);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isLuobiHubLike = pathname === "/luobi" || pathname.startsWith("/luobi/");
  const showPageTopbar = !hubPaths.has(pathname) && !isWorkBibleOrSummaryPath(pathname) && !isLuobiHubLike;

  const mastheadModules: {
    id: "library" | "logic" | "inspiration" | "chat" | "work" | "sheng-hui" | "reference";
    to: string;
    label: string;
    disabledWhenNoWork?: boolean;
  }[] = [
    { id: "library", to: "/library", label: "留白" },
    { id: "logic", to: "/logic", label: "推演" },
    { id: "inspiration", to: "/inspiration", label: "流光" },
    { id: "chat", to: "/chat", label: "问策" },
    { id: "work", to: "/luobi", label: "落笔" },
    { id: "sheng-hui", to: "/sheng-hui", label: "生辉" },
    { id: "reference", to: "/reference", label: "藏经" },
  ];

  const ctxChapterMeta = useMemo(() => {
    if (!workId || !ctxWork) return null;
    const sorted = [...ctxChapters].sort((a, b) => a.order - b.order);
    const defId = resolveDefaultChapterId(ctxWork.id, ctxChapters, ctxWork);
    const cur = defId ? sorted.find((c) => c.id === defId) : sorted[0];
    const idx = cur ? sorted.findIndex((c) => c.id === cur.id) + 1 : 0;
    const totalWords = sorted.reduce((s, c) => s + (c.wordCountCache ?? wordCount(c.content)), 0);
    return {
      sorted,
      cur,
      idx,
      totalWords,
      chapterCount: sorted.length,
    };
  }, [workId, ctxWork, ctxChapters]);

  if (pathname === "/login" || pathname === "/forgot-password" || pathname === "/reset-password") {
    return (
      <div className="app-shell app-shell--auth-fullbleed">
        <Outlet />
        <GlobalCommandPalette
          open={commandOpen}
          onClose={() => setCommandOpen(false)}
          workId={ctxWork?.id ?? null}
          workPathSeg={commandPalettePathSeg}
        />
      </div>
    );
  }

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "relative flex shrink-0 items-center rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200",
      isActive
        ? "bg-primary/10 text-primary after:pointer-events-none after:absolute after:-bottom-2 after:left-1/2 after:h-0.5 after:w-6 after:-translate-x-1/2 after:rounded-full after:bg-primary"
        : "text-zinc-500 dark:text-zinc-400 hover:bg-muted/50 hover:text-foreground",
    );

  return (
    <div className="app-shell app-shell--app flex h-dvh min-h-0 flex-col bg-background">
      <div className="app-body flex min-h-0 flex-1 flex-col">
        <header
          className="sticky top-0 z-50 grid min-h-14 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-b border-black/5 dark:border-border/40 bg-white/80 dark:bg-background/95 px-4 py-2 backdrop-blur-md shadow-sm supports-[backdrop-filter]:bg-white/60 dark:supports-[backdrop-filter]:bg-background/60 lg:px-6 transition-colors"
          data-shell="liubai-v2"
          aria-label="主导航"
        >
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <div className="flex shrink-0 items-center gap-2.5">
            <Link to="/" className="flex items-center gap-2.5 no-underline hover:opacity-90" title="首页">
              <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20">
                <span className="relative z-[1] text-base font-semibold text-primary">留</span>
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-primary/10 to-transparent" />
              </div>
              <div className="hidden min-w-0 sm:block">
                <span className="text-sm font-semibold tracking-wide text-foreground">留白写作</span>
              </div>
            </Link>

            {/* 左上角：创作中心入口（只显示小人图标） */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  aria-label="创作中心"
                  onClick={() => setCreatorCenterOpen(true)}
                >
                  <IconUser className="h-[18px] w-[18px]" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={6}>
                创作中心
              </TooltipContent>
            </Tooltip>
          </div>

          {workId ? (
            <DropdownMenu open={bookMenuOpen} onOpenChange={setBookMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="mr-2 h-8 w-8 shrink-0 border-primary/30 bg-primary/5 hover:bg-primary/10"
                  disabled={ctxLoading}
                  title={ctxWork ? "当前作品" : ctxLoading ? "加载中…" : "当前作品不可用"}
                  aria-label="当前作品上下文"
                >
                  <IconBookOpen className="h-4 w-4 text-primary" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-80 p-0">
                {ctxLoading ? (
                  <div className="space-y-3 p-4" aria-busy="true" aria-label="加载作品信息">
                    <Skeleton className="h-4 w-full max-w-[12rem]" />
                    <Skeleton className="h-3 w-full" />
                    <div className="grid grid-cols-3 gap-3 pt-2">
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-12 w-full" />
                    </div>
                  </div>
                ) : ctxWork && ctxChapterMeta ? (
                  <>
                    <div className="border-b border-border/50 bg-muted/30 p-4">
                      <div className="flex min-w-0 items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h4 className="truncate font-semibold text-foreground" title={ctxWork.title}>
                            {ctxWork.title}
                          </h4>
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                            {ctxChapterMeta.cur
                              ? `第${ctxChapterMeta.idx}章 · ${ctxChapterMeta.cur.title}`
                              : "尚无章节"}
                            <span className="text-muted-foreground"> · {workStatusLabel(ctxWork.status)}</span>
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap justify-end gap-1">
                          {(ctxWork.tags ?? []).slice(0, 2).map((tag) => (
                            <span
                              key={tag}
                              className="max-w-[5.5rem] truncate rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
                              title={tag}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-3">
                        <div className="rounded-lg bg-background/60 p-2 text-center">
                          <p className="text-lg font-semibold text-foreground">{ctxChapterMeta.chapterCount}</p>
                          <p className="text-[10px] text-muted-foreground">总章节</p>
                        </div>
                        <div className="rounded-lg bg-background/60 p-2 text-center">
                          <p className="text-lg font-semibold text-foreground">
                            {(ctxChapterMeta.totalWords / 10000).toFixed(1)}
                          </p>
                          <p className="text-[10px] text-muted-foreground">总字数(万)</p>
                        </div>
                        <div className="rounded-lg bg-background/60 p-2 text-center">
                          <p className="text-lg font-semibold text-foreground">{ctxChapterMeta.idx || "—"}</p>
                          <p className="text-[10px] text-muted-foreground">当前章</p>
                        </div>
                      </div>
                    </div>
                    <div className="p-2">
                      <DropdownMenuItem asChild className="gap-2 rounded-lg">
                        <Link
                          to={
                            ctxChapterMeta.cur
                              ? `/work/${workPathSegment(ctxWork)}?chapter=${encodeURIComponent(ctxChapterMeta.cur.id)}`
                              : `/work/${workPathSegment(ctxWork)}`
                          }
                          onClick={() => setBookMenuOpen(false)}
                        >
                          <IconFileText className="h-4 w-4 text-primary" />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">继续编辑</p>
                            <p className="text-xs text-muted-foreground">打开本书锦囊（落笔）</p>
                          </div>
                          <IconChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild className="gap-2 rounded-lg">
                        <Link to="/logic" state={{ preferWorkId: ctxWork?.id }} onClick={() => setBookMenuOpen(false)}>
                          <IconSparkles className="h-4 w-4 text-amber-500" />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">查看大纲</p>
                            <p className="text-xs text-muted-foreground">打开推演模块</p>
                          </div>
                          <IconChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild className="gap-2 rounded-lg">
                        <Link to="/library" onClick={() => setBookMenuOpen(false)}>
                          <IconBookOpen className="h-4 w-4 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">切换作品</p>
                            <p className="text-xs text-muted-foreground">返回作品库</p>
                          </div>
                          <IconChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
                        </Link>
                      </DropdownMenuItem>
                    </div>
                  </>
                ) : (
                  <div className="space-y-3 p-4 text-sm">
                    <p className="text-destructive">无法加载当前作品（可能已删除）。</p>
                    <Button asChild variant="outline" size="sm" className="w-full">
                      <Link to="/library" onClick={() => setBookMenuOpen(false)}>
                        返回作品库
                      </Link>
                    </Button>
                  </div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          </div>

          <nav
            className="flex max-w-[min(100vw-2rem,56rem)] min-w-0 items-center justify-center gap-0.5 overflow-x-auto overflow-y-hidden overscroll-x-contain px-1"
            aria-label="核心功能"
          >
            {mastheadModules.map((m) =>
              m.disabledWhenNoWork && !workId ? (
                <Link
                  key={m.id}
                  to={m.to}
                  className="flex shrink-0 items-center rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground opacity-60"
                  title="请先在作品库打开或创建作品"
                  aria-disabled
                >
                  <span>{m.label}</span>
                </Link>
              ) : (
                <NavLink key={m.id} end={m.id === "library"} to={m.to} className={navLinkClass}>
                  <span className="whitespace-nowrap">{m.label}</span>
                </NavLink>
              ),
            )}
          </nav>

          <div className="flex min-w-0 shrink-0 items-center justify-end gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="inline-flex h-8 gap-2 border-border/50 bg-muted/30 px-3 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              title={`搜索作品与章节、跳转模块（快捷键 ${searchModKey}+K）`}
              onClick={() => {
                setBookMenuOpen(false);
                setCommandOpen(true);
              }}
            >
              <IconSearch className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden lg:inline">搜索</span>
              <kbd className="pointer-events-none hidden h-5 items-center gap-0.5 rounded border border-border/50 bg-muted/50 px-1.5 font-mono text-[10px] font-medium text-muted-foreground lg:inline-flex">
                {searchModKey}+K
              </kbd>
            </Button>
            <div className="mx-2 h-5 w-px shrink-0 bg-border/50" aria-hidden />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              title={effectiveTheme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
              aria-label={effectiveTheme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
              onClick={handleThemeToggle}
            >
              {effectiveTheme === "dark" ? (
                <IconSun className="h-[18px] w-[18px]" />
              ) : (
                <IconMoon className="h-[18px] w-[18px]" />
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              disabled
              title="暂无系统通知"
              aria-label="通知（暂未开放）"
            >
              <IconBell className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" asChild title="设置" aria-label="设置">
              <Link to="/settings">
                <IconSettings className="h-[18px] w-[18px]" />
              </Link>
            </Button>
          </div>
        </header>

        <Dialog open={creatorCenterOpen} onOpenChange={(o) => { setCreatorCenterOpen(o); if (o) setCreatorUsageTick((n) => n + 1); }}>
          <DialogContent className="w-full max-w-3xl overflow-hidden p-0">
            <DialogHeader className="border-b border-border/40 bg-card/30 px-5 py-4">
              <DialogTitle className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <IconUser className="h-4 w-4 text-primary" />
                  创作中心
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="创作中心菜单">
                      <IconMore className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem disabled={!authUser || creatorUploading} onClick={() => { if (!creatorUploading) onCreatorPickFile(); }}>
                      {creatorUploading ? "头像上传中…" : "更换头像"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-red-600 focus:text-red-600"
                      disabled={!authUser}
                      onClick={() => void onCreatorLogout()}
                    >
                      退出登录
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </DialogTitle>
            </DialogHeader>
            <div className="p-5">
              <div className="rounded-xl border border-border/50 bg-card/40 p-4">
                <input
                  ref={creatorFileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="visually-hidden"
                  aria-hidden
                  onChange={(ev) => void onCreatorFileChange(ev)}
                />
                {/* 身份卡：只放身份信息 */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="h-10 w-10 overflow-hidden rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold">
                        {creatorAvatarUrl ? (
                          <img src={creatorAvatarUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span aria-hidden>{creatorInitials}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {creatorEmail ?? "创作者账号"}
                          </p>
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">ID: —</span>
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                            {creatorEmail ? "会员：未开通" : "游客"}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">账号 · 权益 · 资产（后续会在这里持续增加能力入口）</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 今日 AI 用量 + 创作资产 — 两列并排 */}
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {/* 左：今日 AI 用量 */}
                  <div className="rounded-xl border border-border/40 bg-background/40 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-foreground">今日 AI 用量</h3>
                      <button type="button" className="text-[11px] text-muted-foreground hover:text-foreground" onClick={() => setCreatorUsageTick((n) => n + 1)}>刷新</button>
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      {[
                        { label: "本会话",  value: creatorSessionTokens,  highlight: false },
                        { label: "今日累计", value: creatorTodayTokens,   highlight: true  },
                        { label: "本机累计", value: creatorLifetimeTokens, highlight: false },
                      ].map(({ label, value, highlight }) => (
                        <div key={label} className={`flex items-center justify-between rounded-lg px-3 py-2 ${highlight ? "bg-primary/8 border border-primary/20" : "bg-background/60"}`}>
                          <span className="text-xs text-muted-foreground">{label}</span>
                          <div className="text-right">
                            <span className={`font-bold tabular-nums text-sm ${highlight ? "text-primary" : "text-foreground"}`}>
                              {value >= 10_000 ? `${(value / 1_000).toFixed(0)}k` : value.toLocaleString()}
                            </span>
                            <span className="ml-1 text-[9px] text-muted-foreground/60">tokens</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[10px] text-muted-foreground/50">粗估本机统计，非厂商计费。</p>
                  </div>

                  {/* 右：创作资产 */}
                  <div className="rounded-xl border border-border/40 bg-background/40 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-foreground">创作资产</h3>
                      <span className="text-[10px] text-muted-foreground">后续接入</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: "字数仓剩余",  value: "—" },
                        { label: "星月币可用",   value: "—" },
                        { label: "每日免费重塑", value: "0 / 0" },
                        { label: "会员时效",    value: "未开通" },
                      ].map(({ label, value }) => (
                        <div key={label} className="rounded-lg bg-background/60 p-2.5">
                          <div className="text-[10px] text-muted-foreground">{label}</div>
                          <div className="mt-1 text-sm font-semibold text-foreground">{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 快捷入口 + 权益 — 两列并排 */}
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {/* 快捷入口 */}
                  <div className="rounded-xl border border-border/40 bg-background/40 p-4">
                    <h3 className="mb-3 text-sm font-semibold text-foreground">快捷入口</h3>
                    <div className="grid grid-cols-1 gap-2">
                      <Button type="button" variant="outline" className="h-9 justify-start text-xs" asChild><Link to="/prompts">提示词库</Link></Button>
                      <Button type="button" variant="outline" className="h-9 justify-start text-xs" asChild><Link to="/reference">藏经</Link></Button>
                      <Button type="button" variant="outline" className="h-9 justify-start text-xs" asChild><Link to="/settings">设置</Link></Button>
                    </div>
                  </div>

                  {/* 权益与服务 */}
                  <div className="rounded-xl border border-border/40 bg-background/40 p-4">
                    <h3 className="mb-3 text-sm font-semibold text-foreground">权益与服务</h3>
                    <div className="space-y-2">
                      <Button type="button" className="h-9 w-full text-sm">开通 / 升级会员</Button>
                      <Button type="button" variant="secondary" className="h-8 w-full text-xs">获得更多字数</Button>
                      <Button type="button" variant="outline" className="h-8 w-full text-xs">兑换星月币</Button>
                      <Button type="button" variant="outline" className="h-8 w-full text-xs">个人主页</Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {showPageTopbar ? (
          <header
            className="sticky top-0 z-10 flex min-h-12 shrink-0 items-center border-b border-black/5 dark:border-border/40 bg-white/85 dark:bg-background/90 px-4 backdrop-blur-md shadow-sm lg:px-6"
            aria-label="页面顶栏"
          >
            <div className="flex w-full min-w-0 items-center">
              <div className="min-w-0 truncate text-sm">
                <strong className="text-foreground">{section}</strong>
                {workIdInPath ? (
                  <span className="text-muted-foreground"> · {workIdInPath.slice(0, 6)}</span>
                ) : null}
              </div>
            </div>
          </header>
        ) : null}

        <main
          className="app-main min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-background !p-0"
          aria-label="主内容"
        >
          <div
            className={cn(
              "w-full min-h-0 px-4 lg:px-6",
              pathname === "/library" || pathname === "/luobi" || pathname.startsWith("/luobi/")
                ? "pb-6 pt-2"
                : "py-6",
            )}
          >
            <Outlet />
          </div>
        </main>
      </div>
      <GlobalCommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        workId={ctxWork?.id ?? null}
        workPathSeg={commandPalettePathSeg}
      />
    </div>
  );
}
