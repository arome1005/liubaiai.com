/**
 * 写作编辑页与其他页面/模块之间的「一次性」握手集合：
 *
 * 1. `location.state.applyUserHint`：锦囊「提示词」跳转，写入 AI 侧栏额外要求
 * 2. `?chapter=` deep link：概要总览跳转到指定章
 * 3. `?refsImport=1`：参考材料导入
 * 4. `?hit=1`：跨模块定位到搜索命中片段
 * 5. `?liuguangInsert=1`：流光插入光标位
 * 6. `?liuguangAppend=1` / `?liuguangDraft=1`：章末追加 / 写入 AI 草稿
 *
 * 行为与原 `EditorPage.tsx` 内 6 段 useEffect 完全一致；
 * 仅做收口，**不**改 query 参数名、`replaceState` 时机、`clearXxx()` 调用顺序。
 */
import { useEffect } from "react";
import type { NavigateFunction, Location } from "react-router-dom";
import {
  clearEditorHitHandoff,
  readEditorHitHandoff,
} from "../util/editor-hit-handoff";
import {
  clearEditorRefsImport,
  readEditorRefsImport,
  type EditorRefsImportItem,
} from "../util/editor-refs-import";
import {
  clearInspirationTransferHandoff,
  readInspirationTransferHandoff,
} from "../util/inspiration-transfer-handoff";
import { aiPanelDraftStorageKey } from "../util/ai-panel-draft";
import type { Chapter } from "../db/types";

interface PendingScrollState {
  query: string;
  isRegex: boolean;
  offset: number;
}

interface ImperativeDialogLike {
  confirm: (msg: string) => Promise<boolean>;
}

export interface UseEditorExternalHandoffsParams {
  workId: string | null;
  activeId: string | null;
  activeChapter: Chapter | null;
  chapters: Chapter[];
  location: Location;
  navigate: NavigateFunction;
  imperativeDialog: ImperativeDialogLike;
  /** 始终是同一对象（页面顶层 useRef），用以避免直接依赖随 chapters 重建的回调 */
  switchChapterRef: React.RefObject<(id: string) => Promise<void>>;
  contentRef: React.RefObject<string>;
  pendingScrollRef: React.MutableRefObject<PendingScrollState | null>;
  setAiUserHintPrefill: React.Dispatch<React.SetStateAction<string | null>>;
  setRightRailActiveTab: (tab: "ai" | "summary" | "bible" | "ref") => void;
  setRightRailOpen: (open: boolean) => void;
  setIncomingHit: React.Dispatch<
    React.SetStateAction<{ title: string; hint?: string } | null>
  >;
  setIncomingRefs: React.Dispatch<React.SetStateAction<EditorRefsImportItem[]>>;
  setFindQ: React.Dispatch<React.SetStateAction<string>>;
  setFindOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setLiuguangReturnVisible: React.Dispatch<React.SetStateAction<boolean>>;
  insertAtCursor: (text: string) => void;
  appendToEnd: (text: string) => void;
}

