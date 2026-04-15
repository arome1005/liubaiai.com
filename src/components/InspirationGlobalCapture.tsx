import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { addInspirationFragment, listInspirationCollections, listWorks } from "../db/repo";
import type { InspirationCollection, Work } from "../db/types";
import { cn } from "../lib/utils";
import {
  INSPIRATION_EXPAND_HANDOFF_KEY,
  type InspirationExpandHandoffPayload,
} from "../util/inspiration-expand-handoff";
import { liuguangQuickCaptureShortcutLabel, shortcutModifierSymbol } from "../util/keyboardHints";
import { HOTKEY_EVENT, matchHotkey, readLiuguangQuickCaptureHotkey } from "../util/hotkey-config";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

const LS_LAST_WORK = "liubai:lastWorkId";
const LS_LAST_COLLECTION = "liubai:inspirationLastCollectionId";

function isTypingSurfaceTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return !!el.closest("input, textarea, select, [contenteditable=true]");
}

const AUTH_PREFIXES = ["/login", "/forgot-password", "/reset-password"];

/**
 * 全局 Alt+S（Mac：⌥+S）唤起流光速记（实施步骤 步 36）。
 * 在输入框/编辑器内不触发，避免与正文输入冲突。
 */
export function InspirationGlobalCapture() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [works, setWorks] = useState<Work[]>([]);
  const [collections, setCollections] = useState<InspirationCollection[]>([]);
  const [body, setBody] = useState("");
  const [tagsLine, setTagsLine] = useState("");
  const [workId, setWorkId] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hotkeyRef = useRef(readLiuguangQuickCaptureHotkey());

  const loadWorks = useCallback(async () => {
    const [w, cols] = await Promise.all([listWorks(), listInspirationCollections()]);
    setWorks(w);
    setCollections(cols);
    let defaultWid = "";
    try {
      const saved = localStorage.getItem(LS_LAST_WORK);
      if (saved && w.some((x) => x.id === saved)) defaultWid = saved;
    } catch {
      /* ignore */
    }
    setWorkId(defaultWid);
    let defaultCid = "";
    try {
      const lc = localStorage.getItem(LS_LAST_COLLECTION);
      if (lc && lc !== "__none__" && cols.some((c) => c.id === lc)) defaultCid = lc;
    } catch {
      /* ignore */
    }
    setCollectionId(defaultCid);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setBody("");
    setTagsLine("");
    setError(null);
    setBusy(false);
  }, []);

  useEffect(() => {
    function sync() {
      hotkeyRef.current = readLiuguangQuickCaptureHotkey();
    }
    window.addEventListener(HOTKEY_EVENT, sync);
    return () => window.removeEventListener(HOTKEY_EVENT, sync);
  }, []);

  useEffect(() => {
    function onGlobalKey(e: KeyboardEvent) {
      if (!matchHotkey(e, hotkeyRef.current)) return;
      if (isTypingSurfaceTarget(e.target)) return;
      for (const p of AUTH_PREFIXES) {
        if (pathname === p || pathname.startsWith(`${p}/`)) return;
      }
      e.preventDefault();
      setError(null);
      void loadWorks();
      setOpen(true);
    }
    window.addEventListener("keydown", onGlobalKey);
    return () => window.removeEventListener("keydown", onGlobalKey);
  }, [loadWorks, pathname]);

  useEffect(() => {
    close();
  }, [pathname, close]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => textareaRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  function handoffExpandOnInspirationPage() {
    const text = body.trim();
    if (!text || busy) return;
    const tagParts = tagsLine
      .split(/[,，、\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const payload: InspirationExpandHandoffPayload = {
      body: text,
      tags: tagParts,
      workId: workId || null,
      collectionId: collectionId || null,
    };
    try {
      sessionStorage.setItem(INSPIRATION_EXPAND_HANDOFF_KEY, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
    close();
    navigate("/inspiration?expandDraft=1");
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      const tagParts = tagsLine
        .split(/[,，、\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      await addInspirationFragment({
        body: text,
        tags: tagParts,
        workId: workId || null,
        collectionId: collectionId || null,
      });
      try {
        localStorage.setItem(LS_LAST_COLLECTION, collectionId ? collectionId : "__none__");
      } catch {
        /* ignore */
      }
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const shortcutLabel = liuguangQuickCaptureShortcutLabel();

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) close();
      }}
    >
      <DialogContent
        showCloseButton
        overlayClassName="work-form-modal-overlay"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          window.requestAnimationFrame(() => textareaRef.current?.focus());
        }}
        className={cn(
          "inspiration-global-dialog-content z-[var(--z-modal-app-content)] max-h-[min(88vh,40rem)] max-w-[min(42rem,calc(100vw-2rem))] gap-0 overflow-hidden rounded-xl border border-border bg-[var(--surface)] p-0 shadow-lg ring-1 ring-border/40 sm:max-w-[42rem]",
        )}
      >
        <div className="border-b border-border/40 px-6 py-5">
          <DialogHeader className="gap-1 text-left">
            <DialogTitle className="text-left text-xl font-semibold">流光速记</DialogTitle>
            <DialogDescription asChild>
              <p className="inspiration-global-hint muted small m-0 text-left leading-relaxed">
                <kbd className="inspiration-global-kbd">{shortcutLabel}</kbd> 随时唤起 ·{" "}
                <kbd className="inspiration-global-kbd">Esc</kbd> 关闭 ·{" "}
                <kbd className="inspiration-global-kbd">{shortcutModifierSymbol()}+Enter</kbd> 保存
              </p>
            </DialogDescription>
          </DialogHeader>
        </div>
        <form
          className="inspiration-global-form flex max-h-[min(60vh,28rem)] flex-col gap-4 overflow-auto px-6 py-5"
          onSubmit={(ev) => void submit(ev)}
        >
          <textarea
            ref={textareaRef}
            className="inspiration-global-textarea min-h-[7.5rem] shrink-0"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="闪念、对白、设定点…"
            rows={5}
            disabled={busy}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void submit();
              }
            }}
          />
          <div className="inspiration-global-row">
            <label className="inspiration-global-field">
              <span className="muted small">标签</span>
              <input
                className="inspiration-input"
                value={tagsLine}
                onChange={(e) => setTagsLine(e.target.value)}
                placeholder="逗号分隔"
                disabled={busy}
              />
            </label>
            <label className="inspiration-global-field inspiration-global-field-grow">
              <span className="muted small">归属作品</span>
              <select
                className="inspiration-select inspiration-select-grow"
                value={workId}
                onChange={(e) => setWorkId(e.target.value)}
                disabled={busy}
              >
                <option value="">不关联</option>
                {works.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.title || "未命名"}
                  </option>
                ))}
              </select>
            </label>
            <label className="inspiration-global-field inspiration-global-field-grow">
              <span className="muted small">集合（可选）</span>
              <select
                className="inspiration-select inspiration-select-grow"
                value={collectionId}
                onChange={(e) => setCollectionId(e.target.value)}
                disabled={busy}
              >
                <option value="">未入集合</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || "未命名集合"}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {error ? <p className="inspiration-global-error">{error}</p> : null}
          <DialogFooter className="mt-1 shrink-0 flex-col gap-2 border-t border-border/40 px-0 pt-4 sm:flex-row sm:justify-end">
            <div className="flex w-full flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={close} disabled={busy}>
                取消
              </Button>
              <Button type="button" variant="outline" size="sm" asChild>
                <Link to="/inspiration" onClick={close}>
                  打开流光
                </Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy || !body.trim()}
                title="跳转流光页并自动打开 AI 五段扩容（需模型与隐私门控与列表页一致）"
                onClick={handoffExpandOnInspirationPage}
              >
                去流光扩容
              </Button>
              <Button type="submit" size="sm" disabled={busy || !body.trim()}>
                {busy ? "保存中…" : "保存"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
