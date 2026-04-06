import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { addInspirationFragment, listWorks } from "../db/repo";
import type { Work } from "../db/types";
import { liuguangQuickCaptureShortcutLabel, shortcutModifierSymbol } from "../util/keyboardHints";

const LS_LAST_WORK = "liubai:lastWorkId";

function isTypingSurfaceTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return !!el.closest("input, textarea, select, [contenteditable=true]");
}

const AUTH_PREFIXES = ["/login", "/forgot-password", "/reset-password"];

/**
 * §11 步 36：全局 Alt+S（Mac：⌥+S）唤起流光速记，写作页与 Hub 均可用。
 * 在输入框/编辑器内不触发，避免与正文输入冲突。
 */
export function InspirationGlobalCapture() {
  const { pathname } = useLocation();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [works, setWorks] = useState<Work[]>([]);
  const [body, setBody] = useState("");
  const [tagsLine, setTagsLine] = useState("");
  const [workId, setWorkId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const loadWorks = useCallback(async () => {
    const w = await listWorks();
    setWorks(w);
    let defaultWid = "";
    try {
      const saved = localStorage.getItem(LS_LAST_WORK);
      if (saved && w.some((x) => x.id === saved)) defaultWid = saved;
    } catch {
      /* ignore */
    }
    setWorkId(defaultWid);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setBody("");
    setTagsLine("");
    setError(null);
    setBusy(false);
  }, []);

  useEffect(() => {
    function onGlobalKey(e: KeyboardEvent) {
      if (e.repeat) return;
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.code !== "KeyS") return;
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
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => textareaRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDocKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    }
    document.addEventListener("keydown", onDocKey);
    return () => document.removeEventListener("keydown", onDocKey);
  }, [open, close]);

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
      });
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const shortcutLabel = liuguangQuickCaptureShortcutLabel();

  return (
    <div
      className="inspiration-global-root"
      role="presentation"
      onMouseDown={(ev) => {
        if (ev.target === ev.currentTarget) close();
      }}
    >
      <div
        className="inspiration-global-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="inspiration-global-head">
          <h2 id={titleId} className="inspiration-global-title">
            流光速记
          </h2>
          <p className="muted small inspiration-global-hint">
            <kbd className="inspiration-global-kbd">{shortcutLabel}</kbd> 随时唤起 ·{" "}
            <kbd className="inspiration-global-kbd">Esc</kbd> 关闭 ·{" "}
            <kbd className="inspiration-global-kbd">{shortcutModifierSymbol()}+Enter</kbd> 保存
          </p>
        </div>
        <form className="inspiration-global-form" onSubmit={(ev) => void submit(ev)}>
          <textarea
            ref={textareaRef}
            className="inspiration-global-textarea"
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
          </div>
          {error ? <p className="inspiration-global-error">{error}</p> : null}
          <div className="inspiration-global-actions">
            <button type="button" className="btn ghost small" onClick={close} disabled={busy}>
              取消
            </button>
            <Link to="/inspiration" className="btn ghost small" onClick={close}>
              打开流光
            </Link>
            <button type="submit" className="btn primary small" disabled={busy || !body.trim()}>
              {busy ? "保存中…" : "保存"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
