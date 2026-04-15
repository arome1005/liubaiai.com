export type HotkeyCombo = {
  alt: boolean;
  shift: boolean;
  ctrl: boolean;
  meta: boolean;
  /** KeyboardEvent.code, e.g. KeyS */
  code: string;
};

export type HotkeyId = "liuguangQuickCapture" | "zenToggle";

export const HOTKEY_EVENT = "liubai:hotkeysChanged";

const KEY_LIUGUANG = "liubai:hotkey:liuguangQuickCapture:v1";
const KEY_ZEN = "liubai:hotkey:zenToggle:v1";

function isMacUA(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent);
}

export function defaultLiuguangQuickCaptureHotkey(): HotkeyCombo {
  // 默认：Mac 用 Option+S，其余 Alt+S（与既有行为一致）
  return { alt: true, shift: false, ctrl: false, meta: false, code: "KeyS" };
}

function normCode(code: string): string {
  const c = String(code || "").trim();
  if (!c) return "KeyS";
  return c;
}

export function hotkeyToLabel(h: HotkeyCombo): string {
  const parts: string[] = [];
  if (h.ctrl) parts.push(isMacUA() ? "Ctrl" : "Ctrl");
  if (h.meta) parts.push(isMacUA() ? "⌘" : "Meta");
  if (h.alt) parts.push(isMacUA() ? "⌥" : "Alt");
  if (h.shift) parts.push(isMacUA() ? "⇧" : "Shift");
  const code = normCode(h.code);
  const key =
    code.startsWith("Key") ? code.slice(3) :
    code.startsWith("Digit") ? code.slice(5) :
    code;
  parts.push(key.toUpperCase());
  return parts.join("+");
}

export function matchHotkey(e: KeyboardEvent, h: HotkeyCombo): boolean {
  if (e.repeat) return false;
  if (!!e.altKey !== !!h.alt) return false;
  if (!!e.shiftKey !== !!h.shift) return false;
  if (!!e.ctrlKey !== !!h.ctrl) return false;
  if (!!e.metaKey !== !!h.meta) return false;
  return e.code === normCode(h.code);
}

export function readLiuguangQuickCaptureHotkey(): HotkeyCombo {
  try {
    const raw = localStorage.getItem(KEY_LIUGUANG);
    if (!raw) return defaultLiuguangQuickCaptureHotkey();
    const obj = JSON.parse(raw) as Partial<HotkeyCombo>;
    return {
      alt: !!obj.alt,
      shift: !!obj.shift,
      ctrl: !!obj.ctrl,
      meta: !!obj.meta,
      code: normCode(typeof obj.code === "string" ? obj.code : ""),
    };
  } catch {
    return defaultLiuguangQuickCaptureHotkey();
  }
}

export function writeLiuguangQuickCaptureHotkey(next: HotkeyCombo): { ok: true } | { ok: false; error: string } {
  try {
    const row: HotkeyCombo = {
      alt: !!next.alt,
      shift: !!next.shift,
      ctrl: !!next.ctrl,
      meta: !!next.meta,
      code: normCode(next.code),
    };
    localStorage.setItem(KEY_LIUGUANG, JSON.stringify(row));
    window.dispatchEvent(new Event(HOTKEY_EVENT));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "保存失败" };
  }
}

export function defaultZenToggleHotkey(): HotkeyCombo {
  return { alt: true, shift: false, ctrl: false, meta: false, code: "KeyZ" };
}

export function readZenToggleHotkey(): HotkeyCombo {
  try {
    const raw = localStorage.getItem(KEY_ZEN);
    if (!raw) return defaultZenToggleHotkey();
    const obj = JSON.parse(raw) as Partial<HotkeyCombo>;
    return {
      alt: !!obj.alt,
      shift: !!obj.shift,
      ctrl: !!obj.ctrl,
      meta: !!obj.meta,
      code: normCode(typeof obj.code === "string" ? obj.code : ""),
    };
  } catch {
    return defaultZenToggleHotkey();
  }
}

export function writeZenToggleHotkey(next: HotkeyCombo): { ok: true } | { ok: false; error: string } {
  try {
    const row: HotkeyCombo = {
      alt: !!next.alt,
      shift: !!next.shift,
      ctrl: !!next.ctrl,
      meta: !!next.meta,
      code: normCode(next.code),
    };
    localStorage.setItem(KEY_ZEN, JSON.stringify(row));
    window.dispatchEvent(new Event(HOTKEY_EVENT));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "保存失败" };
  }
}

/** 读取所有可配置键的当前设置 */
export function readAllHotkeys(): Record<HotkeyId, HotkeyCombo> {
  return {
    liuguangQuickCapture: readLiuguangQuickCaptureHotkey(),
    zenToggle: readZenToggleHotkey(),
  };
}

/** 在两组 hotkey 中检测互相冲突（相同按键组合 → 返回另一个的 label） */
export function hotkeyConflictWith(
  candidate: HotkeyCombo,
  others: Array<{ id: HotkeyId; label: string; combo: HotkeyCombo }>,
): string | null {
  function canonical(h: HotkeyCombo): string {
    return [h.ctrl ? "C" : "", h.meta ? "M" : "", h.alt ? "A" : "", h.shift ? "S" : ""].filter(Boolean).join("+")
      + "+" + normCode(h.code);
  }
  const targetKey = canonical(candidate);
  for (const o of others) {
    if (canonical(o.combo) === targetKey) return o.label;
  }
  return null;
}