export function useEditorExternalHandoffs(p: UseEditorExternalHandoffsParams): void {
  const {
    workId,
    activeId,
    activeChapter,
    chapters,
    location,
    navigate,
    imperativeDialog,
    switchChapterRef,
    contentRef,
    pendingScrollRef,
    setAiUserHintPrefill,
    setRightRailActiveTab,
    setRightRailOpen,
    setIncomingHit,
    setIncomingRefs,
    setFindQ,
    setFindOpen,
    setLiuguangReturnVisible,
    insertAtCursor,
    appendToEnd,
  } = p;

  // ─── 1. 锦囊「提示词」跳转 → 写入 AI 侧栏额外要求 ───────────────────────
  useEffect(() => {
    const st = location.state as { applyUserHint?: string } | null | undefined;
    const h = st?.applyUserHint;
    if (typeof h !== "string" || !h.trim()) return;
    setAiUserHintPrefill(h);
    setRightRailActiveTab("ai");
    setRightRailOpen(true);
    navigate(
      { pathname: location.pathname, search: location.search, hash: location.hash },
      { replace: true, state: {} },
    );
    // 与原内联实现一致：rightRail API 引用不稳定时避免重复 replace
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key, location.pathname, location.search, location.hash, navigate]);

  // ─── 2. 概要总览 deep link：?chapter=xxx ─────────────────────────────────
  useEffect(() => {
    if (!workId) return;
    try {
      const u = new URL(window.location.href);
      const c = u.searchParams.get("chapter");
      if (c && chapters.some((x) => x.id === c)) {
        void switchChapterRef.current?.(c);
        u.searchParams.delete("chapter");
        window.history.replaceState({}, "", u.toString());
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workId, chapters.length]);

  // ─── 3. 跨模块引用材料导入：?refsImport=1 ────────────────────────────────
  useEffect(() => {
    if (!workId || !chapters.length) return;
    let should = false;
    try {
      const u = new URL(window.location.href);
      should = u.searchParams.get("refsImport") === "1";
      if (should) {
        u.searchParams.delete("refsImport");
        window.history.replaceState({}, "", u.toString());
      }
    } catch {
      should = false;
    }
    if (!should) return;
    const payload = readEditorRefsImport();
    clearEditorRefsImport();
    if (!payload) return;
    if (payload.workId !== workId) return;
    if (!chapters.some((c) => c.id === payload.chapterId)) return;
    setIncomingRefs(payload.items.slice(0, 8));
    void switchChapterRef.current?.(payload.chapterId);
    queueMicrotask(() => {
      setRightRailOpen(true);
      setRightRailActiveTab("ref");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workId, chapters.length]);

  // ─── 4. 跨模块定位到命中片段：?hit=1 ─────────────────────────────────────
  useEffect(() => {
    if (!workId || !chapters.length) return;
    let should = false;
    try {
      const u = new URL(window.location.href);
      should = u.searchParams.get("hit") === "1";
      if (should) {
        u.searchParams.delete("hit");
        window.history.replaceState({}, "", u.toString());
      }
    } catch {
      should = false;
    }
    if (!should) return;
    const payload = readEditorHitHandoff();
    clearEditorHitHandoff();
    if (!payload) return;
    if (payload.workId !== workId) return;
    if (!payload.query.trim()) return;
    const exists = chapters.some((c) => c.id === payload.chapterId);
    if (!exists) return;

    setIncomingHit({ title: payload.source.title, hint: payload.source.hint });
    pendingScrollRef.current = {
      query: payload.query,
      isRegex: payload.isRegex ?? false,
      offset: payload.offset ?? 0,
    };
    void switchChapterRef.current?.(payload.chapterId);
    setFindQ(payload.query);
    setFindOpen(true);
    queueMicrotask(() => {
      setRightRailOpen(true);
      setRightRailActiveTab("ai");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workId, chapters.length]);

  // ─── 5. 流光「光标位插入」：?liuguangInsert=1 ───────────────────────────
  useEffect(() => {
    if (!workId || !activeId) return;
    let should = false;
    try {
      const u = new URL(window.location.href);
      should = u.searchParams.get("liuguangInsert") === "1";
      if (should) {
        u.searchParams.delete("liuguangInsert");
        window.history.replaceState({}, "", u.toString());
      }
    } catch {
      should = false;
    }
    if (!should) return;

    const payload = readInspirationTransferHandoff();
    if (
      !payload ||
      payload.workId !== workId ||
      payload.chapterId !== activeId ||
      payload.mode !== "insertCursor"
    ) {
      return;
    }
    const text = payload.text;
    clearInspirationTransferHandoff();
    queueMicrotask(() => {
      setRightRailOpen(true);
      setRightRailActiveTab("ai");
    });
    void (async () => {
      const cur = contentRef.current ?? "";
      const needle = text.trim().slice(0, 80);
      if (needle && cur.includes(needle)) {
        if (!(await imperativeDialog.confirm("检测到正文中可能已存在相同片段，仍要在光标处插入吗？"))) return;
      }
      insertAtCursor(text);
      setLiuguangReturnVisible(true);
    })();
  }, [workId, activeId, insertAtCursor]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── 6. 流光：章末追加 / 写入 AI 草稿 ───────────────────────────────────
  useEffect(() => {
    if (!workId || !activeId) return;
    let mode: "appendEnd" | "mergeAiDraft" | null = null;
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.get("liuguangAppend") === "1") {
        mode = "appendEnd";
        u.searchParams.delete("liuguangAppend");
        window.history.replaceState({}, "", u.toString());
      } else if (u.searchParams.get("liuguangDraft") === "1") {
        mode = "mergeAiDraft";
        u.searchParams.delete("liuguangDraft");
        window.history.replaceState({}, "", u.toString());
      }
    } catch {
      mode = null;
    }
    if (!mode) return;

    const payload = readInspirationTransferHandoff();
    if (
      !payload ||
      payload.workId !== workId ||
      payload.chapterId !== activeId ||
      payload.mode !== mode
    ) {
      return;
    }
    clearInspirationTransferHandoff();
    if (mode === "appendEnd") {
      const text = payload.text;
      const cur = contentRef.current ?? "";
      const needle = text.trim().slice(0, 80);
      void (async () => {
        if (needle && cur.includes(needle)) {
          if (!(await imperativeDialog.confirm("检测到正文中可能已存在相同片段，仍要追加到章末吗？"))) return;
        }
        appendToEnd(text);
        setLiuguangReturnVisible(true);
      })();
      return;
    }

    // mergeAiDraft：写入 AiPanel 草稿（在右侧栏可编辑后再插入）
    const draftText = payload.text;
    queueMicrotask(() => {
      setRightRailOpen(true);
      setRightRailActiveTab("ai");
    });
    const tryDraft = async (n: number): Promise<void> => {
      if (n <= 0) return;
      if (activeChapter && workId) {
        const key = aiPanelDraftStorageKey(workId, activeChapter.id);
        try {
          const prev = sessionStorage.getItem(key) ?? "";
          const needle = draftText.trim().slice(0, 80);
          if (needle && prev.includes(needle)) {
            if (!(await imperativeDialog.confirm("检测到 AI 侧栏草稿里可能已存在相同片段，仍要合并写入吗？"))) return;
          }
          const merged = prev.trim().length ? `${prev.trim()}\n\n${draftText.trim()}\n` : `${draftText.trim()}\n`;
          sessionStorage.setItem(key, merged);
        } catch {
          /* ignore */
        }
        setLiuguangReturnVisible(true);
        return;
      }
      await new Promise((r) => window.setTimeout(r, 60));
      return tryDraft(n - 1);
    };
    void tryDraft(12);
  }, [workId, activeId, activeChapter, appendToEnd]); // eslint-disable-line react-hooks/exhaustive-deps
}
